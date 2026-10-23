import { gunzipSync } from 'node:zlib';
import type { RawGroup, RawMeetup } from '@/lib/types';

export interface DaangnRegion {
  name: string;
  id: number;
}

export function daangnSearchUrl(r: DaangnRegion): string {
  return `https://www.daangn.com/kr/search/group/?in=${encodeURIComponent(`${r.name}-${r.id}`)}&q=${encodeURIComponent('클라이밍')}`;
}

interface LdItem {
  '@type'?: string;
  url?: string;
  name?: string;
}

export function parseDaangnSearch(html: string): { url: string; name: string }[] {
  const out: { url: string; name: string }[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let data: { '@type'?: string; itemListElement?: LdItem[] };
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    if (data['@type'] !== 'ItemList' || !data.itemListElement) continue;
    for (const item of data.itemListElement) {
      if (item.url?.startsWith('https://www.daangn.com/kr/group/') && item.name) out.push({ url: item.url, name: item.name });
    }
  }
  return out;
}

/** Reads the JSON value that starts at `start` by matching brackets, honouring strings. */
function sliceJson(text: string, start: number): string {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('unterminated JSON');
}

interface DaangnMeetup {
  id: string;
  name: string;
  meetAt: string;
  currentParticipantsNumber: number;
  maximumParticipantsNumber: number | null;
  placeTag: { name: string; coordinate?: { lat: number; lon: number } | null } | null;
}

export function groupIdFromUrl(url: string): string {
  const slug = decodeURIComponent(new URL(url).pathname).split('/').filter(Boolean)[2] ?? '';
  return slug.slice(slug.lastIndexOf('-') + 1);
}

export function parseDaangnGroup(html: string, url: string): { group: RawGroup; meetups: RawMeetup[] } {
  const groupId = groupIdFromUrl(url);
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? '';
  const name = title.replace(/ \| [^|]*당근 모임$/, '').trim();
  const group: RawGroup = { source: 'daangn', externalId: groupId, name, url };

  // Real group pages always embed the group object; without it we got some other page (bot check, outage).
  if (!html.includes('"__typename":"CommunityGroup"')) throw new Error('no group data on the page');
  const key = '"meetups":';
  const at = html.indexOf(key);
  if (at < 0) return { group, meetups: [] };
  const list = JSON.parse(sliceJson(html, at + key.length)) as DaangnMeetup[];
  const meetups: RawMeetup[] = list.map((m) => ({
    source: 'daangn',
    externalId: m.id,
    groupExternalId: groupId,
    title: m.name,
    startsAt: new Date(m.meetAt),
    participants: m.currentParticipantsNumber ?? 0,
    capacity: m.maximumParticipantsNumber ?? null,
    placeText: m.placeTag?.name ?? null,
    placeLat: m.placeTag?.coordinate?.lat ?? null,
    placeLon: m.placeTag?.coordinate?.lon ?? null,
    url,
  }));
  return { group, meetups };
}

const CLIMBING_SLUG = /클라이밍|볼더|암벽/;

/** Climbing group URLs from the group sitemap; the body may arrive gzipped or already decoded. */
export function parseGroupSitemap(body: Buffer): string[] {
  const gzipped = body[0] === 0x1f && body[1] === 0x8b;
  const xml = (gzipped ? gunzipSync(body) : body).toString('utf-8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((u) => CLIMBING_SLUG.test(decodeURIComponent(u)));
}
