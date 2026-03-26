import Fastify, { type FastifyInstance } from 'fastify';
import backendPackage from '../package.json' with { type: 'json' };
import {
  createEventBus,
  ScannerRegistry,
  RawEventSchema,
  type EventBus,
  type Rule,
} from '@event-radar/shared';
import { type AlertRouter as AlertRouterType } from '@event-radar/delivery';
import { type Database } from './db/connection.js';
import * as schema from './db/schema.js';
import { sql } from 'drizzle-orm';
import { registerAuthPlugin, generateApiKey } from './plugins/auth.js';
import { registerWebsocketPlugin } from './plugins/websocket.js';
import { DeliveryKillSwitch, type IDeliveryKillSwitch } from './services/delivery-kill-switch.js';
import { startAuditCleanupLoop, type AuditCleanupHandle } from './services/audit-cleanup.js';
import { HealthMonitorService } from './services/health-monitor.js';
import { OpenAIProvider } from './services/llm-provider.js';
import { RuleEngine } from './pipeline/rule-engine.js';
import { DEFAULT_RULES } from './pipeline/default-rules.js';
import { LlmClassifier } from './pipeline/llm-classifier.js';
import type { LlmProvider } from './pipeline/llm-provider.js';
import { registry as metricsRegistry } from './metrics.js';
import { EventDeduplicator } from './pipeline/deduplicator.js';
import { AlertFilter, type AlertFilterConfig } from './pipeline/alert-filter.js';
import { LLMEnricher, type LLMEnricherConfig } from './pipeline/llm-enricher.js';
import { HistoricalEnricher } from './pipeline/historical-enricher.js';
import { AuditLog } from './pipeline/audit-log.js';
import { DeliveryGate } from './pipeline/delivery-gate.js';
import { LLMGatekeeper } from './pipeline/llm-gatekeeper.js';
import { prewarmSectorCache } from './pipeline/event-type-mapper.js';
import { PipelineLimiter } from './pipeline/pipeline-limiter.js';
import rateLimit from '@fastify/rate-limit';
import { OutcomeTracker } from './services/outcome-tracker.js';
import { MarketContextCache } from './services/market-context-cache.js';
import { MarketDataCache } from './services/market-data-cache.js';
import { createMarketDataProvider } from './services/create-market-data-provider.js';
import { validateJwtConfig } from './routes/auth.js';
import type { PriceBatchService, PriceChartService } from './routes/price.js';

// Extracted modules
import { registerScanners } from './scanner-registry-setup.js';
import { buildAlertRouter } from './alert-router-builder.js';
import { startOutcomeProcessingLoop } from './outcome-loop.js';
import { intFromEnv } from './pipeline-helpers.js';
import { wireEventPipeline } from './event-pipeline.js';
import { registerAllRoutes } from './route-registration.js';

export { startOutcomeProcessingLoop } from './outcome-loop.js';

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
  priceBatchService?: PriceBatchService;
  killSwitch?: IDeliveryKillSwitch;
  marketDataCache?: {
    getOrFetch(symbol: string): Promise<{
      symbol: string;
      price: number;
      change1d: number;
      change5d: number;
      change20d: number;
      volumeRatio: number;
      rsi14: number;
      high52w: number;
      low52w: number;
      support: number;
      resistance: number;
    } | undefined>;
    start?(): void;
  };
}): AppContext {
  const server = Fastify({ logger: options?.logger ?? true });
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const eventBus = createEventBus();
  const registry = new ScannerRegistry();
  const db = options?.db;
  const alertRouter = options?.alertRouter ?? buildAlertRouter(db);
  const ruleEngine = new RuleEngine();
  const llmClassifier = options?.llmProvider
    ? new LlmClassifier({ provider: options.llmProvider })
    : undefined;
  const dedupRedisEnabled = process.env.DEDUP_REDIS_ENABLED === 'true';
  const deduplicator = new EventDeduplicator({
    db,
    redisUrl: dedupRedisEnabled
      ? (process.env.DEDUP_REDIS_URL ?? 'redis://localhost:6379')
      : undefined,
  });
  const alertFilter = new AlertFilter(options?.alertFilterConfig);
  const auditLog = new AuditLog(db);
  const deliveryGate = new DeliveryGate();
  const gatekeeperApiKey = process.env.LLM_GATEKEEPER_API_KEY;
  const gatekeeperModel = process.env.LLM_GATEKEEPER_MODEL ?? 'gpt-4o-mini';
  const llmGatekeeper = new LLMGatekeeper({
    provider: gatekeeperApiKey
      ? new OpenAIProvider({ apiKey: gatekeeperApiKey, model: gatekeeperModel })
      : undefined,
    enabled: process.env.LLM_GATEKEEPER_ENABLED === 'true',
  });
  const outcomeTracker =
    db != null
      ? new OutcomeTracker(db)
      : undefined;
  const tickerMarketDataProvider = process.env.ALPHA_VANTAGE_API_KEY
    ? createMarketDataProvider({
      apiKey: process.env.ALPHA_VANTAGE_API_KEY,
    })
    : undefined;

  const marketCache = db
    ? new MarketContextCache({ refreshIntervalMs: 300_000 })
    : undefined;
  const tickerMarketDataCache = options?.marketDataCache
    ?? (tickerMarketDataProvider
      ? new MarketDataCache({
        provider: tickerMarketDataProvider,
        refreshIntervalMs: 300_000,
      })
      : undefined);
  const llmEnricher = new LLMEnricher(options?.llmEnricherConfig, {
    marketDataCache: tickerMarketDataCache,
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
    tickerMarketDataCache?.start?.();
    void prewarmSectorCache(db).catch((error) => {
      console.error(
        '[event-type-mapper] Failed to prewarm sector cache:',
        error instanceof Error ? error.message : error,
      );
    });
  }

  // Validate JWT config — fail fast if AUTH_REQUIRED=true but no JWT_SECRET
  validateJwtConfig();

  // Register global rate limiter (before routes)
  server.register(rateLimit, { max: 200, timeWindow: '1 minute' });

  // Register API key auth plugin
  const apiKey = options?.apiKey ?? process.env.API_KEY ?? generateApiKey();
  server.decorate('websocketClientCount', () => websocketClientState.count);
  void registerAuthPlugin(server, {
    apiKey,
    publicRoutes: [
      '/api/auth/magic-link',
      '/api/auth/verify',
      '/api/auth/refresh',
      '/api/auth/logout',
      '/api/auth/me',
      '/api/v1/feed',
      '/api/v1/feed/watchlist-summary',
      '/api/v1/scorecards/summary',
      '/api/events',
      '/api/events/:id',
      '/api/events/:id/similar',
      '/api/tickers/search',
      '/api/tickers/trending',
      '/api/v1/sources',
      '/api-docs',
      '/api/health',
      '/api/health/ping',
      '/api/stats',
      '/ws/events',
    ],
  });

  if (process.env.AUTH_REQUIRED !== 'true') {
    server.log.warn('⚠️  AUTH_REQUIRED is not set to true. All routes are accessible without authentication.');
  }
  if (apiKey === 'er-dev-2026') {
    server.log.warn('⚠️  Using default dev API key. Set API_KEY in production.');
  }

  server.register(registerWebsocketPlugin, {
    apiKey,
    clientState: websocketClientState,
    eventBus,
  });


  // API key logged at startup (redacted for security)
  console.log(`API Key: ${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`);

  ruleEngine.loadRules(options?.rules ?? DEFAULT_RULES);

  // Register all scanners
  registerScanners(registry, eventBus);

  const pipelineLimiter = new PipelineLimiter({
    maxConcurrent: intFromEnv('PIPELINE_MAX_CONCURRENT', 5),
    maxQueueDepth: 100,
    onError(error) {
      server.log.error(
        {
          pipeline: true,
          stage: 'pipeline',
          error: error instanceof Error ? error.message : String(error),
        },
        'pipeline execution failed',
      );
    },
  });

  // Wire the event pipeline (classify → dedup → store → filter → deliver)
  wireEventPipeline({
    server,
    eventBus,
    db,
    alertRouter,
    ruleEngine,
    llmClassifier,
    deduplicator,
    alertFilter,
    llmEnricher,
    historicalEnricher,
    llmGatekeeper,
    deliveryGate,
    auditLog,
    pipelineLimiter,
    killSwitch,
    outcomeTracker,
    startTime,
  });

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

  server.post('/api/events/ingest', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
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

  // Register all routes
  registerAllRoutes({
    server,
    db,
    apiKey,
    registry,
    tickerMarketDataCache,
    killSwitch,
    healthMonitor,
    priceChartService: options?.priceChartService,
    priceBatchService: options?.priceBatchService,
    startTime,
    version: backendPackage.version,
  });

  // Start health monitor (production only)
  if (healthMonitor && process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') {
    healthMonitor.start();
  }

  // Start periodic outcome backfill (fills in change_1d/1w/1m prices)
  let outcomeProcessingLoop: ReturnType<typeof startOutcomeProcessingLoop> | undefined;
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

  // Start daily audit cleanup (delete old pipeline_audit, alert_log, etc.)
  let auditCleanupLoop: AuditCleanupHandle | undefined;
  if (db && process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') {
    auditCleanupLoop = startAuditCleanupLoop(db);
  }

  // Cleanup on shutdown
  server.addHook('onClose', async () => {
    const drained = await pipelineLimiter.drain(30_000);
    if (!drained) {
      server.log.warn({
        pipeline: true,
        stage: 'shutdown',
      }, 'pipeline drain timed out during shutdown');
    }

    alertFilter.dispose();
    marketCache?.stop();
    healthMonitor?.stop();
    outcomeProcessingLoop?.stop();
    auditCleanupLoop?.stop();
    await deduplicator.shutdown();
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
