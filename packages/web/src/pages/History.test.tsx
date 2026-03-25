import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { History } from './History.js';
import { renderWithRouter } from '../test/render.js';

const { useHistoryMock } = vi.hoisted(() => ({
  useHistoryMock: vi.fn(),
}));

vi.mock('../hooks/useHistory.js', () => ({
  useHistory: useHistoryMock,
}));

describe('History page', () => {
  beforeEach(() => {
    useHistoryMock.mockReset();
  });

  it('renders a simple reverse-chronological list with load more', async () => {
    const user = userEvent.setup();
    const loadMore = vi.fn();

    useHistoryMock.mockReturnValue({
      alerts: [
        {
          id: 'evt-2',
          severity: 'HIGH',
          source: 'sec-edgar',
          title: 'Newest alert',
          summary: 'Newest summary',
          tickers: ['NVDA'],
          time: '2026-03-23T12:00:00.000Z',
        },
        {
          id: 'evt-1',
          severity: 'MEDIUM',
          source: 'breaking-news',
          title: 'Older alert',
          summary: 'Older summary',
          tickers: ['AAPL'],
          time: '2026-03-22T12:00:00.000Z',
        },
      ],
      total: 2,
      isLoading: false,
      isFetching: false,
      hasMore: true,
      loadMore,
    });

    renderWithRouter([{ path: '/history', element: <History /> }], ['/history']);

    expect(screen.getByRole('heading', { name: /history/i })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /newest alert/i })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /older alert/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /filters/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/showing important events only/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /load more/i }));

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('shows a simple empty state without filter reset actions', () => {
    useHistoryMock.mockReturnValue({
      alerts: [],
      total: 0,
      isLoading: false,
      isFetching: false,
      hasMore: false,
      loadMore: vi.fn(),
    });

    renderWithRouter([{ path: '/history', element: <History /> }], ['/history']);

    expect(screen.getByText(/no historical events yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset filters/i })).not.toBeInTheDocument();
  });
});
