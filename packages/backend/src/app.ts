import Fastify, { type FastifyInstance } from 'fastify';
import {
  InMemoryEventBus,
  ScannerRegistry,
  RawEventSchema,
  type EventBus,
} from '@event-radar/shared';
import {
  AlertRouter,
  BarkPusher,
  DiscordWebhook,
  classifySeverity,
  type AlertRouter as AlertRouterType,
} from '@event-radar/delivery';
import { DummyScanner } from './scanners/dummy-scanner.js';

export interface AppContext {
  server: FastifyInstance;
  eventBus: EventBus;
  registry: ScannerRegistry;
  alertRouter: AlertRouterType;
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
}): AppContext {
  const server = Fastify({ logger: options?.logger ?? true });
  const eventBus = new InMemoryEventBus();
  const registry = new ScannerRegistry();
  const alertRouter = options?.alertRouter ?? buildAlertRouter();

  registry.register(new DummyScanner(eventBus));

  // Wire EventBus → severity classification → AlertRouter
  if (alertRouter.enabled) {
    eventBus.subscribe(async (event) => {
      const severity = classifySeverity(event);
      const ticker =
        event.metadata && typeof event.metadata['ticker'] === 'string'
          ? (event.metadata['ticker'] as string)
          : undefined;

      await alertRouter.route({ event, severity, ticker });
    });
  }

  server.get('/health', async () => {
    return {
      status: 'ok',
      scanners: registry.healthAll(),
    };
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

  return { server, eventBus, registry, alertRouter };
}
