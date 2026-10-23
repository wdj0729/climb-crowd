import type { Db } from './db';
import { matchGym, normalize } from './gyms/match';
import { BRANDS, GYMS } from './gyms/seed';
import type { RawGroup, RawMeetup, Source, WeekMeetup } from './types';

export type StoredMeetup = RawMeetup & { gymId: string | null };

const toDate = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));

export async function upsertGroup(db: Db, g: RawGroup): Promise<void> {
  await db.query(
    `insert into groups (source, external_id, name, url) values ($1, $2, $3, $4)
     on conflict (source, external_id) do update set name = excluded.name, url = excluded.url`,
    [g.source, g.externalId, g.name, g.url],
  );
}

/**
 * Upserts the group's meetups as seen now, and deletes the group's future meetups that are no longer
 * listed (cancelled). Only call this for a group whose page was read successfully. When the source only
 * showed part of the list, pass `until` (the last time it covers) so later meetups are left alone.
 */
export async function syncGroupMeetups(
  db: Db,
  source: Source,
  groupExternalId: string,
  meetups: StoredMeetup[],
  now: Date,
  until?: Date,
): Promise<{ upserted: number; removed: number }> {
  for (const m of meetups) {
    await db.query(
      `insert into meetups (source, external_id, group_external_id, title, starts_at, participants, capacity,
         place_text, place_lat, place_lon, gym_id, url, last_seen_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (source, external_id) do update set
         group_external_id = excluded.group_external_id, title = excluded.title, starts_at = excluded.starts_at,
         participants = excluded.participants, capacity = excluded.capacity, place_text = excluded.place_text,
         place_lat = excluded.place_lat, place_lon = excluded.place_lon, gym_id = excluded.gym_id,
         url = excluded.url, last_seen_at = excluded.last_seen_at`,
      [m.source, m.externalId, groupExternalId, m.title, m.startsAt.toISOString(), m.participants, m.capacity,
        m.placeText, m.placeLat, m.placeLon, m.gymId, m.url, now.toISOString()],
    );
  }
  const removed = await db.query(
    `delete from meetups
     where source = $1 and group_external_id = $2 and starts_at >= $3 and not (external_id = any($4::text[]))
       and ($5::timestamptz is null or starts_at <= $5)
     returning external_id`,
    [source, groupExternalId, now.toISOString(), meetups.map((m) => m.externalId), until ? until.toISOString() : null],
  );
  return { upserted: meetups.length, removed: removed.length };
}

export async function listGroupsWithFutureMeetups(db: Db, source: Source, now: Date): Promise<{ externalId: string; url: string }[]> {
  const rows = await db.query<{ external_id: string; url: string }>(
    `select g.external_id, g.url from groups g
     where g.source = $1 and exists (
       select 1 from meetups m where m.source = g.source and m.group_external_id = g.external_id and m.starts_at >= $2)
     order by g.external_id`,
    [source, now.toISOString()],
  );
  return rows.map((r) => ({ externalId: r.external_id, url: r.url }));
}

interface WeekRow {
  source: Source;
  external_id: string;
  gym_id: string;
  title: string;
  group_name: string | null;
  starts_at: unknown;
  participants: number;
  capacity: number | null;
  url: string;
}

export async function listWeekMeetups(db: Db, from: Date, to: Date): Promise<WeekMeetup[]> {
  const rows = await db.query<WeekRow>(
    `select m.source, m.external_id, m.gym_id, m.title, g.name as group_name, m.starts_at, m.participants, m.capacity, m.url
     from meetups m
     left join groups g on g.source = m.source and g.external_id = m.group_external_id
     where m.gym_id is not null and m.starts_at >= $1 and m.starts_at < $2
     order by m.starts_at, m.source, m.external_id`,
    [from.toISOString(), to.toISOString()],
  );
  return rows.map((r) => ({
    id: `${r.source}:${r.external_id}`,
    source: r.source,
    gymId: r.gym_id,
    title: r.title,
    groupName: r.group_name ?? '',
    startsAt: toDate(r.starts_at).toISOString(),
    participants: Number(r.participants),
    capacity: r.capacity == null ? null : Number(r.capacity),
    url: r.url,
  }));
}

export async function getExtraAliases(db: Db): Promise<Record<string, string>> {
  const rows = await db.query<{ alias: string; gym_id: string }>(`select alias, gym_id from gym_aliases`);
  return Object.fromEntries(rows.map((r) => [r.alias, r.gym_id]));
}

export async function addAlias(db: Db, alias: string, gymId: string): Promise<void> {
  await db.query(
    `insert into gym_aliases (alias, gym_id) values ($1, $2) on conflict (alias) do update set gym_id = excluded.gym_id`,
    [normalize(alias), gymId],
  );
}

/** Re-runs matching for every unmatched meetup; returns how many now have a gym. */
export async function rematchUnmatched(db: Db): Promise<number> {
  const extra = await getExtraAliases(db);
  const rows = await db.query<{ source: string; external_id: string; title: string; place_text: string | null; place_lat: number | null; place_lon: number | null }>(
    `select source, external_id, title, place_text, place_lat, place_lon from meetups where gym_id is null`,
  );
  let updated = 0;
  for (const r of rows) {
    const gymId = matchGym({ placeText: r.place_text, title: r.title, placeLat: r.place_lat, placeLon: r.place_lon }, GYMS, BRANDS, extra);
    if (!gymId) continue;
    await db.query(`update meetups set gym_id = $3 where source = $1 and external_id = $2`, [r.source, r.external_id, gymId]);
    updated++;
  }
  return updated;
}

export async function listUnmatched(db: Db, now: Date): Promise<{ text: string; count: number; exampleUrl: string }[]> {
  const rows = await db.query<{ text: string; count: unknown; example_url: string }>(
    `select coalesce(place_text, title) as text, count(*) as count, min(url) as example_url
     from meetups where gym_id is null and starts_at >= $1
     group by 1 order by count(*) desc, 1`,
    [now.toISOString()],
  );
  return rows.map((r) => ({ text: r.text, count: Number(r.count), exampleUrl: r.example_url }));
}

export async function recordRun(db: Db, r: { startedAt: Date; finishedAt: Date; ok: boolean; stats: object }): Promise<void> {
  await db.query(`insert into scrape_runs (started_at, finished_at, ok, stats) values ($1, $2, $3, $4)`, [
    r.startedAt.toISOString(), r.finishedAt.toISOString(), r.ok, JSON.stringify(r.stats),
  ]);
}

export async function lastSuccessfulRunAt(db: Db): Promise<Date | null> {
  const rows = await db.query<{ finished_at: unknown }>(
    `select finished_at from scrape_runs where ok order by finished_at desc limit 1`,
  );
  return rows.length ? toDate(rows[0].finished_at) : null;
}
