import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const serviceWorkerSource = readFileSync(
  resolve(process.cwd(), 'public/sw.js'),
  'utf8',
);

interface ServiceWorkerNotificationData {
  eventId?: string;
  url?: string;
}

interface ServiceWorkerNotificationClickEvent {
  notification: {
    close(): void;
    data?: ServiceWorkerNotificationData;
  };
  waitUntil(value: Promise<unknown>): void;
}

type ListenerMap = Record<string, (event: ServiceWorkerNotificationClickEvent) => void>;

function loadServiceWorker(overrides?: {
  clients?: {
    matchAll: ReturnType<typeof vi.fn>;
    openWindow?: ReturnType<typeof vi.fn>;
  };
  locationOrigin?: string;
}) {
  const listeners: ListenerMap = {};
  const self = {
    addEventListener: vi.fn((type: string, listener: (event: ServiceWorkerNotificationClickEvent) => void) => {
      listeners[type] = listener;
    }),
    skipWaiting: vi.fn(),
    registration: {
      showNotification: vi.fn(),
    },
    clients: overrides?.clients ?? {
      matchAll: vi.fn(),
      openWindow: vi.fn(),
    },
    location: {
      origin: overrides?.locationOrigin ?? 'https://app.eventradar.test',
    },
  };

  const execute = new Function('self', 'URL', serviceWorkerSource);
  execute(self, URL);

  return {
    listeners,
    self,
  };
}

describe('service worker notificationclick', () => {
  it('focuses an existing event tab without navigating away from it', async () => {
    const focus = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(undefined);
    const { listeners } = loadServiceWorker({
      clients: {
        matchAll: vi.fn().mockResolvedValue([
          {
            url: 'https://app.eventradar.test/event/evt-123',
            focus,
            navigate,
          },
        ]),
        openWindow: vi.fn(),
      },
    });

    let pending: Promise<unknown> | undefined;
    listeners.notificationclick({
      notification: {
        data: {
          eventId: 'evt-123',
        },
        close: vi.fn(),
      },
      waitUntil(value: Promise<unknown>) {
        pending = value;
      },
    });

    await pending;

    expect(navigate).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledOnce();
  });

  it('navigates an existing app tab to the event detail page when needed', async () => {
    const focus = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(undefined);
    const { listeners } = loadServiceWorker({
      clients: {
        matchAll: vi.fn().mockResolvedValue([
          {
            url: 'https://app.eventradar.test/settings',
            focus,
            navigate,
          },
        ]),
        openWindow: vi.fn(),
      },
    });

    let pending: Promise<unknown> | undefined;
    listeners.notificationclick({
      notification: {
        data: {
          eventId: 'evt-456',
        },
        close: vi.fn(),
      },
      waitUntil(value: Promise<unknown>) {
        pending = value;
      },
    });

    await pending;

    expect(navigate).toHaveBeenCalledWith('https://app.eventradar.test/event/evt-456');
    expect(focus).toHaveBeenCalledOnce();
  });
});
