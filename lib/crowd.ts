import { isWeekend, kstDateKey, kstMinutesOfDay } from './time';
import type { WeekMeetup } from './types';

export interface TimeWindow {
  weekdayStart: string; // 'HH:MM'
  weekendStart: string;
}

export interface DayBucket {
  date: string;
  total: number;
  inWindow: WeekMeetup[];
  outOfWindow: WeekMeetup[];
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** A meetup counts when it starts at or after the day's window start (KST). */
export function inWindow(startsAt: Date, w: TimeWindow): boolean {
  const start = isWeekend(kstDateKey(startsAt)) ? w.weekendStart : w.weekdayStart;
  return kstMinutesOfDay(startsAt) >= toMinutes(start);
}

export function dayBuckets(meetups: WeekMeetup[], gymId: string, days: string[], w: TimeWindow): DayBucket[] {
  const byDate = new Map<string, DayBucket>(
    days.map((date) => [date, { date, total: 0, inWindow: [], outOfWindow: [] }]),
  );
  const sorted = meetups
    .filter((m) => m.gymId === gymId)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  for (const m of sorted) {
    const startsAt = new Date(m.startsAt);
    const bucket = byDate.get(kstDateKey(startsAt));
    if (!bucket) continue;
    if (inWindow(startsAt, w)) {
      bucket.inWindow.push(m);
      bucket.total += m.participants;
    } else {
      bucket.outOfWindow.push(m);
    }
  }
  return days.map((d) => byDate.get(d)!);
}
