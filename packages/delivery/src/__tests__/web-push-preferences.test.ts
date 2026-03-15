import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebPushChannel, type PushSubscriptionStore, type StoredPushSubscription } from '../web-push-channel.js';
import type { AlertEvent } from '../types.js';

function makeAlert(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    event: {
      id: 'evt-quiet-1',
      source: 'sec-edgar',
      type: '8-K',
      title: 'Test event',
      body: 'Test body',
      timestamp: new Date('2026-03-15T12:00:00.000Z'),
      metadata: { ticker: 'AAPL' },
    },
    severity: 'HIGH',
    ticker: 'AAPL',
    enrichment: {
      summary: 'test',
      impact: 'test',
      action: '🟡 Monitor',
      tickers: [{ symbol: 'AAPL', direction: 'bullish' }],
    },
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

describe('WebPushChannel user preferences', () => {
  const sendNotification = vi.fn(async () => undefined);
  const disableSubscription = vi.fn(async () => undefined);
  const onQuietSuppressed = vi.fn();
  const onCapSuppressed = vi.fn();

  beforeEach(() => {
    sendNotification.mockClear();
    disableSubscription.mockClear();
    onQuietSuppressed.mockClear();
    onCapSuppressed.mockClear();
  });

  function createStore(preferences?: Partial<NonNullable<PushSubscriptionStore['getUserPreferences'] extends (...args: never[]) => Promise<infer T> ? T : never>>) {
    const store: PushSubscriptionStore = {
      async listActiveSubscriptions(): Promise<ReadonlyArray<StoredPushSubscription>> {
        return [makeSub('user-1', 'sub-1')];
      },
      async disableSubscription(subscriptionId: string): Promise<void> {
        await disableSubscription(subscriptionId);
      },
      async getWatchlistTickers(): Promise<string[]> {
        return ['AAPL'];
      },
      async getUserPreferences() {
        return {
          quietStart: null,
          quietEnd: null,
          timezone: 'America/New_York',
          dailyPushCap: 20,
          pushNonWatchlist: false,
          ...preferences,
        };
      },
    };

    return store;
  }

  function createChannel(
    store: PushSubscriptionStore,
    now: string,
  ) {
    return new WebPushChannel({
      vapidSubject: 'mailto:test@example.com',
      vapidPublicKey: 'test-public',
      vapidPrivateKey: 'test-private',
      store,
      client: {
        setVapidDetails: vi.fn(),
        sendNotification,
      },
      now: () => new Date(now),
      onQuietSuppressed,
      onCapSuppressed,
    });
  }

  it('suppresses non-high-quality alerts during quiet hours', async () => {
    const channel = createChannel(
      createStore({
        quietStart: '23:00',
        quietEnd: '08:00',
      }),
      '2026-03-15T06:30:00.000Z',
    );

    await channel.send(makeAlert());

    expect(sendNotification).not.toHaveBeenCalled();
    expect(onQuietSuppressed).toHaveBeenCalledWith('user-1');
  });

  it('allows high-quality setup alerts during quiet hours', async () => {
    const channel = createChannel(
      createStore({
        quietStart: '23:00',
        quietEnd: '08:00',
      }),
      '2026-03-15T06:30:00.000Z',
    );

    await channel.send(makeAlert({
      enrichment: {
        summary: 'test',
        impact: 'test',
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: 'AAPL', direction: 'bullish' }],
      },
    }));

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(onQuietSuppressed).not.toHaveBeenCalled();
  });

  it('suppresses alerts after reaching the daily cap', async () => {
    const store = createStore({ dailyPushCap: 1 });
    const firstChannel = createChannel(store, '2026-03-15T15:00:00.000Z');

    await firstChannel.send(makeAlert());
    await firstChannel.send(makeAlert({ event: { ...makeAlert().event, id: 'evt-quiet-2' } }));

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(onCapSuppressed).toHaveBeenCalledWith('user-1');
  });

  it('does not suppress high-quality setup alerts after reaching the daily cap', async () => {
    const store = createStore({ dailyPushCap: 1 });
    const channel = createChannel(store, '2026-03-15T15:00:00.000Z');

    await channel.send(makeAlert());
    await channel.send(makeAlert({
      event: { ...makeAlert().event, id: 'evt-quiet-3' },
      enrichment: {
        summary: 'test',
        impact: 'test',
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: 'AAPL', direction: 'bullish' }],
      },
    }));

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(onCapSuppressed).not.toHaveBeenCalled();
  });

  it('evaluates quiet hours in the user timezone', async () => {
    const channel = createChannel(
      createStore({
        quietStart: '08:00',
        quietEnd: '10:00',
        timezone: 'America/Los_Angeles',
      }),
      '2026-03-15T16:30:00.000Z',
    );

    await channel.send(makeAlert());

    expect(sendNotification).not.toHaveBeenCalled();
    expect(onQuietSuppressed).toHaveBeenCalledWith('user-1');
  });
});
