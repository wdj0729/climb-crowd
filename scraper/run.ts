import { migrate, neonDb, type Db } from '@/lib/db';
import { matchGym } from '@/lib/gyms/match';
import { BRANDS, GYMS } from '@/lib/gyms/seed';
import { getExtraAliases, listGroupsWithFutureMeetups, recordRun, rematchUnmatched, syncGroupMeetups, upsertGroup } from '@/lib/store';
import type { RawGroup, RawMeetup, Source } from '@/lib/types';
import { daangnSearchUrl, groupIdFromUrl, parseDaangnGroup, parseDaangnSearch, parseGroupSitemap, type DaangnRegion } from './daangn/parse';
import regions from './daangn/regions.json';
import { BROWSER_UA, createFetcher, type Fetcher } from './http';
import { parseSomoimGroup, parseSomoimSearch, SOMOIM_KEYWORDS, somoimSearchUrl } from './somoim/parse';

export interface ScrapeStats {
  source: Source;
  searches: number;
  searchesFailed: number;
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
  /** Stable group id for a group page URL (the same group can appear under several URL forms). */
  groupId: (url: string) => string;
  parseGroup: (html: string, url: string) => { group: RawGroup; meetups: RawMeetup[] };
}

async function scrapeSource(plan: SourcePlan, deps: Deps, extra: Record<string, string>): Promise<ScrapeStats> {
  const { db, now, log } = deps;
  const stats: ScrapeStats = {
    source: plan.source, searches: plan.searches.length, searchesFailed: 0,
    groupsFound: 0, groupsOk: 0, groupsFailed: 0, meetups: 0, matched: 0, removed: 0, truncatedGroups: 0,
  };

  const groups = new Map<string, string>(); // group id → page URL
  const add = (url: string) => {
    const id = plan.groupId(url);
    if (!groups.has(id)) groups.set(id, url);
  };
  for (const s of plan.searches) {
    try {
      for (const u of s.groups(await plan.fetcher.get(s.url))) add(u);
    } catch (err) {
      stats.searchesFailed++;
      log(`[${plan.source}] search failed ${s.url}: ${(err as Error).message}`);
    }
  }
  try {
    for (const u of await plan.extraGroups()) add(u);
  } catch (err) {
    log(`[${plan.source}] extra group list failed: ${(err as Error).message}`);
  }
  // Groups that dropped out of search results still need a visit so their cancellations are seen.
  for (const g of await listGroupsWithFutureMeetups(db, plan.source, now)) if (!groups.has(g.externalId)) groups.set(g.externalId, g.url);
  stats.groupsFound = groups.size;
  log(`[${plan.source}] ${groups.size} groups`);

  for (const [id, url] of groups) {
    let parsed: { group: RawGroup; meetups: RawMeetup[] };
    try {
      parsed = plan.parseGroup(await plan.fetcher.get(url), url);
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        // The group no longer exists: its upcoming meetups won't happen.
        stats.removed += (await syncGroupMeetups(db, plan.source, id, [], now)).removed;
        stats.groupsOk++;
        log(`[${plan.source}] group gone ${url}`);
        continue;
      }
      stats.groupsFailed++;
      log(`[${plan.source}] group failed ${url}: ${(err as Error).message}`);
      continue;
    }
    const stored = parsed.meetups.map((m) => ({ ...m, gymId: matchGym(m, GYMS, BRANDS, extra) }));
    const truncated =
      plan.source === 'daangn' && stored.length >= DAANGN_EMBEDDED_MEETUPS && stored.every((m) => m.startsAt >= now);
    // A truncated list shows the nearest meetups only; leave anything after the last one shown alone.
    const until = truncated ? new Date(Math.max(...stored.map((m) => m.startsAt.getTime()))) : undefined;
    await upsertGroup(db, parsed.group);
    const { removed } = await syncGroupMeetups(db, plan.source, parsed.group.externalId, stored, now, until);
    stats.groupsOk++;
    stats.meetups += stored.length;
    stats.matched += stored.filter((m) => m.gymId).length;
    stats.removed += removed;
    if (truncated) {
      stats.truncatedGroups++;
      log(`[daangn] ${url} may have more upcoming meetups than the page shows`);
    }
  }
  log(`[${plan.source}] ${JSON.stringify(stats)}`);
  return stats;
}

/** A run counts as successful only if every source found groups and most searches and group pages loaded. */
export function runOk(stats: ScrapeStats[]): boolean {
  return stats.every(
    (s) => s.groupsFound > 0 && s.groupsFailed / s.groupsFound < 0.5 && (s.searches === 0 || s.searchesFailed / s.searches < 0.5),
  );
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
    groupId: (url) => new URL(url).pathname.slice(1),
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
    groupId: groupIdFromUrl,
    parseGroup: parseDaangnGroup,
  };
  // Different hosts, so the two sources can run side by side; each host still sees one request at a time.
  const stats = await Promise.all([scrapeSource(somoim, deps, extra), scrapeSource(daangn, deps, extra)]);
  await rematchUnmatched(deps.db);
  return stats;
}

async function daangnSitemapGroups(): Promise<string[]> {
  const res = await fetch('https://www.daangn.com/kr/group/sitemap-detail.xml.gz', { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseGroupSitemap(Buffer.from(await res.arrayBuffer()));
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
    ok = runOk(stats);
  } finally {
    const finishedAt = new Date();
    await recordRun(db, { startedAt, finishedAt, ok, stats });
    console.log(`done in ${Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000)} min, ok=${ok}`);
  }
  if (!ok) process.exit(1);
}

if (process.argv[1]?.endsWith('run.ts')) main();
