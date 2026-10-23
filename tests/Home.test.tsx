// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/GymMap', () => ({
  default: (props: { points: { id: string; name: string; total: number }[]; onSelect(id: string): void }) => (
    <div data-testid="map">
      {props.points.map((p) => (
        <button key={p.id} type="button" aria-label={`핀 ${p.name} ${p.total}명`} onClick={() => props.onSelect(p.id)} />
      ))}
    </div>
  ),
}));

const meetup = (id: string, gymId: string, startsAt: string, participants: number) => ({
  id, source: 'somoim', gymId, title: '정모', groupName: `크루${id}`, startsAt, participants, capacity: null, url: `https://www.somoim.co.kr/${id}`,
});

let week: { days: string[]; lastScrapeAt: null; meetups: ReturnType<typeof meetup>[] } = { days: ['2026-10-23'], lastScrapeAt: null, meetups: [] };

async function renderHome(favorites: string[] = []) {
  localStorage.clear();
  if (favorites.length) localStorage.setItem('climb-crowd:v1', JSON.stringify({ favorites }));
  vi.resetModules(); // the settings store caches per module
  const { default: Home } = await import('@/app/page');
  render(<Home />);
}

beforeEach(() => {
  week = { days: ['2026-10-23'], lastScrapeAt: null, meetups: [] };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(week))));
  history.replaceState(null, '', '/');
});

describe('Home navigation', () => {
  it('opens on the map even before any gym is starred', async () => {
    await renderHome();
    expect(await screen.findByTestId('map')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('opens the picker as its own screen and returns with 뒤로', async () => {
    await renderHome(['peakers-jongno']);
    await screen.findByTestId('map');
    fireEvent.click(screen.getByRole('button', { name: '암장' }));
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.queryByTestId('map')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    await waitFor(() => expect(screen.queryByRole('searchbox')).toBeNull());
  });

  it("closes a screen on the phone's back gesture", async () => {
    await renderHome(['peakers-jongno']);
    await screen.findByTestId('map');
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    expect(screen.getByLabelText('평일 이 시간 이후')).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    await waitFor(() => expect(screen.queryByLabelText('평일 이 시간 이후')).toBeNull());
  });
});

describe('Home map', () => {
  beforeEach(() => {
    week = {
      days: ['2026-10-23', '2026-10-24'],
      lastScrapeAt: null,
      meetups: [
        meetup('a', 'peakers-jongno', '2026-10-23T11:00:00.000Z', 12), // 금 20:00
        meetup('b', 'theclimb-gangnam', '2026-10-24T08:00:00.000Z', 25), // 토 17:00
      ],
    };
  });

  it("pins favourites and gyms with a crowd today", async () => {
    await renderHome(['peakers-jongno']);
    expect(await screen.findByLabelText('핀 피커스 종로점 12명')).toBeInTheDocument();
    expect(screen.queryByLabelText(/핀 더클라임 강남점/)).toBeNull(); // not a favourite, nobody there today
    expect(screen.getByRole('tab', { name: /오늘/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('recounts every pin when another day is picked', async () => {
    await renderHome(['peakers-jongno']);
    await screen.findByLabelText('핀 피커스 종로점 12명');
    fireEvent.click(screen.getByRole('tab', { name: /토/ }));
    expect(screen.getByLabelText('핀 피커스 종로점 0명')).toBeInTheDocument();
    expect(screen.getByLabelText('핀 더클라임 강남점 25명')).toBeInTheDocument();
  });

  it("shows a tapped gym's meetups for the chosen day and can star it", async () => {
    await renderHome(['peakers-jongno']);
    fireEvent.click(await screen.findByRole('tab', { name: /토/ }));
    fireEvent.click(await screen.findByLabelText('핀 더클라임 강남점 25명'));
    expect(screen.getByRole('heading', { name: '더클라임 강남점' })).toBeInTheDocument();
    expect(screen.getByText('17:00 · 크루b · 25명 · 소모임')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '더클라임 강남점 즐겨찾기' }));
    expect(screen.getByRole('button', { name: '더클라임 강남점 즐겨찾기' })).toHaveAttribute('aria-pressed', 'true');
  });
});
