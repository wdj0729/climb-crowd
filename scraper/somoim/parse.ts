import * as cheerio from 'cheerio';
import { kstFromParts } from '@/lib/time';
import type { RawGroup, RawMeetup } from '@/lib/types';

export { SEOUL_DISTRICTS } from './districts';

const BASE = 'https://www.somoim.co.kr';

// Somoim's web search ignores the district segment and returns the same ~100 groups for any district,
// so we search a few keywords instead. 볼더링/클밍/암장 return exactly the 클라이밍 list and are left out.
export const SOMOIM_KEYWORDS = ['클라이밍', '클라이밍크루', '실내클라이밍', '볼더'];

export function somoimSearchUrl(keyword: string): string {
  return `${BASE}/groups/search/${encodeURIComponent('서울특별시')}/${encodeURIComponent('마포구')}/${encodeURIComponent(keyword)}`;
}

/** Group links look like /{uuid}{digit}. */
export function parseSomoimSearch(html: string): string[] {
  const ids = new Set<string>();
  for (const m of html.matchAll(/href="\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\d)"/g)) ids.add(m[1]);
  return [...ids];
}

export function parseSomoimGroup(html: string, groupId: string): { group: RawGroup; meetups: RawMeetup[] } {
  const $ = cheerio.load(html);
  const url = `${BASE}/${groupId}`;
  const group: RawGroup = { source: 'somoim', externalId: groupId, name: $('h1').first().text().trim(), url };

  const heading = $('h2').filter((_, el) => $(el).text().trim().startsWith('정모 일정')).first();
  const cards = heading.next().children('div');
  // The thumbnail is named {groupId}{YYYYMMDDHHmm}s{n}.png in KST; the visible date is relative ("내일").
  const stamp = new RegExp(`${groupId}(\\d{4})(\\d{2})(\\d{2})(\\d{2})(\\d{2})s\\d+\\.png`);

  const meetups: RawMeetup[] = [];
  cards.each((_, el) => {
    const card = $(el);
    const m = card.find('img').toArray().map((img) => $(img).attr('src') ?? '').map((src) => src.match(stamp)).find(Boolean);
    if (!m) return;
    const [, y, mo, d, h, mi] = m.map(Number);
    const counts = card.find('span > span').toArray().map((s) => $(s).text().trim());
    const slash = counts.indexOf('/');
    const participants = slash > 0 ? Number(counts[slash - 1]) : 0;
    const capacity = slash > 0 && counts[slash + 1] ? Number(counts[slash + 1]) : null;
    const place = card.find('img[src="/i_location2.svg"]').parent().next('p').text().trim();
    meetups.push({
      source: 'somoim',
      externalId: `${groupId}:${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}`,
      groupExternalId: groupId,
      title: card.find('h3').first().text().trim(),
      startsAt: kstFromParts(y, mo, d, h, mi),
      participants: Number.isFinite(participants) ? participants : 0,
      capacity: capacity != null && Number.isFinite(capacity) ? capacity : null,
      placeText: place || null,
      placeLat: null,
      placeLon: null,
      url,
    });
  });
  return { group, meetups };
}
