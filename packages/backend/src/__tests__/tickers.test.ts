import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { cleanTestDb, createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';

const TEST_API_KEY = 'test-api-key';

describe('ticker routes', () => {
  let db: Database;
  let client: PGlite;
  let ctx: AppContext;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
  });

  afterAll(async () => {
    await safeClose(client);
  });

  beforeEach(async () => {
    await cleanTestDb(db);
    ctx = buildApp({ logger: false, db, apiKey: TEST_API_KEY });
    await ctx.server.ready();

    // Seed ticker reference data for testing
    await db.execute(sql`
      INSERT INTO ticker_reference (ticker, name, sector, exchange) VALUES
        ('NVDA', 'NVIDIA Corporation', 'Technology', 'NASDAQ'),
        ('NVDI', 'NVIDIA International ADR', 'Technology', 'OTC'),
        ('NVR', 'NVR Inc', 'Consumer Cyclical', 'NYSE'),
        ('AAPL', 'Apple Inc', 'Technology', 'NASDAQ'),
        ('TSLA', 'Tesla Inc', 'Consumer Cyclical', 'NASDAQ'),
        ('AMZN', 'Amazon.com Inc', 'Consumer Cyclical', 'NASDAQ'),
        ('MSFT', 'Microsoft Corporation', 'Technology', 'NASDAQ'),
        ('BRK.B', 'Berkshire Hathaway Inc', 'Financials', 'NYSE')
    `);
  });

  afterEach(async () => {
    await safeCloseServer(ctx.server);
  });

  describe('GET /api/tickers/search', () => {
    it('returns empty data for empty query', async () => {
      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/search?q=',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([]);
    });

    it('matches ticker by prefix (case-insensitive)', async () => {
      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/search?q=nv',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.length).toBeGreaterThanOrEqual(2);
      // Should have NVDA and NVDI at minimum
      const tickers = data.map((d: { ticker: string }) => d.ticker);
      expect(tickers).toContain('NVDA');
      expect(tickers).toContain('NVDI');
    });

    it('matches by company name (contains)', async () => {
      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/search?q=amazon',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data[0].ticker).toBe('AMZN');
      expect(data[0].name).toBe('Amazon.com Inc');
    });

    it('ranks ticker prefix matches higher than name matches', async () => {
      // "NV" should match NVDA/NVDI by prefix and NVR by prefix
      // All should come before any name-only matches
      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/search?q=NV',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      // First results should be ticker prefix matches
      expect(data[0].ticker).toBe('NVR'); // exact 2-char shorter first (sorted by length)
    });

    it('returns exact ticker match first', async () => {
      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/search?q=NVDA',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data[0].ticker).toBe('NVDA');
    });

    it('respects limit parameter', async () => {
      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/search?q=a&limit=2',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeLessThanOrEqual(2);
    });

    it('rejects limit above 20', async () => {
      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/search?q=a&limit=100',
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns sector and exchange in results', async () => {
      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/search?q=AAPL',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data[0]).toEqual({
        ticker: 'AAPL',
        name: 'Apple Inc',
        sector: 'Technology',
        exchange: 'NASDAQ',
      });
    });

    it('supports tickers with dots (e.g. BRK.B)', async () => {
      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/search?q=BRK',
      });

      expect(res.statusCode).toBe(200);
      const tickers = res.json().data.map((d: { ticker: string }) => d.ticker);
      expect(tickers).toContain('BRK.B');
    });

    it('escapes LIKE wildcards in search query', async () => {
      // Searching for "%" or "_" should not match everything
      const resPercent = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/search?q=%25', // URL-encoded %
      });
      expect(resPercent.statusCode).toBe(200);
      expect(resPercent.json().data).toEqual([]);

      const resUnderscore = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/search?q=_',
      });
      expect(resUnderscore.statusCode).toBe(200);
      expect(resUnderscore.json().data).toEqual([]);
    });

    it('rejects q parameter longer than 50 characters', async () => {
      const longQuery = 'A'.repeat(51);
      const res = await ctx.server.inject({
        method: 'GET',
        url: `/api/tickers/search?q=${longQuery}`,
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/tickers/trending', () => {
    it('returns empty data when no events exist', async () => {
      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/trending',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([]);
    });

    it('returns tickers ordered by event count in last 24h', async () => {
      // Insert some events within 24h
      await db.execute(sql`
        INSERT INTO events (source, title, ticker, created_at) VALUES
          ('test', 'Event 1', 'NVDA', NOW() - INTERVAL '1 hour'),
          ('test', 'Event 2', 'NVDA', NOW() - INTERVAL '2 hours'),
          ('test', 'Event 3', 'NVDA', NOW() - INTERVAL '3 hours'),
          ('test', 'Event 4', 'AAPL', NOW() - INTERVAL '1 hour'),
          ('test', 'Event 5', 'TSLA', NOW() - INTERVAL '1 hour'),
          ('test', 'Event 6', 'TSLA', NOW() - INTERVAL '2 hours')
      `);

      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/trending?limit=3',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.length).toBe(3);
      // NVDA should be first (3 events), then TSLA (2), then AAPL (1)
      expect(data[0].ticker).toBe('NVDA');
      expect(data[0].eventCount).toBe(3);
      expect(data[1].ticker).toBe('TSLA');
      expect(data[1].eventCount).toBe(2);
      expect(data[2].ticker).toBe('AAPL');
      expect(data[2].eventCount).toBe(1);
    });

    it('excludes events older than 24h', async () => {
      await db.execute(sql`
        INSERT INTO events (source, title, ticker, created_at) VALUES
          ('test', 'Old Event', 'MSFT', NOW() - INTERVAL '25 hours'),
          ('test', 'New Event', 'AAPL', NOW() - INTERVAL '1 hour')
      `);

      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/trending',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      const tickers = data.map((d: { ticker: string }) => d.ticker);
      expect(tickers).toContain('AAPL');
      expect(tickers).not.toContain('MSFT');
    });

    it('joins with ticker_reference for name/sector', async () => {
      await db.execute(sql`
        INSERT INTO events (source, title, ticker, created_at) VALUES
          ('test', 'Event 1', 'NVDA', NOW() - INTERVAL '1 hour')
      `);

      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/tickers/trending',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data[0].name).toBe('NVIDIA Corporation');
      expect(data[0].sector).toBe('Technology');
    });
  });

  describe('POST /api/watchlist - ticker validation', () => {
    it('returns warning for unknown tickers', async () => {
      const res = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: { ticker: 'ZZZZ' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.ticker).toBe('ZZZZ');
      expect(body.warning).toBeDefined();
      expect(body.warning).toContain('not found');
    });

    it('returns no warning for known tickers', async () => {
      const res = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: { ticker: 'NVDA' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.ticker).toBe('NVDA');
      expect(body.warning).toBeUndefined();
    });

    it('accepts tickers with dots (e.g. BRK.B)', async () => {
      const res = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: { ticker: 'BRK.B' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().ticker).toBe('BRK.B');
    });
  });
});
