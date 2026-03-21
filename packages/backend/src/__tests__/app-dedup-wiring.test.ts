import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeCloseServer } from './helpers/test-db.js';

describe('buildApp deduplicator wiring', () => {
  afterEach(() => {
    delete process.env.DEDUP_REDIS_ENABLED;
    delete process.env.DEDUP_REDIS_URL;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('does not pass a Redis URL when dedup Redis is disabled', async () => {
    const ctor = vi.fn();

    vi.doMock('../pipeline/deduplicator.js', () => ({
      EventDeduplicator: class {
        constructor(options: unknown) {
          ctor(options);
        }

        shutdown = vi.fn(async () => undefined);

        get activeStoryCount() {
          return 0;
        }
      },
    }));

    const { buildApp } = await import('../app.js');
    const ctx = buildApp({ logger: false, apiKey: 'test-api-key' });
    await ctx.server.ready();

    expect(ctor).toHaveBeenCalledWith(expect.objectContaining({
      db: undefined,
    }));
    expect(ctor).toHaveBeenCalledWith(expect.not.objectContaining({
      redisUrl: expect.anything(),
    }));

    await safeCloseServer(ctx.server);
  });

  it('passes the default Redis URL when dedup Redis is enabled without override', async () => {
    process.env.DEDUP_REDIS_ENABLED = 'true';
    const ctor = vi.fn();

    vi.doMock('../pipeline/deduplicator.js', () => ({
      EventDeduplicator: class {
        constructor(options: unknown) {
          ctor(options);
        }

        shutdown = vi.fn(async () => undefined);

        get activeStoryCount() {
          return 0;
        }
      },
    }));

    const { buildApp } = await import('../app.js');
    const ctx = buildApp({ logger: false, apiKey: 'test-api-key' });
    await ctx.server.ready();

    expect(ctor).toHaveBeenCalledWith(expect.objectContaining({
      redisUrl: 'redis://localhost:6379',
    }));

    await safeCloseServer(ctx.server);
  });

  it('passes the configured Redis URL when dedup Redis is enabled', async () => {
    process.env.DEDUP_REDIS_ENABLED = 'true';
    process.env.DEDUP_REDIS_URL = 'redis://cache.internal:6380/4';
    const ctor = vi.fn();

    vi.doMock('../pipeline/deduplicator.js', () => ({
      EventDeduplicator: class {
        constructor(options: unknown) {
          ctor(options);
        }

        shutdown = vi.fn(async () => undefined);

        get activeStoryCount() {
          return 0;
        }
      },
    }));

    const { buildApp } = await import('../app.js');
    const ctx = buildApp({ logger: false, apiKey: 'test-api-key' });
    await ctx.server.ready();

    expect(ctor).toHaveBeenCalledWith(expect.objectContaining({
      redisUrl: 'redis://cache.internal:6380/4',
    }));

    await safeCloseServer(ctx.server);
  });
});
