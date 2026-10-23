import { describe, expect, it } from 'vitest';
import { dayBuckets, inWindow } from '@/lib/crowd';
import type { WeekMeetup } from '@/lib/types';

const w = { weekdayStart: '18:00', weekendStart: '14:00' };

let seq = 0;
function m(gymId: string, startsAt: string, participants: number): WeekMeetup {
  seq += 1;
  return { id: `t:${seq}`, source: 'somoim', gymId, title: `m${seq}`, groupName: 'g', startsAt, participants, capacity: null, url: 'u' };
}

const days = ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'];

describe('inWindow', () => {
  it('uses the weekday start on weekdays', () => {
    expect(inWindow(new Date('2026-10-22T09:00:00Z'), w)).toBe(true); // Thu 18:00 KST
    expect(inWindow(new Date('2026-10-22T08:59:00Z'), w)).toBe(false); // Thu 17:59 KST
  });

  it('uses the weekend start on weekends', () => {
    expect(inWindow(new Date('2026-10-24T05:00:00Z'), w)).toBe(true); // Sat 14:00 KST
    expect(inWindow(new Date('2026-10-24T04:30:00Z'), w)).toBe(false); // Sat 13:30 KST
  });
});

describe('dayBuckets', () => {
  it('sums in-window meetups for one gym per day', () => {
    const late = m('a', '2026-10-29T11:00:00Z', 12); // Thu 20:00
    const early = m('a', '2026-10-29T10:00:00Z', 10); // Thu 19:00
    const afternoon = m('a', '2026-10-29T06:00:00Z', 8); // Thu 15:00
    const otherGym = m('b', '2026-10-29T10:00:00Z', 30);
    const buckets = dayBuckets([late, afternoon, otherGym, early], 'a', days, w);

    expect(buckets.map((b) => b.date)).toEqual(days);
    const thu = buckets[6];
    expect(thu.total).toBe(22);
    expect(thu.inWindow.map((x) => x.id)).toEqual([early.id, late.id]);
    expect(thu.outOfWindow.map((x) => x.id)).toEqual([afternoon.id]);
    expect(buckets[0].total).toBe(0);
  });

  it('puts a late-UTC meetup on the next KST day', () => {
    const pastMidnight = m('a', '2026-10-24T15:30:00Z', 9); // Sun 00:30 KST
    const buckets = dayBuckets([pastMidnight], 'a', days, w);
    const sun = buckets.find((b) => b.date === '2026-10-25')!;
    expect(sun.outOfWindow.map((x) => x.id)).toEqual([pastMidnight.id]);
    expect(sun.total).toBe(0);
    expect(buckets.find((b) => b.date === '2026-10-24')!.outOfWindow).toEqual([]);
  });

  it('drops meetups outside the given days', () => {
    const buckets = dayBuckets([m('a', '2026-10-30T10:00:00Z', 5)], 'a', days, w);
    expect(buckets.every((b) => b.inWindow.length === 0 && b.outOfWindow.length === 0)).toBe(true);
  });
});
