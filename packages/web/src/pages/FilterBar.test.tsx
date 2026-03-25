import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach } from 'vitest';
import { Feed } from './Feed.js';
import { renderWithRouter } from '../test/render.js';

describe('Feed page with filters', () => {
  beforeEach(() => {
    localStorage.setItem('onboardingComplete', 'true');
  });
  it('shows filter toggle button', async () => {
    renderWithRouter(
      [{ path: '/', element: <Feed /> }],
      ['/'],
    );

    await waitFor(() => {
      expect(screen.getByText(/Filters/)).toBeInTheDocument();
    });
  });

  it('shows filter panel when clicking toggle', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      [{ path: '/', element: <Feed /> }],
      ['/'],
    );

    await waitFor(() => {
      expect(screen.getByText(/Filters/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Filters/));

    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.queryByText('Presets')).not.toBeInTheDocument();
  });

  it('renders alert cards after the feed query resolves', async () => {
    renderWithRouter([{ path: '/', element: <Feed /> }], ['/']);

    await waitFor(() => {
      expect(screen.getByRole('article', { name: /nvda export filing flags china exposure risk/i })).toBeInTheDocument();
    });
  });
});
