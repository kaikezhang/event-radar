import { and, eq, isNull } from 'drizzle-orm';
import type { StoredPushSubscription } from '@event-radar/delivery';
import type { Database } from '../db/connection.js';
import { pushSubscriptions, userPreferences, watchlist } from '../db/schema.js';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizePreferenceTime,
  type NotificationPreferences,
} from './user-preferences-store.js';

export interface UpsertPushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

export interface PushSubscriptionStore {
  listActiveSubscriptions(): Promise<ReadonlyArray<StoredPushSubscription>>;
  disableSubscription(subscriptionId: string): Promise<void>;
  upsertSubscription(input: UpsertPushSubscriptionInput): Promise<void>;
  removeSubscription(userId: string, endpoint: string): Promise<boolean>;
  getWatchlistTickers(userId: string): Promise<string[]>;
  getPushNonWatchlist(userId: string): Promise<boolean>;
  getUserPreferences(userId: string): Promise<NotificationPreferences>;
}

export function createPushSubscriptionStore(db: Database): PushSubscriptionStore {
  return {
    async listActiveSubscriptions() {
      return db
        .select({
          id: pushSubscriptions.id,
          userId: pushSubscriptions.userId,
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)
        .where(isNull(pushSubscriptions.disabledAt));
    },

    async disableSubscription(subscriptionId: string) {
      await db
        .update(pushSubscriptions)
        .set({
          disabledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pushSubscriptions.id, subscriptionId));
    },

    async upsertSubscription(input: UpsertPushSubscriptionInput) {
      const now = new Date();

      await db
        .insert(pushSubscriptions)
        .values({
          userId: input.userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent ?? null,
          lastSeenAt: now,
          disabledAt: null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
          set: {
            p256dh: input.p256dh,
            auth: input.auth,
            userAgent: input.userAgent ?? null,
            lastSeenAt: now,
            disabledAt: null,
            updatedAt: now,
          },
        });
    },

    async removeSubscription(userId: string, endpoint: string) {
      const deleted = await db
        .delete(pushSubscriptions)
        .where(and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, endpoint),
        ))
        .returning({ id: pushSubscriptions.id });

      return deleted.length > 0;
    },

    async getWatchlistTickers(userId: string) {
      const rows = await db
        .select({ ticker: watchlist.ticker })
        .from(watchlist)
        .where(eq(watchlist.userId, userId));

      return rows.map((r) => r.ticker);
    },

    async getPushNonWatchlist(userId: string) {
      const [row] = await db
        .select({ pushNonWatchlist: userPreferences.pushNonWatchlist })
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1);

      return row?.pushNonWatchlist ?? DEFAULT_NOTIFICATION_PREFERENCES.pushNonWatchlist;
    },

    async getUserPreferences(userId: string) {
      const [row] = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1);

      if (!row) {
        return { ...DEFAULT_NOTIFICATION_PREFERENCES };
      }

      return {
        quietStart: normalizePreferenceTime(row.quietStart),
        quietEnd: normalizePreferenceTime(row.quietEnd),
        timezone: row.timezone,
        dailyPushCap: row.dailyPushCap,
        pushNonWatchlist: row.pushNonWatchlist,
        updatedAt: row.updatedAt,
      };
    },
  };
}
