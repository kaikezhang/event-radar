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

export type WebPushSupportIssue =
  | 'notifications'
  | 'push-manager'
  | 'service-worker'
  | 'vapid-key';

export type WebPushPermissionState = NotificationPermission | 'unsupported';

export type WebPushStatusState =
  | 'unsupported'
  | 'permission-default'
  | 'permission-denied'
  | 'subscribed'
  | 'disabled'
  | 'busy'
  | 'backend-registration-failed';

export type WebPushErrorCode =
  | 'notifications-unsupported'
  | 'permission-denied'
  | 'service-worker-unsupported'
  | 'vapid-key-missing'
  | 'invalid-subscription'
  | 'backend-registration-failed'
  | 'backend-unregister-failed'
  | 'unsubscribe-failed';

export interface WebPushDeviceState {
  supported: boolean;
  permission: WebPushPermissionState;
  subscribed: boolean;
  supportIssue?: WebPushSupportIssue;
}

export interface WebPushStatusDetails {
  state: WebPushStatusState;
  title: string;
  description: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  canEnable: boolean;
  canDisable: boolean;
  enableLabel: string;
  disableLabel: string;
}

export interface BrowserPushSubscriptionResult extends WebPushSubscriptionPayload {
  status: 'created' | 'existing';
}

export interface BrowserPushUnsubscribeResult {
  status: 'not-subscribed' | 'unsubscribed';
}

export class WebPushError extends Error {
  code: WebPushErrorCode;

  constructor(code: WebPushErrorCode, message: string) {
    super(message);
    this.name = 'WebPushError';
    this.code = code;
  }
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
    throw new WebPushError(
      'notifications-unsupported',
      'This browser does not support notifications.',
    );
  }

  if (notification.permission !== 'default') {
    return notification.permission;
  }

  return notification.requestPermission();
}

export async function subscribeBrowserToPush(options?: {
  notification?: NotificationLike;
  serviceWorker?: ServiceWorkerContainerLike;
  pushManagerSupported?: boolean;
  vapidPublicKey?: string;
}): Promise<BrowserPushSubscriptionResult> {
  const permission = await requestNotificationPermission(options?.notification);
  if (permission !== 'granted') {
    throw new WebPushError(
      'permission-denied',
      'Allow browser notifications to enable push alerts on this device.',
    );
  }

  if (!hasEffectivePushManagerSupport(options)) {
    throw new WebPushError(
      'service-worker-unsupported',
      'This browser cannot create push subscriptions.',
    );
  }

  const serviceWorker = options?.serviceWorker ?? globalThis.navigator?.serviceWorker;
  if (!serviceWorker) {
    throw new WebPushError(
      'service-worker-unsupported',
      'This browser cannot create push subscriptions.',
    );
  }

  const vapidPublicKey = options?.vapidPublicKey ?? import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY;
  if (!vapidPublicKey) {
    throw new WebPushError(
      'vapid-key-missing',
      'Push alerts are unavailable because this app is missing its public push key.',
    );
  }

  const registration = await serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) {
    return {
      ...normalizePushSubscription(existingSubscription.toJSON()),
      status: 'existing',
    };
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey:
      urlBase64ToUint8Array(vapidPublicKey) as unknown as ArrayBufferView<ArrayBuffer>,
  });

  return {
    ...normalizePushSubscription(subscription.toJSON()),
    status: 'created',
  };
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
    throw new WebPushError(
      'backend-registration-failed',
      getBackendErrorMessage(response, 'register'),
    );
  }
}

export async function unsubscribeBrowserFromPush(options?: {
  serviceWorker?: ServiceWorkerContainerLike;
  fetchImpl?: typeof fetch;
  apiKey?: string;
}): Promise<BrowserPushUnsubscribeResult> {
  const serviceWorker = options?.serviceWorker ?? globalThis.navigator?.serviceWorker;
  if (!serviceWorker) {
    return { status: 'not-subscribed' };
  }

  const registration = await serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return { status: 'not-subscribed' };
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

  if (!response.ok && response.status !== 404) {
    throw new WebPushError(
      'backend-unregister-failed',
      getBackendErrorMessage(response, 'unregister'),
    );
  }

  const unsubscribed = subscription.unsubscribe ? await subscription.unsubscribe() : true;
  if (!unsubscribed) {
    throw new WebPushError(
      'unsubscribe-failed',
      'This browser did not confirm that push alerts were removed. Try again.',
    );
  }

  return { status: 'unsubscribed' };
}

export async function getWebPushDeviceState(options?: {
  notification?: NotificationLike;
  serviceWorker?: ServiceWorkerContainerLike;
  pushManagerSupported?: boolean;
  vapidPublicKey?: string;
}): Promise<WebPushDeviceState> {
  const support = getWebPushSupport(options);
  if (!support.supported) {
    return {
      supported: false,
      supportIssue: support.supportIssue,
      permission: support.permission,
      subscribed: false,
    };
  }

  const registration = await (options?.serviceWorker ?? globalThis.navigator?.serviceWorker)?.ready;
  const subscription = await registration?.pushManager.getSubscription();

  return {
    supported: true,
    permission: support.permission,
    subscribed: subscription != null,
  };
}

export function getWebPushSupport(options?: {
  notification?: NotificationLike;
  serviceWorker?: ServiceWorkerContainerLike;
  pushManagerSupported?: boolean;
  vapidPublicKey?: string;
}): Pick<WebPushDeviceState, 'supported' | 'permission' | 'supportIssue'> {
  const notification = options?.notification ?? globalThis.Notification;
  if (!notification) {
    return {
      supported: false,
      supportIssue: 'notifications',
      permission: 'unsupported',
    };
  }

  if (!hasEffectivePushManagerSupport(options)) {
    return {
      supported: false,
      supportIssue: 'push-manager',
      permission: notification.permission,
    };
  }

  if (!(options?.serviceWorker ?? globalThis.navigator?.serviceWorker)) {
    return {
      supported: false,
      supportIssue: 'service-worker',
      permission: notification.permission,
    };
  }

  if (!(options?.vapidPublicKey ?? import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY)) {
    return {
      supported: false,
      supportIssue: 'vapid-key',
      permission: notification.permission,
    };
  }

  return {
    supported: true,
    permission: notification.permission,
  };
}

export function getWebPushStatusDetails(state: WebPushDeviceState & {
  isBusy: boolean;
  backendRegistrationFailed: boolean;
}): WebPushStatusDetails {
  if (!state.supported) {
    return {
      state: 'unsupported',
      title: 'Browser push is unavailable',
      description: getUnsupportedDescription(state.supportIssue),
      tone: 'warning',
      canEnable: false,
      canDisable: false,
      enableLabel: 'Enable browser push',
      disableLabel: 'Disable browser push',
    };
  }

  if (state.isBusy) {
    return {
      state: 'busy',
      title: 'Updating browser notifications',
      description: 'Event Radar is syncing this device with your latest push preference.',
      tone: 'neutral',
      canEnable: false,
      canDisable: false,
      enableLabel: 'Working…',
      disableLabel: 'Working…',
    };
  }

  if (state.backendRegistrationFailed) {
    return {
      state: 'backend-registration-failed',
      title: 'Device alerts need one more step',
      description: 'Your browser is ready, but Event Radar could not save this device for push alerts. Try again.',
      tone: 'danger',
      canEnable: true,
      canDisable: true,
      enableLabel: 'Try again',
      disableLabel: 'Disable browser push',
    };
  }

  if (state.permission === 'denied') {
    return {
      state: 'permission-denied',
      title: 'Browser notifications are blocked',
      description: 'Allow notifications for this site in your browser settings, then return here to enable push alerts.',
      tone: 'danger',
      canEnable: false,
      canDisable: false,
      enableLabel: 'Notifications blocked',
      disableLabel: 'Disable browser push',
    };
  }

  if (state.permission === 'default') {
    return {
      state: 'permission-default',
      title: 'Push alerts are ready to enable',
      description: 'Turn on browser notifications to receive important Event Radar alerts on this device.',
      tone: 'neutral',
      canEnable: true,
      canDisable: false,
      enableLabel: 'Enable browser push',
      disableLabel: 'Disable browser push',
    };
  }

  if (state.subscribed) {
    return {
      state: 'subscribed',
      title: 'Browser push is enabled',
      description: 'Important Event Radar alerts can now reach this device even when the app is in the background.',
      tone: 'success',
      canEnable: false,
      canDisable: true,
      enableLabel: 'Enabled on this device',
      disableLabel: 'Disable browser push',
    };
  }

  return {
    state: 'disabled',
    title: 'Push alerts are off on this device',
    description: 'Notifications are allowed, but this browser is not currently subscribed for Event Radar alerts.',
    tone: 'warning',
    canEnable: true,
    canDisable: false,
    enableLabel: 'Enable browser push',
    disableLabel: 'Disable browser push',
  };
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
    throw new WebPushError('invalid-subscription', 'Invalid push subscription payload.');
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

function hasPushManagerSupport(): boolean {
  return typeof globalThis.PushManager !== 'undefined';
}

function hasEffectivePushManagerSupport(options?: {
  serviceWorker?: ServiceWorkerContainerLike;
  pushManagerSupported?: boolean;
}): boolean {
  if (typeof options?.pushManagerSupported === 'boolean') {
    return options.pushManagerSupported;
  }

  return Boolean(options?.serviceWorker) || hasPushManagerSupport();
}

function getUnsupportedDescription(issue?: WebPushSupportIssue): string {
  switch (issue) {
    case 'notifications':
      return 'This browser does not support notifications, so push alerts cannot be enabled here.';
    case 'push-manager':
      return 'This browser is missing the Push API required for web push subscriptions.';
    case 'service-worker':
      return 'This browser cannot register the service worker needed for push alerts.';
    case 'vapid-key':
      return 'Push alerts are unavailable because this app is missing its public push key.';
    default:
      return 'Push alerts are unavailable in this browser.';
  }
}

function getBackendErrorMessage(
  response: Pick<Response, 'status'>,
  action: 'register' | 'unregister',
): string {
  if (response.status === 400) {
    return action === 'register'
      ? 'This browser returned an invalid push subscription.'
      : 'This device sent an invalid push unsubscribe request.';
  }

  if (response.status === 401 || response.status === 403) {
    return 'Push alerts are unavailable because this session is not authorized.';
  }

  if (response.status >= 500) {
    return action === 'register'
      ? 'Event Radar could not save this device for push alerts. Try again in a moment.'
      : 'Event Radar could not remove this device from push alerts. Try again in a moment.';
  }

  return action === 'register'
    ? `Event Radar could not save this device for push alerts (${response.status}).`
    : `Event Radar could not remove this device from push alerts (${response.status}).`;
}
