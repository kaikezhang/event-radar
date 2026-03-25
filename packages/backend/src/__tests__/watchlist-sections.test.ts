import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { cleanTestDb, createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';

const TEST_API_KEY = 'test-api-key';
const AUTH_HEADERS = { 'x-api-key': TEST_API_KEY };

describe('removed watchlist section routes', () => {
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

  it('does not expose GET /api/watchlist/sections', async () => {
    const res = await ctx.server.inject({
      method: 'GET',
      url: '/api/watchlist/sections',
      headers: AUTH_HEADERS,
    });

    expect(res.statusCode).toBe(404);
  });

  it('does not expose POST /api/watchlist/sections', async () => {
    const res = await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist/sections',
      headers: AUTH_HEADERS,
      payload: { name: 'High Conviction' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('does not expose PATCH /api/watchlist/reorder', async () => {
    const res = await ctx.server.inject({
      method: 'PATCH',
      url: '/api/watchlist/reorder',
      headers: AUTH_HEADERS,
      payload: { items: [] },
    });

    expect(res.statusCode).toBe(404);
  });
});
