// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GymPicker } from '@/components/GymPicker';

describe('GymPicker', () => {
  it('filters gyms by name and toggles a favourite', () => {
    const onToggle = vi.fn();
    render(<GymPicker favorites={[]} onToggle={onToggle} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '종로' } });
    expect(screen.getByText('클라이밍파크 종로점')).toBeInTheDocument();
    expect(screen.getByText('피커스 종로점')).toBeInTheDocument();
    expect(screen.queryByText('더클라임 강남점')).toBeNull();
    fireEvent.click(screen.getByText('피커스 종로점'));
    expect(onToggle).toHaveBeenCalledWith('peakers-jongno');
  });

  it('marks favourites', () => {
    render(<GymPicker favorites={['peakers-jongno']} onToggle={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '피커스 종로' } });
    expect(screen.getByRole('button', { name: /피커스 종로점/ }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('GymPicker default list', () => {
  const brandOrder = ['더클라임', '서울숲클라이밍', '손상원', '클라이밍파크', '피커스'];
  const brandIndex = (name: string) => brandOrder.findIndex((b) => name.startsWith(b));

  it('shows the five main brands in order before any search', () => {
    render(<GymPicker favorites={[]} onToggle={() => {}} />);
    const names = screen.getAllByRole('button').map((b) => b.querySelector('span span')?.textContent ?? '');
    expect(names).toHaveLength(22);
    const order = names.map(brandIndex);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('lists the main brands first in search results', () => {
    render(<GymPicker favorites={[]} onToggle={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '종로' } });
    const names = screen.getAllByRole('button').map((b) => b.querySelector('span span')?.textContent ?? '');
    expect(names.slice(0, 3)).toEqual(['서울숲클라이밍 종로점', '클라이밍파크 종로점', '피커스 종로점']);
  });
});
