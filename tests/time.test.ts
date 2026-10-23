import { describe, expect, it } from 'vitest';
import { isWeekend, kstDateKey, kstFromParts, kstMinutesOfDay, kstStartOfDay, nextDays } from '@/lib/time';

describe('KST time helpers', () => {
  it('buckets UTC instants into KST dates', () => {
    expect(kstDateKey(new Date('2026-10-24T15:30:00Z'))).toBe('2026-10-25');
    expect(kstDateKey(new Date('2026-10-24T14:59:00Z'))).toBe('2026-10-24');
  });

  it('gives minutes of the KST day', () => {
    expect(kstMinutesOfDay(new Date('2026-10-23T09:00:00Z'))).toBe(18 * 60);
  });

  it('knows weekends', () => {
    expect(isWeekend('2026-10-24')).toBe(true);
    expect(isWeekend('2026-10-25')).toBe(true);
    expect(isWeekend('2026-10-26')).toBe(false);
  });

  it('lists the next n KST days starting today', () => {
    expect(nextDays(new Date('2026-10-23T16:00:00Z'), 7)).toEqual([
      '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30',
    ]);
  });

  it('converts KST wall-clock to instants', () => {
    expect(kstStartOfDay('2026-10-24').toISOString()).toBe('2026-10-23T15:00:00.000Z');
    expect(kstFromParts(2026, 10, 24, 14, 0).toISOString()).toBe('2026-10-24T05:00:00.000Z');
  });
});
