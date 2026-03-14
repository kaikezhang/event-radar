import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { pushSubscriptions, users } from '../db/schema.js';
import {
  cleanTestDb,
  createTestDb,
  safeClose,
} from './helpers/test-db.js';

describe('push subscriptions schema', () => {
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
  });

  afterAll(async () => {
    await safeClose(client);
  });

  beforeEach(async () => {
    await cleanTestDb(db);
  });

  it('stores a push subscription for a user', async () => {
    await db.insert(users).values({ id: 'user-1' });

    const [subscription] = await db
      .insert(pushSubscriptions)
      .values({
        userId: 'user-1',
        endpoint: 'https://push.example.test/subscriptions/1',
        p256dh: 'public-key',
        auth: 'auth-secret',
      })
      .returning();

    expect(subscription.userId).toBe('user-1');
    expect(subscription.endpoint).toContain('/1');
    expect(subscription.createdAt).toBeInstanceOf(Date);
  });

  it('supports optional push subscription metadata fields', async () => {
    await db.insert(users).values({ id: 'user-1' });

    const [subscription] = await db
      .insert(pushSubscriptions)
      .values({
        userId: 'user-1',
        endpoint: 'https://push.example.test/subscriptions/2',
        p256dh: 'public-key',
        auth: 'auth-secret',
        userAgent: 'Vitest Browser',
        lastSeenAt: new Date('2026-03-14T00:00:00.000Z'),
        disabledAt: new Date('2026-03-15T00:00:00.000Z'),
      })
      .returning();

    expect(subscription.userAgent).toBe('Vitest Browser');
    expect(subscription.lastSeenAt?.toISOString()).toBe('2026-03-14T00:00:00.000Z');
    expect(subscription.disabledAt?.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  it('deletes subscriptions when the owning user is removed', async () => {
    await db.insert(users).values({ id: 'user-1' });
    await db.insert(pushSubscriptions).values({
      userId: 'user-1',
      endpoint: 'https://push.example.test/subscriptions/3',
      p256dh: 'public-key',
      auth: 'auth-secret',
    });

    await db.delete(users).where(eq(users.id, 'user-1'));

    const rows = await db.select().from(pushSubscriptions);
    expect(rows).toHaveLength(0);
  });

  it('rejects duplicate endpoints for the same user', async () => {
    await db.insert(users).values({ id: 'user-1' });
    await db.insert(pushSubscriptions).values({
      userId: 'user-1',
      endpoint: 'https://push.example.test/subscriptions/4',
      p256dh: 'public-key',
      auth: 'auth-secret',
    });

    await expect(
      db.insert(pushSubscriptions).values({
        userId: 'user-1',
        endpoint: 'https://push.example.test/subscriptions/4',
        p256dh: 'second-key',
        auth: 'second-secret',
      }),
    ).rejects.toThrow();
  });
});
