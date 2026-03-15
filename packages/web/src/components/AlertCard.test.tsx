import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';
import { AlertCard } from './AlertCard.js';
import type { AlertSummary } from '../types/index.js';

const sampleAlert: AlertSummary = {
  id: 'test-1',
  severity: 'HIGH',
  source: 'SEC Filing',
  title: 'NVDA 10-K Revenue Decline',
  summary: 'Revenue dropped 12% YoY',
  tickers: ['NVDA'],
  time: new Date().toISOString(),
  saved: false,
};

const sampleAlert2: AlertSummary = {
  id: 'test-2',
  severity: 'MEDIUM',
  source: 'StockTwits',
  title: 'TSLA trending',
  summary: 'Tesla is trending on StockTwits',
  tickers: ['TSLA'],
  time: new Date().toISOString(),
  saved: false,
};

const confirmedAlert: AlertSummary = {
  ...sampleAlert,
  id: 'test-3',
  confirmationCount: 3,
  confirmedSources: ['SEC Filing', 'PR Newswire', 'Reuters'],
};

describe('AlertCard', () => {
  it('renders title, source, summary, and tickers', () => {
    render(
      <MemoryRouter>
        <AlertCard alert={sampleAlert} />
      </MemoryRouter>,
    );

    expect(screen.getByText(sampleAlert.title)).toBeInTheDocument();
    expect(screen.getByText(/SEC Filing/)).toBeInTheDocument();
    expect(screen.getByText('NVDA')).toBeInTheDocument();
    expect(screen.getByText(sampleAlert.summary)).toBeInTheDocument();
  });

  it('navigates to the detail page from the card body', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AlertCard alert={sampleAlert2} />} />
          <Route path="/event/:id" element={<div>Detail page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /open alert/i }));

    expect(screen.getByText('Detail page')).toBeInTheDocument();
  });

  it('renders a confirmation badge for multi-source events', () => {
    render(
      <MemoryRouter>
        <AlertCard alert={confirmedAlert} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/confirmed by 3 sources/i)).toBeInTheDocument();
  });
});
