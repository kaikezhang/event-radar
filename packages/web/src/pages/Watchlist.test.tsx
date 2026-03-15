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

    expect(screen.getByLabelText('Add ticker to watchlist')).toBeInTheDocument();
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

  it('shows a first-ticker success state after adding the first symbol', async () => {
    const user = userEvent.setup();
    const watchlist: Array<{ id: string; ticker: string; addedAt: string; notes: null }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

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

    const input = await screen.findByLabelText('Add ticker to watchlist');

    await user.type(input, 'nvda');
    await user.click(screen.getByRole('button', { name: /add first ticker/i }));

    await waitFor(() => {
      expect(screen.getByText(/nvda is now on your watchlist/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: '$NVDA' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /enable push alerts on this device/i })).toHaveAttribute(
      'href',
      '/settings?from=watchlist#push-alerts',
    );
  });

  it('renders compact quick-add chips for suggested tickers', async () => {
    renderWithRouter(
      [{ path: '/watchlist', element: <Watchlist /> }],
      ['/watchlist'],
    );

    expect(await screen.findByRole('button', { name: /quick add aapl/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick add nvda/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick add tsla/i })).toBeInTheDocument();
  });

  it('loads a suggested ticker into the add form when a quick-add chip is tapped', async () => {
    const user = userEvent.setup();

    renderWithRouter(
      [{ path: '/watchlist', element: <Watchlist /> }],
      ['/watchlist'],
    );

    await user.click(await screen.findByRole('button', { name: /quick add nvda/i }));

    expect(screen.getByLabelText('Add ticker to watchlist')).toHaveValue('NVDA');
  });
});
