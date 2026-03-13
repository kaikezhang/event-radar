import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScannerCard } from './ScannerCard.js';

const useScannerEventsMock = vi.fn();

vi.mock('../hooks/queries.js', () => ({
  useScannerEvents: (...args: unknown[]) => useScannerEventsMock(...args),
}));

describe('ScannerCard', () => {
  beforeEach(() => {
    useScannerEventsMock.mockReset();
    useScannerEventsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
  });

  it('keeps recent events hidden until the card is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ScannerCard
        scanner={{ name: 'sec-edgar', status: 'healthy', last_scan: '1m ago', error_count: 0 }}
      />,
    );

    expect(screen.queryByText('Recent Events')).toBeNull();

    await user.click(screen.getByRole('button', { name: /sec-edgar/i }));

    expect(screen.getByText('Recent Events')).toBeTruthy();
  });

  it('renders recent scanner events when expanded', async () => {
    const user = userEvent.setup();
    useScannerEventsMock.mockReturnValue({
      data: {
        scanner: 'sec-edgar',
        count: 2,
        events: [
          {
            id: 'evt-1',
            title: '8-K filed',
            summary: 'Material agreement filed',
            severity: 'HIGH',
            tickers: ['NVDA'],
            received_at: '2026-03-13T12:00:00.000Z',
          },
          {
            id: 'evt-2',
            title: 'Follow-up filing',
            summary: 'Second filing summary',
            severity: 'MEDIUM',
            tickers: ['AMD'],
            received_at: '2026-03-13T11:00:00.000Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(
      <ScannerCard
        scanner={{ name: 'sec-edgar', status: 'healthy', last_scan: '1m ago', error_count: 0 }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /sec-edgar/i }));

    expect(screen.getByText('8-K filed')).toBeTruthy();
    expect(screen.getByText('Follow-up filing')).toBeTruthy();
    expect(screen.getByText('NVDA')).toBeTruthy();
  });

  it('shows scanner error details and cadence metadata in the expanded state', async () => {
    const user = userEvent.setup();

    render(
      <ScannerCard
        scanner={{
          name: 'fedwatch',
          status: 'down',
          last_scan: '22m ago',
          error_count: 7,
          consecutive_errors: 7,
          in_backoff: true,
          poll_interval_ms: 900000,
          message: 'HTTP 500 from CME endpoint',
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /fedwatch/i }));

    expect(screen.getByText(/http 500 from cme endpoint/i)).toBeTruthy();
    expect(screen.getAllByText(/15m cadence/i)).toHaveLength(2);
    expect(screen.getByText(/7 consecutive/i)).toBeTruthy();
  });

  it('shows an empty-state message when no recent events are available', async () => {
    const user = userEvent.setup();
    useScannerEventsMock.mockReturnValue({
      data: { scanner: 'reddit', count: 0, events: [] },
      isLoading: false,
      error: null,
    });

    render(
      <ScannerCard
        scanner={{ name: 'reddit', status: 'healthy', last_scan: '30s ago', error_count: 0 }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /reddit/i }));

    expect(screen.getByText(/no recent events from this scanner/i)).toBeTruthy();
  });
});
