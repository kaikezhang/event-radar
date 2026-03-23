import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SimilarPastEvents } from './SimilarPastEvents.js';

describe('SimilarPastEvents', () => {
  it('renders the historical outcome summary when stats are available', () => {
    render(
      <SimilarPastEvents
        similarEvents={[
          {
            title: 'Prior NVDA export disclosure',
            date: '2026-02-15T14:30:00.000Z',
            move: '+12.4%',
            ticker: 'NVDA',
            changeT5: 12.4,
          },
          {
            title: 'Prior TSLA regulatory headline',
            date: '2026-03-01T14:30:00.000Z',
            move: '-8.1%',
            ticker: 'TSLA',
            changeT5: -8.1,
          },
        ]}
        outcomeStats={{
          totalWithOutcomes: 2,
          avgMoveT5: 2.2,
          setupWorkedPct: 50,
          bestOutcome: {
            ticker: 'NVDA',
            changeT5: 12.4,
            date: '2026-02-15',
          },
          worstOutcome: {
            ticker: 'TSLA',
            changeT5: -8.1,
            date: '2026-03-01',
          },
        }}
      />,
    );

    expect(screen.getByText(/historical outcomes \(2 similar events\)/i)).toBeInTheDocument();
    expect(screen.getByText(/50% moved 5%\+ \(setup worked\)/i)).toBeInTheDocument();
    expect(screen.getByText(/average t\+5 move: \+2\.2%/i)).toBeInTheDocument();
    expect(screen.getByText(/best outcome: \+12\.4% \(NVDA, 2026-02-15\)/i)).toBeInTheDocument();
    expect(screen.getByText(/worst outcome: -8\.1% \(TSLA, 2026-03-01\)/i)).toBeInTheDocument();
  });

  it('shows positive, negative, and pending outcome badges', () => {
    render(
      <SimilarPastEvents
        similarEvents={[
          {
            title: 'Positive setup',
            date: '2026-02-15T14:30:00.000Z',
            move: '+12.4%',
            ticker: 'NVDA',
            changeT5: 12.4,
          },
          {
            title: 'Negative setup',
            date: '2026-03-01T14:30:00.000Z',
            move: '-8.1%',
            ticker: 'TSLA',
            changeT5: -8.1,
          },
          {
            title: 'Pending setup',
            date: '2026-03-05T14:30:00.000Z',
            move: '',
            ticker: 'AMD',
            changeT5: null,
          },
        ]}
      />,
    );

    expect(screen.getByText('▲ +12.4%')).toBeInTheDocument();
    expect(screen.getByText('▼ -8.1%')).toBeInTheDocument();
    expect(screen.getByText(/^Pending$/)).toBeInTheDocument();
  });

  it('renders an empty state when there are no similar events', () => {
    render(<SimilarPastEvents similarEvents={[]} />);

    expect(screen.getByText(/no similar past events found for this ticker/i)).toBeInTheDocument();
  });
});
