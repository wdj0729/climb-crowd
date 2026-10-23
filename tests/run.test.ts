import { describe, expect, it } from 'vitest';
import { listUnmatched, listWeekMeetups, syncGroupMeetups, upsertGroup } from '@/lib/store';
import { daangnSearchUrl } from '@/scraper/daangn/parse';
import regions from '@/scraper/daangn/regions.json';
import type { Fetcher } from '@/scraper/http';
import { runScrape } from '@/scraper/run';
import { somoimSearchUrl } from '@/scraper/somoim/parse';
import { fixture } from './helpers/fixture';
import { testDb } from './helpers/pglite';

const CLIMB = '01bc91bf-acf3-46ff-a23d-f394c572d6341';
const BOARD = '0306535c-36bc-11ee-88e0-0ac117cfe3691';
const EMPTY = '01105740-1371-4135-89da-c687b329dd0c1';
const BROKEN = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee1';
const DAANGN_GROUP = 'https://www.daangn.com/kr/group/%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D-%EB%AA%A8%EC%9E%84-b7nnwocr7gc5/';

const somoimSearch = `<a href="/${CLIMB}">a</a><a href="/${BOARD}">b</a><a href="/${EMPTY}">c</a><a href="/${BROKEN}">d</a>`;
const daangnSearch = `<script type="application/ld+json">${JSON.stringify({
  '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', url: DAANGN_GROUP, name: '클라이밍 모임' }],
})}</script>`;

function fakeFetcher(pages: Record<string, string | Error>, fallback = '<html></html>') {
  const calls: string[] = [];
  const fetcher: Fetcher = {
    async get(url) {
      calls.push(url);
      const page = pages[url] ?? fallback;
      if (page instanceof Error) throw page;
      return page;
    },
  };
  return { fetcher, calls };
}

function fakes() {
  const somoim = fakeFetcher({
    [somoimSearchUrl('마포구')]: somoimSearch,
    [somoimSearchUrl('강남구')]: somoimSearch,
    [`https://www.somoim.co.kr/${CLIMB}`]: fixture('somoim-group-climb.html'),
    [`https://www.somoim.co.kr/${BOARD}`]: fixture('somoim-group-boardgame.html'),
    [`https://www.somoim.co.kr/${EMPTY}`]: fixture('somoim-group-empty.html'),
    [`https://www.somoim.co.kr/${BROKEN}`]: new Error('timeout'),
  });
  const daangn = fakeFetcher({
    [daangnSearchUrl(regions[0])]: daangnSearch,
    [daangnSearchUrl(regions[1])]: daangnSearch,
    [DAANGN_GROUP]: fixture('daangn-group-climbing.html'),
  });
  return { somoim, daangn };
}

const NOW = new Date('2026-10-23T00:00:00Z');
const quiet = () => {};

describe('runScrape', () => {
  it('visits each group once even when several searches list it', async () => {
    const db = await testDb();
    const { somoim, daangn } = fakes();
    await runScrape({ db, somoim: somoim.fetcher, daangn: daangn.fetcher, now: NOW, log: quiet, daangnSitemapGroups: async () => [DAANGN_GROUP] });
    const counts = new Map<string, number>();
    for (const c of [...somoim.calls, ...daangn.calls]) counts.set(c, (counts.get(c) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    expect(somoim.calls).toContain(`https://www.somoim.co.kr/${CLIMB}`);
    expect(daangn.calls).toContain(DAANGN_GROUP);
  });

  it('stores matched and unmatched meetups and keeps going past a broken group', async () => {
    const db = await testDb();
    await upsertGroup(db, { source: 'somoim', externalId: BROKEN, name: 'old', url: 'u' });
    await syncGroupMeetups(db, 'somoim', BROKEN, [{
      source: 'somoim', externalId: `${BROKEN}:202610251900`, groupExternalId: BROKEN, title: 't', startsAt: new Date('2026-10-25T10:00:00Z'),
      participants: 3, capacity: null, placeText: null, placeLat: null, placeLon: null, url: 'u', gymId: 'theclimb-gangnam',
    }], NOW);
    const { somoim, daangn } = fakes();

    const stats = await runScrape({ db, somoim: somoim.fetcher, daangn: daangn.fetcher, now: NOW, log: quiet, daangnSitemapGroups: async () => [] });

    const s = stats.find((x) => x.source === 'somoim')!;
    expect(s).toMatchObject({ groupsFound: 4, groupsOk: 3, groupsFailed: 1, meetups: 3, matched: 1 });
    const week = await listWeekMeetups(db, NOW, new Date('2026-11-05T00:00:00Z'));
    expect(week.map((m) => [m.id, m.gymId])).toEqual(expect.arrayContaining([
      [`somoim:${CLIMB}:202610241400`, 'climbingpark-jongno'],
      [`somoim:${BROKEN}:202610251900`, 'theclimb-gangnam'],
      ['daangn:306253610', 'theclimb-seongsu'],
    ]));
    const unmatched = (await listUnmatched(db, NOW)).map((u) => u.text);
    expect(unmatched).toEqual(expect.arrayContaining(['석촌 푸른하늘', '공지']));
  });

  it('flags daangn groups whose five embedded meetups are all upcoming', async () => {
    const db = await testDb();
    const { somoim, daangn } = fakes();
    const stats = await runScrape({ db, somoim: somoim.fetcher, daangn: daangn.fetcher, now: new Date('2026-10-01T00:00:00Z'), log: quiet, daangnSitemapGroups: async () => [] });
    expect(stats.find((x) => x.source === 'daangn')!.truncatedGroups).toBe(1);
  });

  it('runs both sources at the same time', async () => {
    const db = await testDb();
    const { somoim, daangn } = fakes();
    let daangnStarted!: () => void;
    const started = new Promise<void>((r) => { daangnStarted = r; });
    const gatedSomoim: Fetcher = {
      async get(url) {
        await Promise.race([started, new Promise((_, rej) => setTimeout(() => rej(new Error('sources ran sequentially')), 500))]);
        return somoim.fetcher.get(url);
      },
    };
    const signallingDaangn: Fetcher = { async get(url) { daangnStarted(); return daangn.fetcher.get(url); } };
    const stats = await runScrape({ db, somoim: gatedSomoim, daangn: signallingDaangn, now: NOW, log: quiet, daangnSitemapGroups: async () => [] });
    expect(stats.find((x) => x.source === 'somoim')!.groupsOk).toBe(3);
  });
});
