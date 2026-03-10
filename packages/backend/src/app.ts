import Fastify, { type FastifyInstance } from 'fastify';
import {
  InMemoryEventBus,
  ScannerRegistry,
  RawEventSchema,
  type EventBus,
  type Rule,
} from '@event-radar/shared';
import {
  AlertRouter,
  BarkPusher,
  DiscordWebhook,
  TelegramDelivery,
  WebhookDelivery,
  type AlertRouter as AlertRouterType,
} from '@event-radar/delivery';
import { DummyScanner } from './scanners/dummy-scanner.js';
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
import { type Database } from './db/connection.js';
import * as schema from './db/schema.js';
import { storeEvent } from './db/event-store.js';
import { sql } from 'drizzle-orm';
import { registerEventRoutes } from './routes/events.js';
import { registerScannerRoutes } from './routes/scanners.js';
import { registerOutcomeRoutes } from './routes/outcomes.js';
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
} from './metrics.js';
import { EventDeduplicator } from './pipeline/deduplicator.js';
import { registerAuthPlugin, generateApiKey } from './plugins/auth.js';
import { registerWebSocketPlugin } from './plugins/websocket.js';

export interface AppContext {
  server: FastifyInstance;
  eventBus: EventBus;
  registry: ScannerRegistry;
  alertRouter: AlertRouterType;
  ruleEngine: RuleEngine;
  llmClassifier?: LlmClassifier;
  deduplicator: EventDeduplicator;
}

function buildAlertRouter(): AlertRouterType {
  const barkKey = process.env.BARK_KEY;
  const barkServerUrl = process.env.BARK_SERVER_URL;
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;
  const webhookUrl = process.env.WEBHOOK_URL;
  const webhookSecret = process.env.WEBHOOK_SECRET;

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
  });
}

export function buildApp(options?: {
  logger?: boolean;
  alertRouter?: AlertRouterType;
  db?: Database;
  rules?: Rule[];
  llmProvider?: LlmProvider;
  apiKey?: string;
}): AppContext {
  const server = Fastify({ logger: options?.logger ?? true });
  const eventBus = new InMemoryEventBus();
  const registry = new ScannerRegistry();
  const alertRouter = options?.alertRouter ?? buildAlertRouter();
  const ruleEngine = new RuleEngine();
  const db = options?.db;
  const llmClassifier = options?.llmProvider
    ? new LlmClassifier({ provider: options.llmProvider })
    : undefined;
  const deduplicator = new EventDeduplicator();

  // Register API key auth plugin
  const apiKey = options?.apiKey ?? process.env.API_KEY ?? generateApiKey();
  server.register(async () => {
    await registerAuthPlugin(server, {
      apiKey,
      publicRoutes: [
        '/health',
        '/api/health/ping',
        '/metrics',
        '/api/events/ingest',
      ],
    });
  });

  // Register WebSocket plugin for real-time events
  registerWebSocketPlugin(server, {
    eventBus,
    db,
    getApiKey: () => apiKey,
  }).catch((err) => {
    console.error('Failed to register WebSocket plugin:', err);
  });

  console.log(`API Key: ${apiKey}`); // Log the API key for development

  ruleEngine.loadRules(options?.rules ?? DEFAULT_RULES);
  registry.register(new DummyScanner(eventBus));

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

  // Wire EventBus → metrics tracking
  eventBus.subscribe(async (event) => {
    const end = processingDurationSeconds.startTimer({ operation: 'classify' });
    const result = ruleEngine.classify(event);
    end();

    eventsProcessedTotal.inc({ source: event.source, event_type: event.type });
    eventsBySource.inc({ source: event.source });
    eventsBySeverity.inc({ severity: result.severity });
  });

  // Wire EventBus → RuleEngine classification → Dedup → AlertRouter
  if (alertRouter.enabled) {
    eventBus.subscribe(async (event) => {
      const result = ruleEngine.classify(event);
      const dedupResult = deduplicator.check(event);

      // Update story metrics
      activeStories.set(deduplicator.activeStoryCount);

      if (dedupResult.isDuplicate) {
        eventsDeduplicatedTotal.inc({ match_type: dedupResult.matchType });
        return; // Skip delivery for duplicates
      }

      // Enrich event metadata with story info if part of a developing story
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

      const ticker =
        event.metadata && typeof event.metadata['ticker'] === 'string'
          ? (event.metadata['ticker'] as string)
          : undefined;

      const deliveryStart = Date.now();
      const results = await alertRouter.route({
        event,
        severity: result.severity,
        ticker,
      });
      const deliveryMs = Date.now() - deliveryStart;

      for (const r of results) {
        const status = r.ok ? 'success' : 'failure';
        deliveriesSentTotal.inc({ channel: r.channel, status });
        deliveriesByChannel.inc({ channel: r.channel });
        deliveryLatencySeconds.observe(
          { channel: r.channel },
          deliveryMs / 1000,
        );
      }
    });
  }

  // Wire EventBus → LLM classifier (async enrichment, fire-and-forget)
  if (llmClassifier) {
    eventBus.subscribe(async (event) => {
      const ruleResult = ruleEngine.classify(event);
      const llmResult = await llmClassifier.classify(event, ruleResult);

      if (llmResult.ok) {
        llmClassificationsTotal.inc({ status: 'success' });
      } else {
        llmClassificationsTotal.inc({ status: 'failure' });
      }
    });
  }

  // Wire EventBus → database storage
  if (db) {
    eventBus.subscribe(async (event) => {
      const result = ruleEngine.classify(event);
      await storeEvent(db, { event, severity: result.severity });
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

    return reply.send({
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      scanners,
      db: {
        status: dbStatus,
      },
      lastEventTime,
      uptime: process.uptime(),
    });
  });

  server.get('/api/health/ping', async () => {
    return { pong: true, timestamp: Date.now() };
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
    registerOutcomeRoutes(server, db);
  }

  // Register scanner health routes
  registerScannerRoutes(server, registry);

  return { server, eventBus, registry, alertRouter, ruleEngine, llmClassifier, deduplicator };
}
