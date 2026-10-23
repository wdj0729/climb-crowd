import { neon } from '@neondatabase/serverless';

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export function neonDb(url: string): Db {
  const sql = neon(url);
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await sql.query(text, params)) as T[];
    },
  };
}

// Kept as separate statements: neither Neon's HTTP driver nor PGlite's parameterised query runs a batch.
const SCHEMA = [
  `create table if not exists groups (
    source text not null,
    external_id text not null,
    name text not null,
    url text not null,
    primary key (source, external_id)
  )`,
  `create table if not exists meetups (
    source text not null,
    external_id text not null,
    group_external_id text not null,
    title text not null,
    starts_at timestamptz not null,
    participants integer not null,
    capacity integer,
    place_text text,
    place_lat double precision,
    place_lon double precision,
    gym_id text,
    url text not null,
    last_seen_at timestamptz not null,
    primary key (source, external_id)
  )`,
  `create index if not exists meetups_starts_at on meetups (starts_at)`,
  `create table if not exists gym_aliases (
    alias text primary key,
    gym_id text not null
  )`,
  `create table if not exists scrape_runs (
    id serial primary key,
    started_at timestamptz not null,
    finished_at timestamptz not null,
    ok boolean not null,
    stats jsonb not null
  )`,
];

export async function migrate(db: Db): Promise<void> {
  for (const statement of SCHEMA) await db.query(statement);
}
