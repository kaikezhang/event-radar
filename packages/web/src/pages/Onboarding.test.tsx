import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Onboarding } from './Onboarding.js';
import { renderWithRouter } from '../test/render.js';

const MOCK_SUGGESTED = {
  tickers: [
    { symbol: 'NVDA', eventCount7d: 5, latestSignal: 'CRITICAL' },
    { symbol: 'AAPL', eventCount7d: 3, latestSignal: 'HIGH' },
    { symbol: 'TSLA', eventCount7d: 2, latestSignal: 'MEDIUM' },
  ],
  packs: [
    { name: 'Tech Leaders', tickers: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META'] },
    { name: 'Biotech', tickers: ['MRNA', 'PFE', 'ABBV', 'GILD', 'REGN'] },
    { name: 'Energy', tickers: ['XOM', 'CVX', 'OXY', 'SLB', 'COP'] },
    { name: 'Finance', tickers: ['JPM', 'GS', 'BAC', 'MS', 'V'] },
  ],
};

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

    if (url.pathname === '/api/v1/onboarding/suggested-tickers') {
      return new Response(JSON.stringify(MOCK_SUGGESTED), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/v1/onboarding/bulk-add' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { tickers: string[] };
      return new Response(
        JSON.stringify({ added: body.tickers.length, total: body.tickers.length }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.pathname === '/api/watchlist') {
      return new Response(JSON.stringify({ data: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({}), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

describe('Onboarding page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders sector packs and trending tickers', async () => {
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    // Sector packs
    await waitFor(() => {
      expect(screen.getByText('Tech Leaders')).toBeInTheDocument();
    });
    expect(screen.getByText('Biotech')).toBeInTheDocument();
    expect(screen.getByText('Energy')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();

    // Trending tickers
    expect(screen.getByText('NVDA')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('TSLA')).toBeInTheDocument();
  });

  it('shows minimum 3 tickers validation', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    await waitFor(() => {
      expect(screen.getByText('Tech Leaders')).toBeInTheDocument();
    });

    // Initially 0 tickers - button should be disabled
    expect(screen.getByText(/you're watching 0 tickers/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start watching/i })).toBeDisabled();

    // Add 2 tickers via trending - should still show hint
    await user.click(screen.getByText('NVDA'));
    await user.click(screen.getByText('AAPL'));

    expect(screen.getByText(/you're watching 2 tickers/i)).toBeInTheDocument();
    expect(screen.getByText(/add at least 1 more to continue/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start watching/i })).toBeDisabled();

    // Add a third
    await user.click(screen.getByText('TSLA'));

    expect(screen.getByText(/you're watching 3 tickers/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start watching/i })).toBeEnabled();
  });

  it('adds sector pack tickers on click', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    await waitFor(() => {
      expect(screen.getByText('Tech Leaders')).toBeInTheDocument();
    });

    // Click Tech Leaders pack (adds 5 tickers)
    await user.click(screen.getByText('Tech Leaders'));

    expect(screen.getByText(/you're watching 5 tickers/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start watching/i })).toBeEnabled();
  });

  it('allows manual ticker input', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Add custom ticker')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Add custom ticker');
    await user.type(input, 'GME');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(screen.getByText(/you're watching 1 ticker$/i)).toBeInTheDocument();
  });

  it('renders sector packs as compact add buttons', async () => {
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    expect(await screen.findByRole('button', { name: /add tech leaders pack/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add biotech pack/i })).toBeInTheDocument();
  });

  it('emphasizes trending names as quick-add chips', async () => {
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    expect(await screen.findByRole('button', { name: /quick add nvda/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick add aapl/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick add tsla/i })).toBeInTheDocument();
  });
});
