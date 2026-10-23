'use client';

import { useEffect, useMemo, useState } from 'react';
import { DayDetail } from '@/components/DayDetail';
import { GymCard } from '@/components/GymCard';
import { GymPicker } from '@/components/GymPicker';
import { SettingsPanel } from '@/components/SettingsPanel';
import { dayBuckets } from '@/lib/crowd';
import { GYMS } from '@/lib/gyms/seed';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/lib/settings';
import { kstDateKey, kstMinutesOfDay } from '@/lib/time';
import type { WeekResponse } from '@/lib/types';

const gymName = new Map(GYMS.map((g) => [g.id, g.name]));

function scrapedLabel(iso: string | null): string {
  if (!iso) return '아직 수집 전';
  const d = new Date(iso);
  const [, mo, day] = kstDateKey(d).split('-').map(Number);
  const min = kstMinutesOfDay(d);
  return `마지막 수집: ${mo}/${day} ${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

type Panel = 'none' | 'gyms' | 'settings';

export default function Home() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [week, setWeek] = useState<WeekResponse | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Record<string, string | null>>({});
  const [panel, setPanel] = useState<Panel>('none');

  useEffect(() => {
    // localStorage is only readable in the browser, so settings load after the first render.
    setSettings(loadSettings());
    setLoaded(true);
    fetch('/api/week')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setWeek)
      .catch(() => setError(true));
  }, []);

  function update(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  function toggleFavorite(id: string) {
    const favorites = settings.favorites.includes(id) ? settings.favorites.filter((f) => f !== id) : [...settings.favorites, id];
    update({ ...settings, favorites });
  }

  const cards = useMemo(
    () => (week ? settings.favorites.map((id) => ({ id, buckets: dayBuckets(week.meetups, id, week.days, settings) })) : []),
    [week, settings],
  );

  const showPicker = panel === 'gyms' || (loaded && settings.favorites.length === 0);

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 pb-16 pt-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">이번 주 암장 혼잡도</h1>
          <p className="text-xs opacity-60">
            평일 {settings.weekdayStart} · 주말 {settings.weekendStart} 이후 정모 인원 · {week ? scrapedLabel(week.lastScrapeAt) : '불러오는 중…'}
          </p>
        </div>
        <nav className="flex shrink-0 gap-1 text-sm">
          <button type="button" onClick={() => setPanel(panel === 'gyms' ? 'none' : 'gyms')} className="rounded-full border border-black/15 px-3 py-1 dark:border-white/20">
            암장
          </button>
          <button type="button" onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')} className="rounded-full border border-black/15 px-3 py-1 dark:border-white/20">
            설정
          </button>
        </nav>
      </header>

      {panel === 'settings' && (
        <section className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
          <SettingsPanel settings={settings} onChange={update} />
        </section>
      )}

      {showPicker && (
        <section className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
          <h2 className="mb-2 font-semibold">{settings.favorites.length ? '즐겨찾는 암장' : '자주 가는 암장을 골라 주세요'}</h2>
          <GymPicker favorites={settings.favorites} onToggle={toggleFavorite} />
        </section>
      )}

      {error && <p className="text-sm text-[#e4572e]">정모 데이터를 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>}

      {cards.map(({ id, buckets }) => {
        const date = selected[id] ?? null;
        const bucket = buckets.find((b) => b.date === date);
        return (
          <div key={id}>
            <GymCard
              gymName={gymName.get(id) ?? id}
              buckets={buckets}
              busyThreshold={settings.busyThreshold}
              selectedDate={date}
              onSelectDate={(d) => setSelected({ ...selected, [id]: d === date ? null : d })}
              onRemove={() => toggleFavorite(id)}
            />
            {bucket && <DayDetail bucket={bucket} />}
          </div>
        );
      })}
    </main>
  );
}
