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

  it('does not expose the removed pricing route', async () => {
    renderWithRouter(appRoutes, ['/pricing']);

    expect(await screen.findByText(/page not found/i)).toBeInTheDocument();
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

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    renderWithRouter(appRoutes, ['/']);

    expect(await screen.findByRole('heading', { name: /event radar/i })).toBeInTheDocument();
  });

  it.each([
    '/about',
    '/api-docs',
    '/scorecard',
    '/history',
  ])('does not expose removed route %s', async (path) => {
    renderWithRouter(appRoutes, [path]);

    expect(await screen.findByText(/page not found/i)).toBeInTheDocument();
  });
});
