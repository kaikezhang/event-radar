import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';
import { DeliveryKillSwitch } from '../services/delivery-kill-switch.js';
import type { Database } from '../db/connection.js';
import type { PGlite } from '@electric-sql/pglite';

const TEST_API_KEY = 'admin-test-key';

describe('Admin delivery routes', () => {
  let db: Database;
  let client: PGlite;
  const previousAuthRequired = process.env.AUTH_REQUIRED;
  const previousJwtSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    const result = await createTestDb();
    db = result.db;
    client = result.client;
  });

  beforeEach(() => {
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
  });

  afterEach(async () => {
    await db.execute(sql`DELETE FROM delivery_kill_switch`);
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

  afterAll(async () => {
    await safeClose(client);
  });

  function createCtx() {
    const killSwitch = new DeliveryKillSwitch(db);
    return buildApp({
      logger: false,
      db,
      apiKey: TEST_API_KEY,
      killSwitch,
    });
  }

  // --- Auth tests ---

  it('returns 401 without API key', async () => {
    const ctx = createCtx();
    await ctx.server.ready();

    const res = await ctx.server.inject({
      method: 'POST',
      url: '/api/admin/delivery/kill',
    });
    expect(res.statusCode).toBe(401);
    await safeCloseServer(ctx.server);
  });

  it('returns 401 with wrong API key', async () => {
    const ctx = createCtx();
    await ctx.server.ready();

    const res = await ctx.server.inject({
      method: 'POST',
      url: '/api/admin/delivery/kill',
      headers: { 'x-api-key': 'wrong-key' },
    });
    expect(res.statusCode).toBe(401);
    await safeCloseServer(ctx.server);
  });

  // --- Kill switch endpoints ---

  it('POST /kill activates kill switch with reason', async () => {
    const ctx = createCtx();
    await ctx.server.ready();

    const res = await ctx.server.inject({
      method: 'POST',
      url: '/api/admin/delivery/kill',
      headers: { 'x-api-key': TEST_API_KEY, 'content-type': 'application/json' },
      payload: { reason: 'Emergency maintenance' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enabled).toBe(true);
    expect(body.reason).toBe('Emergency maintenance');
    expect(body.activatedAt).toBeTruthy();
    await safeCloseServer(ctx.server);
  });

  it('POST /kill rejects invalid reason (empty string)', async () => {
    const ctx = createCtx();
    await ctx.server.ready();

    const res = await ctx.server.inject({
      method: 'POST',
      url: '/api/admin/delivery/kill',
      headers: { 'x-api-key': TEST_API_KEY, 'content-type': 'application/json' },
      payload: { reason: '   ' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Bad Request');
    await safeCloseServer(ctx.server);
  });

  it('POST /resume deactivates kill switch and nulls activatedAt', async () => {
    const ctx = createCtx();
    await ctx.server.ready();

    // Activate first
    await ctx.server.inject({
      method: 'POST',
      url: '/api/admin/delivery/kill',
      headers: { 'x-api-key': TEST_API_KEY, 'content-type': 'application/json' },
      payload: { reason: 'test' },
    });

    // Resume
    const res = await ctx.server.inject({
      method: 'POST',
      url: '/api/admin/delivery/resume',
      headers: { 'x-api-key': TEST_API_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enabled).toBe(false);
    expect(body.reason).toBeNull();
    expect(body.activatedAt).toBeNull();
    await safeCloseServer(ctx.server);
  });

  it('GET /status returns current kill switch state', async () => {
    const ctx = createCtx();
    await ctx.server.ready();

    const res = await ctx.server.inject({
      method: 'GET',
      url: '/api/admin/delivery/status',
      headers: { 'x-api-key': TEST_API_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('enabled');
    expect(body).toHaveProperty('activatedAt');
    expect(body).toHaveProperty('reason');
    expect(body).toHaveProperty('updatedAt');
    await safeCloseServer(ctx.server);
  });

  // --- Health stats endpoint (public) ---

  it('GET /health/delivery-stats returns stats without auth', async () => {
    const ctx = createCtx();
    await ctx.server.ready();

    const res = await ctx.server.inject({
      method: 'GET',
      url: '/api/health/delivery-stats',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('last24h');
    expect(body).toHaveProperty('last7d');
    expect(body.last24h).toHaveProperty('total');
    expect(body.last24h).toHaveProperty('bySource');
    await safeCloseServer(ctx.server);
  });
});
