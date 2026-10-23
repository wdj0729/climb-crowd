import type { Db } from './db';
import { lastSuccessfulRunAt, listWeekMeetups } from './store';
import { kstStartOfDay, nextDays } from './time';
import type { WeekResponse } from './types';

const DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function getWeek(db: Db, now: Date): Promise<WeekResponse> {
  const days = nextDays(now, DAYS);
  const from = kstStartOfDay(days[0]);
  const to = new Date(kstStartOfDay(days[DAYS - 1]).getTime() + DAY_MS);
  const [meetups, last] = await Promise.all([listWeekMeetups(db, from, to), lastSuccessfulRunAt(db)]);
  return { days, lastScrapeAt: last ? last.toISOString() : null, meetups };
}
