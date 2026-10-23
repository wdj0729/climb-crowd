// KST is a fixed UTC+9 offset with no daylight saving, so plain arithmetic is exact.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function shifted(d: Date): Date {
  return new Date(d.getTime() + KST_OFFSET_MS);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' of the instant in KST. */
export function kstDateKey(d: Date): string {
  const s = shifted(d);
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`;
}

export function kstMinutesOfDay(d: Date): number {
  const s = shifted(d);
  return s.getUTCHours() * 60 + s.getUTCMinutes();
}

export function kstFromParts(y: number, mo: number, d: number, h: number, mi: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - KST_OFFSET_MS);
}

export function kstStartOfDay(dateKey: string): Date {
  const [y, mo, d] = dateKey.split('-').map(Number);
  return kstFromParts(y, mo, d, 0, 0);
}

export function isWeekend(dateKey: string): boolean {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** n consecutive KST date keys starting with today. */
export function nextDays(now: Date, n: number): string[] {
  const start = kstStartOfDay(kstDateKey(now)).getTime();
  return Array.from({ length: n }, (_, i) => kstDateKey(new Date(start + i * DAY_MS)));
}
