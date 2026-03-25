import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { safeCloseServer } from './helpers/test-db.js';

describe('route registration dead routes', () => {
  it.each([
    '/api/v1/dashboard',
    '/api/v1/delivery/feed',
    '/api/v1/events/history',
    '/api/v1/events/history/sources',
    '/api/v1/events/history/types',
    '/api/v1/events/impact?ticker=AAPL',
    '/api/scanners/status',
    '/api/v1/scanners/sec-edgar/events',
  ])('returns 404 for removed route %s', async (url) => {
    const ctx = buildApp({ logger: false, apiKey: 'test-api-key' });
    await ctx.server.ready();

    try {
      const response = await ctx.server.inject({
        method: 'GET',
        url,
      });

      expect(response.statusCode).toBe(404);
    } finally {
      await safeCloseServer(ctx.server);
    }
  });
});
