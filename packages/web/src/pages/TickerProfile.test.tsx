import { screen, waitFor } from '@testing-library/react';
import { TickerProfile } from './TickerProfile.js';
import { renderWithRouter } from '../test/render.js';

describe('TickerProfile page', () => {
  it('renders the ticker heading and related alerts', async () => {
    renderWithRouter(
      [{ path: '/ticker/:symbol', element: <TickerProfile /> }],
      ['/ticker/NVDA'],
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /nvidia corporation/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/recent radar for nvda/i)).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /nvda export filing flags china exposure risk/i })).toBeInTheDocument();
  });

  it('shows quick stats for the ticker profile', async () => {
    renderWithRouter(
      [{ path: '/ticker/:symbol', element: <TickerProfile /> }],
      ['/ticker/NVDA'],
    );

    await waitFor(() => {
      expect(screen.getByText(/total events/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/avg severity/i)).toBeInTheDocument();
    expect(screen.getByText(/top source/i)).toBeInTheDocument();
  });
});
