// One-off: finds Daangn's Seoul district ids and writes scraper/daangn/regions.json.
// Daangn numbers each district right before its administrative neighbourhoods (종로구 2, its dongs 3–19,
// 중구 20, …), and a district's search page lists those neighbourhoods as "nearbyRegions". So we start at
// 종로구 and jump to (largest neighbourhood id + 1) until every district is found.
// Run with `pnpm tsx scraper/daangn/discover-regions.ts`.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { SEOUL_DISTRICTS } from '../somoim/districts';
import { daangnSearchUrl, type DaangnRegion } from './parse';

interface RegionRow {
  id: number;
  name1: string;
  name2: string;
  name2Id: number;
}

// Legal-dong rows use ids above this; administrative dongs sit right after their district.
const LEGAL_DONG_ID_START = 6000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function nearbyRegions(html: string): RegionRow[] {
  const key = '"nearbyRegions":';
  const at = html.indexOf(key);
  if (at < 0) return [];
  const start = at + key.length;
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']' && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  return [];
}

async function main() {
  const found = new Map<string, number>();
  let id = 2;
  for (let step = 0; step < 120 && found.size < SEOUL_DISTRICTS.length; step++) {
    const res = await fetch(daangnSearchUrl({ name: 'x', id }), { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const rows = nearbyRegions(await res.text());
    const seoul = rows.filter((r) => r.name1 === '서울특별시');
    if (!seoul.length) break;
    const district = seoul[0].name2;
    if (SEOUL_DISTRICTS.includes(district)) found.set(district, seoul[0].name2Id);
    console.log(`${id} → ${district} (${seoul[0].name2Id})`);
    id = Math.max(id, ...seoul.map((r) => r.id).filter((x) => x < LEGAL_DONG_ID_START)) + 1;
    await sleep(1000);
  }
  const missing = SEOUL_DISTRICTS.filter((d) => !found.has(d));
  if (missing.length) {
    console.error('missing districts:', missing.join(', '));
    process.exit(1);
  }
  const regions: DaangnRegion[] = SEOUL_DISTRICTS.map((name) => ({ name, id: found.get(name)! }));
  writeFileSync(path.join(import.meta.dirname, 'regions.json'), JSON.stringify(regions, null, 2) + '\n');
  console.log('wrote regions.json');
}

main();
