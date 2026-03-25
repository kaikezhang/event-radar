import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
      expect(res.json()).not.toHaveProperty('sectionId');
    });

    it('handles case-insensitive ticker in URL', async () => {
      await ctx.server.inject({ method: 'POST', url: '/api/watchlist', headers: AUTH_HEADERS, payload: { ticker: 'MSFT' } });
      const res = await ctx.server.inject({ method: 'PATCH', url: '/api/watchlist/msft', headers: AUTH_HEADERS, payload: { notes: 'lowercase test' } });
      expect(res.statusCode).toBe(200);
      expect(res.json().notes).toBe('lowercase test');
    });

    it('ignores legacy sectionId updates', async () => {
      await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist',
        headers: AUTH_HEADERS,
        payload: { ticker: 'NVDA' },
      });

      const res = await ctx.server.inject({
        method: 'PATCH',
        url: '/api/watchlist/NVDA',
        headers: AUTH_HEADERS,
        payload: { notes: 'core name', sectionId: 'legacy-section-id' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().notes).toBe('core name');
      expect(res.json()).not.toHaveProperty('sectionId');
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
      expect(listRes.json().data[0]).not.toHaveProperty('sectionId');
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

    it('adds tickers with notes', async () => {
      const res = await ctx.server.inject({ method: 'POST', url: '/api/watchlist/bulk', headers: AUTH_HEADERS, payload: { tickers: [{ ticker: 'AAPL', notes: 'earnings play' }, { ticker: 'GOOG' }] } });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ added: 2, skipped: 0 });
      const listRes = await ctx.server.inject({ method: 'GET', url: '/api/watchlist', headers: AUTH_HEADERS });
      const items = listRes.json().data;
      const aapl = items.find((i: Record<string, unknown>) => i.ticker === 'AAPL');
      expect(aapl.notes).toBe('earnings play');
    });

    it('ignores legacy sectionId values in bulk payloads', async () => {
      const res = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/bulk',
        headers: AUTH_HEADERS,
        payload: {
          tickers: [
            { ticker: 'AAPL', sectionId: 'legacy-growth' },
            { ticker: 'MSFT', sectionId: 'legacy-core', notes: 'quality' },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ added: 2, skipped: 0 });

      const listRes = await ctx.server.inject({ method: 'GET', url: '/api/watchlist', headers: AUTH_HEADERS });
      expect(listRes.json().data).toEqual(expect.arrayContaining([
        expect.not.objectContaining({ sectionId: expect.anything() }),
      ]));
    });
  });

  describe('POST /api/watchlist ordering', () => {
    it('appends a newly added ticker to the end of the existing sort order', async () => {
      await ctx.server.inject({ method: 'POST', url: '/api/watchlist', headers: AUTH_HEADERS, payload: { ticker: 'AAPL' } });
      await ctx.server.inject({ method: 'POST', url: '/api/watchlist', headers: AUTH_HEADERS, payload: { ticker: 'MSFT' } });

      const addResponse = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist',
        headers: AUTH_HEADERS,
        payload: { ticker: 'NVDA' },
      });
      expect(addResponse.statusCode).toBe(201);

      const listResponse = await ctx.server.inject({ method: 'GET', url: '/api/watchlist', headers: AUTH_HEADERS });
      const items = listResponse.json().data as Array<{ ticker: string; sortOrder: number }>;

      expect(items.map((item) => item.ticker)).toEqual(['AAPL', 'MSFT', 'NVDA']);
      expect(items.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
    });
  });
});
