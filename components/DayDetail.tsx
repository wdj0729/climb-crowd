import type { DayBucket } from '@/lib/crowd';
import { kstMinutesOfDay } from '@/lib/time';
import type { WeekMeetup } from '@/lib/types';

const SOURCE_LABEL = { somoim: '소모임', daangn: '당근' } as const;

function hhmm(iso: string): string {
  const m = kstMinutesOfDay(new Date(iso));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function Row({ m, dim }: { m: WeekMeetup; dim: boolean }) {
  const headcount = m.capacity == null ? `${m.participants}명` : `${m.participants}/${m.capacity}명`;
  return (
    <li data-dim={dim} className={dim ? 'opacity-45' : ''}>
      <a href={m.url} target="_blank" rel="noreferrer" className="block rounded-lg px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/10">
        <span className="block text-sm font-medium">{`${hhmm(m.startsAt)} · ${m.groupName || m.title} · ${headcount} · ${SOURCE_LABEL[m.source]}`}</span>
        <span className="block truncate text-xs opacity-60">{m.title}</span>
      </a>
    </li>
  );
}

export function DayDetail({ bucket }: { bucket: DayBucket }) {
  if (!bucket.inWindow.length && !bucket.outOfWindow.length) {
    return <p className="px-2 py-3 text-sm opacity-60">예정된 정모가 없어요</p>;
  }
  return (
    <ul className="mt-2 space-y-0.5">
      {bucket.inWindow.map((m) => <Row key={m.id} m={m} dim={false} />)}
      {bucket.outOfWindow.map((m) => <Row key={m.id} m={m} dim />)}
    </ul>
  );
}
