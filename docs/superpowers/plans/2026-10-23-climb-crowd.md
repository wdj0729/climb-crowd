# 암장 혼잡도 트래커 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 소모임·당근 모임의 서울 클라이밍 정모를 하루 3번 수집해, 즐겨찾기한 암장별로 이번 주 내 시간대 예상 인원을 막대그래프로 보여주는 웹앱.

**Architecture:** 한 저장소에 Next.js 웹앱(Vercel Hobby, DB 읽기 + 관리 화면에서 별칭 추가)과 수집 스크립트(GitHub Actions schedule, `tsx`로 실행, DB 쓰기)를 둔다. 둘 다 `lib/`의 타입·DB 접근·암장 매칭 코드를 공유한다. 시간대 필터·요일 합계는 브라우저에서 사용자 설정으로 계산한다.

**Tech Stack:** Next.js (App Router, TypeScript, Tailwind), Neon Postgres (`@neondatabase/serverless`), Vitest + Testing Library + jsdom, PGlite (`@electric-sql/pglite`, 테스트용 Postgres), cheerio, tsx, pnpm, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-23-climb-crowd-design.md`

## Global Constraints

- 비용 0원: Vercel Hobby, Neon 무료, GitHub Actions. Vercel Cron 사용 금지.
- 수집 대상은 서울 소모임·당근 모임만. 문토·인스타·카톡 코드 없음.
- 로그인 없음. 즐겨찾기·설정은 localStorage.
- 모든 날짜 계산·표시는 KST(`Asia/Seoul`, UTC+9, 서머타임 없음).
- 기본 시간대: 평일 `18:00` 이후, 주말(토·일) `14:00` 이후에 **시작하는** 정모만 합계.
- 인원 = 현재 참석 인원. 정원은 표시만. 당근 `CLOSED`도 포함.
- 요청 예의: 호스트별로 순차 요청, 요청 사이 최소 1000ms, 일반 브라우저 User-Agent, robots.txt 차단 경로 사용 금지(당근 `/kr/group/s/`, `/wv/` 등).
- 이번 주 = 오늘(KST)부터 7일. (스펙이 빌더에게 맡긴 선택 — 이 계획에서 확정)
- 붐빔 강조 기준 기본 20명, 설정에서 변경 가능.

## Review Focus

1. **KST 날짜 경계** — 당근 `meetAt`은 UTC. `2026-10-24T15:30:00Z`는 KST 10/25(일) 00:30이므로 25일 칸에 들어가야 한다. → Task 2 테스트.
2. **취소된 정모** — 한 번 저장된 정모가 원본에서 사라지면 그래프에서도 빠져야 한다. 해당 모임 페이지를 성공적으로 읽은 실행에서, 그 모임의 미래 정모 중 이번에 안 보인 것은 삭제. 페이지를 못 읽은 모임은 건드리지 않는다. → Task 6 테스트.
3. **일부 페이지 실패** — 모임 페이지 하나가 타임아웃/404여도 전체 수집은 계속되고 실행 기록에 실패 수가 남는다. → Task 8 테스트.
4. **같은 모임이 여러 구 검색에 중복** — 한 번만 방문한다. → Task 8 테스트.
5. **localStorage가 막혀 있거나 값이 깨짐** — 기본 설정으로 정상 표시. → Task 9 테스트.

---

## File Structure

```
climb-crowd/
  app/
    layout.tsx, manifest.ts, globals.css
    page.tsx                    # 클라이언트: 내 암장 카드 화면
    api/week/route.ts           # GET 이번 주 정모 + 마지막 수집 시각
    admin/page.tsx              # 미매칭 장소 목록 + 별칭 추가 (ADMIN_KEY)
    admin/actions.ts            # server action: addAlias + rematch
  components/
    GymCard.tsx                 # 막대그래프 카드
    DayDetail.tsx               # 선택한 날 정모 목록
    GymPicker.tsx               # 암장 검색/즐겨찾기
    SettingsPanel.tsx           # 시간대·기준값
  lib/
    types.ts                    # 공용 타입
    time.ts                     # KST 헬퍼
    crowd.ts                    # 시간대 필터·요일 버킷
    settings.ts                 # localStorage 로드/저장
    db.ts                       # Db 인터페이스 + Neon 구현
    schema.sql
    store.ts                    # DB 연산
    gyms/seed.ts                # 서울 암장 데이터 + 브랜드 별칭
    gyms/match.ts               # 정규화 + 매칭
  scraper/
    http.ts                     # 예의 있는 fetch
    somoim/parse.ts
    somoim/districts.ts         # 서울 25개 구 이름
    daangn/parse.ts
    daangn/regions.json         # 서울 25개 구 {name, id}
    daangn/discover-regions.ts  # regions.json 생성 1회용 스크립트
    run.ts                      # runScrape + main
  .github/workflows/scrape.yml
  tests/
    fixtures/*.html
    helpers/pglite.ts
    *.test.ts(x)
```

---

### Task 1: 프로젝트 뼈대 + 공용 타입 + KST 시간 헬퍼

**Files:**
- Create: Next.js 앱 일체(`create-next-app`), `vitest.config.ts`, `lib/types.ts`, `lib/time.ts`
- Test: `tests/time.test.ts`

**Interfaces:**
- Produces (`lib/types.ts`):
  ```ts
  export type Source = 'somoim' | 'daangn';
  export interface RawGroup { source: Source; externalId: string; name: string; url: string }
  export interface RawMeetup {
    source: Source; externalId: string; groupExternalId: string; title: string;
    startsAt: Date; participants: number; capacity: number | null;
    placeText: string | null; placeLat: number | null; placeLon: number | null; url: string;
  }
  export interface WeekMeetup {          // API → 브라우저 (JSON)
    id: string; source: Source; gymId: string; title: string; groupName: string;
    startsAt: string /* ISO */; participants: number; capacity: number | null; url: string;
  }
  export interface WeekResponse { days: string[]; lastScrapeAt: string | null; meetups: WeekMeetup[] }
  ```
- Produces (`lib/time.ts`): `kstDateKey(d: Date): string` (`'YYYY-MM-DD'`), `kstMinutesOfDay(d: Date): number`, `isWeekend(dateKey: string): boolean`, `nextDays(now: Date, n: number): string[]`, `kstStartOfDay(dateKey: string): Date`, `kstFromParts(y, mo, d, h, mi): Date`.

- [ ] **Step 1: 뼈대 만들기** — `/Users/peter/climb-crowd`에서 `pnpm create next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm` (기존 `docs/` 유지). dev 의존성: `vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @electric-sql/pglite tsx`. 런타임: `@neondatabase/serverless cheerio`. `vitest.config.ts`는 `@/` 별칭, 기본 환경 `node`(컴포넌트 테스트 파일만 `// @vitest-environment jsdom`). `package.json` 스크립트: `"test": "vitest run"`, `"scrape": "tsx scraper/run.ts"`. `.gitignore`에 `.superpowers/`, `.env*` 추가.

- [ ] **Step 2: 실패하는 테스트 작성** `tests/time.test.ts`
  ```ts
  expect(kstDateKey(new Date('2026-10-24T15:30:00Z'))).toBe('2026-10-25');
  expect(kstDateKey(new Date('2026-10-24T14:59:00Z'))).toBe('2026-10-24');
  expect(kstMinutesOfDay(new Date('2026-10-23T09:00:00Z'))).toBe(18 * 60);
  expect(isWeekend('2026-10-24')).toBe(true);   // 토
  expect(isWeekend('2026-10-26')).toBe(false);  // 월
  expect(nextDays(new Date('2026-10-23T16:00:00Z'), 7))
    .toEqual(['2026-10-24','2026-10-25','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30']);
  expect(kstStartOfDay('2026-10-24').toISOString()).toBe('2026-10-23T15:00:00.000Z');
  expect(kstFromParts(2026, 10, 24, 14, 0).toISOString()).toBe('2026-10-24T05:00:00.000Z');
  ```
- [ ] **Step 3: 실행해 실패 확인** — `pnpm test tests/time.test.ts` → FAIL (모듈 없음)
- [ ] **Step 4: 구현** — 고정 +9시간 오프셋 산술로 구현(Intl 의존 없이).
- [ ] **Step 5: 통과 확인** — `pnpm test tests/time.test.ts` → PASS
- [ ] **Step 6: 커밋** — `git add -A && git commit -m "chore: scaffold app, shared types, KST helpers"`

---

### Task 2: 시간대 필터와 요일 버킷 (`lib/crowd.ts`)

**Files:** Create `lib/crowd.ts` · Test `tests/crowd.test.ts`

**Interfaces:**
- Consumes: `WeekMeetup`, `kstDateKey`, `kstMinutesOfDay`, `isWeekend` (Task 1)
- Produces:
  ```ts
  export interface TimeWindow { weekdayStart: string /* 'HH:MM' */; weekendStart: string }
  export interface DayBucket { date: string; total: number; inWindow: WeekMeetup[]; outOfWindow: WeekMeetup[] }
  export function inWindow(startsAt: Date, w: TimeWindow): boolean
  export function dayBuckets(meetups: WeekMeetup[], gymId: string, days: string[], w: TimeWindow): DayBucket[]
  ```

- [ ] **Step 1: 실패하는 테스트** — `w = {weekdayStart:'18:00', weekendStart:'14:00'}`
  - `inWindow(목 18:00 KST)` true, `inWindow(목 17:59 KST)` false, `inWindow(토 14:00 KST)` true, `inWindow(토 13:30 KST)` false.
  - `dayBuckets`: 같은 암장 목 19:00(10명)+목 20:00(12명)+목 15:00(8명), 다른 암장 목 19:00(30명) → 목요일 `total` 22, `inWindow` 2개(시간순), `outOfWindow` 1개; `days` 7개 모두 버킷 존재(빈 날 total 0).
  - **Review Focus 1:** `startsAt '2026-10-24T15:30:00Z'`(KST 10/25 일 00:30)는 `'2026-10-25'` 버킷의 `outOfWindow`에 들어간다(14:00 이전).
  - `days` 범위 밖 정모는 어느 버킷에도 없다.
- [ ] **Step 2: 실패 확인** — `pnpm test tests/crowd.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `feat: time-window filter and day buckets`

---

### Task 3: 서울 암장 데이터와 매칭 (`lib/gyms/`)

**Files:** Create `lib/gyms/seed.ts`, `lib/gyms/match.ts` · Test `tests/match.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // seed.ts
  export interface Brand { id: string; name: string; aliases: string[] }      // 예: {id:'climbingpark', name:'클라이밍파크', aliases:['클라이밍파크','클팍']}
  export interface Gym { id: string; brandId: string | null; name: string /* 표시명 */; branch: string | null;
    branchAliases: string[]; extraAliases: string[]; address: string; lat: number; lon: number; source: string /* 확인한 URL */ }
  export const BRANDS: Brand[]; export const GYMS: Gym[];
  // match.ts
  export function normalize(s: string): string
  export function matchGym(input: { placeText: string | null; title: string; placeLat: number | null; placeLon: number | null },
                           gyms: Gym[], brands: Brand[], extra?: Record<string, string> /* 정규화 별칭 → gymId */): string | null
  ```

- [ ] **Step 1: 시드 데이터 작성** — 서울 소재 클라이밍 암장을 가능한 한 전부. 최소 포함 브랜드: 더클라임, 클라이밍파크, 서울숲클라이밍, 피커스, 손상원클라이밍의 **서울 지점 전부**, 그리고 그루트(뚝섬), 클라임어스(장한평) 등 독립 암장. 각 항목의 지점·주소·좌표는 공식 사이트/지도에서 확인하고 그 URL을 `source`에 적는다(기억으로 지어내지 말 것). id 형식 `'{brand}-{branch-romanized}'` 예 `theclimb-gangnam`, `climbingpark-jongno`, `peakers-sinchon`, `theclimb-seongsu`, `peakers-jongno`, `seoulforest-jamsil`, `sonsangwon-euljiro`. 브랜드 별칭에 최소 `더클`, `클팍`, `서울숲`, `피커스`, `손상원` 포함.
- [ ] **Step 2: 실패하는 테스트** `tests/match.test.ts`
  - 데이터 무결성: `GYMS` id 유일, 모든 `source`가 `http`로 시작, 서울 좌표 범위(lat 37.4–37.72, lon 126.76–127.19).
  - `matchGym({placeText:'클라이밍 파크 종로', title:'클팍 종로💜🧗🏻‍♀️', ...null})` → `'climbingpark-jongno'`
  - `matchGym({placeText:null, title:'성수 더클라임 낮클'})` → `'theclimb-seongsu'`
  - `matchGym({placeText:null, title:'더클 강남 7시까지'})` → `'theclimb-gangnam'`
  - `matchGym({placeText:null, title:'종로 피커스 퇴근클'})` → `'peakers-jongno'`
  - `matchGym({placeText:'피커스클라이밍신촌', title:'신촌해변', placeLat:37.5565639285478, placeLon:126.940328119434})` → `'peakers-sinchon'`
  - 좌표만 맞는 경우: `{placeText:'아무이름', title:'x', placeLat: <gym.lat>, placeLon: <gym.lon>}` → 그 gym (반경 150m)
  - 지점 없는 브랜드만: `{placeText:null, title:'더클 7시'}` → `null` (Claude 판단: 지점 여러 개인 브랜드는 추정하지 않음)
  - 지점 하나뿐인 브랜드/독립 암장 이름만 있어도 매칭.
  - 클라이밍 아님: `{placeText:'석촌 푸른하늘', title:'토요일 보드게임 모임 😇🤗🎲☄️'}` → `null`; `{placeText:'공지', title:'할로윈 🎃 보드게임 나이트 👻'}` → `null`
  - `extra` 별칭: `matchGym({placeText:'신촌해변암장', ...}, GYMS, BRANDS, {[normalize('신촌해변암장')]: 'peakers-sinchon'})` → `'peakers-sinchon'`
- [ ] **Step 3: 실패 확인** → FAIL
- [ ] **Step 4: 구현** — `normalize`: 소문자, 공백·이모지·문장부호 제거, 끝의 `점` 제거. 매칭 순서: ① 좌표 150m 이내 최근접 ② `extra` 별칭이 `placeText` 정규화값과 일치 ③ `placeText`, 그다음 `title`의 정규화 문자열에서 (브랜드별칭+지점별칭 / 지점별칭+브랜드별칭 / gym.extraAliases) 후보를 **부분 문자열**로 찾고 가장 긴 후보 채택 ④ 지점 1개뿐인 브랜드 별칭 단독 일치. 없으면 `null`.
- [ ] **Step 5: 통과 확인** → PASS
- [ ] **Step 6: 커밋** — `feat: Seoul gym seed data and matcher`

---

### Task 4: 소모임 파서 (`scraper/somoim/`)

**Files:** Create `scraper/somoim/parse.ts`, `scraper/somoim/districts.ts`, `tests/fixtures/somoim-*.html` · Test `tests/somoim.test.ts`

**Interfaces:**
- Consumes: `RawGroup`, `RawMeetup`, `kstFromParts` (Task 1)
- Produces:
  ```ts
  export const SEOUL_DISTRICTS: string[]   // 25개 구 이름, '강남구' … '중랑구'
  export function somoimSearchUrl(district: string): string  // https://www.somoim.co.kr/groups/search/서울특별시/{구}/클라이밍 (경로 인코딩)
  export function parseSomoimSearch(html: string): string[]  // 모임 ID 목록, 중복 제거
  export function parseSomoimGroup(html: string, groupId: string): { group: RawGroup; meetups: RawMeetup[] }
  ```

- [ ] **Step 1: 픽스처 복사** (이 세션의 조사 파일)
  ```bash
  R=/private/tmp/claude-501/-Users-peter/e05eb2ae-d6b2-44c6-8f57-bc27bca60897/scratchpad/recon
  mkdir -p tests/fixtures
  cp $R/s_list.html tests/fixtures/somoim-search-mapo.html
  cp $R/s_group_climb.html tests/fixtures/somoim-group-climb.html
  cp $R/s_group.html tests/fixtures/somoim-group-empty.html
  cp $R/s_group_with_meet.html tests/fixtures/somoim-group-boardgame.html
  ```
  파일이 없으면 각 URL을 다시 받는다: 마포구 검색 페이지, `/01bc91bf-acf3-46ff-a23d-f394c572d6341`, `/01105740-1371-4135-89da-c687b329dd0c1`, `/0306535c-36bc-11ee-88e0-0ac117cfe3691` (이 경우 아래 기대값의 날짜는 받은 시점 데이터로 갱신).
- [ ] **Step 2: 실패하는 테스트**
  - `parseSomoimSearch(mapo)` 길이 94, `'01105740-1371-4135-89da-c687b329dd0c1'` 포함.
  - `parseSomoimGroup(climb, '01bc91bf-acf3-46ff-a23d-f394c572d6341')`: `group.name` = `'💜클라이밍 크루 무라사키💜'`, `group.url` = `https://www.somoim.co.kr/01bc91bf-acf3-46ff-a23d-f394c572d6341`; 정모 1개 — `title '클팍 종로💜🧗🏻‍♀️'`, `startsAt 2026-10-24T05:00:00Z`, `placeText '클라이밍 파크 종로'`, `participants 4`, `capacity 10`, `externalId '01bc91bf-acf3-46ff-a23d-f394c572d6341:202610241400'`, `placeLat/placeLon null`.
  - `empty` → 정모 0개.
  - `boardgame` → 정모 2개: `('토요일 보드게임 모임 😇🤗🎲☄️', 2026-10-24T06:00:00Z, '석촌 푸른하늘', 4, 14)`, `('할로윈 🎃 보드게임 나이트 👻', 2026-10-31T10:00:00Z, '공지', 1, 1)`.
- [ ] **Step 3: 실패 확인** → FAIL
- [ ] **Step 4: 구현** — cheerio. 정모 카드는 "정모 일정" `h2` 다음 grid의 각 `div.flex.space-x-3`. 일시는 화면의 "내일" 등 상대 표현 대신 **썸네일 `img src`의 `{groupId}(\d{12})s\d\.png`** (YYYYMMDDHHmm, KST)에서 얻는다. 제목 `h3`, 장소는 `i_location2.svg` 옆 `p`, 인원은 카드 안 `N / M` 텍스트. 모임 이름은 `h1`. 인원 텍스트가 없으면 participants 0, capacity null.
- [ ] **Step 5: 통과 확인** → PASS
- [ ] **Step 6: 커밋** — `feat: somoim parsers`

---

### Task 5: 당근 파서 + 서울 구 ID (`scraper/daangn/`)

**Files:** Create `scraper/daangn/parse.ts`, `scraper/daangn/discover-regions.ts`, `scraper/daangn/regions.json`, `tests/fixtures/daangn-*.html` · Test `tests/daangn.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DaangnRegion { name: string /* '강남구' */; id: number /* 381 */ }
  export function daangnSearchUrl(r: DaangnRegion): string   // https://www.daangn.com/kr/search/group/?in={name}-{id}&q=클라이밍 (인코딩)
  export function parseDaangnSearch(html: string): { url: string; name: string }[]  // JSON-LD ItemList
  export function parseDaangnGroup(html: string, url: string): { group: RawGroup; meetups: RawMeetup[] }
  ```

- [ ] **Step 1: 픽스처 복사** — `cp $R/d_group.html tests/fixtures/daangn-group-climbing.html; cp $R/d_r.html tests/fixtures/daangn-search-seoul.html` (`d_r.html`은 `in=서울특별시-1` 결과).
- [ ] **Step 2: 실패하는 테스트**
  - `parseDaangnSearch(seoul)` 길이 29, 이름에 `'직장인 클라이밍'` 포함, 모든 url이 `https://www.daangn.com/kr/group/`로 시작.
  - `parseDaangnGroup(climbing, <url>)`: `group.name '클라이밍 모임'`, `group.externalId 'b7nnwocr7gc5'`(URL 끝 슬러그 ID); 정모 5개; `'306253610'` → `title '성수 더클라임 낮클'`, `startsAt 2026-10-23T05:00:00Z`, `participants 2`, `capacity 4`, `placeText null`; `'306184490'` → `placeText '피커스클라이밍신촌'`, `placeLat 37.5565639285478`, `placeLon 126.940328119434`.
  - `regions.json`: 25개, 이름이 `SEOUL_DISTRICTS`(Task 4)와 같은 집합, `{name:'강남구', id:381}`, `{name:'서초구', id:362}`, `{name:'관악구', id:340}`, `{name:'강서구', id:257}` 포함.
- [ ] **Step 3: 실패 확인** → FAIL
- [ ] **Step 4: 파서 구현** — 그룹 페이지 HTML에서 `"meetups":[` 위치를 찾아 `JSON` 배열을 괄호 짝 맞춰 잘라 파싱(HTML 엔티티/이스케이프 상태는 픽스처로 확인).
- [ ] **Step 5: 구 ID 수집 스크립트** — `discover-regions.ts`: 검색 페이지 HTML의 `__locationSelectModal` 등에 있는 `{"name1":"서울특별시","name2":"강남구",…,"name2Id":381}` 객체를 모은다. 서울 동 이름으로 `in=` 검색을 돌며 25개 구가 다 모일 때까지 탐색(1초 간격). 결과를 `regions.json`에 쓰고 커밋한다(이후엔 정적 데이터). 모자란 구가 있으면 그 구 이름을 출력하고 실패.
- [ ] **Step 6: 실행 및 통과 확인** — `pnpm tsx scraper/daangn/discover-regions.ts` → 25개 기록; `pnpm test tests/daangn.test.ts` → PASS
- [ ] **Step 7: 커밋** — `feat: daangn parsers and Seoul region ids`

---

### Task 6: DB 스키마와 저장소 연산 (`lib/db.ts`, `lib/store.ts`)

**Files:** Create `lib/schema.sql`, `lib/db.ts`, `lib/store.ts`, `tests/helpers/pglite.ts` · Test `tests/store.test.ts`

**Interfaces:**
- Consumes: `RawGroup`, `RawMeetup`, `WeekMeetup` (Task 1); `matchGym`, `GYMS`, `BRANDS` (Task 3)
- Produces:
  ```ts
  // db.ts
  export interface Db { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> }
  export function neonDb(url: string): Db
  export async function migrate(db: Db): Promise<void>   // schema.sql 실행, 여러 번 실행해도 안전
  // store.ts
  export type StoredMeetup = RawMeetup & { gymId: string | null }
  export async function upsertGroup(db: Db, g: RawGroup): Promise<void>
  export async function syncGroupMeetups(db: Db, source: Source, groupExternalId: string, meetups: StoredMeetup[], now: Date): Promise<{ upserted: number; removed: number }>
  export async function listWeekMeetups(db: Db, from: Date, to: Date): Promise<WeekMeetup[]>  // gym_id not null만, starts_at 오름차순
  export async function getExtraAliases(db: Db): Promise<Record<string, string>>
  export async function addAlias(db: Db, alias: string, gymId: string): Promise<void>        // normalize해서 저장
  export async function rematchUnmatched(db: Db): Promise<number>                           // 미래 미매칭 정모 재매칭, 갱신 수
  export async function listUnmatched(db: Db, now: Date): Promise<{ text: string; count: number; exampleUrl: string }[]>  // 미래 미매칭을 coalesce(place_text,title)로 묶어 빈도순
  export async function recordRun(db: Db, r: { startedAt: Date; finishedAt: Date; ok: boolean; stats: object }): Promise<void>
  export async function lastSuccessfulRunAt(db: Db): Promise<Date | null>
  ```
- 테이블: `groups(source, external_id, name, url, pk(source,external_id))`, `meetups(source, external_id, group_external_id, title, starts_at timestamptz, participants int, capacity int null, place_text, place_lat, place_lon, gym_id null, url, last_seen_at, pk(source,external_id))`, `gym_aliases(alias pk, gym_id)`, `scrape_runs(id, started_at, finished_at, ok, stats jsonb)`. `WeekMeetup.id` = `'{source}:{external_id}'`, `groupName`은 groups 조인.

- [ ] **Step 1: 실패하는 테스트** — `tests/helpers/pglite.ts`가 `new PGlite()`를 `Db`로 감싸고 `migrate` 실행.
  - upsert 두 번(참석 4→7) 후 `listWeekMeetups` 결과 participants 7, 행 1개.
  - `gymId null` 정모는 `listWeekMeetups`에 없음, `listUnmatched`에 `{text, count}`로 나옴.
  - **Review Focus 2:** 모임 G에 미래 정모 A,B 저장 → 다음 `syncGroupMeetups(G, [A])` 결과 `removed 1`, B 없음. 과거(`starts_at < now`) 정모는 삭제하지 않음. 다른 모임 H의 정모는 영향 없음.
  - `addAlias(db,'신촌해변암장','peakers-sinchon')` 후 placeText `'신촌해변암장'`인 미매칭 정모가 `rematchUnmatched` → 1, 이후 `listWeekMeetups`에 `gymId 'peakers-sinchon'`.
  - `recordRun` 두 번(ok true 10:00, ok false 11:00) → `lastSuccessfulRunAt` = 10:00.
  - `migrate` 두 번 호출해도 에러 없음.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — `neonDb`는 `neon(url)`의 `.query(text, params)` 사용. 테스트는 PGlite만.
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `feat: db schema and store`

---

### Task 7: 예의 있는 HTTP 클라이언트 (`scraper/http.ts`)

**Files:** Create `scraper/http.ts` · Test `tests/http.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Fetcher { get(url: string): Promise<string> }   // 실패 시 throw
  export function createFetcher(opts: { delayMs: number; userAgent: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; retries?: number /* 기본 1 */ }): Fetcher
  export const BROWSER_UA: string
  ```

- [ ] **Step 1: 실패하는 테스트** (가짜 `fetchImpl`, 가짜 `sleep`으로 시간 기록)
  - 같은 Fetcher로 동시에 `get` 3개 → `fetchImpl` 호출이 겹치지 않고 순차, 호출 사이 `sleep(1000)`.
  - 요청 헤더 `User-Agent` = 지정값.
  - 첫 응답 500, 두 번째 200 → 성공. 404는 재시도 없이 throw.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 내부 Promise 체인으로 직렬화. 타임아웃 20초(`AbortSignal.timeout`).
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `feat: polite sequential fetcher`

---

### Task 8: 수집 실행기 + GitHub Actions (`scraper/run.ts`)

**Files:** Create `scraper/run.ts`, `.github/workflows/scrape.yml` · Test `tests/run.test.ts`

**Interfaces:**
- Consumes: Task 3–7 전부
- Produces:
  ```ts
  export interface ScrapeStats { source: Source; groupsFound: number; groupsOk: number; groupsFailed: number; meetups: number; matched: number; removed: number; truncatedGroups: number }
  export async function runScrape(deps: { db: Db; somoim: Fetcher; daangn: Fetcher; now: Date; log: (m: string) => void }): Promise<ScrapeStats[]>
  // main(): DATABASE_URL로 neonDb → migrate → runScrape → recordRun (ok = 실패 그룹 비율 < 50% 이고 예외 없음)
  ```

- [ ] **Step 1: 실패하는 테스트** — 가짜 Fetcher가 URL→픽스처 맵으로 응답, PGlite DB.
  - 소모임: 25개 구 검색 중 2개 구가 같은 검색 픽스처를 반환해도 각 모임 페이지는 **한 번만** 요청됨(Review Focus 4).
  - 모임 페이지 하나가 throw → 나머지는 저장되고 `groupsFailed 1`, 그 모임의 기존 정모는 삭제되지 않음(Review Focus 3).
  - 무라사키 픽스처 정모가 `gymId 'climbingpark-jongno'`로 저장, 보드게임 정모는 `gymId null`로 저장.
  - 당근 그룹에서 정모 5개가 모두 `now` 이후면 `truncatedGroups` 증가 + 로그(당근 그룹 페이지는 최근 5개만 실림 — 잘림 감지용).
  - 소모임과 당근은 서로 다른 Fetcher라 병렬로 돈다(`Promise.all`).
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 소스별: 검색 페이지들 → 모임 집합(중복 제거; 당근은 `https://www.daangn.com/kr/group/sitemap-detail.xml.gz`에서 URL 디코딩한 슬러그에 `클라이밍|볼더|암벽`이 들어간 모임도 추가 — gzip 응답이라 Fetcher에 `getBuffer` 대신 이 한 곳만 `fetchImpl` 직접 사용 가능) → 각 모임 페이지 파싱 → `matchGym`(DB `getExtraAliases` 포함) → `upsertGroup` + `syncGroupMeetups`. 마지막에 `rematchUnmatched`. 모든 HTTP는 Fetcher 경유(`delayMs 1000`).
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 워크플로 작성** `.github/workflows/scrape.yml` — `on: schedule: [cron: '0 22 * * *', '0 3 * * *', '0 9 * * *']` (KST 07/12/18시) + `workflow_dispatch`; Node 22, pnpm 설치, `pnpm scrape`, `env: DATABASE_URL: ${{ secrets.DATABASE_URL }}`, `timeout-minutes: 120`, `concurrency: scrape` (겹치기 방지).
- [ ] **Step 6: 실제 1회 로컬 실행으로 소요 시간 측정** — Neon 연결 전이면 `DATABASE_URL` 대신 로컬 PGlite 파일 DB로 돌리는 `--dry` 옵션을 둔다. 걸린 시간·그룹 수를 기록해 사용자에게 보고(비공개 저장소 월 2,000분 한도 판단용: 1회 분 × 3 × 30).
- [ ] **Step 7: 커밋** — `feat: scrape runner and scheduled workflow`

---

### Task 9: 설정 저장 (`lib/settings.ts`)

**Files:** Create `lib/settings.ts` · Test `tests/settings.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Settings extends TimeWindow { busyThreshold: number; favorites: string[] }
  export const DEFAULT_SETTINGS: Settings  // {weekdayStart:'18:00', weekendStart:'14:00', busyThreshold:20, favorites:[]}
  export const STORAGE_KEY = 'climb-crowd:v1'
  export function loadSettings(storage?: Pick<Storage,'getItem'>): Settings
  export function saveSettings(s: Settings, storage?: Pick<Storage,'setItem'>): void   // 실패해도 throw 안 함
  ```

- [ ] **Step 1: 실패하는 테스트** — **Review Focus 5:** `getItem`이 throw → 기본값; 값이 `'{깨진json'` → 기본값; `{favorites:['x']}`만 저장 → 나머지 기본값 채움; `weekdayStart:'25:99'` → 기본값으로 교정; `setItem` throw → 예외 없음.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — storage 기본값은 `globalThis.localStorage`(없으면 기본 설정).
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `feat: settings persistence`

---

### Task 10: 이번 주 API (`app/api/week/route.ts`)

**Files:** Create `app/api/week/route.ts`, `lib/week.ts` · Test `tests/week.test.ts`

**Interfaces:**
- Consumes: `listWeekMeetups`, `lastSuccessfulRunAt`, `neonDb` (Task 6); `nextDays`, `kstStartOfDay` (Task 1)
- Produces: `export async function getWeek(db: Db, now: Date): Promise<WeekResponse>`; `GET /api/week` → `WeekResponse` JSON, `export const revalidate = 600`.

- [ ] **Step 1: 실패하는 테스트** (PGlite) — `now = 2026-10-23T03:00Z`: `days` = 10/23~10/29; 10/30 00:00 KST(`2026-10-29T15:00Z`) 이후 정모 제외, 10/23 00:00 KST 이전 제외; `lastScrapeAt` ISO 문자열 또는 null.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 라우트는 `neonDb(process.env.DATABASE_URL!)`로 `getWeek` 호출.
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `feat: week api`

---

### Task 11: 메인 화면 (C안: 내 암장 카드)

**Files:** Create `components/GymCard.tsx`, `components/DayDetail.tsx`, `components/GymPicker.tsx`, `components/SettingsPanel.tsx`; Modify `app/page.tsx`, `app/layout.tsx`; Create `app/manifest.ts`, 아이콘 · Test `tests/GymCard.test.tsx`, `tests/GymPicker.test.tsx`

**Interfaces:**
- Consumes: `WeekResponse` (Task 10), `dayBuckets`/`DayBucket` (Task 2), `Settings`/`loadSettings`/`saveSettings` (Task 9), `GYMS` (Task 3)
- Produces:
  ```tsx
  GymCard(props: { gymName: string; buckets: DayBucket[]; busyThreshold: number; selectedDate: string | null; onSelectDate(d: string): void; onRemove(): void })
  DayDetail(props: { bucket: DayBucket })
  GymPicker(props: { favorites: string[]; onToggle(gymId: string): void })
  SettingsPanel(props: { settings: Settings; onChange(s: Settings): void })
  ```

- [ ] **Step 1: 실패하는 테스트** (jsdom)
  - `GymCard`: 버킷 7개(total `[0,5,31,0,20,8,0]`, threshold 20) → 막대 7개, 각 막대 `aria-label`에 `'{요일} {n}명'`(예 `'수 31명'`), 31·20 막대에 `data-busy="true"`, 가장 큰 값이 높이 100%. 막대 클릭 → `onSelectDate('…')`.
  - `DayDetail`: 시간대 안 정모를 시간순으로 `'19:00 · 크루명 · 10/14명 · 소모임'` 형식으로 표시하고 원본 링크(`target="_blank"`); 시간대 밖 정모는 흐린 스타일(`data-dim="true"`)로 아래에. 정원 null이면 `'10명'`.
  - `GymPicker`: `'종로'` 입력 → `climbingpark-jongno`, `peakers-jongno` 표시; 클릭 → `onToggle`.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — `app/page.tsx`(client): `loadSettings` → `/api/week` fetch → 즐겨찾기 암장마다 `GymCard`. 즐겨찾기 없으면 `GymPicker`를 바로 보여줌. 상단에 `마지막 수집: M/D HH:mm` (null이면 `'아직 수집 전'`). 요일 라벨은 `오늘`, 그 뒤 `월`~`일`. 차트 라이브러리 없이 div 막대. 모바일 우선. `manifest.ts`로 홈 화면 추가 지원(이름 `암장 혼잡도`).
- [ ] **Step 4: 통과 확인** — `pnpm test` 전체 PASS, `pnpm build` 성공.
- [ ] **Step 5: 화면 확인** — `pnpm dev` 후 PGlite/로컬 데이터 또는 Neon 데이터로 브라우저에서 즐겨찾기 추가 → 카드·막대·상세 확인(폭 390px).
- [ ] **Step 6: 커밋** — `feat: weekly gym cards UI`

---

### Task 12: 관리 화면 (미매칭 장소 → 별칭 추가)

**Files:** Create `app/admin/page.tsx`, `app/admin/actions.ts` · Test `tests/admin.test.ts`

**Interfaces:**
- Consumes: `listUnmatched`, `addAlias`, `rematchUnmatched` (Task 6), `GYMS`
- Produces: `export async function addAliasAction(key: string, alias: string, gymId: string): Promise<{ ok: boolean; rematched: number }>` (server action); `/admin?key=…`

- [ ] **Step 1: 실패하는 테스트** — `addAliasAction`을 DB 주입 가능한 내부 함수 `addAliasWith(db, adminKey, key, alias, gymId)`로 테스트: 키 불일치 → `{ok:false, rematched:0}`, DB 변경 없음; 없는 gymId → `ok:false`; 정상 → `ok:true`, 재매칭 수 반환.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 페이지는 `searchParams.key !== process.env.ADMIN_KEY`면 404. 미매칭 목록(텍스트, 횟수, 예시 링크) 각 행에 암장 선택 + 추가 버튼.
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `feat: admin alias screen`

---

### Task 13: 배포 (외부 서비스 — 각 단계 사용자 확인 후)

- [ ] **Step 1: 사용자에게 확인** — GitHub 저장소 공개/비공개(Task 8 Step 6 측정치와 함께), 저장소 이름. 확인 전 아무것도 만들지 않는다.
- [ ] **Step 2:** `gh repo create` + push.
- [ ] **Step 3:** Vercel 프로젝트 연결(Hobby) + Marketplace에서 Neon 무료 DB 추가 → `DATABASE_URL` 자동 등록, `ADMIN_KEY` 생성 등록. `vercel env pull`로 로컬에도.
- [ ] **Step 4:** GitHub Secrets에 `DATABASE_URL` 등록(`gh secret set`).
- [ ] **Step 5:** `gh workflow run scrape.yml` 수동 실행 → 성공 확인, `scrape_runs`에 ok 행.
- [ ] **Step 6:** 배포 URL에서 `/api/week`가 정모를 반환하고 화면에 카드가 보이는지 확인. `/admin?key=…`에서 미매칭 상위 항목을 보고 사용자에게 보고.
- [ ] **Step 7:** URL·관리 키 전달 방법을 사용자에게 알림.
