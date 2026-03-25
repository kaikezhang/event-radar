import { screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithRouter } from '../test/render.js';
import { Scorecard } from './Scorecard.js';

describe('Scorecard page', () => {
  it('renders only the five simplified scorecard metrics', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string'
        ? new URL(input, 'http://localhost')
        : new URL(input.toString(), 'http://localhost');

      if (url.pathname === '/api/v1/scorecards/summary' && url.searchParams.get('days') === '90') {
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
          sourceBuckets: [
            {
              bucket: 'sec-edgar',
              totalAlerts: 420,
              alertsWithUsableVerdicts: 320,
              directionalCorrectCount: 0,
              directionalHitRate: 0,
              setupWorkedCount: 208,
              setupWorkedRate: 0.65,
              avgT5Move: 2.4,
              avgT20Move: 5.6,
            },
            {
              bucket: 'breaking-news',
              totalAlerts: 600,
              alertsWithUsableVerdicts: 500,
              directionalCorrectCount: 0,
              directionalHitRate: 0,
              setupWorkedCount: 240,
              setupWorkedRate: 0.48,
              avgT5Move: 1.4,
              avgT20Move: 3.2,
            },
          ],
          eventTypeBuckets: [],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/api/v1/scorecards/summary' && url.searchParams.get('days') === '7') {
        return new Response(JSON.stringify({
          days: 7,
          overview: {
            totalEvents: 142,
            sourcesMonitored: 13,
            eventsWithTickers: 91,
            eventsWithPriceOutcomes: 47,
          },
          totals: {
            totalAlerts: 91,
            alertsWithUsableVerdicts: 47,
            directionalCorrectCount: 0,
            directionalHitRate: 0,
            setupWorkedCount: 19,
            setupWorkedRate: 0.4042,
            avgT5Move: 1.2,
            avgT20Move: 2.1,
            medianT20Move: 1.8,
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

      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch);

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
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/scorecards/summary?days=7',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(global.fetch).not.toHaveBeenCalledWith('/api/v1/scorecards/severity-breakdown?days=90',
      expect.anything(),
    );

    expect(screen.getByText('23,769')).toBeInTheDocument();
    expect(screen.getByText('45.2%')).toBeInTheDocument();
    expect(screen.getByText('+1.8% / +4.3%')).toBeInTheDocument();
    expect(screen.getByText('SEC Filing')).toBeInTheDocument();
    expect(screen.getByText('142')).toBeInTheDocument();
    expect(screen.getByText(/events this week/i)).toBeInTheDocument();
  });

  it('removes the heavy analytics chrome and placeholder sections', async () => {
    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /scorecard/i })).toBeInTheDocument();
    });

    expect(screen.queryByText(/rolling accuracy trend/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/advanced analytics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/signal buckets/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/confidence buckets/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/source buckets/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/event type buckets/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /30d/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /all/i })).not.toBeInTheDocument();
  });

  it('shows card skeletons while the scorecard queries are still loading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})) as typeof fetch);

    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    expect(screen.getAllByTestId('scorecard-skeleton-card')).toHaveLength(5);
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

  it('keeps the no-data empty state when alerts have not aged into verdict windows yet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      days: 90,
      overview: {
        totalEvents: 500,
        sourcesMonitored: 13,
        eventsWithTickers: 200,
        eventsWithPriceOutcomes: 0,
      },
      totals: {
        totalAlerts: 200,
        alertsWithUsableVerdicts: 0,
        directionalCorrectCount: 0,
        directionalHitRate: 0,
        setupWorkedCount: 0,
        setupWorkedRate: null,
        avgT5Move: null,
        avgT20Move: null,
        medianT20Move: null,
      },
      actionBuckets: [],
      confidenceBuckets: [],
      sourceBuckets: [],
      eventTypeBuckets: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch);

    renderWithRouter(
      [{ path: '/scorecard', element: <Scorecard /> }],
      ['/scorecard'],
    );

    expect(await screen.findByText(/scorecard is building/i)).toBeInTheDocument();
  });
});
