'use client';

import { useState } from 'react';
import { normalize } from '@/lib/gyms/match';
import { GYMS } from '@/lib/gyms/seed';

const MAX_RESULTS = 30;

export function GymPicker(props: { favorites: string[]; onToggle(gymId: string): void }) {
  const [query, setQuery] = useState('');
  const q = normalize(query);
  const results = q
    ? GYMS.filter((g) => normalize(`${g.name} ${g.address}`).includes(q)).slice(0, MAX_RESULTS)
    : GYMS.filter((g) => props.favorites.includes(g.id));
  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="암장 이름이나 동네 (예: 종로, 더클라임)"
        className="w-full rounded-xl border border-black/15 bg-transparent px-3 py-2 dark:border-white/20"
      />
      <ul className="space-y-1">
        {results.map((g) => {
          const on = props.favorites.includes(g.id);
          return (
            <li key={g.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => props.onToggle(g.id)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
              >
                <span>
                  <span className="block text-sm">{g.name}</span>
                  <span className="block text-xs opacity-60">{g.address}</span>
                </span>
                <span aria-hidden className={on ? 'text-[#e4572e]' : 'opacity-30'}>★</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
