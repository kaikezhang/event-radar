import { and, eq, isNull } from 'drizzle-orm';
import type { StoredPushSubscription } from '@event-radar/delivery';
import type { Database } from '../db/connection.js';
import { pushSubscriptions } from '../db/schema.js';

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
  };
}
