import { describe, expect, it, vi } from 'vitest';
import { WebPushChannel, extractAlertTickers } from '../web-push-channel.js';
import type { AlertEvent } from '../types.js';
import type { StoredPushSubscription, PushSubscriptionStore } from '../web-push-channel.js';

function makeAlert(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    event: {
      id: 'evt-1',
      source: 'sec-edgar',
      type: '8-K',
      title: 'Test event',
      body: 'Test body',
      timestamp: new Date(),
      metadata: { ticker: 'AAPL', tickers: ['AAPL'] },
    },
    severity: 'HIGH',
    ticker: 'AAPL',
    ...overrides,
  };
}

function makeSub(userId: string, id = 'sub-1'): StoredPushSubscription {
  return {
    id,
    userId,
    endpoint: `https://push.example.com/${id}`,
    p256dh: 'test-p256dh',
    auth: 'test-auth',
  };
}

describe('extractAlertTickers', () => {
  it('extracts ticker from alert.ticker', () => {
    const alert = makeAlert({ ticker: 'TSLA' });
    expect(extractAlertTickers(alert)).toContain('TSLA');
  });

  it('extracts tickers from enrichment', () => {
    const alert = makeAlert({
      ticker: 'AAPL',
      enrichment: {
        summary: 'test',
        impact: 'test',
        action: '🔴 High-Quality Setup',
        tickers: [
          { symbol: 'AAPL', direction: 'bullish' },
          { symbol: 'MSFT', direction: 'neutral' },
        ],
      },
    });
    const tickers = extractAlertTickers(alert);
    expect(tickers).toContain('AAPL');
    expect(tickers).toContain('MSFT');
  });

  it('extracts tickers from event metadata', () => {
    const alert = makeAlert({
      ticker: undefined,
      event: {
        id: 'evt-1',
        source: 'sec-edgar',
        type: '8-K',
        title: 'Test',
        body: 'Test',
        timestamp: new Date(),
        metadata: { ticker: 'NVDA', tickers: ['NVDA', 'AMD'] },
      },
    });
    const tickers = extractAlertTickers(alert);
    expect(tickers).toContain('NVDA');
    expect(tickers).toContain('AMD');
  });
});

describe('WebPushChannel watchlist filtering', () => {
  it('only sends push to users whose watchlist matches the alert ticker', async () => {
    const sentTo: string[] = [];

    const store: PushSubscriptionStore = {
      async listActiveSubscriptions(): Promise<ReadonlyArray<StoredPushSubscription>> {
        return [
          makeSub('user-1', 'sub-1'),
          makeSub('user-2', 'sub-2'),
          makeSub('user-3', 'sub-3'),
        ];
      },
      async disableSubscription() {},
      async getWatchlistTickers(userId: string): Promise<string[]> {
        const watchlists: Record<string, string[]> = {
          'user-1': ['AAPL', 'TSLA'],
          'user-2': ['NVDA'],
          'user-3': ['AAPL'],
        };
        return watchlists[userId] ?? [];
      },
    };

    const mockClient = {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn(async (sub: { endpoint: string }) => {
        sentTo.push(sub.endpoint);
      }),
    };

    const channel = new WebPushChannel({
      vapidSubject: 'mailto:test@example.com',
      vapidPublicKey: 'test-public',
      vapidPrivateKey: 'test-private',
      store,
      client: mockClient,
    });

    await channel.send(makeAlert({ ticker: 'AAPL' }));

    // user-1 has AAPL, user-3 has AAPL, user-2 does NOT
    expect(sentTo).toHaveLength(2);
    expect(sentTo).toContain('https://push.example.com/sub-1');
    expect(sentTo).toContain('https://push.example.com/sub-3');
    expect(sentTo).not.toContain('https://push.example.com/sub-2');
  });

  it('skips users with empty watchlist', async () => {
    const sentTo: string[] = [];

    const store: PushSubscriptionStore = {
      async listActiveSubscriptions(): Promise<ReadonlyArray<StoredPushSubscription>> {
        return [makeSub('user-empty', 'sub-1')];
      },
      async disableSubscription() {},
      async getWatchlistTickers(): Promise<string[]> {
        return [];
      },
    };

    const mockClient = {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn(async (sub: { endpoint: string }) => {
        sentTo.push(sub.endpoint);
      }),
    };

    const channel = new WebPushChannel({
      vapidSubject: 'mailto:test@example.com',
      vapidPublicKey: 'test-public',
      vapidPrivateKey: 'test-private',
      store,
      client: mockClient,
    });

    await channel.send(makeAlert({ ticker: 'AAPL' }));

    expect(sentTo).toHaveLength(0);
  });

  it('broadcasts to all when store does not implement getWatchlistTickers', async () => {
    const sentTo: string[] = [];

    const store: PushSubscriptionStore = {
      async listActiveSubscriptions(): Promise<ReadonlyArray<StoredPushSubscription>> {
        return [makeSub('user-1', 'sub-1'), makeSub('user-2', 'sub-2')];
      },
      async disableSubscription() {},
      // No getWatchlistTickers
    };

    const mockClient = {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn(async (sub: { endpoint: string }) => {
        sentTo.push(sub.endpoint);
      }),
    };

    const channel = new WebPushChannel({
      vapidSubject: 'mailto:test@example.com',
      vapidPublicKey: 'test-public',
      vapidPrivateKey: 'test-private',
      store,
      client: mockClient,
    });

    await channel.send(makeAlert({ ticker: 'AAPL' }));

    // Without getWatchlistTickers, falls back to broadcast
    expect(sentTo).toHaveLength(2);
  });
});
