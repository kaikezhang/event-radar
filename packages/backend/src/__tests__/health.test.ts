import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type AppContext } from '../app.js';
import { safeCloseServer } from './helpers/test-db.js';

describe('GET /health', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = buildApp({ logger: false });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('returns 200 with a stable ISO startedAt timestamp', async () => {
    const firstResponse = await ctx.server.inject({
      method: 'GET',
      url: '/health',
    });
    const secondResponse = await ctx.server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);

    const firstBody = firstResponse.json();
    const secondBody = secondResponse.json();

    expect(typeof firstBody.startedAt).toBe('string');
    expect(firstBody.startedAt).toBe(new Date(firstBody.startedAt).toISOString());
    expect(secondBody.startedAt).toBe(firstBody.startedAt);
  });

  it('returns uptimeSeconds as a non-negative number', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();

    expect(typeof body.uptimeSeconds).toBe('number');
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
