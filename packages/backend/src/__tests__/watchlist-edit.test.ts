import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { cleanTestDb, createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';

const TEST_API_KEY = 'test-api-key';
const AUTH_HEADERS = { 'x-api-key': TEST_API_KEY };

describe('watchlist edit & bulk routes', () => {
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

  describe('PATCH /api/watchlist/:ticker', () => {
    it('requires auth', async () => {
      const res = await ctx.server.inject({ method: 'PATCH', url: '/api/watchlist/AAPL', payload: { notes: 'test' } });
      expect(res.statusCode).toBe(401);
    });

    it('returns 404 for ticker not in watchlist', async () => {
      const res = await ctx.server.inject({ method: 'PATCH', url: '/api/watchlist/AAPL', headers: AUTH_HEADERS, payload: { notes: 'test' } });
      expect(res.statusCode).toBe(404);
    });

    it('updates notes on a watchlist item', async () => {
      await ctx.server.inject({ method: 'POST', url: '/api/watchlist', headers: AUTH_HEADERS, payload: { ticker: 'AAPL' } });
      const res = await ctx.server.inject({ method: 'PATCH', url: '/api/watchlist/AAPL', headers: AUTH_HEADERS, payload: { notes: 'Earnings play Q1' } });
      expect(res.statusCode).toBe(200);
      expect(res.json().notes).toBe('Earnings play Q1');
    });

    it('updates sectionId on a watchlist item', async () => {
      await ctx.server.inject({ method: 'POST', url: '/api/watchlist', headers: AUTH_HEADERS, payload: { ticker: 'NVDA' } });
      const secRes = await ctx.server.inject({ method: 'POST', url: '/api/watchlist/sections', headers: AUTH_HEADERS, payload: { name: 'High Conviction' } });
      const sectionId = secRes.json().id;
      const res = await ctx.server.inject({ method: 'PATCH', url: '/api/watchlist/NVDA', headers: AUTH_HEADERS, payload: { sectionId } });
      expect(res.statusCode).toBe(200);
      expect(res.json().sectionId).toBe(sectionId);
    });

    it('clears sectionId when set to null', async () => {
      await ctx.server.inject({ method: 'POST', url: '/api/watchlist', headers: AUTH_HEADERS, payload: { ticker: 'TSLA' } });
      const secRes = await ctx.server.inject({ method: 'POST', url: '/api/watchlist/sections', headers: AUTH_HEADERS, payload: { name: 'Watch' } });
      const sectionId = secRes.json().id;
      await ctx.server.inject({ method: 'PATCH', url: '/api/watchlist/TSLA', headers: AUTH_HEADERS, payload: { sectionId } });
      const res = await ctx.server.inject({ method: 'PATCH', url: '/api/watchlist/TSLA', headers: AUTH_HEADERS, payload: { sectionId: null } });
      expect(res.statusCode).toBe(200);
      expect(res.json().sectionId).toBeNull();
    });

    it('rejects invalid sectionId', async () => {
      await ctx.server.inject({ method: 'POST', url: '/api/watchlist', headers: AUTH_HEADERS, payload: { ticker: 'GOOG' } });
      const res = await ctx.server.inject({ method: 'PATCH', url: '/api/watchlist/GOOG', headers: AUTH_HEADERS, payload: { sectionId: '00000000-0000-0000-0000-000000000000' } });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('section');
    });

    it('handles case-insensitive ticker in URL', async () => {
      await ctx.server.inject({ method: 'POST', url: '/api/watchlist', headers: AUTH_HEADERS, payload: { ticker: 'MSFT' } });
      const res = await ctx.server.inject({ method: 'PATCH', url: '/api/watchlist/msft', headers: AUTH_HEADERS, payload: { notes: 'lowercase test' } });
      expect(res.statusCode).toBe(200);
      expect(res.json().notes).toBe('lowercase test');
    });
  });

  describe('POST /api/watchlist/bulk', () => {
    it('requires auth', async () => {
      const res = await ctx.server.inject({ method: 'POST', url: '/api/watchlist/bulk', payload: { tickers: [{ ticker: 'AAPL' }] } });
      expect(res.statusCode).toBe(401);
    });

    it('adds multiple tickers at once', async () => {
      const res = await ctx.server.inject({ method: 'POST', url: '/api/watchlist/bulk', headers: AUTH_HEADERS, payload: { tickers: [{ ticker: 'AAPL' }, { ticker: 'NVDA' }, { ticker: 'TSLA' }] } });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ added: 3, skipped: 0 });
      const listRes = await ctx.server.inject({ method: 'GET', url: '/api/watchlist', headers: AUTH_HEADERS });
      expect(listRes.json().data).toHaveLength(3);
    });

    it('skips duplicates without error', async () => {
      await ctx.server.inject({ method: 'POST', url: '/api/watchlist', headers: AUTH_HEADERS, payload: { ticker: 'AAPL' } });
      const res = await ctx.server.inject({ method: 'POST', url: '/api/watchlist/bulk', headers: AUTH_HEADERS, payload: { tickers: [{ ticker: 'AAPL' }, { ticker: 'NVDA' }] } });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ added: 1, skipped: 1 });
    });

    it('handles empty tickers array', async () => {
      const res = await ctx.server.inject({ method: 'POST', url: '/api/watchlist/bulk', headers: AUTH_HEADERS, payload: { tickers: [] } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ added: 0, skipped: 0 });
    });

    it('adds tickers with notes and sectionId', async () => {
      const secRes = await ctx.server.inject({ method: 'POST', url: '/api/watchlist/sections', headers: AUTH_HEADERS, payload: { name: 'Bulk Section' } });
      const sectionId = secRes.json().id;
      const res = await ctx.server.inject({ method: 'POST', url: '/api/watchlist/bulk', headers: AUTH_HEADERS, payload: { tickers: [{ ticker: 'AAPL', sectionId, notes: 'earnings play' }, { ticker: 'GOOG', sectionId }] } });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ added: 2, skipped: 0 });
      const listRes = await ctx.server.inject({ method: 'GET', url: '/api/watchlist', headers: AUTH_HEADERS });
      const items = listRes.json().data;
      const aapl = items.find((i: Record<string, unknown>) => i.ticker === 'AAPL');
      expect(aapl.sectionId).toBe(sectionId);
      expect(aapl.notes).toBe('earnings play');
    });

    it('rejects invalid sectionId', async () => {
      const res = await ctx.server.inject({ method: 'POST', url: '/api/watchlist/bulk', headers: AUTH_HEADERS, payload: { tickers: [{ ticker: 'AAPL', sectionId: '00000000-0000-0000-0000-000000000000' }] } });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('section');
    });
  });
});
