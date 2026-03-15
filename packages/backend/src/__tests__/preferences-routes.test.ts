import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { userPreferences } from '../db/schema.js';
import { cleanTestDb, createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';

const TEST_API_KEY = 'test-api-key';

describe('preferences routes', () => {
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
    if (ctx?.server) {
      await safeCloseServer(ctx.server);
    }
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

  it('returns default preferences when no record exists', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/preferences',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      quietStart: null,
      quietEnd: null,
      timezone: 'America/New_York',
      dailyPushCap: 20,
      pushNonWatchlist: false,
    });
  });

  it('requires authentication to update preferences', async () => {
    const response = await ctx.server.inject({
      method: 'PUT',
      url: '/api/v1/preferences',
      payload: {
        dailyPushCap: 10,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('creates and returns preferences for the current user', async () => {
    const updateResponse = await ctx.server.inject({
      method: 'PUT',
      url: '/api/v1/preferences',
      headers: {
        'x-api-key': TEST_API_KEY,
        'x-user-id': 'user-42',
      },
      payload: {
        quietStart: '22:30',
        quietEnd: '07:15',
        timezone: 'America/Los_Angeles',
        dailyPushCap: 5,
        pushNonWatchlist: true,
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      quietStart: '22:30',
      quietEnd: '07:15',
      timezone: 'America/Los_Angeles',
      dailyPushCap: 5,
      pushNonWatchlist: true,
    });

    const fetchResponse = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/preferences',
      headers: {
        'x-api-key': TEST_API_KEY,
        'x-user-id': 'user-42',
      },
    });

    expect(fetchResponse.statusCode).toBe(200);
    expect(fetchResponse.json()).toMatchObject({
      quietStart: '22:30',
      quietEnd: '07:15',
      timezone: 'America/Los_Angeles',
      dailyPushCap: 5,
      pushNonWatchlist: true,
    });
  });

  it('supports clearing quiet hours with null values', async () => {
    await ctx.server.inject({
      method: 'PUT',
      url: '/api/v1/preferences',
      headers: {
        'x-api-key': TEST_API_KEY,
        'x-user-id': 'user-7',
      },
      payload: {
        quietStart: '23:00',
        quietEnd: '08:00',
      },
    });

    const response = await ctx.server.inject({
      method: 'PUT',
      url: '/api/v1/preferences',
      headers: {
        'x-api-key': TEST_API_KEY,
        'x-user-id': 'user-7',
      },
      payload: {
        quietStart: null,
        quietEnd: null,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      quietStart: null,
      quietEnd: null,
    });

    const [stored] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, 'user-7'));

    expect(stored?.quietStart).toBeNull();
    expect(stored?.quietEnd).toBeNull();
  });

  it('rejects partial quiet-hour updates', async () => {
    const response = await ctx.server.inject({
      method: 'PUT',
      url: '/api/v1/preferences',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
      payload: {
        quietStart: '23:00',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'Invalid preferences payload',
    });
  });

  it('rejects invalid timezones', async () => {
    const response = await ctx.server.inject({
      method: 'PUT',
      url: '/api/v1/preferences',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
      payload: {
        timezone: 'Mars/Olympus',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'Invalid preferences payload',
    });
  });
});
