import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeCloseServer } from './helpers/test-db.js';

describe('buildApp market data wiring', () => {
  afterEach(() => {
    delete process.env.ALPHA_VANTAGE_API_KEY;
    delete process.env.NODE_ENV;
    delete process.env.VITEST;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('does not create the ticker market data provider when no API key is configured', async () => {
    const createMarketDataProvider = vi.fn();
    const marketDataCacheStart = vi.fn();

    vi.doMock('../services/create-market-data-provider.js', () => ({
      createMarketDataProvider,
    }));
    vi.doMock('../services/market-data-cache.js', () => ({
      MarketDataCache: class {
        start = marketDataCacheStart;
      },
    }));

    const { buildApp } = await import('../app.js');
    const ctx = buildApp({ logger: false, apiKey: 'test-api-key' });
    await ctx.server.ready();

    expect(createMarketDataProvider).not.toHaveBeenCalled();
    expect(marketDataCacheStart).not.toHaveBeenCalled();

    await safeCloseServer(ctx.server);
  });

  it('creates and starts the ticker market data cache when an API key is configured', async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test-alpha-key';
    process.env.VITEST = 'false';
    process.env.NODE_ENV = 'production';

    const marketDataProvider = { getQuote: vi.fn(), getIndicators: vi.fn() };
    const createMarketDataProvider = vi.fn(() => marketDataProvider);
    const marketDataCacheStart = vi.fn();

    vi.doMock('../services/create-market-data-provider.js', () => ({
      createMarketDataProvider,
    }));
    vi.doMock('../services/market-data-cache.js', () => ({
      MarketDataCache: class {
        constructor(
          public readonly provider: unknown,
          public readonly config: { refreshIntervalMs?: number } | undefined,
        ) {}

        start = marketDataCacheStart;
      },
    }));

    const { buildApp } = await import('../app.js');
    const ctx = buildApp({
      logger: false,
      apiKey: 'test-api-key',
      db: {} as never,
    });
    await ctx.server.ready();

    expect(createMarketDataProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-alpha-key',
      }),
    );
    expect(marketDataCacheStart).toHaveBeenCalledOnce();

    await safeCloseServer(ctx.server);
  });

  it('passes the ticker market data cache into the historical enricher when enabled', async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test-alpha-key';
    process.env.VITEST = 'false';
    process.env.NODE_ENV = 'production';

    const historicalCtor = vi.fn();
    const marketDataProvider = { getQuote: vi.fn(), getIndicators: vi.fn() };
    const marketDataCache = { getOrFetch: vi.fn(), start: vi.fn() };

    vi.doMock('../services/create-market-data-provider.js', () => ({
      createMarketDataProvider: vi.fn(() => marketDataProvider),
    }));
    vi.doMock('../services/market-data-cache.js', () => ({
      MarketDataCache: class {
        constructor() {
          return marketDataCache;
        }
      },
    }));
    vi.doMock('../pipeline/historical-enricher.js', async () => {
      const actual = await vi.importActual<typeof import('../pipeline/historical-enricher.js')>(
        '../pipeline/historical-enricher.js',
      );

      return {
        ...actual,
        HistoricalEnricher: class {
          constructor(
            db: unknown,
            marketCache: unknown,
            config: Record<string, unknown> | undefined,
          ) {
            historicalCtor(db, marketCache, config);
          }

          enrich = vi.fn();
        },
      };
    });

    const { buildApp } = await import('../app.js');
    const ctx = buildApp({
      logger: false,
      apiKey: 'test-api-key',
      db: {} as never,
    });
    await ctx.server.ready();

    expect(historicalCtor).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        marketDataCache,
      }),
    );

    await safeCloseServer(ctx.server);
  });
});
