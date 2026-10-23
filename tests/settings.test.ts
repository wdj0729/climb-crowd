import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, STORAGE_KEY } from '@/lib/settings';

const storageWith = (value: string | null) => ({ getItem: (k: string) => (k === STORAGE_KEY ? value : null) });

describe('settings', () => {
  it('has the agreed defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({ weekdayStart: '18:00', weekendStart: '14:00', busyThreshold: 20, favorites: [] });
  });

  it('falls back to defaults when storage throws', () => {
    expect(loadSettings({ getItem: () => { throw new Error('blocked'); } })).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults on broken JSON', () => {
    expect(loadSettings(storageWith('{깨진json'))).toEqual(DEFAULT_SETTINGS);
  });

  it('fills missing fields with defaults', () => {
    expect(loadSettings(storageWith(JSON.stringify({ favorites: ['x'] })))).toEqual({ ...DEFAULT_SETTINGS, favorites: ['x'] });
  });

  it('replaces invalid values with defaults', () => {
    const stored = { weekdayStart: '25:99', weekendStart: '13:30', busyThreshold: -3, favorites: 'nope' };
    expect(loadSettings(storageWith(JSON.stringify(stored)))).toEqual({ ...DEFAULT_SETTINGS, weekendStart: '13:30' });
  });

  it('round-trips through storage', () => {
    let saved = '';
    const s = { ...DEFAULT_SETTINGS, favorites: ['peakers-jongno'], busyThreshold: 25 };
    saveSettings(s, { setItem: (_k, v) => { saved = v; } });
    expect(loadSettings(storageWith(saved))).toEqual(s);
  });

  it('does not throw when saving fails', () => {
    expect(() => saveSettings(DEFAULT_SETTINGS, { setItem: () => { throw new Error('quota'); } })).not.toThrow();
  });
});
