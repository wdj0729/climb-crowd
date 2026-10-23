import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, type Db } from '@/lib/db';
import {
  addAlias, getExtraAliases, lastSuccessfulRunAt, listUnmatched, listWeekMeetups,
  listGroupsWithFutureMeetups, recordRun, rematchUnmatched, syncGroupMeetups, upsertGroup, type StoredMeetup,
} from '@/lib/store';
import { testDb } from './helpers/pglite';

const NOW = new Date('2026-10-23T03:00:00Z');
const FROM = new Date('2026-10-22T15:00:00Z');
const TO = new Date('2026-10-29T15:00:00Z');

function meetup(over: Partial<StoredMeetup> = {}): StoredMeetup {
  return {
    source: 'somoim', externalId: 'g1:202610241400', groupExternalId: 'g1', title: '클팍 종로',
    startsAt: new Date('2026-10-24T05:00:00Z'), participants: 4, capacity: 10, placeText: '클라이밍 파크 종로',
    placeLat: null, placeLon: null, url: 'https://www.somoim.co.kr/g1', gymId: 'climbingpark-jongno', ...over,
  };
}

let db: Db;
beforeEach(async () => {
  db = await testDb();
  await upsertGroup(db, { source: 'somoim', externalId: 'g1', name: '무라사키', url: 'https://www.somoim.co.kr/g1' });
  await upsertGroup(db, { source: 'somoim', externalId: 'h1', name: '다른크루', url: 'https://www.somoim.co.kr/h1' });
});

describe('store', () => {
  it('migrates idempotently', async () => {
    await expect(migrate(db)).resolves.toBeUndefined();
  });

  it('updates participants on re-sync', async () => {
    await syncGroupMeetups(db, 'somoim', 'g1', [meetup()], NOW);
    await syncGroupMeetups(db, 'somoim', 'g1', [meetup({ participants: 7 })], NOW);
    const week = await listWeekMeetups(db, FROM, TO);
    expect(week).toEqual([{
      id: 'somoim:g1:202610241400', source: 'somoim', gymId: 'climbingpark-jongno', title: '클팍 종로', groupName: '무라사키',
      startsAt: '2026-10-24T05:00:00.000Z', participants: 7, capacity: 10, url: 'https://www.somoim.co.kr/g1',
    }]);
  });

  it('keeps unmatched meetups out of the week and lists them for the admin', async () => {
    await syncGroupMeetups(db, 'somoim', 'g1', [
      meetup({ externalId: 'a', gymId: null, placeText: '신촌해변암장' }),
      meetup({ externalId: 'b', gymId: null, placeText: '신촌해변암장' }),
      meetup({ externalId: 'c', gymId: null, placeText: null, title: '번개' }),
    ], NOW);
    expect(await listWeekMeetups(db, FROM, TO)).toEqual([]);
    const unmatched = await listUnmatched(db, NOW);
    expect(unmatched.map((u) => [u.text, u.count])).toEqual([['신촌해변암장', 2], ['번개', 1]]);
    expect(unmatched[0].exampleUrl).toBe('https://www.somoim.co.kr/g1');
  });

  it('removes future meetups that vanished from a group, and only those', async () => {
    const past = meetup({ externalId: 'past', startsAt: new Date('2026-10-20T10:00:00Z') });
    await syncGroupMeetups(db, 'somoim', 'g1', [meetup({ externalId: 'A' }), meetup({ externalId: 'B' }), past], NOW);
    await syncGroupMeetups(db, 'somoim', 'h1', [meetup({ externalId: 'H', groupExternalId: 'h1' })], NOW);

    const res = await syncGroupMeetups(db, 'somoim', 'g1', [meetup({ externalId: 'A' })], NOW);

    expect(res).toEqual({ upserted: 1, removed: 1 });
    const ids = (await listWeekMeetups(db, new Date('2026-10-01T00:00:00Z'), TO)).map((m) => m.id).sort();
    expect(ids).toEqual(['somoim:A', 'somoim:H', 'somoim:past']);
  });

  it('rematches unmatched meetups after an alias is added', async () => {
    await syncGroupMeetups(db, 'somoim', 'g1', [meetup({ externalId: 'a', gymId: null, placeText: '신촌해변암장', title: 'x' })], NOW);
    await addAlias(db, '신촌 해변암장', 'peakers-sinchon');
    expect(await getExtraAliases(db)).toEqual({ 신촌해변암장: 'peakers-sinchon' });
    expect(await rematchUnmatched(db)).toBe(1);
    expect((await listWeekMeetups(db, FROM, TO)).map((m) => m.gymId)).toEqual(['peakers-sinchon']);
  });

  it('reports the last successful run', async () => {
    expect(await lastSuccessfulRunAt(db)).toBeNull();
    const t10 = new Date('2026-10-23T01:00:00Z');
    const t11 = new Date('2026-10-23T02:00:00Z');
    await recordRun(db, { startedAt: t10, finishedAt: t10, ok: true, stats: {} });
    await recordRun(db, { startedAt: t11, finishedAt: t11, ok: false, stats: {} });
    expect(await lastSuccessfulRunAt(db)).toEqual(t10);
  });
});

describe('store: partial lists and known groups', () => {
  it('only deletes up to the given horizon when the source list is truncated', async () => {
    const db = await testDb();
    await upsertGroup(db, { source: 'daangn', externalId: 'g', name: 'G', url: 'u' });
    const near = meetup({ source: 'daangn', externalId: 'near', groupExternalId: 'g', startsAt: new Date('2026-10-24T05:00:00Z') });
    const gone = meetup({ source: 'daangn', externalId: 'gone', groupExternalId: 'g', startsAt: new Date('2026-10-25T05:00:00Z') });
    const later = meetup({ source: 'daangn', externalId: 'later', groupExternalId: 'g', startsAt: new Date('2026-10-28T05:00:00Z') });
    await syncGroupMeetups(db, 'daangn', 'g', [near, gone, later], NOW);
    const res = await syncGroupMeetups(db, 'daangn', 'g', [near], NOW, new Date('2026-10-26T00:00:00Z'));
    expect(res.removed).toBe(1);
    expect((await listWeekMeetups(db, FROM, TO)).map((m) => m.id)).toEqual(['daangn:near', 'daangn:later']);
  });

  it('lists known groups that still have future meetups', async () => {
    const db = await testDb();
    await upsertGroup(db, { source: 'somoim', externalId: 'g1', name: 'A', url: 'https://www.somoim.co.kr/g1' });
    await upsertGroup(db, { source: 'somoim', externalId: 'old', name: 'B', url: 'https://www.somoim.co.kr/old' });
    await syncGroupMeetups(db, 'somoim', 'g1', [meetup()], NOW);
    await syncGroupMeetups(db, 'somoim', 'old', [meetup({ externalId: 'p', groupExternalId: 'old', startsAt: new Date('2026-10-01T00:00:00Z') })], NOW);
    expect(await listGroupsWithFutureMeetups(db, 'somoim', NOW)).toEqual([{ externalId: 'g1', url: 'https://www.somoim.co.kr/g1' }]);
  });
});
