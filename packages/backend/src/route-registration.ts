import type { FastifyInstance } from 'fastify';
import type { ScannerRegistry } from '@event-radar/shared';
import type { Database } from './db/connection.js';
import type { PriceBatchService, PriceChartService } from './routes/price.js';
import type { IDeliveryKillSwitch } from './services/delivery-kill-switch.js';
import type { HealthMonitorService } from './services/health-monitor.js';
import type { MarketDataCache } from './services/market-data-cache.js';
import { registerEventRoutes } from './routes/events.js';
import { registerFeedRoutes } from './routes/feed.js';
import { registerOutcomeRoutes } from './routes/outcomes.js';
import { registerWatchlistRoutes } from './routes/watchlist.js';
import { registerTickerRoutes } from './routes/tickers.js';
import { registerPushSubscriptionRoutes } from './routes/push-subscriptions.js';
import { registerPriceRoutes } from './routes/price.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerApiDocsRoutes } from './routes/api-docs.js';

export interface RouteRegistrationOptions {
  server: FastifyInstance;
  db?: Database;
  apiKey: string;
  registry: ScannerRegistry;
  tickerMarketDataCache?: Pick<MarketDataCache, 'getOrFetch'>;
  killSwitch?: IDeliveryKillSwitch;
  healthMonitor?: HealthMonitorService;
  priceChartService?: PriceChartService;
  priceBatchService?: PriceBatchService;
  startTime: number;
  version: string;
}

export function registerAllRoutes(options: RouteRegistrationOptions): void {
  const {
    server,
    db,
    apiKey,
    registry,
    tickerMarketDataCache,
    priceChartService,
    priceBatchService,
    startTime,
    version,
  } = options;

  registerPriceRoutes(server, {
    apiKey,
    priceChartService,
    priceBatchService,
    marketDataCache: tickerMarketDataCache,
  });
  registerApiDocsRoutes(server);
  registerFeedRoutes(server, db);
  registerHealthRoutes(server, {
    db,
    registry,
    version,
    startTime,
  });

  if (!db) {
    return;
  }

  registerEventRoutes(server, db, {
    apiKey,
    marketDataCache: tickerMarketDataCache,
  });
  registerOutcomeRoutes(server, db);
  registerWatchlistRoutes(server, db, { apiKey });
  registerTickerRoutes(server, db);
  registerPushSubscriptionRoutes(server, db, { apiKey });
  registerAuthRoutes(server, db);
}
