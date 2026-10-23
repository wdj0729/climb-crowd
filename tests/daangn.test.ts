import { describe, expect, it } from 'vitest';
import { daangnSearchUrl, parseDaangnGroup, parseDaangnSearch, type DaangnRegion } from '@/scraper/daangn/parse';
import { SEOUL_DISTRICTS } from '@/scraper/somoim/districts';
import regions from '@/scraper/daangn/regions.json';
import { fixture } from './helpers/fixture';

const GROUP_URL = 'https://www.daangn.com/kr/group/%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D-%EB%AA%A8%EC%9E%84-b7nnwocr7gc5/';

describe('daangn search', () => {
  it('builds a district search url', () => {
    expect(decodeURIComponent(daangnSearchUrl({ name: '강남구', id: 381 }))).toBe(
      'https://www.daangn.com/kr/search/group/?in=강남구-381&q=클라이밍',
    );
  });

  it('reads groups from the JSON-LD list', () => {
    const groups = parseDaangnSearch(fixture('daangn-search-seoul.html'));
    expect(groups).toHaveLength(29);
    expect(groups.map((g) => g.name)).toContain('직장인 클라이밍');
    expect(groups.every((g) => g.url.startsWith('https://www.daangn.com/kr/group/'))).toBe(true);
  });
});

describe('daangn group page', () => {
  const { group, meetups } = parseDaangnGroup(fixture('daangn-group-climbing.html'), GROUP_URL);

  it('reads the group', () => {
    expect(group).toEqual({ source: 'daangn', externalId: 'b7nnwocr7gc5', name: '클라이밍 모임', url: GROUP_URL });
  });

  it('reads embedded meetups', () => {
    expect(meetups).toHaveLength(5);
    expect(meetups.find((m) => m.externalId === '306253610')).toMatchObject({
      groupExternalId: 'b7nnwocr7gc5',
      title: '성수 더클라임 낮클',
      startsAt: new Date('2026-10-23T05:00:00Z'),
      participants: 2,
      capacity: 4,
      placeText: null,
      placeLat: null,
    });
  });

  it('keeps place tags with coordinates', () => {
    expect(meetups.find((m) => m.externalId === '306184490')).toMatchObject({
      placeText: '피커스클라이밍신촌',
      placeLat: 37.5565639285478,
      placeLon: 126.940328119434,
    });
  });
});

describe('Seoul region ids', () => {
  const list = regions as DaangnRegion[];

  it('covers exactly the 25 districts', () => {
    expect(list).toHaveLength(25);
    expect(new Set(list.map((r) => r.name))).toEqual(new Set(SEOUL_DISTRICTS));
  });

  it('has known ids', () => {
    expect(list).toEqual(expect.arrayContaining([
      { name: '강남구', id: 381 }, { name: '서초구', id: 362 }, { name: '관악구', id: 340 }, { name: '강서구', id: 257 },
    ]));
  });
});
