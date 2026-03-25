import type { FastifyInstance } from 'fastify';
import type { ScannerRegistry, IMarketRegimeService } from '@event-radar/shared';
import type { Database } from './db/connection.js';
import type { PriceBatchService, PriceChartService } from './routes/price.js';
import type { IDeliveryKillSwitch } from './services/delivery-kill-switch.js';
import type { HealthMonitorService } from './services/health-monitor.js';
import type { MarketContextCache } from './services/market-context-cache.js';
import type { MarketDataCache } from './services/market-data-cache.js';
import { registerEventRoutes } from './routes/events.js';
import { registerScannerRoutes } from './routes/scanners.js';
import { registerOutcomeRoutes } from './routes/outcomes.js';
import { registerAlertScorecardRoutes } from './routes/alert-scorecard.js';
import { registerWatchlistRoutes } from './routes/watchlist.js';
import { registerTickerRoutes } from './routes/tickers.js';
import { registerOnboardingRoutes } from './routes/onboarding.js';
import { registerPushSubscriptionRoutes } from './routes/push-subscriptions.js';
import { registerPreferencesRoutes } from './routes/preferences.js';
import { registerEventsHistoryRoutes } from './routes/events-history.js';
import { registerEventImpactRoutes } from './routes/event-impact.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerDeliveryFeedRoutes } from './routes/delivery-feed.js';
import { registerPriceRoutes } from './routes/price.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerNotificationSettingsRoutes } from './routes/notification-settings.js';
import { registerCalendarRoutes } from './routes/calendar.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerApiDocsRoutes } from './routes/api-docs.js';

export interface RouteRegistrationOptions {
  server: FastifyInstance;
  db?: Database;
  apiKey: string;
  registry: ScannerRegistry;
  marketRegimeService: IMarketRegimeService;
  tickerMarketDataCache?: Pick<MarketDataCache, 'getOrFetch'>;
  marketCache?: MarketContextCache;
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
    marketRegimeService,
    tickerMarketDataCache,
    marketCache,
    killSwitch,
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
  registerHealthRoutes(server, {
    db,
    registry,
    version,
    startTime,
  });

  // Register event query routes if db is available
  if (db) {
    registerEventRoutes(server, db, {
      apiKey,
      marketDataCache: tickerMarketDataCache,
    });
    registerEventsHistoryRoutes(server, db, { apiKey });
    registerEventImpactRoutes(server, db, { apiKey });
    registerAlertScorecardRoutes(server, db, { apiKey });
    registerOutcomeRoutes(server, db);
    registerWatchlistRoutes(server, db, { apiKey });
    registerTickerRoutes(server, db);
    registerOnboardingRoutes(server, db, { apiKey });
    registerPushSubscriptionRoutes(server, db, { apiKey });
    registerPreferencesRoutes(server, db, { apiKey });
    registerNotificationSettingsRoutes(server, db, { apiKey });
    registerCalendarRoutes(server, db, { apiKey });
    registerAuthRoutes(server, db);
  }

  // Register scanner health routes
  registerScannerRoutes(server, registry, db);
  registerDeliveryFeedRoutes(server, db);

  // Register dashboard route
  registerDashboardRoutes(server, {
    apiKey,
    db,
    scannerRegistry: registry,
    marketCache: marketCache ?? undefined,
    marketRegimeService,
    killSwitch,
    startTime,
    version,
  });
}
