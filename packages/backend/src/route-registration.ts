import type { FastifyInstance } from 'fastify';
import type { ScannerRegistry, EventBus, IMarketRegimeService } from '@event-radar/shared';
import type { Database } from './db/connection.js';
import type { PriceChartService } from './routes/price.js';
import type { IDeliveryKillSwitch } from './services/delivery-kill-switch.js';
import type { HealthMonitorService } from './services/health-monitor.js';
import type { MarketContextCache } from './services/market-context-cache.js';
import type { MarketDataCache } from './services/market-data-cache.js';
import { registerEventRoutes } from './routes/events.js';
import { registerScannerRoutes } from './routes/scanners.js';
import { registerOutcomeRoutes } from './routes/outcomes.js';
import { registerWinRateRoutes } from './routes/win-rate.js';
import { registerStoryGroupRoutes } from './routes/story-groups.js';
import { registerAccuracyRoutes } from './routes/accuracy.js';
import { registerAlertScorecardRoutes } from './routes/alert-scorecard.js';
import { registerAdaptiveRoutes } from './routes/adaptive.js';
import { registerFeedbackRoutes } from './routes/feedback.js';
import { registerRulesRoutes } from './routes/rules.js';
import { registerAlertBudgetRoutes } from './routes/alert-budget.js';
import { registerWatchlistRoutes } from './routes/watchlist.js';
import { registerWatchlistSectionRoutes } from './routes/watchlist-sections.js';
import { registerTickerRoutes } from './routes/tickers.js';
import { registerOnboardingRoutes } from './routes/onboarding.js';
import { registerPushSubscriptionRoutes } from './routes/push-subscriptions.js';
import { registerPreferencesRoutes } from './routes/preferences.js';
import { registerEventsHistoryRoutes } from './routes/events-history.js';
import { registerEventImpactRoutes } from './routes/event-impact.js';
import { registerHistoricalRoutes } from './routes/historical.js';
import { registerClassifyRoute } from './routes/classify.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerAiObservabilityRoutes } from './routes/ai-observability.js';
import { registerDeliveryFeedRoutes } from './routes/delivery-feed.js';
import { registerJudgeRoutes } from './routes/judge.js';
import { registerPriceRoutes } from './routes/price.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerRegimeRoutes } from './routes/regime.js';
import { registerAdminDeliveryRoutes } from './routes/admin-delivery.js';
import { createLLMProvider } from './services/llm-provider.js';
import type { Rule } from '@event-radar/shared';
import { DEFAULT_RULES } from './pipeline/default-rules.js';

export interface RouteRegistrationOptions {
  server: FastifyInstance;
  db?: Database;
  apiKey: string;
  eventBus: EventBus;
  registry: ScannerRegistry;
  marketRegimeService: IMarketRegimeService;
  tickerMarketDataCache?: Pick<MarketDataCache, 'getOrFetch'>;
  marketCache?: MarketContextCache;
  killSwitch?: IDeliveryKillSwitch;
  healthMonitor?: HealthMonitorService;
  priceChartService?: PriceChartService;
  startTime: number;
  version: string;
  rules?: Rule[];
}

export function registerAllRoutes(options: RouteRegistrationOptions): void {
  const {
    server,
    db,
    apiKey,
    eventBus,
    registry,
    marketRegimeService,
    tickerMarketDataCache,
    marketCache,
    killSwitch,
    healthMonitor,
    priceChartService,
    startTime,
    version,
    rules,
  } = options;

  registerPriceRoutes(server, {
    apiKey,
    priceChartService,
  });
  registerRegimeRoutes(server, {
    apiKey,
    marketRegimeService,
  });

  // Register event query routes if db is available
  if (db) {
    registerEventRoutes(server, db, {
      marketDataCache: tickerMarketDataCache,
    });
    registerEventsHistoryRoutes(server, db, { apiKey });
    registerEventImpactRoutes(server, db, { apiKey });
    registerHistoricalRoutes(server, db, { apiKey });
    registerAlertScorecardRoutes(server, db, { apiKey });
    registerOutcomeRoutes(server, db);
    registerWinRateRoutes(server, db);
    registerStoryGroupRoutes(server, db);
    registerAccuracyRoutes(server, db, { apiKey });
    registerAdaptiveRoutes(server, db, { apiKey });
    registerFeedbackRoutes(server, db, { apiKey });
    registerRulesRoutes(server, db, { apiKey });
    registerAlertBudgetRoutes(server, db, { apiKey, eventBus });
    registerWatchlistSectionRoutes(server, db, { apiKey });
    registerWatchlistRoutes(server, db, { apiKey });
    registerTickerRoutes(server, db);
    registerOnboardingRoutes(server, db, { apiKey });
    registerPushSubscriptionRoutes(server, db, { apiKey });
    registerPreferencesRoutes(server, db, { apiKey });
    registerAuthRoutes(server, db);
    if (killSwitch && healthMonitor) {
      registerAdminDeliveryRoutes(server, {
        apiKey,
        killSwitch,
        healthMonitor,
      });
    }
  }

  // Register classify debug route (works without DB)
  registerClassifyRoute(server, {
    apiKey,
    llmProvider: createLLMProvider(),
    rules: rules ?? DEFAULT_RULES,
  });

  // Register scanner health routes
  registerScannerRoutes(server, registry, db);
  registerDeliveryFeedRoutes(server, db);
  registerJudgeRoutes(server, db);

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

  // Register AI observability routes
  registerAiObservabilityRoutes(server, {
    apiKey,
    db,
    scannerRegistry: registry,
    startTime,
  });
}
