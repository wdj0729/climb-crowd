import type { Brand, Gym } from './seed';

const MATCH_RADIUS_M = 150;

export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/점$/u, '');
}

interface Candidate {
  text: string;
  gymId: string;
}

interface Index {
  /** Brand+branch combinations and gym names. */
  primary: Candidate[];
  /** Bare aliases of brands that have exactly one branch. */
  soloBrand: Candidate[];
  /** Short gym names, only trusted in the place field. */
  place: Candidate[];
}

const indexCache = new WeakMap<Gym[], Index>();

function buildIndex(gyms: Gym[], brands: Brand[]): Index {
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const branchCount = new Map<string, number>();
  for (const g of gyms) if (g.brandId) branchCount.set(g.brandId, (branchCount.get(g.brandId) ?? 0) + 1);

  const primary: Candidate[] = [];
  const soloBrand: Candidate[] = [];
  const place: Candidate[] = [];
  for (const g of gyms) {
    for (const alias of g.placeAliases) place.push({ text: normalize(alias), gymId: g.id });
    const brand = g.brandId ? brandById.get(g.brandId) : undefined;
    const brandAliases = brand ? brand.aliases.map(normalize) : [];
    for (const alias of g.extraAliases) primary.push({ text: normalize(alias), gymId: g.id });
    for (const branch of g.branchAliases.map(normalize)) {
      for (const b of brandAliases) {
        primary.push({ text: b + branch, gymId: g.id }, { text: branch + b, gymId: g.id });
      }
    }
    if (brand && branchCount.get(brand.id) === 1) {
      for (const b of brandAliases) soloBrand.push({ text: b, gymId: g.id });
    }
  }
  const longestFirst = (a: Candidate, b: Candidate) => b.text.length - a.text.length;
  return {
    primary: primary.filter((c) => c.text).sort(longestFirst),
    soloBrand: soloBrand.sort(longestFirst),
    place: place.filter((c) => c.text).sort(longestFirst),
  };
}

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

function nearestGym(lat: number, lon: number, gyms: Gym[]): string | null {
  let best: { id: string; d: number } | null = null;
  for (const g of gyms) {
    const d = distanceM(lat, lon, g.lat, g.lon);
    if (d <= MATCH_RADIUS_M && (!best || d < best.d)) best = { id: g.id, d };
  }
  return best?.id ?? null;
}

function findIn(texts: string[], candidates: Candidate[]): string | null {
  for (const t of texts) {
    // Candidates are sorted longest first, so the first hit is the most specific.
    const hit = candidates.find((c) => t.includes(c.text));
    if (hit) return hit.gymId;
  }
  return null;
}

export function matchGym(
  input: { placeText: string | null; title: string; placeLat: number | null; placeLon: number | null },
  gyms: Gym[],
  brands: Brand[],
  extra: Record<string, string> = {},
): string | null {
  if (input.placeLat != null && input.placeLon != null) {
    const near = nearestGym(input.placeLat, input.placeLon, gyms);
    if (near) return near;
  }
  const texts = [input.placeText, input.title].filter((t): t is string => !!t).map(normalize);
  for (const t of texts) if (extra[t]) return extra[t];

  let index = indexCache.get(gyms);
  if (!index) {
    index = buildIndex(gyms, brands);
    indexCache.set(gyms, index);
  }
  const placeText = input.placeText ? [normalize(input.placeText)] : [];
  return findIn(texts, index.primary) ?? findIn(texts, index.soloBrand) ?? findIn(placeText, index.place);
}
