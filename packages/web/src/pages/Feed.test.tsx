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

  it('renders a lightweight trust cue on feed cards when summary data is available', async () => {
    renderWithRouter([{ path: '/', element: <Feed /> }], ['/']);

    await waitFor(() => {
      expect(screen.getAllByText(/source hit rate 67%/i).length).toBeGreaterThan(0);
    });
  });

  it('filters the feed down to pushed alerts when the push-only toggle is enabled', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const originalImplementation = fetchMock.getMockImplementation();

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

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
});
