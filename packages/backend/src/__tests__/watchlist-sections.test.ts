import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { watchlistSections } from '../db/schema.js';
import { cleanTestDb, createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';

const TEST_API_KEY = 'test-api-key';
const AUTH_HEADERS = { 'x-api-key': TEST_API_KEY };

describe('watchlist section routes', () => {
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

  // ── Section CRUD ──────────────────────────────────────────────────

  describe('GET /api/watchlist/sections', () => {
    it('requires auth', async () => {
      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/watchlist/sections',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns empty array when no sections', async () => {
      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([]);
    });

    it('returns sections ordered by sortOrder', async () => {
      // Create user first
      await db.execute(sql`INSERT INTO users (id) VALUES ('default')`);

      await db.insert(watchlistSections).values([
        { userId: 'default', name: 'Second', color: 'blue', sortOrder: 1 },
        { userId: 'default', name: 'First', color: 'red', sortOrder: 0 },
      ]);

      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data).toHaveLength(2);
      expect(data[0].name).toBe('First');
      expect(data[1].name).toBe('Second');
    });
  });

  describe('POST /api/watchlist/sections', () => {
    it('creates a section with defaults', async () => {
      const res = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'High Conviction' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.name).toBe('High Conviction');
      expect(body.color).toBe('gray');
      expect(body.sortOrder).toBe(0);
    });

    it('creates a section with custom color', async () => {
      const res = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'Watchlist', color: 'green' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().color).toBe('green');
    });

    it('rejects invalid color', async () => {
      const res = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'Test', color: 'pink' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects duplicate name', async () => {
      await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'Watchlist' },
      });

      const res = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'Watchlist' },
      });

      expect(res.statusCode).toBe(409);
    });

    it('enforces max 20 sections', async () => {
      // Create user
      await db.execute(sql`INSERT INTO users (id) VALUES ('default') ON CONFLICT DO NOTHING`);

      // Insert 20 sections directly
      for (let i = 0; i < 20; i++) {
        await db.insert(watchlistSections).values({
          userId: 'default',
          name: `Section ${i}`,
          sortOrder: i,
        });
      }

      const res = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'One too many' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('20');
    });

    it('auto-increments sortOrder', async () => {
      await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'First' },
      });

      const res = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'Second' },
      });

      expect(res.json().sortOrder).toBe(1);
    });
  });

  describe('PATCH /api/watchlist/sections/:id', () => {
    it('updates section name', async () => {
      const createRes = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'Old Name' },
      });
      const sectionId = createRes.json().id;

      const res = await ctx.server.inject({
        method: 'PATCH',
        url: `/api/watchlist/sections/${sectionId}`,
        headers: AUTH_HEADERS,
        payload: { name: 'New Name' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe('New Name');
    });

    it('updates section color', async () => {
      const createRes = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'Test' },
      });
      const sectionId = createRes.json().id;

      const res = await ctx.server.inject({
        method: 'PATCH',
        url: `/api/watchlist/sections/${sectionId}`,
        headers: AUTH_HEADERS,
        payload: { color: 'red' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().color).toBe('red');
    });

    it('returns 404 for non-existent section', async () => {
      const res = await ctx.server.inject({
        method: 'PATCH',
        url: '/api/watchlist/sections/00000000-0000-0000-0000-000000000000',
        headers: AUTH_HEADERS,
        payload: { name: 'X' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('rejects rename to existing name', async () => {
      await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'A' },
      });

      const createRes = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'B' },
      });
      const sectionId = createRes.json().id;

      const res = await ctx.server.inject({
        method: 'PATCH',
        url: `/api/watchlist/sections/${sectionId}`,
        headers: AUTH_HEADERS,
        payload: { name: 'A' },
      });

      expect(res.statusCode).toBe(409);
    });
  });

  describe('DELETE /api/watchlist/sections/:id', () => {
    it('deletes a section and nullifies ticker sectionIds', async () => {
      // Create section
      const createRes = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'To Delete' },
      });
      const sectionId = createRes.json().id;

      // Add a ticker to this section
      await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist',
        headers: AUTH_HEADERS,
        payload: { ticker: 'AAPL' },
      });

      // Move ticker to section
      await ctx.server.inject({
        method: 'PATCH',
        url: '/api/watchlist/reorder',
        headers: AUTH_HEADERS,
        payload: { items: [{ ticker: 'AAPL', sortOrder: 0, sectionId }] },
      });

      // Delete section
      const res = await ctx.server.inject({
        method: 'DELETE',
        url: `/api/watchlist/sections/${sectionId}`,
        headers: AUTH_HEADERS,
      });

      expect(res.statusCode).toBe(200);

      // Verify ticker's sectionId is now null
      const watchlistRes = await ctx.server.inject({
        method: 'GET',
        url: '/api/watchlist',
        headers: AUTH_HEADERS,
      });

      const items = watchlistRes.json().data;
      expect(items[0].sectionId).toBeNull();
    });

    it('returns 404 for non-existent section', async () => {
      const res = await ctx.server.inject({
        method: 'DELETE',
        url: '/api/watchlist/sections/00000000-0000-0000-0000-000000000000',
        headers: AUTH_HEADERS,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── Reorder ───────────────────────────────────────────────────────

  describe('PATCH /api/watchlist/reorder', () => {
    it('reorders items within a section', async () => {
      // Create section
      const secRes = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'Main' },
      });
      const sectionId = secRes.json().id;

      // Add tickers
      await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist',
        headers: AUTH_HEADERS,
        payload: { ticker: 'AAPL' },
      });
      await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist',
        headers: AUTH_HEADERS,
        payload: { ticker: 'MSFT' },
      });
      await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist',
        headers: AUTH_HEADERS,
        payload: { ticker: 'GOOG' },
      });

      // Reorder
      const res = await ctx.server.inject({
        method: 'PATCH',
        url: '/api/watchlist/reorder',
        headers: AUTH_HEADERS,
        payload: {
          items: [
            { ticker: 'GOOG', sortOrder: 0, sectionId },
            { ticker: 'AAPL', sortOrder: 1, sectionId },
            { ticker: 'MSFT', sortOrder: 2, sectionId },
          ],
        },
      });

      expect(res.statusCode).toBe(200);

      // Verify order
      const listRes = await ctx.server.inject({
        method: 'GET',
        url: '/api/watchlist',
        headers: AUTH_HEADERS,
      });

      const items = listRes.json().data;
      expect(items[0].ticker).toBe('GOOG');
      expect(items[1].ticker).toBe('AAPL');
      expect(items[2].ticker).toBe('MSFT');
    });

    it('moves items between sections', async () => {
      // Create two sections
      const sec1Res = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'Section A' },
      });
      const sec2Res = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'Section B' },
      });
      const sectionAId = sec1Res.json().id;
      const sectionBId = sec2Res.json().id;

      // Add ticker and assign to section A
      await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist',
        headers: AUTH_HEADERS,
        payload: { ticker: 'TSLA' },
      });

      await ctx.server.inject({
        method: 'PATCH',
        url: '/api/watchlist/reorder',
        headers: AUTH_HEADERS,
        payload: { items: [{ ticker: 'TSLA', sortOrder: 0, sectionId: sectionAId }] },
      });

      // Move to section B
      const res = await ctx.server.inject({
        method: 'PATCH',
        url: '/api/watchlist/reorder',
        headers: AUTH_HEADERS,
        payload: { items: [{ ticker: 'TSLA', sortOrder: 0, sectionId: sectionBId }] },
      });

      expect(res.statusCode).toBe(200);

      // Verify
      const listRes = await ctx.server.inject({
        method: 'GET',
        url: '/api/watchlist',
        headers: AUTH_HEADERS,
      });

      const items = listRes.json().data;
      expect(items[0].sectionId).toBe(sectionBId);
    });

    it('handles empty items array', async () => {
      const res = await ctx.server.inject({
        method: 'PATCH',
        url: '/api/watchlist/reorder',
        headers: AUTH_HEADERS,
        payload: { items: [] },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  // ── GET /api/watchlist returns new fields ─────────────────────────

  describe('GET /api/watchlist includes sectionId and sortOrder', () => {
    it('returns sectionId and sortOrder', async () => {
      // Create section and add ticker
      const secRes = await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist/sections',
        headers: AUTH_HEADERS,
        payload: { name: 'Test' },
      });
      const sectionId = secRes.json().id;

      await ctx.server.inject({
        method: 'POST',
        url: '/api/watchlist',
        headers: AUTH_HEADERS,
        payload: { ticker: 'NVDA' },
      });

      // Assign to section
      await ctx.server.inject({
        method: 'PATCH',
        url: '/api/watchlist/reorder',
        headers: AUTH_HEADERS,
        payload: { items: [{ ticker: 'NVDA', sortOrder: 5, sectionId }] },
      });

      const res = await ctx.server.inject({
        method: 'GET',
        url: '/api/watchlist',
        headers: AUTH_HEADERS,
      });

      const items = res.json().data;
      expect(items[0].sectionId).toBe(sectionId);
      expect(items[0].sortOrder).toBe(5);
    });
  });
});
