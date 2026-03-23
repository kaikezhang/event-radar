import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { History } from './History.js';
import { renderWithRouter } from '../test/render.js';

const useHistoryMock = vi.fn();

vi.mock('../hooks/useHistory.js', () => ({
  useHistory: useHistoryMock,
}));

describe('History page', () => {
  beforeEach(() => {
    useHistoryMock.mockReset();
  });

  it('shows the important-events banner and clears the default filter from the call to action', async () => {
    const user = userEvent.setup();
    const clearFilters = vi.fn();

    useHistoryMock.mockReturnValue({
      filters: {
        from: '2026-02-20',
        to: '2026-03-23',
        severity: 'HIGH,CRITICAL',
        source: '',
        ticker: '',
      },
      setFilter: vi.fn(),
      resetFilters: vi.fn(),
      clearFilters,
      isDefaultSeverity: true,
      alerts: [],
      total: 0,
      isLoading: false,
      isFetching: false,
      hasMore: false,
      loadMore: vi.fn(),
      sources: ['sec-edgar'],
      severities: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      stats: {
        total: 0,
        bySeverity: {},
        topTickers: [],
      },
    });

    renderWithRouter([{ path: '/history', element: <History /> }], ['/history']);

    expect(screen.getByText(/showing important events only/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show all →/i }));

    expect(clearFilters).toHaveBeenCalledTimes(1);
  });

  it('hides the important-events banner after the user changes the severity filter', () => {
    useHistoryMock.mockReturnValue({
      filters: {
        from: '2026-02-20',
        to: '2026-03-23',
        severity: '',
        source: '',
        ticker: '',
      },
      setFilter: vi.fn(),
      resetFilters: vi.fn(),
      clearFilters: vi.fn(),
      isDefaultSeverity: false,
      alerts: [],
      total: 0,
      isLoading: false,
      isFetching: false,
      hasMore: false,
      loadMore: vi.fn(),
      sources: ['sec-edgar'],
      severities: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      stats: {
        total: 0,
        bySeverity: {},
        topTickers: [],
      },
    });

    renderWithRouter([{ path: '/history', element: <History /> }], ['/history']);

    expect(screen.queryByText(/showing important events only/i)).not.toBeInTheDocument();
  });
});
