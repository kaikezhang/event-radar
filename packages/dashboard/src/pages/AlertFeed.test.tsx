import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertFeed } from './AlertFeed.js';

const useDeliveryFeedMock = vi.fn();

vi.mock('../hooks/queries.js', () => ({
  useDeliveryFeed: (...args: unknown[]) => useDeliveryFeedMock(...args),
}));

describe('AlertFeed', () => {
  beforeEach(() => {
    useDeliveryFeedMock.mockReset();
    useDeliveryFeedMock.mockReturnValue({
      data: { pages: [{ events: [], cursor: null, total: 0 }] },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
  });

  it('renders the empty state when no alerts have been delivered', () => {
    render(<AlertFeed />);

    expect(screen.getByText('No alerts delivered yet')).toBeTruthy();
  });

  it('renders alert cards with badges, summary, tickers, channels, and time', () => {
    useDeliveryFeedMock.mockReturnValue({
      data: {
        pages: [
          {
            events: [
              {
                id: 'evt-1',
                title: 'Nvidia files material 8-K',
                source: 'sec-edgar',
                severity: 'CRITICAL',
                tickers: ['NVDA', 'SMCI'],
                analysis: 'AI summary for the event.',
                impact: 'Impact context.',
                action: '🔴 立即关注',
                regime_context: 'Risk appetite is supportive.',
                delivery_channels: [
                  { channel: 'discord', ok: true },
                  { channel: 'bark', ok: true },
                ],
                delivered_at: '2026-03-13T12:00:00.000Z',
              },
            ],
            cursor: null,
            total: 1,
          },
        ],
      },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });

    render(<AlertFeed />);

    expect(screen.getByText('Nvidia files material 8-K')).toBeTruthy();
    expect(screen.getByText('sec-edgar')).toBeTruthy();
    expect(screen.getByText('CRITICAL')).toBeTruthy();
    expect(screen.getByText(/ai summary for the event/i)).toBeTruthy();
    expect(screen.getByText('NVDA')).toBeTruthy();
    expect(screen.getByText(/discord/i)).toBeTruthy();
  });

  it('loads the next page when load more is clicked', async () => {
    const user = userEvent.setup();
    const fetchNextPage = vi.fn();

    useDeliveryFeedMock.mockReturnValue({
      data: {
        pages: [
          {
            events: [
              {
                id: 'evt-1',
                title: 'Delivered alert',
                source: 'x-scanner',
                severity: 'HIGH',
                tickers: ['TSLA'],
                analysis: 'Summary',
                impact: null,
                action: '🟡 持续观察',
                regime_context: null,
                delivery_channels: [{ channel: 'discord', ok: true }],
                delivered_at: '2026-03-13T12:00:00.000Z',
              },
            ],
            cursor: 'cursor-1',
            total: 2,
          },
        ],
      },
      isLoading: false,
      error: null,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
    });

    render(<AlertFeed />);

    await user.click(screen.getByRole('button', { name: /load more alerts/i }));

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('disables load more while the next page is loading', () => {
    useDeliveryFeedMock.mockReturnValue({
      data: {
        pages: [
          {
            events: [
              {
                id: 'evt-1',
                title: 'Delivered alert',
                source: 'x-scanner',
                severity: 'HIGH',
                tickers: ['TSLA'],
                analysis: 'Summary',
                impact: null,
                action: '🟡 持续观察',
                regime_context: null,
                delivery_channels: [{ channel: 'discord', ok: true }],
                delivered_at: '2026-03-13T12:00:00.000Z',
              },
            ],
            cursor: 'cursor-1',
            total: 2,
          },
        ],
      },
      isLoading: false,
      error: null,
      hasNextPage: true,
      isFetchingNextPage: true,
      fetchNextPage: vi.fn(),
    });

    render(<AlertFeed />);

    expect(screen.getByRole('button', { name: /loading more/i }).hasAttribute('disabled')).toBe(true);
  });
});
