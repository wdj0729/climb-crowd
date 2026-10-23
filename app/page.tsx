'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { DayDetail } from '@/components/DayDetail';
import { DayTabs } from '@/components/DayTabs';
import { GymPicker } from '@/components/GymPicker';
import type { GymPoint } from '@/components/GymMap';
import { SettingsPanel } from '@/components/SettingsPanel';
import { dayBuckets, type DayBucket } from '@/lib/crowd';
import { GYMS } from '@/lib/gyms/seed';
import { kstDateKey, kstMinutesOfDay } from '@/lib/time';
import type { WeekResponse } from '@/lib/types';
import { useSettings } from '@/lib/useSettings';

// Leaflet needs `window`, so the map only ever renders in the browser.
const GymMap = dynamic(() => import('@/components/GymMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" />,
});

const gymById = new Map(GYMS.map((g) => [g.id, g]));

function scrapedLabel(iso: string | null): string {
  if (!iso) return '아직 수집 전';
  const d = new Date(iso);
  const [, mo, day] = kstDateKey(d).split('-').map(Number);
  const min = kstMinutesOfDay(d);
  return `마지막 수집: ${mo}/${day} ${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

type View = 'home' | 'gyms' | 'settings';

const pill = 'rounded-full border border-black/15 px-3 py-1 dark:border-white/20';

function SubScreen(props: { title: string; onBack(): void; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-4">
      <header className="sticky top-0 z-10 -mx-4 mb-3 flex items-center gap-2 bg-[var(--background)] px-4 py-2">
        <button type="button" onClick={props.onBack} className={`${pill} text-sm`} aria-label="뒤로">
          ← 뒤로
        </button>
        <h1 className="text-lg font-bold">{props.title}</h1>
      </header>
      {props.children}
    </main>
  );
}

export default function Home() {
  const [settings, update] = useSettings();
  const [week, setWeek] = useState<WeekResponse | null>(null);
  const [error, setError] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [selectedGym, setSelectedGym] = useState<string | null>(null);
  const [view, setView] = useState<View>('home');

  useEffect(() => {
    fetch('/api/week')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setWeek)
      .catch(() => setError(true));
    // The phone's back gesture/button pops our history entry; show whatever screen it belongs to.
    const onPop = (e: PopStateEvent) => setView((e.state as { view?: View } | null)?.view ?? 'home');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function open(next: View) {
    history.pushState({ view: next }, '');
    setView(next);
  }

  function back() {
    if ((history.state as { view?: View } | null)?.view) history.back();
    else setView('home');
  }

  function toggleFavorite(id: string) {
    const favorites = settings.favorites.includes(id) ? settings.favorites.filter((f) => f !== id) : [...settings.favorites, id];
    update({ ...settings, favorites });
  }

  const date = day ?? week?.days[0] ?? null;

  // Favourites always show on the map; other gyms appear on days a crew meets there.
  const buckets = useMemo(() => {
    if (!week) return new Map<string, DayBucket[]>();
    const ids = new Set([...settings.favorites, ...week.meetups.map((m) => m.gymId)]);
    return new Map([...ids].filter((id) => gymById.has(id)).map((id) => [id, dayBuckets(week.meetups, id, week.days, settings)]));
  }, [week, settings]);

  const points = useMemo<GymPoint[]>(
    () =>
      [...buckets].map(([id, bs]) => {
        const g = gymById.get(id)!;
        return { id, name: g.name, lat: g.lat, lon: g.lon, total: bs.find((b) => b.date === date)?.total ?? 0, favorite: settings.favorites.includes(id) };
      }).filter((p) => p.favorite || p.total > 0),
    [buckets, date, settings.favorites],
  );

  const selectedPoint = points.find((p) => p.id === selectedGym) ?? null;
  const selectedBucket = selectedGym ? buckets.get(selectedGym)?.find((b) => b.date === date) : undefined;

  if (view === 'gyms') {
    return (
      <SubScreen title={settings.favorites.length ? `암장 선택 (${settings.favorites.length})` : '자주 가는 암장을 골라 주세요'} onBack={back}>
        <GymPicker favorites={settings.favorites} onToggle={toggleFavorite} />
      </SubScreen>
    );
  }

  if (view === 'settings') {
    return (
      <SubScreen title="설정" onBack={back}>
        <section className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
          <SettingsPanel settings={settings} onChange={update} />
        </section>
      </SubScreen>
    );
  }

  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col gap-3 px-4 pb-4 pt-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">이번 주 암장 혼잡도</h1>
          <p className="text-xs opacity-60">평일 {settings.weekdayStart} · 주말 {settings.weekendStart} 이후 정모 인원</p>
          <p className={`text-xs ${error ? 'text-[#e4572e]' : 'opacity-60'}`}>
            {error ? '데이터를 불러오지 못했어요. 잠시 후 다시 열어 주세요.' : week ? scrapedLabel(week.lastScrapeAt) : '불러오는 중…'}
          </p>
        </div>
        <nav className="flex shrink-0 gap-1 text-sm">
          <button type="button" onClick={() => open('gyms')} className={pill}>
            암장
          </button>
          <button type="button" onClick={() => open('settings')} className={pill}>
            설정
          </button>
        </nav>
      </header>

      {week && date && <DayTabs days={week.days} selected={date} onSelect={setDay} />}

      <div className="relative min-h-0 flex-1">
        <GymMap points={points} busyThreshold={settings.busyThreshold} selectedId={selectedGym} onSelect={setSelectedGym} />

        <p className="pointer-events-none absolute left-2 top-2 z-[1000] flex gap-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] text-[#171717] shadow">
          <span>
            <span className="mr-1 inline-block size-2.5 rounded-full bg-[#e4572e]" />
            {settings.busyThreshold}명+
          </span>
          <span>
            <span className="mr-1 inline-block size-2.5 rounded-full bg-[#f8a03a]" />
            정모
          </span>
          <span>
            <span className="mr-1 inline-block size-2.5 rounded-full border-2 border-[#171717]" />
            즐겨찾기
          </span>
        </p>

        {selectedPoint && (
          <section className="absolute inset-x-2 bottom-2 z-[1000] max-h-[60%] overflow-y-auto rounded-2xl border border-black/10 bg-[var(--background)] p-4 shadow-lg dark:border-white/15">
            <header className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{selectedPoint.name}</h2>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`text-sm tabular-nums ${selectedPoint.total >= settings.busyThreshold ? 'font-bold text-[#e4572e]' : 'opacity-70'}`}>
                  {selectedPoint.total}명
                </span>
                <button
                  type="button"
                  onClick={() => toggleFavorite(selectedPoint.id)}
                  aria-pressed={selectedPoint.favorite}
                  aria-label={`${selectedPoint.name} 즐겨찾기`}
                  className="text-lg"
                >
                  {selectedPoint.favorite ? '★' : '☆'}
                </button>
                <button type="button" onClick={() => setSelectedGym(null)} aria-label="닫기" className="text-sm opacity-60 hover:opacity-100">
                  ✕
                </button>
              </div>
            </header>
            {selectedBucket && <DayDetail bucket={selectedBucket} />}
          </section>
        )}
      </div>
    </main>
  );
}
