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
  type AlertRouter as AlertRouterType,
} from '@event-radar/delivery';
import { DummyScanner } from './scanners/dummy-scanner.js';
import { type Database } from './db/connection.js';
import { storeEvent } from './db/event-store.js';
import { registerEventRoutes } from './routes/events.js';
import { RuleEngine } from './pipeline/rule-engine.js';
import { DEFAULT_RULES } from './pipeline/default-rules.js';
import {
  registry as metricsRegistry,
  eventsProcessedTotal,
  eventsBySource,
  eventsBySeverity,
  deliveriesSentTotal,
  deliveriesByChannel,
  processingDurationSeconds,
} from './metrics.js';

export interface AppContext {
  server: FastifyInstance;
  eventBus: EventBus;
  registry: ScannerRegistry;
  alertRouter: AlertRouterType;
  ruleEngine: RuleEngine;
}

function buildAlertRouter(): AlertRouterType {
  const barkKey = process.env.BARK_KEY;
  const barkServerUrl = process.env.BARK_SERVER_URL;
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

  return new AlertRouter({
    bark: barkKey
      ? new BarkPusher({ key: barkKey, serverUrl: barkServerUrl })
      : undefined,
    discord: discordWebhookUrl
      ? new DiscordWebhook({ webhookUrl: discordWebhookUrl })
      : undefined,
  });
}

export function buildApp(options?: {
  logger?: boolean;
  alertRouter?: AlertRouterType;
  db?: Database;
  rules?: Rule[];
}): AppContext {
  const server = Fastify({ logger: options?.logger ?? true });
  const eventBus = new InMemoryEventBus();
  const registry = new ScannerRegistry();
  const alertRouter = options?.alertRouter ?? buildAlertRouter();
  const ruleEngine = new RuleEngine();
  const db = options?.db;

  ruleEngine.loadRules(options?.rules ?? DEFAULT_RULES);
  registry.register(new DummyScanner(eventBus));

  // Wire EventBus → metrics tracking
  eventBus.subscribe(async (event) => {
    const end = processingDurationSeconds.startTimer({ operation: 'classify' });
    const result = ruleEngine.classify(event);
    end();

    eventsProcessedTotal.inc({ source: event.source, event_type: event.type });
    eventsBySource.inc({ source: event.source });
    eventsBySeverity.inc({ severity: result.severity });
  });

  // Wire EventBus → RuleEngine classification → AlertRouter
  if (alertRouter.enabled) {
    eventBus.subscribe(async (event) => {
      const result = ruleEngine.classify(event);
      const ticker =
        event.metadata && typeof event.metadata['ticker'] === 'string'
          ? (event.metadata['ticker'] as string)
          : undefined;

      const results = await alertRouter.route({
        event,
        severity: result.severity,
        ticker,
      });

      for (const r of results) {
        const status = r.ok ? 'success' : 'failure';
        deliveriesSentTotal.inc({ channel: r.channel, status });
        deliveriesByChannel.inc({ channel: r.channel });
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

  server.get('/health', async () => {
    return {
      status: 'ok',
      scanners: registry.healthAll(),
    };
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
  }

  return { server, eventBus, registry, alertRouter, ruleEngine };
}
