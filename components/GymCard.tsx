import type { DayBucket } from '@/lib/crowd';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dayLabel(date: string, index: number): string {
  return index === 0 ? '오늘' : WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export function GymCard(props: {
  gymName: string;
  buckets: DayBucket[];
  busyThreshold: number;
  selectedDate: string | null;
  onSelectDate(d: string): void;
  onRemove(): void;
}) {
  const max = Math.max(0, ...props.buckets.map((b) => b.total));
  return (
    <section className="rounded-2xl border border-black/10 dark:border-white/15 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{props.gymName}</h2>
        <button type="button" onClick={props.onRemove} className="text-sm opacity-60 hover:opacity-100" aria-label={`${props.gymName} 즐겨찾기 해제`}>
          ✕
        </button>
      </header>
      <div className="flex items-end gap-1.5">
        {props.buckets.map((b, i) => {
          const label = dayLabel(b.date, i);
          const busy = b.total >= props.busyThreshold;
          const selected = props.selectedDate === b.date;
          return (
            <button
              key={b.date}
              type="button"
              aria-label={`${label} ${b.total}명`}
              aria-pressed={selected}
              data-busy={busy}
              onClick={() => props.onSelectDate(b.date)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg pb-1 ${selected ? 'bg-black/5 dark:bg-white/10' : ''}`}
            >
              <span className={`text-xs tabular-nums ${busy ? 'font-bold text-[#e4572e]' : 'opacity-70'}`}>{b.total || ''}</span>
              <span className="flex h-20 w-full items-end">
                <span
                  data-bar
                  className={`w-full rounded-t ${busy ? 'bg-[#e4572e]' : 'bg-[#f8b26a]'}`}
                  style={{ height: max ? `${Math.round((b.total / max) * 100)}%` : '0%', minHeight: b.total ? 3 : 0 }}
                />
              </span>
              <span className={`text-xs ${i === 0 ? 'font-semibold' : 'opacity-70'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
