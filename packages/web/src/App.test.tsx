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

    expect(await screen.findByRole('heading', { name: /event radar/i })).toBeInTheDocument();
    expect(screen.getByText(/ai-powered stock market event intelligence/i)).toBeInTheDocument();
  });
});
