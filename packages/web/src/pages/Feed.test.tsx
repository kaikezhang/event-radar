import { screen, waitFor } from '@testing-library/react';
import { Feed } from './Feed.js';
import { renderWithRouter } from '../test/render.js';

describe('Feed page', () => {
  it('shows skeleton cards while loading', () => {
    const { getAllByTestId } = renderWithRouter(
      [{ path: '/', element: <Feed /> }],
      ['/'],
    );

    expect(getAllByTestId('skeleton-card')).toHaveLength(5);
  });

  it('renders alert cards after the feed query resolves', async () => {
    renderWithRouter([{ path: '/', element: <Feed /> }], ['/']);

    await waitFor(() => {
      expect(screen.getByRole('article', { name: /nvda export filing flags china exposure risk/i })).toBeInTheDocument();
    });
  });
});
