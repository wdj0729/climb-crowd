# 암장 혼잡도

소모임·당근 모임에 올라온 서울 클라이밍 정모를 하루 3번 모아, 즐겨찾는 암장이 이번 주 언제 붐빌지 보여주는 웹앱.

- 앱: https://climb-crowd.vercel.app
- 설계: `docs/superpowers/specs/2026-10-23-climb-crowd-design.md`

## 구조

- `app/`, `components/` — Next.js 웹앱 (Vercel). `/api/week`가 이번 주 정모를 내려주고, 화면은 브라우저 설정(시간대·즐겨찾기)으로 계산한다.
- `scraper/` — 수집기. GitHub Actions(`.github/workflows/scrape.yml`)가 KST 07/12/18시에 `pnpm scrape` 실행.
- `lib/` — 공용 코드: DB(`db.ts`, `store.ts`), 암장 목록과 매칭(`gyms/`), KST 시간 계산.

## 환경 변수

| 이름 | 쓰는 곳 |
|---|---|
| `DATABASE_URL` | Neon Postgres. Vercel 프로젝트와 GitHub Secrets에 등록 |
| `ADMIN_KEY` | 관리 화면 키. Vercel에 등록 |

`vercel env pull .env.local`로 로컬에 받는다.

## 자주 쓰는 명령

```bash
pnpm test                 # 테스트
pnpm dev                  # 로컬 실행
pnpm scrape --dry         # 실제 사이트를 수집해 로컬 PGlite(.scrape-dry/)에 저장
gh workflow run scrape.yml  # 수집 수동 실행
```

## 관리 화면

`https://climb-crowd.vercel.app/admin?key=<ADMIN_KEY>` — 암장에 연결되지 않은 정모 장소를 골라 별칭으로 연결한다.

## 알려진 한계

- 소모임 웹 검색은 지역을 무시하고 약 100개 모임만 보여준다.
- 당근 모임 페이지는 가까운 정모 5개만 담는다. 그 이후 정모는 보이지 않는다.
- 암장 목록은 holday.rocks 서울 목록(`lib/gyms/seoul-gyms.json`) 기준이다.
