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
  sourceKey: 'sec-edgar',
  title: 'NVDA 10-K Revenue Decline',
  summary: 'Revenue dropped 12% YoY',
  tickers: ['NVDA'],
  time: new Date().toISOString(),
  saved: false,
  direction: 'bearish',
  confidence: 0.85,
};

const sampleAlert2: AlertSummary = {
  id: 'test-2',
  severity: 'MEDIUM',
  source: 'StockTwits',
  sourceKey: 'stocktwits',
  title: 'TSLA trending',
  summary: 'Tesla is trending on StockTwits',
  tickers: ['TSLA'],
  time: new Date().toISOString(),
  saved: false,
  direction: 'bullish',
};

const confirmedAlert: AlertSummary = {
  ...sampleAlert,
  id: 'test-3',
  confirmationCount: 3,
  confirmedSources: ['SEC Filing', 'PR Newswire', 'Reuters'],
};

const criticalAlert: AlertSummary = {
  id: 'test-4',
  severity: 'CRITICAL',
  source: 'Breaking News',
  sourceKey: 'breaking-news',
  title: 'Fed announces emergency rate cut',
  summary: 'Historical pattern shows 75% win rate for similar events',
  tickers: ['SPY', 'QQQ'],
  time: new Date().toISOString(),
  saved: false,
  direction: 'bullish',
  confidence: 0.92,
};

const lowAlert: AlertSummary = {
  id: 'test-5',
  severity: 'LOW',
  source: 'Reddit',
  sourceKey: 'reddit',
  title: 'GME meme activity spike',
  summary: 'Low conviction social signal',
  tickers: ['GME'],
  time: new Date().toISOString(),
  saved: false,
  direction: 'neutral',
};

describe('AlertCard', () => {
  it('renders title, source, summary, and tickers', () => {
    render(
      <MemoryRouter>
        <AlertCard alert={sampleAlert} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/NVDA 10-K Revenue Decline/)).toBeInTheDocument();
    expect(screen.getByText(/SEC EDGAR/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'NVDA' })).toBeInTheDocument();
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

    expect(screen.getByText(/confirmed/i)).toBeInTheDocument();
  });

  it('renders direction badge with confidence label', () => {
    render(
      <MemoryRouter>
        <AlertCard alert={sampleAlert} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/BEARISH/)).toBeInTheDocument();
    expect(screen.getByText(/High conf/)).toBeInTheDocument();
  });

  it('renders CRITICAL tier with elevated background and wider bar', () => {
    const { container } = render(
      <MemoryRouter>
        <AlertCard alert={criticalAlert} />
      </MemoryRouter>,
    );

    const article = container.querySelector('article');
    expect(article?.className).toContain('bg-bg-elevated');
    expect(screen.getByText(/BULLISH/)).toBeInTheDocument();
  });

  it('renders LOW tier as compressed card with inline direction', () => {
    render(
      <MemoryRouter>
        <AlertCard alert={lowAlert} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/LOW/)).toBeInTheDocument();
    expect(screen.getByText(/NEUTRAL/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GME' })).toBeInTheDocument();
  });

  it('renders ticker chips as links', () => {
    render(
      <MemoryRouter>
        <AlertCard alert={criticalAlert} />
      </MemoryRouter>,
    );

    const spyLink = screen.getByRole('link', { name: 'SPY' });
    expect(spyLink).toHaveAttribute('href', '/ticker/SPY');
    const qqqLink = screen.getByRole('link', { name: 'QQQ' });
    expect(qqqLink).toHaveAttribute('href', '/ticker/QQQ');
  });

  it('renders watchlist star toggle', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AlertCard
          alert={sampleAlert}
          showWatchlistButton
          isOnWatchlist={false}
          onToggleWatchlist={onToggle}
        />
      </MemoryRouter>,
    );

    const starButton = screen.getByRole('button', { name: /add nvda to watchlist/i });
    await user.click(starButton);
    expect(onToggle).toHaveBeenCalledWith('NVDA');
  });
});
