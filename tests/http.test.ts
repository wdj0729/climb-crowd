import { describe, expect, it } from 'vitest';
import { createFetcher } from '@/scraper/http';

function fakeFetch(responses: Record<string, number[]>) {
  const log: string[] = [];
  let active = 0;
  let maxActive = 0;
  const headers: string[] = [];
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    active++;
    maxActive = Math.max(maxActive, active);
    log.push(`start ${url}`);
    headers.push(new Headers(init?.headers).get('User-Agent') ?? '');
    await new Promise((r) => setTimeout(r, 5));
    active--;
    const status = responses[url]?.shift() ?? 200;
    return new Response(`body ${url}`, { status });
  }) as typeof fetch;
  return { impl, log, headers, maxActive: () => maxActive };
}

describe('createFetcher', () => {
  it('runs requests one at a time with a pause between them', async () => {
    const f = fakeFetch({});
    const sleeps: number[] = [];
    const fetcher = createFetcher({ delayMs: 1000, userAgent: 'UA', fetchImpl: f.impl, sleep: async (ms) => { sleeps.push(ms); } });
    const bodies = await Promise.all(['a', 'b', 'c'].map((u) => fetcher.get(`https://x/${u}`)));
    expect(bodies).toEqual(['body https://x/a', 'body https://x/b', 'body https://x/c']);
    expect(f.maxActive()).toBe(1);
    expect(sleeps).toEqual([1000, 1000, 1000]);
    expect(f.headers).toEqual(['UA', 'UA', 'UA']);
  });

  it('retries a server error once', async () => {
    const f = fakeFetch({ 'https://x/a': [500, 200] });
    const fetcher = createFetcher({ delayMs: 0, userAgent: 'UA', fetchImpl: f.impl, sleep: async () => {} });
    await expect(fetcher.get('https://x/a')).resolves.toBe('body https://x/a');
    expect(f.log).toHaveLength(2);
  });

  it('does not retry a 404', async () => {
    const f = fakeFetch({ 'https://x/a': [404, 200] });
    const fetcher = createFetcher({ delayMs: 0, userAgent: 'UA', fetchImpl: f.impl, sleep: async () => {} });
    await expect(fetcher.get('https://x/a')).rejects.toThrow('404');
    expect(f.log).toHaveLength(1);
  });

  it('keeps going after a failed request', async () => {
    const f = fakeFetch({ 'https://x/a': [404] });
    const fetcher = createFetcher({ delayMs: 0, userAgent: 'UA', fetchImpl: f.impl, sleep: async () => {} });
    const results = await Promise.allSettled([fetcher.get('https://x/a'), fetcher.get('https://x/b')]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
  });
});
