import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Search } from './Search.js';
import { renderWithRouter } from '../test/render.js';

describe('Search page', () => {
  it('renders search input and popular tickers', () => {
    renderWithRouter(
      [{ path: '/search', element: <Search /> }],
      ['/search'],
    );

    expect(screen.getByLabelText('Search events')).toBeInTheDocument();
    expect(screen.getByText('Popular tickers')).toBeInTheDocument();
  });

  it('shows search results after typing a query', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      [{ path: '/search', element: <Search /> }],
      ['/search'],
    );

    const input = screen.getByLabelText('Search events');
    await user.type(input, 'earnings');

    await waitFor(() => {
      expect(screen.getByText(/earnings beat expectations/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows empty state when no results found', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      [{ path: '/search', element: <Search /> }],
      ['/search'],
    );

    const input = screen.getByLabelText('Search events');
    await user.type(input, 'xyznotfound');

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
