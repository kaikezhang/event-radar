import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp, type AppContext } from '../app.js';
import { safeCloseServer } from './helpers/test-db.js';

describe('GET /api/health/ping', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = buildApp({ logger: false });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('should return pong with timestamp', async () => {
    const before = Date.now();
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/health/ping',
    });
    const after = Date.now();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.pong).toBe(true);
    expect(body.timestamp).toBeGreaterThanOrEqual(before);
    expect(body.timestamp).toBeLessThanOrEqual(after);
  });
});
