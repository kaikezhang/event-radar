import webpush from 'web-push';
import type { Severity } from '@event-radar/shared';
import type { AlertEvent, DeliveryService } from './types.js';

const INVALID_SUBSCRIPTION_STATUS_CODES = new Set([404, 410]);
const DEFAULT_TTL_SECONDS = 60;
const MAX_BODY_LENGTH = 240;

const URGENCY_BY_SEVERITY: Record<Severity, 'low' | 'normal' | 'high'> = {
  CRITICAL: 'high',
  HIGH: 'high',
  MEDIUM: 'normal',
  LOW: 'low',
};

export interface StoredPushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionStore {
  listActiveSubscriptions(): Promise<ReadonlyArray<StoredPushSubscription>>;
  disableSubscription(subscriptionId: string): Promise<void>;
}

export interface WebPushClient {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: {
      endpoint: string;
      keys: {
        p256dh: string;
        auth: string;
      };
    },
    payload: string,
    options?: {
      TTL?: number;
      urgency?: 'very-low' | 'low' | 'normal' | 'high';
      topic?: string;
    },
  ): Promise<unknown>;
}

export interface WebPushChannelConfig {
  vapidSubject: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  store: PushSubscriptionStore;
  client?: WebPushClient;
}

export interface WebPushNotificationPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  eventId: string;
  severity: Severity;
  ticker: string | null;
  source: string;
}

export class WebPushChannel implements DeliveryService {
  readonly name = 'webPush';
  private readonly client: WebPushClient;
  private readonly store: PushSubscriptionStore;

  constructor(config: WebPushChannelConfig) {
    this.client = config.client ?? webpush;
    this.store = config.store;
    this.client.setVapidDetails(
      config.vapidSubject,
      config.vapidPublicKey,
      config.vapidPrivateKey,
    );
  }

  async send(alert: AlertEvent): Promise<void> {
    const subscriptions = await this.store.listActiveSubscriptions();
    if (subscriptions.length === 0) {
      return;
    }

    const payload = JSON.stringify(buildWebPushPayload(alert));
    const topic = `event-radar-${alert.storedEventId ?? alert.event.id}`;
    let deliveredCount = 0;
    let transientError: Error | undefined;

    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await this.client.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
          {
            TTL: DEFAULT_TTL_SECONDS,
            urgency: URGENCY_BY_SEVERITY[alert.severity],
            topic,
          },
        );
        deliveredCount += 1;
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        if (isInvalidSubscriptionError(error)) {
          await this.store.disableSubscription(subscription.id);
          return;
        }

        transientError ??= normalized;
      }
    }));

    if (transientError && deliveredCount === 0) {
      throw transientError;
    }
  }
}

export function buildWebPushPayload(alert: AlertEvent): WebPushNotificationPayload {
  const eventId = alert.storedEventId ?? alert.event.id;

  return {
    title: alert.event.title,
    body: truncate(alert.enrichment?.summary ?? alert.event.body, MAX_BODY_LENGTH),
    url: alert.storedEventId
      ? `/event/${alert.storedEventId}`
      : (alert.event.url ?? '/'),
    tag: `event-radar:${eventId}`,
    eventId,
    severity: alert.severity,
    ticker: alert.ticker ?? null,
    source: alert.event.source,
  };
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function isInvalidSubscriptionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const statusCode = Reflect.get(error, 'statusCode');
  return typeof statusCode === 'number' && INVALID_SUBSCRIPTION_STATUS_CODES.has(statusCode);
}
