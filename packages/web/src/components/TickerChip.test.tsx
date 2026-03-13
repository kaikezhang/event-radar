import { screen } from '@testing-library/react';
import { Route, Routes, MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TickerChip } from './TickerChip.js';

describe('TickerChip', () => {
  it('renders a ticker with dollar prefix', () => {
    render(
      <MemoryRouter>
        <TickerChip symbol="NVDA" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '$NVDA' })).toHaveAttribute('href', '/ticker/NVDA');
  });

  it('navigates to the ticker route when tapped', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<TickerChip symbol="AAPL" />} />
          <Route path="/ticker/:symbol" element={<div>Ticker route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: '$AAPL' }));

    expect(screen.getByText('Ticker route')).toBeInTheDocument();
  });
});
