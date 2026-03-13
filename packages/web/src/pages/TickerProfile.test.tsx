import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithRouter } from '../test/render.js';

vi.mock('../components/EventChart.js', () => ({
  EventChart: ({ symbol }: { symbol: string }) => (
    <section aria-label="Mock event chart">
      <h2>{symbol} price action</h2>
    </section>
  ),
}));

import { TickerProfile } from './TickerProfile.js';

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

  it('renders the chart panel above the recent radar list', async () => {
    renderWithRouter(
      [{ path: '/ticker/:symbol', element: <TickerProfile /> }],
      ['/ticker/NVDA'],
    );

    const chartHeading = await screen.findByRole('heading', { name: /nvda price action/i });
    const radarHeading = await screen.findByRole('heading', { name: /recent radar for nvda/i });

    expect(
      chartHeading.compareDocumentPosition(radarHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
