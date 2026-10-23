import type { TimeWindow } from './crowd';

export interface Settings extends TimeWindow {
  busyThreshold: number;
  favorites: string[];
}

export const DEFAULT_SETTINGS: Settings = { weekdayStart: '18:00', weekendStart: '14:00', busyThreshold: 20, favorites: [] };

export const STORAGE_KEY = 'climb-crowd:v1';

const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = browserStorage()): Settings {
  let raw: Partial<Record<keyof Settings, unknown>> = {};
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (text) raw = JSON.parse(text);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const threshold = raw.busyThreshold;
  return {
    weekdayStart: isTime(raw.weekdayStart) ? raw.weekdayStart : DEFAULT_SETTINGS.weekdayStart,
    weekendStart: isTime(raw.weekendStart) ? raw.weekendStart : DEFAULT_SETTINGS.weekendStart,
    busyThreshold: typeof threshold === 'number' && Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULT_SETTINGS.busyThreshold,
    favorites: Array.isArray(raw.favorites) ? raw.favorites.filter((f): f is string => typeof f === 'string') : [],
  };
}

export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> | undefined = browserStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Private mode or quota: settings just won't persist.
  }
}
