import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { pushSubscriptions } from '../db/schema.js';
import { cleanTestDb, createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';

const TEST_API_KEY = 'test-api-key';

function makeSubscriptionPayload(overrides: Record<string, unknown> = {}) {
  return {
    endpoint: 'https://push.example.test/subscriptions/device-1',
    expirationTime: null,
    keys: {
      p256dh: 'public-key-1',
      auth: 'auth-secret-1',
    },
    ...overrides,
  };
}

describe('push subscription routes', () => {
  let db: Database;
  let client: PGlite;
  let ctx: AppContext;
  const previousAuthRequired = process.env.AUTH_REQUIRED;
  const previousJwtSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
  });

  afterAll(async () => {
    await safeClose(client);
  });

  beforeEach(async () => {
    await cleanTestDb(db);
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    ctx = buildApp({ logger: false, db, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterEach(async () => {
    await safeCloseServer(ctx.server);
    if (previousAuthRequired == null) {
      delete process.env.AUTH_REQUIRED;
    } else {
      process.env.AUTH_REQUIRED = previousAuthRequired;
    }
    if (previousJwtSecret == null) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousJwtSecret;
    }
  });

  it('requires an API key to register a push subscription', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/push-subscriptions',
      payload: makeSubscriptionPayload(),
    });

    expect(response.statusCode).toBe(401);
  });

  it('registers a push subscription for the default user', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/push-subscriptions',
      headers: {
        'x-api-key': TEST_API_KEY,
        'user-agent': 'Vitest Browser',
      },
      payload: makeSubscriptionPayload(),
    });

    expect(response.statusCode).toBe(201);

    const rows = await db.select().from(pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe('default');
    expect(rows[0]?.endpoint).toBe('https://push.example.test/subscriptions/device-1');
    expect(rows[0]?.p256dh).toBe('public-key-1');
    expect(rows[0]?.auth).toBe('auth-secret-1');
    expect(rows[0]?.userAgent).toBe('Vitest Browser');
    expect(rows[0]?.disabledAt).toBeNull();
    expect(rows[0]?.lastSeenAt).toBeInstanceOf(Date);
  });

  it('ignores x-user-id while upserting the default user subscription and clears disabled state', async () => {
    await ctx.server.inject({
      method: 'POST',
      url: '/api/push-subscriptions',
      headers: {
        'x-api-key': TEST_API_KEY,
        'x-user-id': 'user-1',
      },
      payload: makeSubscriptionPayload(),
    });

    await db
      .update(pushSubscriptions)
      .set({
        disabledAt: new Date('2026-03-14T00:00:00.000Z'),
      })
      .where(and(
        eq(pushSubscriptions.userId, 'default'),
        eq(pushSubscriptions.endpoint, 'https://push.example.test/subscriptions/device-1'),
      ));

    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/push-subscriptions',
      headers: {
        'x-api-key': TEST_API_KEY,
        'x-user-id': 'user-1',
      },
      payload: makeSubscriptionPayload({
        keys: {
          p256dh: 'public-key-2',
          auth: 'auth-secret-2',
        },
      }),
    });

    expect(response.statusCode).toBe(201);

    const rows = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, 'default'));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.p256dh).toBe('public-key-2');
    expect(rows[0]?.auth).toBe('auth-secret-2');
    expect(rows[0]?.disabledAt).toBeNull();
  });

  it('ignores x-user-id and keeps subscriptions scoped to the default user', async () => {
    await ctx.server.inject({
      method: 'POST',
      url: '/api/push-subscriptions',
      headers: {
        'x-api-key': TEST_API_KEY,
        'x-user-id': 'user-1',
      },
      payload: makeSubscriptionPayload(),
    });

    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/push-subscriptions',
      headers: {
        'x-api-key': TEST_API_KEY,
        'x-user-id': 'user-2',
      },
      payload: makeSubscriptionPayload(),
    });

    expect(response.statusCode).toBe(201);

    const rows = await db.select().from(pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe('default');
  });

  it('ignores x-user-id when unregistering subscriptions', async () => {
    await ctx.server.inject({
      method: 'POST',
      url: '/api/push-subscriptions',
      headers: {
        'x-api-key': TEST_API_KEY,
        'x-user-id': 'user-1',
      },
      payload: makeSubscriptionPayload(),
    });

    await ctx.server.inject({
      method: 'POST',
      url: '/api/push-subscriptions',
      headers: {
        'x-api-key': TEST_API_KEY,
        'x-user-id': 'user-2',
      },
      payload: makeSubscriptionPayload(),
    });

    const response = await ctx.server.inject({
      method: 'DELETE',
      url: '/api/push-subscriptions',
      headers: {
        'x-api-key': TEST_API_KEY,
        'x-user-id': 'user-1',
      },
      payload: {
        endpoint: 'https://push.example.test/subscriptions/device-1',
      },
    });

    expect(response.statusCode).toBe(200);

    const remaining = await db.select().from(pushSubscriptions);
    expect(remaining).toHaveLength(0);
  });

  it('returns 404 when unregistering an unknown subscription', async () => {
    const response = await ctx.server.inject({
      method: 'DELETE',
      url: '/api/push-subscriptions',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
      payload: {
        endpoint: 'https://push.example.test/subscriptions/missing',
      },
    });

    expect(response.statusCode).toBe(404);
  });
});
