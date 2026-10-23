'use client';

import type { Settings } from '@/lib/settings';

export function SettingsPanel({ settings, onChange }: { settings: Settings; onChange(s: Settings): void }) {
  const field = 'rounded-lg border border-black/15 bg-transparent px-2 py-1 dark:border-white/20';
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
      <label htmlFor="weekday">평일 이 시간 이후</label>
      <input id="weekday" type="time" className={field} value={settings.weekdayStart}
        onChange={(e) => e.target.value && onChange({ ...settings, weekdayStart: e.target.value })} />
      <label htmlFor="weekend">주말 이 시간 이후</label>
      <input id="weekend" type="time" className={field} value={settings.weekendStart}
        onChange={(e) => e.target.value && onChange({ ...settings, weekendStart: e.target.value })} />
      <label htmlFor="busy">붐빔 기준(명)</label>
      <input id="busy" type="number" min={1} className={field} value={settings.busyThreshold}
        onChange={(e) => Number(e.target.value) > 0 && onChange({ ...settings, busyThreshold: Number(e.target.value) })} />
    </div>
  );
}
