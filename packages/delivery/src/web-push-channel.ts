import webpush from 'web-push';
import type { Severity } from '@event-radar/shared';
import type { AlertEvent, DeliveryService } from './types.js';

const INVALID_SUBSCRIPTION_STATUS_CODES = new Set([404, 410]);
const DEFAULT_TTL_SECONDS = 3600;
const MAX_BODY_LENGTH = 240;
const DEFAULT_TIMEZONE = 'America/New_York';
const DEFAULT_DAILY_PUSH_CAP = 20;
const HIGH_QUALITY_SETUP_ACTION = '🔴 High-Quality Setup';

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
  getWatchlistTickers?(userId: string): Promise<string[]>;
  getPushNonWatchlist?(userId: string): Promise<boolean>;
  getUserPreferences?(userId: string): Promise<UserPushPreferences | undefined>;
}

export interface UserPushPreferences {
  quietStart: string | null;
  quietEnd: string | null;
  timezone: string;
  dailyPushCap: number;
  pushNonWatchlist: boolean;
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
  now?: () => Date;
  onQuietSuppressed?: (userId: string) => void;
  onCapSuppressed?: (userId: string) => void;
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
  private readonly now: () => Date;
  private readonly onQuietSuppressed?: (userId: string) => void;
  private readonly onCapSuppressed?: (userId: string) => void;
  private readonly dailyUserCounts = new Map<string, { date: string; count: number }>();

  constructor(config: WebPushChannelConfig) {
    this.client = config.client ?? webpush;
    this.store = config.store;
    this.now = config.now ?? (() => new Date());
    this.onQuietSuppressed = config.onQuietSuppressed;
    this.onCapSuppressed = config.onCapSuppressed;
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

    // Extract event tickers for watchlist matching
    const alertTickers = extractAlertTickers(alert);

    const payload = JSON.stringify(buildWebPushPayload(alert));
    const topic = `event-radar-${alert.storedEventId ?? alert.event.id}`;
    const now = this.now();
    const alertTickerSet = new Set(alertTickers.map((ticker) => ticker.toUpperCase()));
    const hasAlertTickers = alertTickerSet.size > 0;
    const subscriptionsByUser = groupSubscriptionsByUser(subscriptions);
    const userIds = [...subscriptionsByUser.keys()];
    const userContexts = new Map<
      string,
      { watchlist: Set<string>; preferences: UserPushPreferences }
    >();
    let transientError: Error | undefined;

    await Promise.all(userIds.map(async (userId) => {
      const [watchlistTickers, preferences, legacyPushNonWatchlist] = await Promise.all([
        this.store.getWatchlistTickers?.(userId) ?? Promise.resolve([]),
        this.store.getUserPreferences?.(userId),
        this.store.getPushNonWatchlist?.(userId),
      ]);

      userContexts.set(userId, {
        watchlist: new Set(watchlistTickers.map((ticker) => ticker.toUpperCase())),
        preferences: resolveUserPreferences(preferences, legacyPushNonWatchlist),
      });
    }));

    let deliveredCount = 0;

    await Promise.all(userIds.map(async (userId) => {
      const userSubscriptions = subscriptionsByUser.get(userId) ?? [];
      const userContext = userContexts.get(userId);
      if (userSubscriptions.length === 0 || !userContext) {
        return;
      }

      if (!shouldSendForWatchlist(
        alertTickerSet,
        hasAlertTickers,
        userContext.watchlist,
        userContext.preferences,
        this.store.getWatchlistTickers != null,
      )) {
        return;
      }

      if (shouldSuppressForQuietHours(now, userContext.preferences, alert)) {
        this.onQuietSuppressed?.(userId);
        console.info(`[webPush] suppressed by quiet hours for user ${userId}`);
        return;
      }

      if (shouldSuppressForDailyCap(now, userId, userContext.preferences, this.dailyUserCounts, alert)) {
        this.onCapSuppressed?.(userId);
        console.info(`[webPush] suppressed by daily cap for user ${userId}`);
        return;
      }

      let deliveredForUser = false;

      await Promise.all(userSubscriptions.map(async (subscription) => {
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
          deliveredForUser = true;
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

      if (deliveredForUser) {
        incrementDailyCount(this.dailyUserCounts, userId, now);
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

export function extractAlertTickers(alert: AlertEvent): string[] {
  const tickers: string[] = [];

  // Primary ticker from alert
  if (alert.ticker) {
    tickers.push(alert.ticker);
  }

  // Tickers from enrichment
  if (alert.enrichment?.tickers) {
    for (const t of alert.enrichment.tickers) {
      if (t.symbol && !tickers.includes(t.symbol)) {
        tickers.push(t.symbol);
      }
    }
  }

  // Ticker from event metadata
  const metadata = alert.event.metadata as Record<string, unknown> | undefined;
  if (metadata) {
    if (typeof metadata.ticker === 'string' && !tickers.includes(metadata.ticker)) {
      tickers.push(metadata.ticker);
    }
    if (Array.isArray(metadata.tickers)) {
      for (const t of metadata.tickers) {
        if (typeof t === 'string' && !tickers.includes(t)) {
          tickers.push(t);
        }
      }
    }
  }

  return tickers;
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

function resolveUserPreferences(
  preferences: UserPushPreferences | undefined,
  legacyPushNonWatchlist: boolean | undefined,
): UserPushPreferences {
  return {
    quietStart: preferences?.quietStart ?? null,
    quietEnd: preferences?.quietEnd ?? null,
    timezone: preferences?.timezone ?? DEFAULT_TIMEZONE,
    dailyPushCap: preferences?.dailyPushCap ?? DEFAULT_DAILY_PUSH_CAP,
    pushNonWatchlist: preferences?.pushNonWatchlist ?? legacyPushNonWatchlist ?? false,
  };
}

function groupSubscriptionsByUser(
  subscriptions: ReadonlyArray<StoredPushSubscription>,
): Map<string, StoredPushSubscription[]> {
  const grouped = new Map<string, StoredPushSubscription[]>();

  for (const subscription of subscriptions) {
    grouped.set(subscription.userId, [...(grouped.get(subscription.userId) ?? []), subscription]);
  }

  return grouped;
}

function shouldSendForWatchlist(
  alertTickerSet: Set<string>,
  hasAlertTickers: boolean,
  userTickers: Set<string>,
  preferences: UserPushPreferences,
  hasWatchlistSupport: boolean,
): boolean {
  if (!hasWatchlistSupport) {
    return true;
  }

  if (!hasAlertTickers) {
    return preferences.pushNonWatchlist;
  }

  if (userTickers.size === 0) {
    return preferences.pushNonWatchlist;
  }

  return [...alertTickerSet].some((ticker) => userTickers.has(ticker));
}

function shouldSuppressForQuietHours(
  now: Date,
  preferences: UserPushPreferences,
  alert: AlertEvent,
): boolean {
  if (isHighQualitySetup(alert)) {
    return false;
  }

  if (!preferences.quietStart || !preferences.quietEnd) {
    return false;
  }

  const startMinutes = parseTimeToMinutes(preferences.quietStart);
  const endMinutes = parseTimeToMinutes(preferences.quietEnd);
  if (startMinutes == null || endMinutes == null || startMinutes === endMinutes) {
    return false;
  }

  const localMinutes = getLocalMinutes(now, preferences.timezone);
  if (localMinutes == null) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return localMinutes >= startMinutes && localMinutes < endMinutes;
  }

  return localMinutes >= startMinutes || localMinutes < endMinutes;
}

function shouldSuppressForDailyCap(
  now: Date,
  userId: string,
  preferences: UserPushPreferences,
  counts: Map<string, { date: string; count: number }>,
  alert: AlertEvent,
): boolean {
  if (isHighQualitySetup(alert) || preferences.dailyPushCap === 0) {
    return false;
  }

  return getDailyCount(counts, userId, now) >= preferences.dailyPushCap;
}

function isHighQualitySetup(alert: AlertEvent): boolean {
  return alert.enrichment?.action === HIGH_QUALITY_SETUP_ACTION;
}

function parseTimeToMinutes(value: string): number | null {
  const [hoursString, minutesString] = value.split(':');
  const hours = Number(hoursString);
  const minutes = Number(minutesString);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  return (hours * 60) + minutes;
}

function getLocalMinutes(now: Date, timezone: string): number | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(now);
    const hours = Number(parts.find((part) => part.type === 'hour')?.value);
    const minutes = Number(parts.find((part) => part.type === 'minute')?.value);

    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
      return null;
    }

    return (hours * 60) + minutes;
  } catch {
    return null;
  }
}

function getDailyCount(
  counts: Map<string, { date: string; count: number }>,
  userId: string,
  now: Date,
): number {
  const date = now.toISOString().slice(0, 10);
  const current = counts.get(userId);

  if (!current || current.date !== date) {
    counts.set(userId, { date, count: 0 });
    return 0;
  }

  return current.count;
}

function incrementDailyCount(
  counts: Map<string, { date: string; count: number }>,
  userId: string,
  now: Date,
): void {
  const date = now.toISOString().slice(0, 10);
  const current = counts.get(userId);

  if (!current || current.date !== date) {
    counts.set(userId, { date, count: 1 });
    return;
  }

  counts.set(userId, { date, count: current.count + 1 });
}
