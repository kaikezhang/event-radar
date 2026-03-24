import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyBriefing } from './DailyBriefing.js';
import { renderWithRouter } from '../test/render.js';
import { getTodayDateKey } from '../lib/daily-briefing.js';

const DISMISSED_KEY = 'lastBriefingDismissed';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockBriefingResponse(payload?: Partial<{
  date: string;
  totalEvents: number;
  bySeverity: Record<string, number>;
  topEvents: Array<{ title: string; ticker: string | null; severity: string }>;
  bySource: Record<string, number>;
  watchlistEvents: number;
}>): void {
  const fetchMock = vi.mocked(fetch);
  const originalImplementation = fetchMock.getMockImplementation();

  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

    if (url.pathname === '/api/v1/briefing/daily') {
      return jsonResponse({
        date: '2026-03-23',
        totalEvents: 4,
        bySeverity: {
          CRITICAL: 1,
          HIGH: 2,
          MEDIUM: 1,
          LOW: 0,
        },
        topEvents: [
          { title: 'Nvidia issues urgent filing', ticker: 'NVDA', severity: 'CRITICAL' },
          { title: 'Tesla trading halt', ticker: 'TSLA', severity: 'HIGH' },
          { title: 'Apple guidance update', ticker: 'AAPL', severity: 'MEDIUM' },
        ],
        bySource: {
          'sec-edgar': 2,
          'breaking-news': 1,
          'trading-halt': 1,
        },
        watchlistEvents: 2,
        ...payload,
      });
    }

    return originalImplementation?.(input, init) as Promise<Response>;
  });
}

describe('DailyBriefing', () => {
  beforeEach(() => {
    localStorage.clear();
    mockBriefingResponse();
  });

  it('renders collapsed by default and expands to show the full briefing', async () => {
    const user = userEvent.setup();

    renderWithRouter([
      { path: '/', element: <DailyBriefing /> },
      { path: '/history', element: <div>History page</div> },
    ], ['/']);

    const toggle = await screen.findByRole('button', { name: /daily briefing/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/daily briefing · 1 critical event today/i)).toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText(/severity breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/1 critical, 2 high, 1 medium in the last 24h/i)).toBeInTheDocument();
    expect(screen.getByText(/source breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/events affecting your watchlist: 2/i)).toBeInTheDocument();
    expect(screen.getByText(/sec filings: 2, breaking news: 1, trading halts: 1/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/history');
    expect(screen.getByText(/nvidia issues urgent filing/i)).toBeInTheDocument();
  });

  it('dismisses the briefing for today', async () => {
    const user = userEvent.setup();

    renderWithRouter([{ path: '/', element: <DailyBriefing /> }], ['/']);

    const toggle = await screen.findByRole('button', { name: /daily briefing/i });
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: /dismiss for today/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /daily briefing/i })).not.toBeInTheDocument();
    });
    expect(localStorage.getItem(DISMISSED_KEY)).toBe(getTodayDateKey());
  });

  it('stays hidden when already dismissed today', () => {
    localStorage.setItem(DISMISSED_KEY, getTodayDateKey());

    renderWithRouter([{ path: '/', element: <DailyBriefing /> }], ['/']);

    expect(screen.queryByRole('button', { name: /daily briefing/i })).not.toBeInTheDocument();
  });

  it('omits the watchlist activity line when there is no watchlist activity', async () => {
    const user = userEvent.setup();
    mockBriefingResponse({ watchlistEvents: 0 });

    renderWithRouter([{ path: '/', element: <DailyBriefing /> }], ['/']);

    await user.click(await screen.findByRole('button', { name: /daily briefing/i }));

    expect(screen.queryByText(/events affecting your watchlist/i)).not.toBeInTheDocument();
  });
});
