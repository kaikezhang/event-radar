import { describe, expect, it, vi } from 'vitest';
import { WebPushChannel, type StoredPushSubscription } from '../web-push-channel.js';
import type { AlertEvent } from '../types.js';

function makeAlert(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    severity: 'CRITICAL',
    storedEventId: 'db-event-1',
    ticker: 'NVDA',
    event: {
      id: 'raw-event-1',
      source: 'sec-edgar',
      type: '8-K',
      title: 'NVIDIA files export risk update',
      body: 'NVIDIA highlighted incremental China export risk in its filing.',
      timestamp: new Date('2026-03-15T12:00:00.000Z'),
      url: 'https://example.com/source/nvda',
    },
    ...overrides,
  };
}

function makeSubscription(overrides: Partial<StoredPushSubscription> = {}): StoredPushSubscription {
  return {
    id: 'sub-1',
    userId: 'user-1',
    endpoint: 'https://push.example.test/subscriptions/1',
    p256dh: 'public-key',
    auth: 'auth-secret',
    ...overrides,
  };
}

describe('WebPushChannel', () => {
  it('configures VAPID details when constructed', () => {
    const client = {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn(),
    };

    new WebPushChannel({
      vapidSubject: 'mailto:alerts@example.com',
      vapidPublicKey: 'public-key',
      vapidPrivateKey: 'private-key',
      store: {
        listActiveSubscriptions: vi.fn().mockResolvedValue([]),
        disableSubscription: vi.fn(),
      },
      client,
    });

    expect(client.setVapidDetails).toHaveBeenCalledWith(
      'mailto:alerts@example.com',
      'public-key',
      'private-key',
    );
  });

  it('sends a payload to every active subscription', async () => {
    const client = {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn().mockResolvedValue(undefined),
    };
    const store = {
      listActiveSubscriptions: vi.fn().mockResolvedValue([
        makeSubscription(),
        makeSubscription({
          id: 'sub-2',
          endpoint: 'https://push.example.test/subscriptions/2',
        }),
      ]),
      disableSubscription: vi.fn(),
    };
    const channel = new WebPushChannel({
      vapidSubject: 'mailto:alerts@example.com',
      vapidPublicKey: 'public-key',
      vapidPrivateKey: 'private-key',
      store,
      client,
    });

    await channel.send(makeAlert());

    expect(client.sendNotification).toHaveBeenCalledTimes(2);
    const [, payload] = client.sendNotification.mock.calls[0] as [unknown, string];
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    expect(parsed.title).toBe('NVIDIA files export risk update');
    expect(parsed.body).toContain('NVIDIA highlighted incremental China export risk');
    expect(parsed.url).toBe('/event/db-event-1');
    expect(parsed.severity).toBe('CRITICAL');
    expect(parsed.ticker).toBe('NVDA');
  });

  it('falls back to the source url when no stored event id is available', async () => {
    const client = {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn().mockResolvedValue(undefined),
    };
    const channel = new WebPushChannel({
      vapidSubject: 'mailto:alerts@example.com',
      vapidPublicKey: 'public-key',
      vapidPrivateKey: 'private-key',
      store: {
        listActiveSubscriptions: vi.fn().mockResolvedValue([makeSubscription()]),
        disableSubscription: vi.fn(),
      },
      client,
    });

    await channel.send(makeAlert({ storedEventId: undefined }));

    const [, payload] = client.sendNotification.mock.calls[0] as [unknown, string];
    expect(JSON.parse(payload).url).toBe('https://example.com/source/nvda');
  });

  it('disables invalid subscriptions without failing the delivery path', async () => {
    const invalidError = Object.assign(new Error('subscription gone'), { statusCode: 410 });
    const client = {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn()
        .mockRejectedValueOnce(invalidError)
        .mockResolvedValueOnce(undefined),
    };
    const store = {
      listActiveSubscriptions: vi.fn().mockResolvedValue([
        makeSubscription(),
        makeSubscription({
          id: 'sub-2',
          endpoint: 'https://push.example.test/subscriptions/2',
        }),
      ]),
      disableSubscription: vi.fn().mockResolvedValue(undefined),
    };
    const channel = new WebPushChannel({
      vapidSubject: 'mailto:alerts@example.com',
      vapidPublicKey: 'public-key',
      vapidPrivateKey: 'private-key',
      store,
      client,
    });

    await expect(channel.send(makeAlert())).resolves.toBeUndefined();

    expect(store.disableSubscription).toHaveBeenCalledWith('sub-1');
  });

  it('does nothing when there are no active subscriptions', async () => {
    const client = {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn(),
    };
    const channel = new WebPushChannel({
      vapidSubject: 'mailto:alerts@example.com',
      vapidPublicKey: 'public-key',
      vapidPrivateKey: 'private-key',
      store: {
        listActiveSubscriptions: vi.fn().mockResolvedValue([]),
        disableSubscription: vi.fn(),
      },
      client,
    });

    await channel.send(makeAlert());

    expect(client.sendNotification).not.toHaveBeenCalled();
  });

  it('throws when delivery fails for a non-invalid subscription error', async () => {
    const client = {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn().mockRejectedValue(new Error('push gateway unavailable')),
    };
    const channel = new WebPushChannel({
      vapidSubject: 'mailto:alerts@example.com',
      vapidPublicKey: 'public-key',
      vapidPrivateKey: 'private-key',
      store: {
        listActiveSubscriptions: vi.fn().mockResolvedValue([makeSubscription()]),
        disableSubscription: vi.fn(),
      },
      client,
    });

    await expect(channel.send(makeAlert())).rejects.toThrow('push gateway unavailable');
  });
});
