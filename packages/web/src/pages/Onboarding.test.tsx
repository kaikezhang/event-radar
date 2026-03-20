import { screen, waitFor, within } from '@testing-library/react';
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

async function goToStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /get started/i }));
}

describe('Onboarding page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders welcome step initially', () => {
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    expect(screen.getByText('Welcome to Event Radar')).toBeInTheDocument();
    expect(screen.getByText(/track market-moving events/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
  });

  it('navigates to watchlist step on "Get started"', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    await user.click(screen.getByRole('button', { name: /get started/i }));

    expect(screen.getByText(/add tickers to your watchlist/i)).toBeInTheDocument();
  });

  it('renders sector packs and trending tickers in step 2', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    await goToStep2(user);

    // Sector packs
    await waitFor(() => {
      expect(screen.getByText('Tech Leaders')).toBeInTheDocument();
    });
    expect(screen.getByText('Biotech')).toBeInTheDocument();
    expect(screen.getByText('Energy')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();

    // Trending tickers section exists
    expect(screen.getByText('Trending this week')).toBeInTheDocument();
  });

  it('shows minimum 3 tickers validation', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    await goToStep2(user);

    await waitFor(() => {
      expect(screen.getByText('Tech Leaders')).toBeInTheDocument();
    });

    // Initially 0 tickers - button should be disabled
    expect(screen.getByText(/you're watching 0 tickers/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();

    // Add 2 tickers via popular chips (use getAllByRole since AAPL/TSLA appear in both popular + trending)
    const popularSection = screen.getByText('Popular tickers').closest('section')!;
    const popularAAPL = within(popularSection).getByRole('button', { name: /quick add aapl/i });
    const popularTSLA = within(popularSection).getByRole('button', { name: /quick add tsla/i });
    await user.click(popularAAPL);
    await user.click(popularTSLA);

    expect(screen.getByText(/you're watching 2 tickers/i)).toBeInTheDocument();
    expect(screen.getByText(/add at least 1 more to continue/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();

    // Add a third via popular section
    const popularNVDA = within(popularSection).getByRole('button', { name: /quick add nvda/i });
    await user.click(popularNVDA);

    expect(screen.getByText(/you're watching 3 tickers/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  it('adds sector pack tickers on click', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    await goToStep2(user);

    await waitFor(() => {
      expect(screen.getByText('Tech Leaders')).toBeInTheDocument();
    });

    // Click Tech Leaders pack (adds 5 tickers)
    await user.click(screen.getByText('Tech Leaders'));

    expect(screen.getByText(/you're watching 5 tickers/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  it('allows manual ticker input', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    await goToStep2(user);

    await waitFor(() => {
      expect(screen.getByLabelText('Add custom ticker')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Add custom ticker');
    await user.type(input, 'GME');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(screen.getByText(/you're watching 1 ticker$/i)).toBeInTheDocument();
  });

  it('renders sector packs as compact add buttons', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    await goToStep2(user);

    expect(await screen.findByRole('button', { name: /add tech leaders pack/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add biotech pack/i })).toBeInTheDocument();
  });

  it('emphasizes trending names as quick-add chips', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    await goToStep2(user);

    // Wait for trending section to appear
    const trendingHeading = await screen.findByText('Trending this week');
    const trendingSection = trendingHeading.closest('section')!;
    expect(within(trendingSection).getByRole('button', { name: /quick add nvda/i })).toBeInTheDocument();
    expect(within(trendingSection).getByRole('button', { name: /quick add aapl/i })).toBeInTheDocument();
    expect(within(trendingSection).getByRole('button', { name: /quick add tsla/i })).toBeInTheDocument();
  });

  it('shows notifications step after watchlist', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    await goToStep2(user);

    await waitFor(() => {
      expect(screen.getByText('Tech Leaders')).toBeInTheDocument();
    });

    // Add enough tickers
    await user.click(screen.getByText('Tech Leaders'));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // Should show notifications step — use heading specifically
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /enable notifications/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Trading halts, major SEC filings')).toBeInTheDocument();
  });

  it('shows done step with scorecard explanation', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    await goToStep2(user);

    await waitFor(() => {
      expect(screen.getByText('Tech Leaders')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Tech Leaders'));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /enable notifications/i })).toBeInTheDocument();
    });

    // Skip notifications
    await user.click(screen.getByRole('button', { name: /maybe later/i }));

    // Should show done step
    await waitFor(() => {
      expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/scorecard & trust cues/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to feed/i })).toBeInTheDocument();
  });

  it('sets localStorage on completion', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [
        { path: '/onboarding', element: <Onboarding /> },
        { path: '/', element: <div>Feed page</div> },
      ],
      ['/onboarding'],
    );

    await goToStep2(user);

    await waitFor(() => {
      expect(screen.getByText('Tech Leaders')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Tech Leaders'));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /enable notifications/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /maybe later/i }));

    await waitFor(() => {
      expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /go to feed/i }));

    expect(localStorage.getItem('onboardingComplete')).toBe('true');
  });

  it('skip link sets localStorage and navigates to feed', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    const { router } = renderWithRouter(
      [
        { path: '/onboarding', element: <Onboarding /> },
        { path: '/', element: <div>Feed page</div> },
      ],
      ['/onboarding'],
    );

    // Skip from welcome step
    await user.click(screen.getAllByText(/skip setup/i)[0]!);

    expect(localStorage.getItem('onboardingComplete')).toBe('true');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  it('shows popular ticker chips in step 2', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetch());

    renderWithRouter(
      [{ path: '/onboarding', element: <Onboarding /> }],
      ['/onboarding'],
    );

    await goToStep2(user);

    // Popular tickers section should be shown
    const popularHeading = screen.getByText('Popular tickers');
    const popularSection = popularHeading.closest('section')!;
    for (const ticker of ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'SPY']) {
      expect(within(popularSection).getByRole('button', { name: new RegExp(`quick add ${ticker}`, 'i') })).toBeInTheDocument();
    }
  });
});
