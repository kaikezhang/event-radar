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

  it('does not render source-level setup-worked stats on feed cards', async () => {
    renderWithRouter([{ path: '/', element: <Feed /> }], ['/']);

    await waitFor(() => {
      expect(screen.getByRole('article', { name: /nvda export filing flags china exposure risk/i })).toBeInTheDocument();
    });

    expect(screen.queryByText(/setup worked/i)).not.toBeInTheDocument();
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

  it('hides LOW alerts in smart mode while all-events mode still shows them', async () => {
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

    renderWithRouter([{ path: '/', element: <Feed /> }], ['/?tab=all']);

    expect(await screen.findByRole('article', { name: /high-priority nvda filing/i })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /low-priority tsla chatter/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /all events/i }));
    await user.click(screen.getByRole('button', { name: /smart feed/i }));

    await waitFor(() => {
      expect(screen.queryByRole('article', { name: /low-priority tsla chatter/i })).not.toBeInTheDocument();
    });
  });

  it('shows LOW alerts in all-events mode without the removed quality stats', async () => {
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
    expect(screen.queryByText(/2 events · 1 high\+ · 1 low/i)).not.toBeInTheDocument();
  });

  it('collapses same-ticker duplicate reports into one card with related-source context', async () => {
    const fetchMock = vi.mocked(fetch);
    const originalImplementation = fetchMock.getMockImplementation();

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/v1/feed') {
        return jsonResponse({
          events: [
            {
              id: 'evt-breaking-news',
              severity: 'HIGH',
              source: 'breaking-news',
              title: 'Breaking desk flags NVDA supply update',
              summary: 'Fresh breaking-news headline.',
              tickers: ['NVDA'],
              receivedAt: '2026-03-12T20:05:00.000Z',
            },
            {
              id: 'evt-sec',
              severity: 'HIGH',
              source: 'sec-edgar',
              title: 'SEC filing flags NVDA supply update',
              summary: 'EDGAR confirms the same headline.',
              tickers: ['NVDA'],
              receivedAt: '2026-03-12T19:25:00.000Z',
            },
            {
              id: 'evt-reuters',
              severity: 'HIGH',
              source: 'reuters',
              title: 'Reuters confirms NVDA supply update',
              summary: 'Newswire confirms the same headline.',
              tickers: ['NVDA'],
              receivedAt: '2026-03-12T18:45:00.000Z',
            },
          ],
          cursor: null,
          total: 3,
        });
      }

      return originalImplementation?.(input, init) as Promise<Response>;
    });

    renderWithRouter([{ path: '/', element: <Feed /> }], ['/']);

    expect(await screen.findByRole('article', { name: /breaking desk flags nvda supply update/i })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: /sec filing flags nvda supply update/i })).not.toBeInTheDocument();
    expect(screen.getByText(/nvda · 3 related events/i)).toBeInTheDocument();
    expect(screen.getByText(/also reported by: sec edgar, reuters/i)).toBeInTheDocument();
  });
});
