import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Watchlist } from './Watchlist.js';
import { renderWithRouter } from '../test/render.js';

describe('Watchlist page', () => {
  it('renders watchlist header and add form', async () => {
    renderWithRouter(
      [{ path: '/watchlist', element: <Watchlist /> }],
      ['/watchlist'],
    );

    await waitFor(() => {
      expect(screen.getByText('Watchlist')).toBeInTheDocument();
    });

    // The add-ticker UI is now a search button that opens the TickerSearch overlay
    expect(screen.getByText(/search tickers to add/i)).toBeInTheDocument();
  });

  it('shows watchlist-first onboarding copy when the watchlist is empty', async () => {
    renderWithRouter(
      [{ path: '/watchlist', element: <Watchlist /> }],
      ['/watchlist'],
    );

    await waitFor(() => {
      expect(screen.getByText(/start with a watchlist/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/event radar works best when you follow a small set of names/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /enable push alerts/i })).toHaveAttribute(
      'href',
      '/settings?from=watchlist#push-alerts',
    );
  });

  it('shows the add-ticker section with contextual copy when the watchlist is empty', async () => {
    renderWithRouter(
      [{ path: '/watchlist', element: <Watchlist /> }],
      ['/watchlist'],
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add your first ticker/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/start with the names you care about most/i)).toBeInTheDocument();
  });

  it('opens the ticker search overlay when the search button is clicked', async () => {
    const user = userEvent.setup();

    renderWithRouter(
      [{ path: '/watchlist', element: <Watchlist /> }],
      ['/watchlist'],
    );

    const searchButton = await screen.findByText(/search tickers to add/i);
    await user.click(searchButton.closest('button')!);

    // The TickerSearch overlay should now be open with a combobox input
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  it('shows a first-ticker success state after adding the first symbol', async () => {
    const user = userEvent.setup();
    const watchlist: Array<{ id: string; ticker: string; addedAt: string; notes: null }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/auth/me') {
        return new Response(JSON.stringify({ id: 'user-1', email: 'test@example.com', displayName: 'Test User' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/api/v1/feed/watchlist-summary') {
        return new Response(JSON.stringify({ tickers: [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/api/watchlist' && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ data: watchlist }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/api/watchlist' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { ticker: string };
        const item = {
          id: 'watch-1',
          ticker: body.ticker,
          addedAt: '2026-03-15T00:00:00.000Z',
          notes: null,
        };
        watchlist.splice(0, watchlist.length, item);

        return new Response(JSON.stringify(item), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/api/tickers/search') {
        const q = url.searchParams.get('q')?.toLowerCase() ?? '';
        if (q.includes('nvda')) {
          return new Response(JSON.stringify({
            data: [{ ticker: 'NVDA', name: 'NVIDIA Corporation', sector: null, exchange: null }],
          }), { headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ data: [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/api/tickers/trending') {
        return new Response(JSON.stringify({ data: [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWithRouter(
      [{ path: '/watchlist', element: <Watchlist /> }],
      ['/watchlist'],
    );

    // Open the search overlay
    const searchButton = await screen.findByText(/search tickers to add/i);
    await user.click(searchButton.closest('button')!);

    // Type in the search combobox
    const input = await screen.findByRole('combobox');
    await user.type(input, 'NVDA');

    // Wait for search results and click to add
    const addButton = await screen.findByRole('button', { name: /add.*nvda/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/nvda is now on your watchlist/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: /enable push alerts on this device/i })).toHaveAttribute(
      'href',
      '/settings?from=watchlist#push-alerts',
    );
  });

  it('renders saved tickers as a flat list without section chrome', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/auth/me') {
        return new Response(JSON.stringify({ id: 'user-1', email: 'test@example.com', displayName: 'Test User' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/api/watchlist') {
        return new Response(JSON.stringify({
          data: [
            {
              id: 'watch-1',
              ticker: 'NVDA',
              addedAt: '2026-03-15T00:00:00.000Z',
              notes: 'AI leader',
              name: 'NVIDIA Corporation',
              sectionId: 'growth',
              sortOrder: 2,
            },
            {
              id: 'watch-2',
              ticker: 'AAPL',
              addedAt: '2026-03-14T00:00:00.000Z',
              notes: null,
              name: 'Apple Inc.',
              sectionId: 'quality',
              sortOrder: 1,
            },
          ],
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/api/v1/feed/watchlist-summary') {
        return new Response(JSON.stringify({ tickers: [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch);

    renderWithRouter(
      [{ path: '/watchlist', element: <Watchlist /> }],
      ['/watchlist'],
    );

    expect(await screen.findByText('$AAPL')).toBeInTheDocument();
    expect(screen.getByText('$NVDA')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new section/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /section menu/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /drag to reorder/i })).not.toBeInTheDocument();
  });
});
