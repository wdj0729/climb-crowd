import { describe, expect, it } from 'vitest';
import { parseSomoimGroup, parseSomoimSearch, SEOUL_DISTRICTS, SOMOIM_KEYWORDS, somoimSearchUrl } from '@/scraper/somoim/parse';
import { fixture } from './helpers/fixture';

const CLIMB_ID = '01bc91bf-acf3-46ff-a23d-f394c572d6341';

describe('somoim search', () => {
  it('lists 25 Seoul districts', () => {
    expect(SEOUL_DISTRICTS).toHaveLength(25);
    expect(SEOUL_DISTRICTS).toContain('강남구');
    expect(SEOUL_DISTRICTS).toContain('중랑구');
  });

  it('builds a keyword search url (the district part is ignored by Somoim, so one fixed district is used)', () => {
    expect(decodeURI(somoimSearchUrl('클라이밍'))).toBe('https://www.somoim.co.kr/groups/search/서울특별시/마포구/클라이밍');
    expect(SOMOIM_KEYWORDS).toEqual(['클라이밍', '클라이밍크루', '실내클라이밍', '볼더']);
  });

  it('extracts unique group ids', () => {
    const ids = parseSomoimSearch(fixture('somoim-search-mapo.html'));
    expect(ids).toHaveLength(94);
    expect(ids).toContain('01105740-1371-4135-89da-c687b329dd0c1');
  });
});

describe('somoim group page', () => {
  it('reads the group and its meetup', () => {
    const { group, meetups } = parseSomoimGroup(fixture('somoim-group-climb.html'), CLIMB_ID);
    expect(group).toEqual({ source: 'somoim', externalId: CLIMB_ID, name: '💜클라이밍 크루 무라사키💜', url: `https://www.somoim.co.kr/${CLIMB_ID}` });
    expect(meetups).toHaveLength(1);
    expect(meetups[0]).toEqual({
      source: 'somoim',
      externalId: `${CLIMB_ID}:202610241400`,
      groupExternalId: CLIMB_ID,
      title: '클팍 종로💜🧗🏻‍♀️',
      startsAt: new Date('2026-10-24T05:00:00Z'),
      participants: 4,
      capacity: 10,
      placeText: '클라이밍 파크 종로',
      placeLat: null,
      placeLon: null,
      url: `https://www.somoim.co.kr/${CLIMB_ID}`,
    });
  });

  it('returns no meetups for a group without any', () => {
    expect(parseSomoimGroup(fixture('somoim-group-empty.html'), '01105740-1371-4135-89da-c687b329dd0c1').meetups).toEqual([]);
  });

  it('reads several meetups', () => {
    const { meetups } = parseSomoimGroup(fixture('somoim-group-boardgame.html'), '0306535c-36bc-11ee-88e0-0ac117cfe3691');
    expect(meetups.map((m) => [m.title, m.startsAt.toISOString(), m.placeText, m.participants, m.capacity])).toEqual([
      ['토요일 보드게임 모임 😇🤗🎲☄️', '2026-10-24T06:00:00.000Z', '석촌 푸른하늘', 4, 14],
      ['할로윈 🎃 보드게임 나이트 👻', '2026-10-31T10:00:00.000Z', '공지', 1, 1],
    ]);
  });
});
