import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

  it('returns version as a semver string', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();

    expect(typeof body.version).toBe('string');
    expect(body.version).toMatch(
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/,
    );
  });

  it('returns a public /api/health payload with service status and scanner counts', async () => {
    vi.spyOn(ctx.registry, 'healthAll').mockReturnValue([
      { scanner: 'sec-edgar', status: 'healthy', errorCount: 0, lastScanAt: null },
      { scanner: 'fedwatch', status: 'degraded', errorCount: 1, lastScanAt: null },
      { scanner: 'dummy', status: 'down', errorCount: 3, lastScanAt: null },
    ]);

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'healthy',
      version: expect.any(String),
      uptime: expect.any(Number),
      timestamp: expect.any(String),
      services: {
        database: 'unknown',
        scanners: {
          active: 2,
          total: 3,
        },
      },
    });
  });
});
