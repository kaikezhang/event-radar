import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach } from 'vitest';
import { vi } from 'vitest';
import { Feed } from './Feed.js';
import { renderWithRouter } from '../test/render.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Feed page', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('onboardingComplete', 'true');
  });

  it('shows the loading state while the feed query resolves', () => {
    renderWithRouter(
      [{ path: '/', element: <Feed /> }],
      ['/'],
    );

    expect(screen.getByText(/scanning 15 sources for your watchlist/i)).toBeInTheDocument();
  });

  it('renders alert cards after the feed query resolves', async () => {
    renderWithRouter([{ path: '/', element: <Feed /> }], ['/']);

    await waitFor(() => {
      expect(screen.getByRole('article', { name: /nvda export filing flags china exposure risk/i })).toBeInTheDocument();
    });
  });

  it('renders a lightweight setup-worked cue on feed cards when summary data is available', async () => {
    renderWithRouter([{ path: '/', element: <Feed /> }], ['/']);

    await waitFor(() => {
      expect(screen.getAllByText(/setup worked 60%/i).length).toBeGreaterThan(0);
    });
  });

  it('filters the feed down to pushed alerts when the push-only toggle is enabled', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const originalImplementation = fetchMock.getMockImplementation();

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/watchlist') {
        return jsonResponse({
          data: [
            {
              id: 'watch-1',
              ticker: 'TSLA',
              addedAt: '2026-03-12T19:00:00.000Z',
            },
          ],
        });
      }

      if (url.pathname === '/api/v1/feed') {
        return jsonResponse({
          events: [
            {
              id: 'evt-pushed',
              severity: 'HIGH',
              source: 'sec-edgar',
              title: 'Pushed NVDA alert',
              summary: 'This one triggered push.',
              pushed: true,
              tickers: ['NVDA'],
              receivedAt: '2026-03-12T20:05:00.000Z',
            },
            {
              id: 'evt-feed-only',
              severity: 'HIGH',
              source: 'stocktwits',
              title: 'Feed-only TSLA alert',
              summary: 'This one stayed in feed.',
              pushed: false,
              tickers: ['TSLA'],
              receivedAt: '2026-03-12T19:05:00.000Z',
            },
          ],
          cursor: null,
          total: 2,
        });
      }

      return originalImplementation?.(input, init) as Promise<Response>;
    });

    renderWithRouter([{ path: '/', element: <Feed /> }], ['/']);

    expect(await screen.findByRole('article', { name: /pushed nvda alert/i })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /feed-only tsla alert/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /push alerts only/i }));

    await waitFor(() => {
      expect(screen.getByRole('article', { name: /pushed nvda alert/i })).toBeInTheDocument();
      expect(screen.queryByRole('article', { name: /feed-only tsla alert/i })).not.toBeInTheDocument();
    });
  });

  it('restores the saved feed sort preference on load', async () => {
    localStorage.setItem('er-feed-sort', 'severity');

    renderWithRouter([{ path: '/', element: <Feed /> }], ['/']);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue('severity');
    });
  });

  it('persists feed sort changes to localStorage immediately', async () => {
    const user = userEvent.setup();

    renderWithRouter([{ path: '/', element: <Feed /> }], ['/']);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue('latest');
    });

    await user.selectOptions(screen.getByRole('combobox'), 'severity');

    expect(localStorage.getItem('er-feed-sort')).toBe('severity');
  });

  it('hides LOW alerts in smart mode until the reveal pill is clicked', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const originalImplementation = fetchMock.getMockImplementation();

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/v1/feed') {
        return jsonResponse({
          events: [
            {
              id: 'evt-smart-high',
              severity: 'HIGH',
              source: 'sec-edgar',
              title: 'High-priority NVDA filing',
              summary: 'Material update for Nvidia.',
              pushed: true,
              tickers: ['NVDA'],
              receivedAt: '2026-03-12T20:05:00.000Z',
            },
            {
              id: 'evt-smart-low',
              severity: 'LOW',
              source: 'stocktwits',
              title: 'Low-priority TSLA chatter',
              summary: 'Social noise for Tesla.',
              pushed: false,
              tickers: ['TSLA'],
              receivedAt: '2026-03-12T19:05:00.000Z',
            },
          ],
          cursor: null,
          total: 2,
        });
      }

      return originalImplementation?.(input, init) as Promise<Response>;
    });

    renderWithRouter([{ path: '/', element: <Feed /> }], ['/']);

    expect(await screen.findByRole('article', { name: /high-priority nvda filing/i })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /low-priority tsla chatter/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /all events/i }));
    await user.click(screen.getByRole('button', { name: /smart feed/i }));

    await waitFor(() => {
      expect(screen.queryByRole('article', { name: /low-priority tsla chatter/i })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /showing high\+ events · 1 low event hidden/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /showing high\+ events · 1 low event hidden/i }));

    await waitFor(() => {
      expect(screen.getByRole('article', { name: /low-priority tsla chatter/i })).toBeInTheDocument();
    });
  });

  it('shows LOW alerts and quality stats in all-events mode', async () => {
    const fetchMock = vi.mocked(fetch);
    const originalImplementation = fetchMock.getMockImplementation();

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/v1/feed') {
        return jsonResponse({
          events: [
            {
              id: 'evt-all-high',
              severity: 'HIGH',
              source: 'breaking-news',
              title: 'High-priority macro catalyst',
              summary: 'Important catalyst.',
              pushed: true,
              tickers: ['SPY'],
              receivedAt: '2026-03-12T20:05:00.000Z',
            },
            {
              id: 'evt-all-low',
              severity: 'LOW',
              source: 'stocktwits',
              title: 'Low-priority meme chatter',
              summary: 'Background social activity.',
              pushed: false,
              tickers: ['GME'],
              receivedAt: '2026-03-12T19:05:00.000Z',
            },
          ],
          cursor: null,
          total: 2,
        });
      }

      return originalImplementation?.(input, init) as Promise<Response>;
    });

    renderWithRouter([{ path: '/', element: <Feed /> }], ['/?tab=all']);

    expect(await screen.findByRole('article', { name: /high-priority macro catalyst/i })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /low-priority meme chatter/i })).toBeInTheDocument();
    expect(screen.getByText(/2 events · 1 high\+ · 1 low/i)).toBeInTheDocument();
  });
});
