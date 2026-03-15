import { API_KEY } from './api.js';

export interface NotificationLike {
  permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
}

export interface ServiceWorkerContainerLike {
  ready: Promise<{
    pushManager: {
      getSubscription(): Promise<PushSubscriptionLike | null>;
      subscribe(options: PushSubscriptionOptionsInit): Promise<PushSubscriptionLike>;
    };
  }>;
}

export interface PushSubscriptionLike {
  toJSON(): PushSubscriptionJSON;
  unsubscribe?(): Promise<boolean>;
}

export interface WebPushSubscriptionPayload {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface PushBackendOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  path?: string;
}

export async function requestNotificationPermission(
  notification: NotificationLike | undefined = globalThis.Notification,
): Promise<NotificationPermission> {
  if (!notification) {
    throw new Error('Notifications are not supported in this browser.');
  }

  if (notification.permission !== 'default') {
    return notification.permission;
  }

  return notification.requestPermission();
}

export async function subscribeBrowserToPush(options?: {
  notification?: NotificationLike;
  serviceWorker?: ServiceWorkerContainerLike;
  vapidPublicKey?: string;
}): Promise<WebPushSubscriptionPayload> {
  const permission = await requestNotificationPermission(options?.notification);
  if (permission !== 'granted') {
    throw new Error('Notification permission not granted.');
  }

  const serviceWorker = options?.serviceWorker ?? globalThis.navigator?.serviceWorker;
  if (!serviceWorker) {
    throw new Error('Service workers are not available in this browser.');
  }

  const vapidPublicKey = options?.vapidPublicKey ?? import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY;
  if (!vapidPublicKey) {
    throw new Error('Missing VAPID public key configuration.');
  }

  const registration = await serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) {
    return normalizePushSubscription(existingSubscription.toJSON());
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey:
      urlBase64ToUint8Array(vapidPublicKey) as unknown as ArrayBufferView<ArrayBuffer>,
  });

  return normalizePushSubscription(subscription.toJSON());
}

export async function sendPushSubscriptionToBackend(
  subscription: WebPushSubscriptionPayload,
  options?: PushBackendOptions,
): Promise<void> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(options?.path ?? '/api/push-subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': options?.apiKey ?? API_KEY,
    },
    body: JSON.stringify(normalizePushSubscription(subscription)),
  });

  if (!response.ok) {
    throw new Error(`Failed to register push subscription (${response.status})`);
  }
}

export async function unsubscribeBrowserFromPush(options?: {
  serviceWorker?: ServiceWorkerContainerLike;
  fetchImpl?: typeof fetch;
  apiKey?: string;
}): Promise<boolean> {
  const serviceWorker = options?.serviceWorker ?? globalThis.navigator?.serviceWorker;
  if (!serviceWorker) {
    return false;
  }

  const registration = await serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return false;
  }

  const normalized = normalizePushSubscription(subscription.toJSON());
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl('/api/push-subscriptions', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': options?.apiKey ?? API_KEY,
    },
    body: JSON.stringify({ endpoint: normalized.endpoint }),
  });

  if (!response.ok) {
    throw new Error(`Failed to unregister push subscription (${response.status})`);
  }

  return subscription.unsubscribe ? subscription.unsubscribe() : true;
}

export function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`
    .replaceAll('-', '+')
    .replaceAll('_', '/');
  const decoded = globalThis.atob(base64);
  const array = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    array[index] = decoded.charCodeAt(index);
  }

  return array;
}

function normalizePushSubscription(subscription: PushSubscriptionJSON): WebPushSubscriptionPayload {
  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys?.p256dh;
  const auth = subscription.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription payload.');
  }

  return {
    endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      p256dh,
      auth,
    },
  };
}
