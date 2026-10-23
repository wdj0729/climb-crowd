import { describe, expect, it } from 'vitest';
import { BRANDS, GYMS } from '@/lib/gyms/seed';
import { matchGym, normalize } from '@/lib/gyms/match';

const none = { placeText: null, placeLat: null, placeLon: null };
const match = (input: Partial<Parameters<typeof matchGym>[0]> & { title: string }, extra?: Record<string, string>) =>
  matchGym({ ...none, ...input }, GYMS, BRANDS, extra);

describe('gym seed data', () => {
  it('has unique ids', () => {
    expect(new Set(GYMS.map((g) => g.id)).size).toBe(GYMS.length);
  });

  it('cites a source for every gym', () => {
    expect(GYMS.every((g) => g.source.startsWith('http'))).toBe(true);
  });

  it('only contains gyms inside Seoul', () => {
    for (const g of GYMS) {
      expect(g.lat).toBeGreaterThan(37.4);
      expect(g.lat).toBeLessThan(37.72);
      expect(g.lon).toBeGreaterThan(126.76);
      expect(g.lon).toBeLessThan(127.19);
    }
  });

  it('points every branded gym at a known brand', () => {
    const ids = new Set(BRANDS.map((b) => b.id));
    expect(GYMS.filter((g) => g.brandId && !ids.has(g.brandId))).toEqual([]);
  });
});

describe('matchGym', () => {
  it('matches a spelled-out place text', () => {
    expect(match({ placeText: '클라이밍 파크 종로', title: '클팍 종로💜🧗🏻‍♀️' })).toBe('climbingpark-jongno');
  });

  it('matches branch-then-brand in a title', () => {
    expect(match({ title: '성수 더클라임 낮클' })).toBe('theclimb-seongsu');
    expect(match({ title: '종로 피커스 퇴근클' })).toBe('peakers-jongno');
  });

  it('matches brand nicknames', () => {
    expect(match({ title: '더클 강남 7시까지' })).toBe('theclimb-gangnam');
  });

  it('matches a place tag by name and coordinates', () => {
    expect(match({ placeText: '피커스클라이밍신촌', title: '신촌해변', placeLat: 37.5565639285478, placeLon: 126.940328119434 })).toBe('peakers-sinchon');
  });

  it('matches by coordinates when the meetup mentions climbing', () => {
    const g = GYMS.find((x) => x.id === 'theclimb-mullae')!;
    expect(match({ placeText: '아무이름', title: '저녁 클밍', placeLat: g.lat + 0.0005, placeLon: g.lon })).toBe('theclimb-mullae');
    expect(match({ placeText: '아무이름', title: '볼더링 같이해요', placeLat: g.lat + 0.0005, placeLon: g.lon })).toBe('theclimb-mullae');
  });

  it('ignores a nearby place tag for a non-climbing meetup', () => {
    const g = GYMS.find((x) => x.id === 'theclimb-sillim')!;
    expect(match({ placeText: '원조민속순대타운', title: '신림하면 순대 먹부림', placeLat: g.lat + 0.0005, placeLon: g.lon })).toBeNull();
  });

  it('prefers an admin alias over coordinates', () => {
    const g = GYMS.find((x) => x.id === 'theclimb-mullae')!;
    expect(match({ placeText: '문래 클라이밍장', title: '클밍', placeLat: g.lat, placeLon: g.lon }, { [normalize('문래 클라이밍장')]: 'seoulforest-yeongdeungpo' }))
      .toBe('seoulforest-yeongdeungpo');
  });

  it('does not guess a branch for a multi-branch brand', () => {
    expect(match({ title: '더클 7시' })).toBeNull();
  });

  it('matches a single-branch brand by name alone', () => {
    expect(match({ title: '그루트 저녁벙' })).toBe('groot-seongsu');
  });

  it('matches an unbranded gym by its name', () => {
    expect(match({ placeText: '버티고클라이밍짐', title: '정모' })).toBe('버티고클라이밍짐');
  });

  it('accepts the common 더클라이밍 misspelling', () => {
    expect(match({ placeText: '더클라이밍 문래점', title: '정모' })).toBe('theclimb-mullae');
  });

  it('matches an unbranded gym by its short name in the place text', () => {
    expect(match({ placeText: '노원 드림캐처', title: '정모' })).toBe('드림캐처클라이밍짐');
  });

  it('does not match short gym names inside titles', () => {
    expect(match({ title: '위클리 정모' })).toBeNull();
  });

  it('rejects non-climbing meetups', () => {
    expect(match({ placeText: '석촌 푸른하늘', title: '토요일 보드게임 모임 😇🤗🎲☄️' })).toBeNull();
    expect(match({ placeText: '공지', title: '할로윈 🎃 보드게임 나이트 👻' })).toBeNull();
  });

  it('uses extra aliases added by the admin', () => {
    expect(match({ placeText: '신촌해변암장', title: 'x' }, { [normalize('신촌해변암장')]: 'peakers-sinchon' })).toBe('peakers-sinchon');
  });
});
