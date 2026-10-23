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
