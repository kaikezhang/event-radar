import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeCloseServer } from './helpers/test-db.js';

describe('buildApp public route registration', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('includes scanner events in the auth public routes list', async () => {
    const registerAuthPlugin = vi.fn(async () => {});

    vi.doMock('../plugins/auth.js', async () => {
      const actual = await vi.importActual<typeof import('../plugins/auth.js')>('../plugins/auth.js');

      return {
        ...actual,
        registerAuthPlugin,
      };
    });

    const { buildApp } = await import('../app.js');
    const ctx = buildApp({ logger: false, apiKey: 'test-api-key' });

    await ctx.server.ready();

    expect(registerAuthPlugin).toHaveBeenCalledTimes(1);
    expect(registerAuthPlugin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        publicRoutes: expect.arrayContaining(['/api/v1/scanners/:name/events']),
      }),
    );

    await safeCloseServer(ctx.server);
  });
});
