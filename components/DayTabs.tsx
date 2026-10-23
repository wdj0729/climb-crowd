const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function dayLabel(date: string, index: number): string {
  return index === 0 ? '오늘' : WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export function DayTabs(props: { days: string[]; selected: string | null; onSelect(d: string): void }) {
  return (
    <div role="tablist" aria-label="요일" className="flex gap-1">
      {props.days.map((d, i) => {
        const selected = props.selected === d;
        const weekend = [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => props.onSelect(d)}
            className={`flex flex-1 flex-col items-center rounded-xl py-1.5 text-sm ${
              selected ? 'bg-[#e4572e] font-semibold text-white' : 'border border-black/10 dark:border-white/15'
            }`}
          >
            <span className={!selected && weekend ? 'text-[#e4572e]' : ''}>{dayLabel(d, i)}</span>
            <span className="text-[10px] tabular-nums opacity-70">{Number(d.slice(8))}</span>
          </button>
        );
      })}
    </div>
  );
}
