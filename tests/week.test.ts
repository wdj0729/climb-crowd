import { describe, expect, it } from 'vitest';
import { recordRun, syncGroupMeetups, upsertGroup, type StoredMeetup } from '@/lib/store';
import { getWeek } from '@/lib/week';
import { testDb } from './helpers/pglite';

const at = (iso: string, id: string): StoredMeetup => ({
  source: 'daangn', externalId: id, groupExternalId: 'g', title: id, startsAt: new Date(iso), participants: 5, capacity: 10,
  placeText: null, placeLat: null, placeLon: null, url: 'u', gymId: 'theclimb-gangnam',
});

describe('getWeek', () => {
  it('returns seven KST days from today and only their meetups', async () => {
    const db = await testDb();
    await upsertGroup(db, { source: 'daangn', externalId: 'g', name: 'G', url: 'u' });
    await syncGroupMeetups(db, 'daangn', 'g', [
      at('2026-10-22T14:59:00Z', 'before'), // 10/22 23:59 KST
      at('2026-10-22T15:00:00Z', 'first'), // 10/23 00:00 KST
      at('2026-10-29T14:59:00Z', 'last'), // 10/29 23:59 KST
      at('2026-10-29T15:00:00Z', 'after'), // 10/30 00:00 KST
    ], new Date('2026-10-01T00:00:00Z'));
    const week = await getWeek(db, new Date('2026-10-23T03:00:00Z'));
    expect(week.days).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']);
    expect(week.meetups.map((m) => m.title)).toEqual(['first', 'last']);
    expect(week.lastScrapeAt).toBeNull();
  });

  it('includes the last successful scrape time', async () => {
    const db = await testDb();
    const t = new Date('2026-10-22T22:05:00Z');
    await recordRun(db, { startedAt: t, finishedAt: t, ok: true, stats: {} });
    expect((await getWeek(db, new Date('2026-10-23T03:00:00Z'))).lastScrapeAt).toBe('2026-10-22T22:05:00.000Z');
  });
});
