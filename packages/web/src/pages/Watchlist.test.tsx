import { screen, waitFor } from '@testing-library/react';
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

  it('shows empty state when watchlist is empty', async () => {
    renderWithRouter(
      [{ path: '/watchlist', element: <Watchlist /> }],
      ['/watchlist'],
    );

    await waitFor(() => {
      expect(screen.getByText('Watchlist is empty')).toBeInTheDocument();
    });
  });
});
