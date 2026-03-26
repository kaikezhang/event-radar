import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { cleanTestDb, createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';

const TEST_API_KEY = 'subtraction-round3-test-key';
const AUTH_HEADERS = { 'x-api-key': TEST_API_KEY };

describe('subtraction round 3 removed routes', () => {
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

  it.each([
    ['GET', '/api/v1/rules'],
    ['GET', '/api/v1/adaptive/weights'],
    ['GET', '/api/v1/story-groups'],
    ['GET', '/api/v1/feedback/stats'],
    ['GET', '/api/v1/analytics/win-rate/by-source'],
    ['GET', '/api/v1/accuracy/stats'],
    ['GET', '/api/regime'],
    ['GET', '/api/v1/reports/weekly?date=2026-03-23'],
    ['GET', '/api/admin/delivery/status'],
    ['GET', '/api/health/delivery-stats'],
    ['GET', '/api/v1/briefing/daily'],
    ['GET', '/api/v1/calendar/earnings?from=2026-03-24&to=2026-03-28'],
    ['GET', '/api/v1/calendar/upcoming?from=2026-03-24&to=2026-03-28'],
    ['GET', '/api/v1/onboarding/suggested-tickers'],
    ['POST', '/api/v1/onboarding/bulk-add'],
    ['GET', '/api/v1/settings/notifications'],
    ['POST', '/api/v1/settings/notifications'],
    ['POST', '/api/v1/settings/notifications/test-discord'],
  ])('does not expose %s %s', async (method, url) => {
    const res = await ctx.server.inject({
      method,
      url,
      headers: AUTH_HEADERS,
      payload: method === 'POST' ? {} : undefined,
    });

    expect(res.statusCode).toBe(404);
  });
});
