import { gunzipSync } from 'node:zlib';
import { migrate, neonDb, type Db } from '@/lib/db';
import { matchGym } from '@/lib/gyms/match';
import { BRANDS, GYMS } from '@/lib/gyms/seed';
import { getExtraAliases, recordRun, rematchUnmatched, syncGroupMeetups, upsertGroup } from '@/lib/store';
import type { RawGroup, RawMeetup, Source } from '@/lib/types';
import { daangnSearchUrl, parseDaangnGroup, parseDaangnSearch, type DaangnRegion } from './daangn/parse';
import regions from './daangn/regions.json';
import { BROWSER_UA, createFetcher, type Fetcher } from './http';
import { parseSomoimGroup, parseSomoimSearch, SOMOIM_KEYWORDS, somoimSearchUrl } from './somoim/parse';

export interface ScrapeStats {
  source: Source;
  groupsFound: number;
  groupsOk: number;
  groupsFailed: number;
  meetups: number;
  matched: number;
  removed: number;
  truncatedGroups: number;
}

interface Deps {
  db: Db;
  somoim: Fetcher;
  daangn: Fetcher;
  now: Date;
  log: (m: string) => void;
  /** Extra Daangn group URLs from the group sitemap. */
  daangnSitemapGroups: () => Promise<string[]>;
}

// Daangn group pages embed only the five most recent meetups.
const DAANGN_EMBEDDED_MEETUPS = 5;

interface SourcePlan {
  source: Source;
  fetcher: Fetcher;
  /** Search pages to read, each yielding group page URLs. */
  searches: { url: string; groups: (html: string) => string[] }[];
  extraGroups: () => Promise<string[]>;
  parseGroup: (html: string, url: string) => { group: RawGroup; meetups: RawMeetup[] };
}

async function scrapeSource(plan: SourcePlan, deps: Deps, extra: Record<string, string>): Promise<ScrapeStats> {
  const { db, now, log } = deps;
  const stats: ScrapeStats = { source: plan.source, groupsFound: 0, groupsOk: 0, groupsFailed: 0, meetups: 0, matched: 0, removed: 0, truncatedGroups: 0 };

  const groupUrls = new Set<string>();
  for (const s of plan.searches) {
    try {
      for (const u of s.groups(await plan.fetcher.get(s.url))) groupUrls.add(u);
    } catch (err) {
      log(`[${plan.source}] search failed ${s.url}: ${(err as Error).message}`);
    }
  }
  try {
    for (const u of await plan.extraGroups()) groupUrls.add(u);
  } catch (err) {
    log(`[${plan.source}] extra group list failed: ${(err as Error).message}`);
  }
  stats.groupsFound = groupUrls.size;
  log(`[${plan.source}] ${groupUrls.size} groups`);

  for (const url of groupUrls) {
    let parsed: { group: RawGroup; meetups: RawMeetup[] };
    try {
      parsed = plan.parseGroup(await plan.fetcher.get(url), url);
    } catch (err) {
      stats.groupsFailed++;
      log(`[${plan.source}] group failed ${url}: ${(err as Error).message}`);
      continue;
    }
    const stored = parsed.meetups.map((m) => ({ ...m, gymId: matchGym(m, GYMS, BRANDS, extra) }));
    await upsertGroup(db, parsed.group);
    const { removed } = await syncGroupMeetups(db, plan.source, parsed.group.externalId, stored, now);
    stats.groupsOk++;
    stats.meetups += stored.length;
    stats.matched += stored.filter((m) => m.gymId).length;
    stats.removed += removed;
    if (plan.source === 'daangn' && stored.length >= DAANGN_EMBEDDED_MEETUPS && stored.every((m) => m.startsAt >= now)) {
      stats.truncatedGroups++;
      log(`[daangn] ${url} may have more upcoming meetups than the page shows`);
    }
  }
  log(`[${plan.source}] ${JSON.stringify(stats)}`);
  return stats;
}

export async function runScrape(deps: Deps): Promise<ScrapeStats[]> {
  const extra = await getExtraAliases(deps.db);
  const somoim: SourcePlan = {
    source: 'somoim',
    fetcher: deps.somoim,
    searches: SOMOIM_KEYWORDS.map((k) => ({
      url: somoimSearchUrl(k),
      groups: (html) => parseSomoimSearch(html).map((id) => `https://www.somoim.co.kr/${id}`),
    })),
    extraGroups: async () => [],
    parseGroup: (html, url) => parseSomoimGroup(html, new URL(url).pathname.slice(1)),
  };
  const daangn: SourcePlan = {
    source: 'daangn',
    fetcher: deps.daangn,
    searches: (regions as DaangnRegion[]).map((r) => ({
      url: daangnSearchUrl(r),
      groups: (html) => parseDaangnSearch(html).map((g) => g.url),
    })),
    extraGroups: deps.daangnSitemapGroups,
    parseGroup: parseDaangnGroup,
  };
  // Different hosts, so the two sources can run side by side; each host still sees one request at a time.
  const stats = await Promise.all([scrapeSource(somoim, deps, extra), scrapeSource(daangn, deps, extra)]);
  await rematchUnmatched(deps.db);
  return stats;
}

const CLIMBING_SLUG = /클라이밍|볼더|암벽/;

async function daangnSitemapGroups(): Promise<string[]> {
  const res = await fetch('https://www.daangn.com/kr/group/sitemap-detail.xml.gz', { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf-8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((u) => CLIMBING_SLUG.test(decodeURIComponent(u)));
}

async function openDb(dry: boolean): Promise<Db> {
  if (dry) {
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite('./.scrape-dry');
    return { query: async (text, params = []) => (await pg.query(text, params)).rows as never };
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neonDb(url);
}

async function main() {
  const dry = process.argv.includes('--dry');
  const db = await openDb(dry);
  await migrate(db);
  const startedAt = new Date();
  let stats: ScrapeStats[] = [];
  let ok = false;
  try {
    stats = await runScrape({
      db,
      somoim: createFetcher({ delayMs: 1000, userAgent: BROWSER_UA }),
      daangn: createFetcher({ delayMs: 1000, userAgent: BROWSER_UA }),
      now: startedAt,
      log: (m) => console.log(m),
      daangnSitemapGroups,
    });
    const found = stats.reduce((n, s) => n + s.groupsFound, 0);
    const failed = stats.reduce((n, s) => n + s.groupsFailed, 0);
    ok = found > 0 && failed / found < 0.5;
  } finally {
    const finishedAt = new Date();
    await recordRun(db, { startedAt, finishedAt, ok, stats });
    console.log(`done in ${Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000)} min, ok=${ok}`);
  }
  if (!ok) process.exit(1);
}

if (process.argv[1]?.endsWith('run.ts')) main();
