'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings';

// Settings live in localStorage, which the server can't see; the server snapshot is the defaults and the
// browser takes over after hydration. Kept in memory too, so a blocked localStorage still works per visit.
let current: Settings | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Settings {
  current ??= loadSettings();
  return current;
}

const getServerSnapshot = () => DEFAULT_SETTINGS;

export function useSettings(): [Settings, (s: Settings) => void, boolean] {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const set = (s: Settings) => {
    current = s;
    saveSettings(s);
    listeners.forEach((l) => l());
  };
  return [settings, set, hydrated];
}
