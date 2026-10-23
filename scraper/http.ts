export interface Fetcher {
  get(url: string): Promise<string>;
}

export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const TIMEOUT_MS = 20_000;

/** Sequential GETs for one host: never two in flight, and a pause after every request. */
export function createFetcher(opts: {
  delayMs: number;
  userAgent: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
}): Fetcher {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const retries = opts.retries ?? 1;
  let queue: Promise<unknown> = Promise.resolve();

  async function attempt(url: string): Promise<string> {
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': opts.userAgent }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { status: res.status });
      return await res.text();
    } finally {
      await sleep(opts.delayMs);
    }
  }

  async function run(url: string): Promise<string> {
    for (let i = 0; ; i++) {
      try {
        return await attempt(url);
      } catch (err) {
        const status = (err as { status?: number }).status;
        const retryable = status === undefined || status >= 500 || status === 429;
        if (!retryable || i >= retries) throw err;
      }
    }
  }

  return {
    get(url) {
      const result = queue.then(() => run(url));
      queue = result.catch(() => undefined);
      return result;
    },
  };
}
