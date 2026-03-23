import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithRouter } from '../test/render.js';
import { Scorecard } from './Scorecard.js';

describe('Scorecard page', () => {
  it('loads the 90 day summary by default and renders top-level metrics', async () => {
    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /scorecard/i })).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/v1/scorecards/summary?days=90',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/scorecards/severity-breakdown?days=90',
      expect.objectContaining({ credentials: 'include' }),
    );

    expect(screen.getByText(/scorecard tracks how market events correlate with price movements/i)).toBeInTheDocument();
    expect(screen.getByText('23,769')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText('6,346')).toBeInTheDocument();
    expect(screen.getByText(/6,346 events with price outcomes \/ 12,028 events with tickers \(52\.8%\)/i)).toBeInTheDocument();
    expect(screen.getByText('Setup Worked Rate')).toBeInTheDocument();
    expect(screen.getByText('+4.3%')).toBeInTheDocument();
    expect(screen.getByText(/events without tickers/i)).toBeInTheDocument();
    expect(screen.getByText(/rolling accuracy trend/i)).toBeInTheDocument();
    expect(screen.getByText(/we're collecting enough data to show meaningful trends/i)).toBeInTheDocument();
  });

  it('renders all required bucket sections', async () => {
    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    await waitFor(() => {
      expect(screen.getByText('Signal buckets')).toBeInTheDocument();
    });

    expect(screen.getByText('Confidence buckets')).toBeInTheDocument();
    expect(screen.getByText('Source buckets')).toBeInTheDocument();
    expect(screen.getByText('Event type buckets')).toBeInTheDocument();

    expect(screen.getByText('High-Quality Setup')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('SEC Filing')).toBeInTheDocument();
    expect(screen.getByText('sec form 8k')).toBeInTheDocument();
  });

  it('lets the user switch the summary window without overbuilding filters', async () => {
    const user = userEvent.setup();

    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    const allButton = await screen.findByRole('button', { name: /all/i });
    await user.click(allButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/scorecards/summary',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    expect(screen.getByText('Full-history scorecard')).toBeInTheDocument();
  });

  it('shows card skeletons while the scorecard query is still loading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})) as typeof fetch);

    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    expect(screen.getAllByTestId('scorecard-skeleton-card')).toHaveLength(4);
  });

  it('renders a more actionable error state when the summary request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'boom' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch);

    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    expect(await screen.findByText(/scorecard data is taking a beat/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /return to live feed/i })).toHaveAttribute('href', '/');
  });

  it('leads with setup and coverage context instead of directional hit rate', async () => {
    const user = userEvent.setup();

    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    await waitFor(() => {
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    const moveHelps = screen.getAllByRole('button', { name: /t\+20 move explanation/i });
    expect(moveHelps).toHaveLength(2);
    await user.click(moveHelps[0]!);
    expect(screen.getByText(/price change 20 trading days/i)).toBeInTheDocument();

    const setupHelp = screen.getByRole('button', { name: /setup worked rate explanation/i });
    await user.click(setupHelp);
    expect(screen.getByText(/how often the event led to a tradeable move of 5%\+/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /directional hit rate explanation/i })).not.toBeInTheDocument();
    expect(screen.getByText(/coverage:/i)).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('shows a clear empty state when no severity data is available yet', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string'
        ? new URL(input, 'http://localhost')
        : new URL(input.toString(), 'http://localhost');

      if (url.pathname === '/api/v1/scorecards/summary') {
        return new Response(JSON.stringify({
          days: 90,
          overview: {
            totalEvents: 23769,
            sourcesMonitored: 13,
            eventsWithTickers: 12028,
            eventsWithPriceOutcomes: 6346,
          },
          totals: {
            totalAlerts: 12028,
            alertsWithUsableVerdicts: 6346,
            directionalCorrectCount: 0,
            directionalHitRate: 0,
            setupWorkedCount: 2870,
            setupWorkedRate: 0.4523,
            avgT5Move: 1.8,
            avgT20Move: 4.3,
            medianT20Move: 3.2,
          },
          actionBuckets: [],
          confidenceBuckets: [],
          sourceBuckets: [],
          eventTypeBuckets: [],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/api/v1/scorecards/severity-breakdown') {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch);

    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    expect(await screen.findByText(/no severity data available yet/i)).toBeInTheDocument();
  });
});
