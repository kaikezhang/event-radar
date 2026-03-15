import { describe, expect, it, vi } from 'vitest';
import {
  requestNotificationPermission,
  sendPushSubscriptionToBackend,
  subscribeBrowserToPush,
  urlBase64ToUint8Array,
} from './web-push.js';

describe('requestNotificationPermission', () => {
  it('returns the existing permission state when already granted', async () => {
    const notification = {
      permission: 'granted' as const,
      requestPermission: vi.fn(),
    };

    await expect(requestNotificationPermission(notification)).resolves.toBe('granted');
    expect(notification.requestPermission).not.toHaveBeenCalled();
  });

  it('requests permission when the browser is still in the default state', async () => {
    const notification = {
      permission: 'default' as const,
      requestPermission: vi.fn().mockResolvedValue('granted'),
    };

    await expect(requestNotificationPermission(notification)).resolves.toBe('granted');
    expect(notification.requestPermission).toHaveBeenCalledOnce();
  });
});

describe('subscribeBrowserToPush', () => {
  it('reuses an existing push subscription when present', async () => {
    const existingSubscription = {
      toJSON: vi.fn().mockReturnValue({
        endpoint: 'https://push.example.test/subscriptions/1',
        keys: { p256dh: 'public-key', auth: 'auth-secret' },
      }),
    };
    const subscribe = vi.fn();
    const ready = Promise.resolve({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(existingSubscription),
        subscribe,
      },
    });

    const result = await subscribeBrowserToPush({
      notification: {
        permission: 'granted',
        requestPermission: vi.fn(),
      },
      serviceWorker: { ready },
      vapidPublicKey: 'BEl6Q0xNb2NrX2tleQ',
    });

    expect(result.endpoint).toBe('https://push.example.test/subscriptions/1');
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('creates a new push subscription with the VAPID application server key', async () => {
    const subscribe = vi.fn().mockResolvedValue({
      toJSON: () => ({
        endpoint: 'https://push.example.test/subscriptions/2',
        keys: { p256dh: 'public-key-2', auth: 'auth-secret-2' },
      }),
    });
    const ready = Promise.resolve({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe,
      },
    });

    const result = await subscribeBrowserToPush({
      notification: {
        permission: 'granted',
        requestPermission: vi.fn(),
      },
      serviceWorker: { ready },
      vapidPublicKey: 'BEl6Q0xNb2NrX2tleQ',
    });

    expect(result.endpoint).toBe('https://push.example.test/subscriptions/2');
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    });
  });
});

describe('sendPushSubscriptionToBackend', () => {
  it('posts the normalized subscription payload to the backend', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }));

    await sendPushSubscriptionToBackend({
      endpoint: 'https://push.example.test/subscriptions/3',
      expirationTime: null,
      keys: { p256dh: 'public-key-3', auth: 'auth-secret-3' },
    }, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith('/api/push-subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': 'er-dev-2026',
      },
      body: JSON.stringify({
        endpoint: 'https://push.example.test/subscriptions/3',
        expirationTime: null,
        keys: { p256dh: 'public-key-3', auth: 'auth-secret-3' },
      }),
    });
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes URL-safe base64 strings for Push API usage', () => {
    expect(Array.from(urlBase64ToUint8Array('SGVsbG8'))).toEqual([72, 101, 108, 108, 111]);
  });
});
