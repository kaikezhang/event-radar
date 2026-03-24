import { screen } from '@testing-library/react';
import { AppShell, APP_SHELL_BOTTOM_PADDING_CLASS, appRoutes } from './App.js';
import { renderWithRouter } from './test/render.js';

describe('App shell spacing', () => {
  it('adds bottom padding to the main content wrapper so the bottom nav does not overlap content', async () => {
    localStorage.setItem('onboardingComplete', 'true');

    renderWithRouter([
      {
        path: '/',
        element: <AppShell />,
        children: [{ index: true, element: <div>Feed body</div> }],
      },
    ], ['/']);

    expect(await screen.findByTestId('app-shell-content')).toHaveClass(APP_SHELL_BOTTOM_PADDING_CLASS);
  });

  it('renders the landing page on the pricing route', async () => {
    renderWithRouter(appRoutes, ['/pricing']);

    expect(await screen.findByRole('heading', { name: /know what moves markets/i })).toBeInTheDocument();
    expect(screen.getByText(/ai-powered event detection across 13 real-time sources/i)).toBeInTheDocument();
  });

  it('routes authenticated users to the feed on the home page', async () => {
    localStorage.setItem('onboardingComplete', 'true');

    renderWithRouter(appRoutes, ['/']);

    expect(await screen.findByText(/nvda export filing flags china exposure risk/i)).toBeInTheDocument();
  });

  it('routes signed-out users to the landing page on the home page', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/auth/me') {
        return new Response(null, { status: 401 });
      }

      if (url.pathname === '/api/auth/refresh' && init?.method === 'POST') {
        return new Response(null, { status: 401 });
      }

      if (url.pathname === '/api/v1/scorecards/summary') {
        return new Response(JSON.stringify({
          days: null,
          overview: {
            totalEvents: 24001,
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
            avgT5Move: 2.4,
            avgT20Move: 5.1,
            medianT20Move: 3.8,
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

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    renderWithRouter(appRoutes, ['/']);

    expect(await screen.findByRole('heading', { name: /know what moves markets/i })).toBeInTheDocument();
  });

  it('routes to the API docs page', async () => {
    renderWithRouter(appRoutes, ['/api-docs']);

    expect(await screen.findByRole('heading', { name: /api docs/i })).toBeInTheDocument();
    expect(screen.getByText('/api/v1/reports/weekly')).toBeInTheDocument();
  });
});
