// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DayDetail } from '@/components/DayDetail';
import { GymCard } from '@/components/GymCard';
import type { DayBucket } from '@/lib/crowd';
import type { WeekMeetup } from '@/lib/types';

const days = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
const totals = [0, 5, 31, 0, 20, 8, 0];
const buckets: DayBucket[] = days.map((date, i) => ({ date, total: totals[i], inWindow: [], outOfWindow: [] }));

describe('GymCard', () => {
  it('draws one labelled bar per day, today first', () => {
    render(<GymCard gymName="더클라임 강남점" buckets={buckets} busyThreshold={20} selectedDate={null} onSelectDate={() => {}} onRemove={() => {}} />);
    const bars = screen.getAllByRole('button', { name: /명$/ });
    expect(bars.map((b) => b.getAttribute('aria-label'))).toEqual(['오늘 0명', '화 5명', '수 31명', '목 0명', '금 20명', '토 8명', '일 0명']);
  });

  it('marks busy days and scales to the busiest day', () => {
    render(<GymCard gymName="g" buckets={buckets} busyThreshold={20} selectedDate={null} onSelectDate={() => {}} onRemove={() => {}} />);
    const busy = screen.getAllByRole('button', { name: /명$/ }).filter((b) => b.dataset.busy === 'true');
    expect(busy.map((b) => b.getAttribute('aria-label'))).toEqual(['수 31명', '금 20명']);
    expect((screen.getByLabelText('수 31명').querySelector('[data-bar]') as HTMLElement).style.height).toBe('100%');
  });

  it('selects a day on click', () => {
    const onSelectDate = vi.fn();
    render(<GymCard gymName="g" buckets={buckets} busyThreshold={20} selectedDate={null} onSelectDate={onSelectDate} onRemove={() => {}} />);
    fireEvent.click(screen.getByLabelText('수 31명'));
    expect(onSelectDate).toHaveBeenCalledWith('2026-10-28');
  });
});

const m = (over: Partial<WeekMeetup>): WeekMeetup => ({
  id: 'x', source: 'somoim', gymId: 'g', title: '정모', groupName: '크루명', startsAt: '2026-10-28T10:00:00.000Z',
  participants: 10, capacity: 14, url: 'https://www.somoim.co.kr/x', ...over,
});

describe('DayDetail', () => {
  it('lists in-window meetups with time, crew, headcount and source', () => {
    const bucket: DayBucket = {
      date: '2026-10-28', total: 22,
      inWindow: [m({ id: 'a' }), m({ id: 'b', startsAt: '2026-10-28T11:30:00.000Z', groupName: '당근크루', participants: 12, capacity: null, source: 'daangn', url: 'https://www.daangn.com/b' })],
      outOfWindow: [m({ id: 'c', startsAt: '2026-10-28T05:00:00.000Z', groupName: '낮크루', participants: 6, capacity: 8 })],
    };
    render(<DayDetail bucket={bucket} />);
    expect(screen.getByText('19:00 · 크루명 · 10/14명 · 소모임')).toBeInTheDocument();
    expect(screen.getByText('20:30 · 당근크루 · 12명 · 당근')).toBeInTheDocument();
    const dim = screen.getByText('14:00 · 낮크루 · 6/8명 · 소모임').closest('[data-dim]');
    expect(dim?.getAttribute('data-dim')).toBe('true');
    const link = screen.getByText('19:00 · 크루명 · 10/14명 · 소모임').closest('a')!;
    expect(link.getAttribute('href')).toBe('https://www.somoim.co.kr/x');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('says when there is nothing that day', () => {
    render(<DayDetail bucket={{ date: '2026-10-28', total: 0, inWindow: [], outOfWindow: [] }} />);
    expect(screen.getByText('예정된 정모가 없어요')).toBeInTheDocument();
  });
});
