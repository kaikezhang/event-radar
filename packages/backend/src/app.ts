import Fastify, { type FastifyInstance } from 'fastify';
import backendPackage from '../package.json' with { type: 'json' };
import {
  InMemoryEventBus,
  ScannerRegistry,
  RawEventSchema,
  type EventBus,
  type IMarketRegimeService,
  type Rule,
} from '@event-radar/shared';
import {
  AlertRouter,
  BarkPusher,
  DiscordWebhook,
  TelegramDelivery,
  WebPushChannel,
  WebhookDelivery,
  type AlertRouter as AlertRouterType,
} from '@event-radar/delivery';
import { DummyScanner } from './scanners/dummy-scanner.js';
import { AnalystScanner } from './scanners/analyst-scanner.js';
import { EarningsScanner } from './scanners/earnings-scanner.js';
import { TruthSocialScanner } from './scanners/truth-social-scanner.js';
import { XScanner } from './scanners/x-scanner.js';
import { RedditScanner } from './scanners/reddit-scanner.js';
import { StockTwitsScanner } from './scanners/stocktwits-scanner.js';
import { EconCalendarScanner } from './scanners/econ-calendar-scanner.js';
import { FedWatchScanner } from './scanners/fedwatch-scanner.js';
import { BreakingNewsScanner } from './scanners/breaking-news-scanner.js';
import { CongressScanner } from './scanners/congress-scanner.js';
import { UnusualOptionsScanner } from './scanners/options-scanner.js';
import { ShortInterestScanner } from './scanners/short-interest-scanner.js';
import { FdaScanner } from './scanners/fda-scanner.js';
import { WhiteHouseScanner } from './scanners/whitehouse-scanner.js';
import { DojScanner } from './scanners/doj-scanner.js';
import { FederalRegisterScanner } from './scanners/federal-register-scanner.js';
import { NewswireScanner } from './scanners/newswire-scanner.js';
import { SecEdgarScanner } from './scanners/sec-edgar-scanner.js';
import { IrMonitorScanner } from './scanners/ir-monitor-scanner.js';
import { HaltScanner } from './scanners/halt-scanner.js';
import { DilutionScanner } from './scanners/dilution-scanner.js';
import { type Database } from './db/connection.js';
import * as schema from './db/schema.js';
import { storeEvent } from './db/event-store.js';
import { sql } from 'drizzle-orm';
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
import { registerPushSubscriptionRoutes } from './routes/push-subscriptions.js';
import { registerEventsHistoryRoutes } from './routes/events-history.js';
import { registerEventImpactRoutes } from './routes/event-impact.js';
import { registerHistoricalRoutes } from './routes/historical.js';
import { registerClassifyRoute } from './routes/classify.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerAiObservabilityRoutes } from './routes/ai-observability.js';
import { registerDeliveryFeedRoutes } from './routes/delivery-feed.js';
import { registerJudgeRoutes } from './routes/judge.js';
import { registerPriceRoutes, type PriceChartService } from './routes/price.js';
import { MarketRegimeService } from './services/market-regime.js';
import { registerRegimeRoutes } from './routes/regime.js';
import { DeliveryKillSwitch, type IDeliveryKillSwitch } from './services/delivery-kill-switch.js';
import { HealthMonitorService } from './services/health-monitor.js';
import { registerAdminDeliveryRoutes } from './routes/admin-delivery.js';
import { createLLMProvider, OpenAIProvider } from './services/llm-provider.js';
import { RuleEngine } from './pipeline/rule-engine.js';
import { DEFAULT_RULES } from './pipeline/default-rules.js';
import { LlmClassifier } from './pipeline/llm-classifier.js';
import type { LlmProvider } from './pipeline/llm-provider.js';
import {
  registry as metricsRegistry,
  eventsProcessedTotal,
  eventsBySource,
  eventsBySeverity,
  deliveriesSentTotal,
  deliveriesByChannel,
  deliveryLatencySeconds,
  processingDurationSeconds,
  llmClassificationsTotal,
  eventsDeduplicatedTotal,
  activeStories,
  pipelineFunnelTotal,
  alertFilterTotal,
  historicalEnrichmentTotal,
  historicalEnrichmentDurationSeconds,
  gracePeriodSuppressedTotal,
  deliveryErrorsTotal,
  llmEnrichmentTotal,
  llmEnrichmentDurationSeconds,
} from './metrics.js';
import { EventDeduplicator } from './pipeline/deduplicator.js';
import { AlertFilter, type AlertFilterConfig } from './pipeline/alert-filter.js';
import { LLMEnricher, type LLMEnricherConfig } from './pipeline/llm-enricher.js';
import { HistoricalEnricher } from './pipeline/historical-enricher.js';
import { AuditLog } from './pipeline/audit-log.js';
import { LLMGatekeeper } from './pipeline/llm-gatekeeper.js';
import { prewarmSectorCache } from './pipeline/event-type-mapper.js';
import { registerAuthPlugin, generateApiKey } from './plugins/auth.js';
import { registerWebsocketPlugin, toLiveFeedEvent } from './plugins/websocket.js';
import { OutcomeTracker } from './services/outcome-tracker.js';
import { MarketContextCache } from './services/market-context-cache.js';
import { MarketDataCache } from './services/market-data-cache.js';
import { createMarketDataProvider } from './services/create-market-data-provider.js';
import { ClassificationAccuracyService } from './services/classification-accuracy.js';
import { AdaptiveClassifierService } from './services/adaptive-classifier.js';
import { PatternMatcher } from './services/pattern-matcher.js';
import { createPushSubscriptionStore } from './services/push-subscription-store.js';
import type {
  AccuracyDirection,
  ClassificationPrediction,
  ClassificationResult,
  LlmClassificationResult,
  Result,
  RawEvent,
} from '@event-radar/shared';

/** Primary sources — used for circuit breaker fallback (pass primary, block secondary) */
const PRIMARY_SOURCES_SET = new Set([
  'whitehouse', 'congress', 'sec-edgar', 'fda', 'doj-antitrust',
  'unusual-options', 'truth-social', 'x-scanner', 'short-interest', 'warn',
  'federal-register', 'sec-regulatory', 'ftc', 'fed', 'treasury',
  'commerce', 'cfpb',
]);

/** Categorize alert filter reason string into a metric-friendly bucket */
function categorizeFilterReason(reason: string): string {
  if (reason.includes('stale')) return 'stale';
  if (reason.includes('retrospective')) return 'retrospective';
  if (reason.includes('keyword')) return 'keyword';
  if (reason.includes('cooldown')) return 'cooldown';
  if (reason.includes('social')) return 'social_noise';
  if (reason.includes('dummy')) return 'dummy';
  if (reason.includes('newswire')) return 'newswire_noise';
  if (reason.includes('insider')) return 'insider_threshold';
  if (reason.includes('primary source')) return 'primary_pass';
  if (reason.includes('calendar')) return 'calendar';
  if (reason.includes('analyst')) return 'analyst';
  if (reason.includes('default')) return 'default';
  return 'other';
}

export interface AppContext {
  server: FastifyInstance;
  eventBus: EventBus;
  registry: ScannerRegistry;
  alertRouter: AlertRouterType;
  ruleEngine: RuleEngine;
  llmClassifier?: LlmClassifier;
  deduplicator: EventDeduplicator;
  alertFilter: AlertFilter;
  llmEnricher: LLMEnricher;
  historicalEnricher?: Pick<HistoricalEnricher, 'enrich'>;
  killSwitch?: IDeliveryKillSwitch;
  healthMonitor?: HealthMonitorService;
}

type HistoricalEnricherLike = Pick<HistoricalEnricher, 'enrich'>;

interface OutcomeProcessingLoopLogger {
  info(message: string): void;
  error(message: string, error: unknown): void;
}

interface OutcomeProcessingLoopOptions {
  outcomeTracker: Pick<OutcomeTracker, 'processOutcomes'>;
  startupDelayMs: number;
  intervalMs: number;
  logger: OutcomeProcessingLoopLogger;
}

interface OutcomeProcessingLoopHandle {
  stop(): void;
}

export function startOutcomeProcessingLoop(
  options: OutcomeProcessingLoopOptions,
): OutcomeProcessingLoopHandle {
  const {
    outcomeTracker,
    startupDelayMs,
    intervalMs,
    logger,
  } = options;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  const timeoutId = setTimeout(() => {
    if (stopped) {
      return;
    }

    logger.info('Starting periodic outcome backfill');
    void processOutcomesPeriodically();
    intervalId = setInterval(() => {
      void processOutcomesPeriodically();
    }, intervalMs);
  }, startupDelayMs);
  let stopped = false;
  let isProcessing = false;

  const processOutcomesPeriodically = async () => {
    if (stopped || isProcessing) {
      return;
    }

    isProcessing = true;
    try {
      await outcomeTracker.processOutcomes();
    } catch (error: unknown) {
      logger.error('Outcome processing failed', error);
    } finally {
      isProcessing = false;
    }
  };

  return {
    stop() {
      stopped = true;
      clearTimeout(timeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
    },
  };
}

function buildAlertRouter(db?: Database): AlertRouterType {
  const barkKey = process.env.BARK_KEY;
  const barkServerUrl = process.env.BARK_SERVER_URL;
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;
  const webhookUrl = process.env.WEBHOOK_URL;
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const webPushVapidSubject = process.env.WEB_PUSH_VAPID_SUBJECT;
  const webPushVapidPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const webPushVapidPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const pushSubscriptionStore = db ? createPushSubscriptionStore(db) : undefined;

  return new AlertRouter({
    bark: barkKey
      ? new BarkPusher({ key: barkKey, serverUrl: barkServerUrl })
      : undefined,
    discord: discordWebhookUrl
      ? new DiscordWebhook({ webhookUrl: discordWebhookUrl })
      : undefined,
    telegram:
      telegramBotToken && telegramChatId
        ? new TelegramDelivery({
            botToken: telegramBotToken,
            chatId: telegramChatId,
            minSeverity: 'LOW',
            enabled: true,
          })
        : undefined,
    webhook:
      webhookUrl && webhookSecret
        ? new WebhookDelivery({
            url: webhookUrl,
            secret: webhookSecret,
            minSeverity: 'LOW',
            enabled: true,
          })
        : undefined,
    webPush:
      pushSubscriptionStore && webPushVapidSubject && webPushVapidPublicKey && webPushVapidPrivateKey
        ? new WebPushChannel({
            vapidSubject: webPushVapidSubject,
            vapidPublicKey: webPushVapidPublicKey,
            vapidPrivateKey: webPushVapidPrivateKey,
            store: pushSubscriptionStore,
          })
        : undefined,
  });
}

export function buildApp(options?: {
  logger?: boolean;
  alertRouter?: AlertRouterType;
  db?: Database;
  rules?: Rule[];
  llmProvider?: LlmProvider;
  apiKey?: string;
  alertFilterConfig?: AlertFilterConfig;
  llmEnricherConfig?: LLMEnricherConfig;
  historicalEnricherConfig?: ConstructorParameters<typeof HistoricalEnricher>[2];
  historicalEnricher?: HistoricalEnricherLike;
  priceChartService?: PriceChartService;
  marketRegimeService?: IMarketRegimeService;
  killSwitch?: IDeliveryKillSwitch;
}): AppContext {
  const server = Fastify({ logger: options?.logger ?? true });
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const eventBus = new InMemoryEventBus();
  const registry = new ScannerRegistry();
  const db = options?.db;
  const alertRouter = options?.alertRouter ?? buildAlertRouter(db);
  const ruleEngine = new RuleEngine();
  const llmClassifier = options?.llmProvider
    ? new LlmClassifier({ provider: options.llmProvider })
    : undefined;
  const marketRegimeService = options?.marketRegimeService ?? new MarketRegimeService({
    logger: server.log,
  });
  const deduplicator = new EventDeduplicator({ db });
  const alertFilter = new AlertFilter(options?.alertFilterConfig);
  const auditLog = new AuditLog(db);
  const gatekeeperApiKey = process.env.LLM_GATEKEEPER_API_KEY;
  const gatekeeperModel = process.env.LLM_GATEKEEPER_MODEL ?? 'gpt-4o-mini';
  const llmGatekeeper = new LLMGatekeeper({
    provider: gatekeeperApiKey
      ? new OpenAIProvider({ apiKey: gatekeeperApiKey, model: gatekeeperModel })
      : undefined,
    enabled: process.env.LLM_GATEKEEPER_ENABLED === 'true',
  });
  const accuracyService = db
    ? new ClassificationAccuracyService(db, { eventBus })
    : undefined;
  const adaptiveService = db
    ? new AdaptiveClassifierService(db, { accuracyService, eventBus })
    : undefined;
  const outcomeTracker =
    db != null
      ? new OutcomeTracker(db, undefined, accuracyService)
      : undefined;
  const tickerMarketDataProvider = process.env.ALPHA_VANTAGE_API_KEY
    ? createMarketDataProvider({
      apiKey: process.env.ALPHA_VANTAGE_API_KEY,
    })
    : undefined;

  const marketCache = db
    ? new MarketContextCache({ refreshIntervalMs: 300_000 })
    : undefined;
  const tickerMarketDataCache = tickerMarketDataProvider
    ? new MarketDataCache({
      provider: tickerMarketDataProvider,
      refreshIntervalMs: 300_000,
    })
    : undefined;
  const patternMatcher = db ? new PatternMatcher(db) : undefined;
  const llmEnricher = new LLMEnricher(options?.llmEnricherConfig, {
    regimeService: marketRegimeService,
    marketDataCache: tickerMarketDataCache,
    patternMatcher,
    marketSnapshotProvider: marketCache,
  });
  const historicalEnricher = options?.historicalEnricher
    ?? (db && marketCache
      ? new HistoricalEnricher(db, marketCache, {
        ...options?.historicalEnricherConfig,
        marketDataCache:
          options?.historicalEnricherConfig?.marketDataCache ?? tickerMarketDataCache,
      })
      : undefined);
  const killSwitch = options?.killSwitch ?? (db ? new DeliveryKillSwitch(db) : undefined);
  const healthMonitor = db ? new HealthMonitorService(db, eventBus, { killSwitch }) : undefined;

  const websocketClientState = { count: 0 };
  const historicalEnrichmentEnabled =
    options?.historicalEnricherConfig?.enabled
    ?? process.env.HISTORICAL_ENRICHMENT_ENABLED !== 'false';
  const shouldWarmHistoricalResources =
    db != null &&
    marketCache != null &&
    historicalEnrichmentEnabled &&
    historicalEnricher instanceof HistoricalEnricher &&
    process.env.VITEST !== 'true' &&
    process.env.NODE_ENV !== 'test';

  if (shouldWarmHistoricalResources) {
    marketCache.start();
    tickerMarketDataCache?.start();
    void prewarmSectorCache(db).catch((error) => {
      console.error(
        '[event-type-mapper] Failed to prewarm sector cache:',
        error instanceof Error ? error.message : error,
      );
    });
  }

  // Register API key auth plugin
  const apiKey = options?.apiKey ?? process.env.API_KEY ?? generateApiKey();
  server.decorate('websocketClientCount', () => websocketClientState.count);
  server.register(async () => {
    await registerAuthPlugin(server, {
      apiKey,
      publicRoutes: [
        '/health',
        '/ws/events',
        '/api/health/ping',
        '/metrics',
        '/api/events/ingest',
        '/api/v1/dashboard',
        '/api/v1/feed',
        '/api/v1/delivery/feed',
        '/api/v1/scanners/:name/events',
        '/api/v1/audit',
        '/api/v1/audit/stats',
        '/api/health/delivery-stats',
      ],
    });
  });

  server.register(registerWebsocketPlugin, {
    apiKey,
    clientState: websocketClientState,
    eventBus,
  });


  // API key logged at startup (redacted for security)
  console.log(`API Key: ${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`);

  ruleEngine.loadRules(options?.rules ?? DEFAULT_RULES);

  // DummyScanner only when explicitly enabled (default off)
  if (process.env.DUMMY_SCANNER_ENABLED === 'true') {
    registry.register(new DummyScanner(eventBus));
  }

  if (process.env.TRUTH_SOCIAL_ENABLED === 'true') {
    registry.register(new TruthSocialScanner(eventBus));
  }
  if (process.env.X_SCANNER_ENABLED === 'true') {
    registry.register(new XScanner(eventBus));
  }
  if (process.env.REDDIT_ENABLED !== 'false') {
    registry.register(new RedditScanner(eventBus));
  }
  if (process.env.STOCKTWITS_ENABLED !== 'false') {
    registry.register(new StockTwitsScanner(eventBus));
  }
  if (process.env.ECON_CALENDAR_ENABLED !== 'false') {
    registry.register(new EconCalendarScanner(eventBus));
  }
  if (process.env.FEDWATCH_ENABLED !== 'false') {
    registry.register(new FedWatchScanner(eventBus));
  }
  if (process.env.BREAKING_NEWS_ENABLED !== 'false') {
    registry.register(new BreakingNewsScanner(eventBus));
  }
  if (process.env.CONGRESS_ENABLED !== 'false') {
    registry.register(new CongressScanner(eventBus));
  }
  if (process.env.UNUSUAL_OPTIONS_ENABLED !== 'false') {
    registry.register(new UnusualOptionsScanner(eventBus));
  }
  if (process.env.SHORT_INTEREST_ENABLED !== 'false') {
    registry.register(new ShortInterestScanner(eventBus));
  }
  if (process.env.FDA_ENABLED !== 'false') {
    registry.register(new FdaScanner(eventBus));
  }
  if (process.env.WHITEHOUSE_ENABLED !== 'false') {
    registry.register(new WhiteHouseScanner(eventBus));
  }
  if (process.env.DOJ_ENABLED !== 'false') {
    registry.register(new DojScanner(eventBus));
  }
  if (process.env.ANALYST_ENABLED === 'true') {
    registry.register(new AnalystScanner(eventBus));
  }
  if (process.env.EARNINGS_ENABLED === 'true') {
    registry.register(new EarningsScanner(eventBus));
  }
  if (process.env.FEDERAL_REGISTER_ENABLED !== 'false') {
    registry.register(new FederalRegisterScanner(eventBus));
  }
  if (process.env.NEWSWIRE_ENABLED === 'true') {
    registry.register(new NewswireScanner(eventBus));
  }
  if (process.env.SEC_EDGAR_ENABLED === 'true') {
    registry.register(new SecEdgarScanner(eventBus));
  }
  if (process.env.IR_MONITOR_ENABLED === 'true') {
    registry.register(new IrMonitorScanner(eventBus));
  }
  if (process.env.HALT_SCANNER_ENABLED === 'true') {
    registry.register(new HaltScanner(eventBus));
  }
  if (process.env.DILUTION_SCANNER_ENABLED === 'true') {
    registry.register(new DilutionScanner(eventBus));
  }

  // Helper: truncate title for logs
  const logTitle = (title: string) => title.length > 80 ? title.slice(0, 77) + '...' : title;

  // Unified event pipeline: classify → dedup → store → filter → deliver
  eventBus.subscribe(async (event) => {
    pipelineFunnelTotal.inc({ stage: 'ingested' });

    // Step 1: Classify ONCE
    const end = processingDurationSeconds.startTimer({ operation: 'classify' });
    const result = ruleEngine.classify(event);
    end();
    pipelineFunnelTotal.inc({ stage: 'classified' });

    // Step 2: Track metrics (always, even for duplicates)
    eventsProcessedTotal.inc({ source: event.source, event_type: event.type });
    eventsBySource.inc({ source: event.source });
    eventsBySeverity.inc({ severity: result.severity });

    // Step 3: Dedup check
    const dedupResult = await deduplicator.check(event);
    activeStories.set(deduplicator.activeStoryCount);

    if (dedupResult.isDuplicate) {
      eventsDeduplicatedTotal.inc({ match_type: dedupResult.matchType });
      pipelineFunnelTotal.inc({ stage: 'deduped' });
      auditLog.record({
        eventId: event.id, source: event.source, title: event.title,
        outcome: 'deduped', stoppedAt: 'dedup',
        reason: `duplicate: ${dedupResult.matchType}`,
      });
      return; // Skip DB storage + delivery for duplicates
    }

    // Step 4: Enrich event metadata with story info
    if (dedupResult.storyId) {
      const storyInfo = deduplicator.getStory(event.id);
      if (storyInfo) {
        event.metadata = {
          ...event.metadata,
          storyId: storyInfo.storyId,
          storyEventCount: storyInfo.eventCount,
        };
        event.title = `Developing: ${event.title}`;
      }
    }

    // Step 5: LLM classification (once, shared by DB storage and delivery)
    const llmResult = llmClassifier
      ? await llmClassifier.classify(event, result)
      : undefined;

    if (llmClassifier && llmResult) {
      llmClassificationsTotal.inc({ status: llmResult.ok ? 'success' : 'failure' });
    }

    // Step 6: Store to DB (if available)
    let eventId: string | undefined;

    if (db) {
      eventId = await storeEvent(db, { event, severity: result.severity });

      if (accuracyService) {
        const predictionPayload = await buildPredictionPayload(
          event,
          result,
          llmResult,
          adaptiveService,
        );
        await accuracyService.recordPrediction(
          eventId,
          predictionPayload,
        );

        if (adaptiveService) {
          await adaptiveService.enqueueEventIfNeeded({
            eventId,
            source: event.source,
            confidence: predictionPayload.confidence,
          });
        }
      }

      if (outcomeTracker) {
        await outcomeTracker.scheduleOutcomeTrackingForEvent(eventId, event);
      }
    }

    await eventBus.publishTopic?.(
      'event:classified',
      toLiveFeedEvent({
        id: eventId ?? event.id,
        source: event.source,
        title: event.title,
        summary: event.body,
        severity: result.severity,
        metadata: event.metadata,
        time: event.timestamp,
        llmReason: llmResult?.ok ? llmResult.value.reasoning : undefined,
      }),
    );

    pipelineFunnelTotal.inc({ stage: 'stored' });

    // Step 7: Alert filter + delivery (if alertRouter enabled)
    // Grace period: suppress delivery for first 90s after startup to let scanners
    // populate their seenIds buffers (prevents duplicate flood on restart)
    const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
    const uptimeMs = Date.now() - startTime;
    const DELIVERY_GRACE_MS = 90_000;
    if (!isTest && uptimeMs < DELIVERY_GRACE_MS) {
      gracePeriodSuppressedTotal.inc();
      auditLog.record({
        eventId: event.id, source: event.source, title: event.title,
        severity: result.severity, outcome: 'grace_period', stoppedAt: 'grace_period',
        reason: `startup grace period (${Math.round(uptimeMs / 1000)}s / ${DELIVERY_GRACE_MS / 1000}s)`,
      });
      return; // Still in startup grace period — store to DB but don't deliver
    }

    if (alertRouter.enabled) {
      const ticker =
        event.metadata && typeof event.metadata['ticker'] === 'string'
          ? (event.metadata['ticker'] as string)
          : undefined;
      const persistEventMetadata = async () => {
        if (!db || !eventId) {
          return;
        }

        await db.execute(sql`
          UPDATE events
          SET metadata = ${JSON.stringify(event.metadata ?? {})}::jsonb
          WHERE id = ${eventId}
        `);
      };

      const filterResult = alertFilter.check(event);

      // Categorize filter reason for metrics
      const reasonCat = categorizeFilterReason(filterResult.reason);
      alertFilterTotal.inc({
        decision: filterResult.pass ? 'pass' : 'block',
        source: event.source,
        reason_category: reasonCat,
      });

      if (!filterResult.pass) {
        pipelineFunnelTotal.inc({ stage: 'filtered_out' });
        server.log.debug({
          pipeline: true,
          stage: 'filter',
          source: event.source,
          title: logTitle(event.title),
          pass: false,
          reason: filterResult.reason,
        });
        auditLog.record({
          eventId: event.id, source: event.source, title: event.title,
          severity: result.severity, ticker,
          outcome: 'filtered', stoppedAt: 'alert_filter',
          reason: filterResult.reason, reasonCategory: reasonCat,
        });
        return; // Blocked by alert filter
      }

      pipelineFunnelTotal.inc({ stage: 'filter_passed' });
      server.log.info({
        pipeline: true,
        stage: 'filter',
        source: event.source,
        title: logTitle(event.title),
        severity: result.severity,
        pass: true,
        reason: filterResult.reason,
        ticker,
      });

      // L2 LLM Judge — quality check for ALL sources that pass L1
      if (llmGatekeeper.enabled) {
        // Circuit breaker fallback: pass primary sources, block secondary
        if (llmGatekeeper.isCircuitOpen) {
          const isPrimary = PRIMARY_SOURCES_SET.has(event.source.toLowerCase());
          if (!isPrimary) {
            event.metadata = {
              ...(event.metadata ?? {}),
              llm_judge: {
                decision: 'BLOCK',
                confidence: 0,
                reason: 'circuit breaker open — secondary source blocked',
              },
            };
            await persistEventMetadata();
            pipelineFunnelTotal.inc({ stage: 'llm_blocked' });
            alertFilterTotal.inc({ decision: 'block', source: event.source, reason_category: 'llm_circuit_breaker' });
            server.log.info({
              pipeline: true,
              stage: 'llm_judge',
              source: event.source,
              title: logTitle(event.title),
              pass: false,
              reason: 'circuit breaker open — secondary source blocked',
            });
            auditLog.record({
              eventId: event.id, source: event.source, title: event.title,
              severity: result.severity, ticker,
              outcome: 'filtered', stoppedAt: 'llm_judge',
              reason: 'circuit breaker open — secondary source blocked',
              reasonCategory: 'llm_circuit_breaker',
            });
            return;
          }
          // Primary source: pass through during circuit break
          server.log.info({
            pipeline: true,
            stage: 'llm_judge',
            source: event.source,
            title: logTitle(event.title),
            pass: true,
            reason: 'circuit breaker open — primary source pass-through',
          });
        } else {
          const gateResult = await llmGatekeeper.check(event);
          event.metadata = {
            ...(event.metadata ?? {}),
            llm_judge: {
              decision: gateResult.pass ? 'PASS' : 'BLOCK',
              confidence: gateResult.confidence,
              reason: gateResult.reason,
            },
          };
          await persistEventMetadata();
          if (!gateResult.pass) {
            pipelineFunnelTotal.inc({ stage: 'llm_blocked' });
            alertFilterTotal.inc({ decision: 'block', source: event.source, reason_category: 'llm_judge' });
            server.log.info({
              pipeline: true,
              stage: 'llm_judge',
              source: event.source,
              title: logTitle(event.title),
              pass: false,
              reason: gateResult.reason,
              confidence: gateResult.confidence,
            });
            auditLog.record({
              eventId: event.id, source: event.source, title: event.title,
              severity: result.severity, ticker,
              outcome: 'filtered', stoppedAt: 'llm_judge',
              reason: `LLM: ${gateResult.reason} (confidence: ${gateResult.confidence})`,
              reasonCategory: 'llm_judge',
              confidence: gateResult.confidence,
            });
            return;
          }
          server.log.info({
            pipeline: true,
            stage: 'llm_judge',
            source: event.source,
            title: logTitle(event.title),
            pass: true,
            reason: gateResult.reason,
            confidence: gateResult.confidence,
          });
        }
      }

      // LLM Enrichment (only for events flagged by L1)
      let enrichment: import('@event-radar/delivery').LLMEnrichment | undefined;
      if (filterResult.enrichWithLLM && llmEnricher.enabled) {
        const enrichStart = Date.now();
        try {
          const llmEnrichResult = await llmEnricher.enrich(
            event,
            llmResult?.ok ? llmResult.value : undefined,
          );
          const enrichDurationSec = (Date.now() - enrichStart) / 1000;
          llmEnrichmentDurationSeconds.observe(enrichDurationSec);
          if (llmEnrichResult) {
            enrichment = llmEnrichResult;
            event.metadata = {
              ...(event.metadata ?? {}),
              llm_enrichment: llmEnrichResult,
            };
            await persistEventMetadata();
            llmEnrichmentTotal.inc({ result: 'success' });
          } else {
            llmEnrichmentTotal.inc({ result: 'empty' });
          }
        } catch (enrichErr) {
          const enrichDurationSec = (Date.now() - enrichStart) / 1000;
          llmEnrichmentDurationSeconds.observe(enrichDurationSec);
          llmEnrichmentTotal.inc({ result: 'error' });
          server.log.error({
            pipeline: true, stage: 'llm_enrichment', source: event.source,
            error: enrichErr instanceof Error ? enrichErr.message : String(enrichErr),
          });
        }
      }

      // Historical enrichment (only after filter passes, before delivery)
      let historicalContext: import('@event-radar/delivery').HistoricalContext | undefined;
      if (historicalEnricher) {
        const histStart = Date.now();
        const histResult = await historicalEnricher.enrich(
          event,
          llmResult?.ok ? llmResult.value : undefined,
        );
        historicalContext = histResult ?? undefined;
        if (historicalContext) {
          event.metadata = {
            ...(event.metadata ?? {}),
            historical_context: historicalContext,
          };
          await persistEventMetadata();
        }
        const histDurationMs = Date.now() - histStart;
        const histDurationS = histDurationMs / 1000;
        historicalEnrichmentDurationSeconds.observe(histDurationS);

        if (historicalContext) {
          historicalEnrichmentTotal.inc({ result: 'hit' });
          server.log.info({
            pipeline: true,
            stage: 'historical',
            source: event.source,
            title: logTitle(event.title),
            confidence: historicalContext.confidence,
            matches: historicalContext.matchCount,
            duration_ms: histDurationMs,
          });
        } else {
          historicalEnrichmentTotal.inc({ result: 'miss' });
        }
      }

      let regimeSnapshot: import('@event-radar/shared').RegimeSnapshot | undefined;
      try {
        regimeSnapshot = await marketRegimeService.getRegimeSnapshot();
      } catch (error) {
        server.log.warn({
          pipeline: true,
          stage: 'market_regime',
          source: event.source,
          title: logTitle(event.title),
          error: error instanceof Error ? error.message : error,
        }, 'failed to load regime snapshot for delivery');
      }

      pipelineFunnelTotal.inc({ stage: 'enriched' });

      // Kill switch — skip delivery when active
      if (killSwitch && await killSwitch.isActive()) {
        pipelineFunnelTotal.inc({ stage: 'kill_switch_skipped' });
        server.log.info({
          pipeline: true,
          stage: 'kill_switch',
          source: event.source,
          title: logTitle(event.title),
          severity: result.severity,
          reason: 'delivery kill switch is active',
        });
        auditLog.record({
          eventId: event.id, source: event.source, title: event.title,
          severity: result.severity, ticker,
          outcome: 'filtered', stoppedAt: 'kill_switch',
          reason: 'delivery kill switch is active',
          reasonCategory: 'kill_switch',
        });
        return; // Event was processed and stored, just not delivered
      }

      const deliveryStart = Date.now();
      const results = await alertRouter.route({
        storedEventId: eventId,
        event,
        severity: result.severity,
        ticker,
        enrichment,
        historicalContext,
        regimeSnapshot,
      });
      const deliveryMs = Date.now() - deliveryStart;

      const okCount = results.filter(r => r.ok).length;
      const failCount = results.filter(r => !r.ok).length;

      for (const r of results) {
        const status = r.ok ? 'success' : 'failure';
        deliveriesSentTotal.inc({ channel: r.channel, status });
        deliveriesByChannel.inc({ channel: r.channel });
        deliveryLatencySeconds.observe(
          { channel: r.channel },
          deliveryMs / 1000,
        );
        if (!r.ok && r.error) {
          deliveryErrorsTotal.inc({ channel: r.channel, error_type: r.error.message.slice(0, 50) });
        }
      }

      pipelineFunnelTotal.inc({ stage: 'delivered' });

      server.log.info({
        pipeline: true,
        stage: 'delivery',
        source: event.source,
        title: logTitle(event.title),
        severity: result.severity,
        channels: results.map(r => r.channel),
        ok: okCount,
        fail: failCount,
        duration_ms: deliveryMs,
        historical: !!historicalContext,
        ticker,
      });
      const judgeConfidence = typeof event.metadata?.['llm_judge'] === 'object'
        ? (event.metadata['llm_judge'] as Record<string, unknown>)?.['confidence']
        : undefined;
      auditLog.record({
        eventId: event.id, source: event.source, title: event.title,
        severity: result.severity, ticker,
        outcome: 'delivered', stoppedAt: 'delivery',
        reason: filterResult.reason,
        reasonCategory: reasonCat,
        deliveryChannels: results.map(r => ({ channel: r.channel, ok: r.ok })),
        historicalMatch: !!historicalContext,
        historicalConfidence: historicalContext?.confidence,
        durationMs: deliveryMs,
        confidence: typeof judgeConfidence === 'number' ? judgeConfidence : undefined,
      });
    }
  });

  if (adaptiveService && eventBus.subscribeTopic) {
    eventBus.subscribeTopic('accuracy:updated', async (payload) => {
      const totalEvaluated =
        payload &&
        typeof payload === 'object' &&
        'totalEvaluated' in payload &&
        typeof payload.totalEvaluated === 'number'
          ? payload.totalEvaluated
          : null;

      if (totalEvaluated != null) {
        await adaptiveService.recalculateWeightsIfNeeded(totalEvaluated);
      }
    });
  }

  server.get('/metrics', async (_request, reply) => {
    const metrics = await metricsRegistry.metrics();
    return reply
      .header('Content-Type', metricsRegistry.contentType)
      .send(metrics);
  });

  server.get('/health', async (request, reply) => {
    const scanners = registry.healthAll();

    // Check DB connection if available
    let dbStatus: 'connected' | 'disconnected' | 'unknown' = 'unknown';
    let lastEventTime: string | null = null;

    if (db) {
      try {
        await db.select().from(schema.events).limit(1);
        dbStatus = 'connected';

        // Get the most recent event time
        const [latestEvent] = await db
          .select({ receivedAt: schema.events.receivedAt })
          .from(schema.events)
          .orderBy(sql`${schema.events.receivedAt} DESC`)
          .limit(1);

        if (latestEvent?.receivedAt) {
          lastEventTime = latestEvent.receivedAt.toISOString();
        }
      } catch {
        dbStatus = 'disconnected';
      }
    }

    let killSwitchActive: boolean | null = null;
    if (killSwitch) {
      try {
        killSwitchActive = await killSwitch.isActive();
      } catch {
        killSwitchActive = null;
      }
    }

    return reply.send({
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      version: backendPackage.version,
      startedAt,
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      scanners,
      db: {
        status: dbStatus,
      },
      websocket: {
        clients: server.websocketClientCount?.() ?? 0,
      },
      lastEventTime,
      uptime: process.uptime(),
      deliveryKillSwitch: killSwitchActive,
    });
  });

  server.get('/api/health/ping', async () => {
    return { pong: true, timestamp: Date.now() };
  });

  registerPriceRoutes(server, {
    apiKey,
    priceChartService: options?.priceChartService,
  });
  registerRegimeRoutes(server, {
    apiKey,
    marketRegimeService,
  });

  server.post('/api/events/ingest', async (request, reply) => {
    const parsed = RawEventSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid RawEvent',
        details: parsed.error.issues,
      });
    }

    await eventBus.publish(parsed.data);

    return reply.status(201).send({ accepted: true, id: parsed.data.id });
  });

  // Register event query routes if db is available
  if (db) {
    registerEventRoutes(server, db);
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
    registerWatchlistRoutes(server, db, { apiKey });
    registerPushSubscriptionRoutes(server, db, { apiKey });
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
    rules: options?.rules ?? DEFAULT_RULES,
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
    version: backendPackage.version,
  });

  // Register AI observability routes
  registerAiObservabilityRoutes(server, {
    apiKey,
    db,
    scannerRegistry: registry,
    startTime,
  });

  // Start health monitor (production only)
  if (healthMonitor && process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') {
    healthMonitor.start();
  }

  // Start periodic outcome backfill (fills in change_1d/1w/1m prices)
  let outcomeProcessingLoop: OutcomeProcessingLoopHandle | undefined;
  if (outcomeTracker && process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') {
    outcomeProcessingLoop = startOutcomeProcessingLoop({
      outcomeTracker,
      intervalMs: 15 * 60 * 1000,
      startupDelayMs: 2 * 60 * 1000,
      logger: {
        info(message) {
          console.log(`[outcome-tracker] ${message}`);
        },
        error(message, error) {
          console.error(
            `[outcome-tracker] ${message}:`,
            error instanceof Error ? error.message : error,
          );
        },
      },
    });
  }

  // Cleanup on shutdown
  server.addHook('onClose', async () => {
    marketCache?.stop();
    healthMonitor?.stop();
    outcomeProcessingLoop?.stop();
  });

  return {
    server,
    eventBus,
    registry,
    alertRouter,
    ruleEngine,
    llmClassifier,
    deduplicator,
    alertFilter,
    llmEnricher,
    historicalEnricher,
    killSwitch,
    healthMonitor,
  };
}

async function buildPredictionPayload(
  event: RawEvent,
  ruleResult: ClassificationResult,
  llmResult?: Result<LlmClassificationResult, Error>,
  adaptiveService?: AdaptiveClassifierService,
): Promise<Omit<ClassificationPrediction, 'eventId'>> {
  const sourceWeight = adaptiveService
    ? await adaptiveService.getSourceWeight(event.source)
    : 1;

  if (llmResult?.ok) {
    return {
      predictedSeverity: llmResult.value.severity,
      predictedDirection: normalizeLlmDirection(llmResult.value.direction),
      confidence: applySourceWeight(llmResult.value.confidence, sourceWeight),
      classifiedBy: 'hybrid',
      classifiedAt: new Date().toISOString(),
    };
  }

  return {
    predictedSeverity: ruleResult.severity,
    predictedDirection: extractFallbackDirection(event),
    confidence: applySourceWeight(ruleResult.confidence, sourceWeight),
    classifiedBy: 'rule-engine',
    classifiedAt: new Date().toISOString(),
  };
}

function applySourceWeight(confidence: number, sourceWeight: number): number {
  return Math.min(1, Math.max(0, Number((confidence * sourceWeight).toFixed(4))));
}

function extractFallbackDirection(event: RawEvent): AccuracyDirection {
  const direction = event.metadata?.['direction'];
  if (typeof direction === 'string') {
    const normalized = direction.toLowerCase();
    if (
      normalized === 'bullish' ||
      normalized === 'bearish' ||
      normalized === 'neutral'
    ) {
      return normalized;
    }
  }

  // TODO: Revisit rule-engine fallback direction. Defaulting to neutral when
  // metadata is missing reduces the binary sample size and can inflate
  // aggregate direction metrics.
  return 'neutral';
}

function normalizeLlmDirection(direction: LlmClassificationResult['direction']): AccuracyDirection {
  if (direction === 'BULLISH') {
    return 'bullish';
  }
  if (direction === 'BEARISH') {
    return 'bearish';
  }
  return 'neutral';
}
