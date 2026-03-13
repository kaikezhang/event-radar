import websocket, { type WebSocket } from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { EventBus } from '@event-radar/shared';
import { validateApiKeyValue } from '../routes/auth-middleware.js';

type FeedCategory = 'policy' | 'macro' | 'corporate' | 'geopolitics' | 'other';

const FEED_CATEGORIES = new Set<FeedCategory>([
  'policy',
  'macro',
  'corporate',
  'geopolitics',
  'other',
]);

export interface LiveFeedEvent {
  id: string;
  title: string;
  source: string;
  severity: string;
  tickers: string[];
  summary: string;
  url: string | null;
  time: string;
  category: FeedCategory;
  llmReason: string;
}

interface WebsocketPluginOptions {
  apiKey?: string;
  clientState?: {
    count: number;
  };
  eventBus: EventBus;
}

declare module 'fastify' {
  interface FastifyInstance {
    websocketClientCount: () => number;
  }
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function asStringArray(value: unknown): string[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function getFeedTickers(metadata: Record<string, unknown>): string[] {
  const tickers = asStringArray(metadata['tickers']);
  if (tickers.length > 0) {
    return tickers;
  }

  const singleTicker = metadata['ticker'];
  if (typeof singleTicker === 'string' && singleTicker.length > 0) {
    return [singleTicker];
  }

  return [];
}

function getFeedUrl(metadata: Record<string, unknown>): string | null {
  const metadataUrl = metadata['url'];
  return typeof metadataUrl === 'string' && metadataUrl.length > 0 ? metadataUrl : null;
}

function inferFeedCategory(source: string, metadata: Record<string, unknown>): FeedCategory {
  const explicitCategory = metadata['category'];
  if (typeof explicitCategory === 'string' && FEED_CATEGORIES.has(explicitCategory as FeedCategory)) {
    return explicitCategory as FeedCategory;
  }

  const eventType = metadata['eventType'];
  if (typeof eventType === 'string') {
    if (eventType === 'macro') return 'macro';
    if (eventType === 'political') return 'policy';
  }

  const normalizedSource = source.toLowerCase();
  if (['whitehouse', 'federal-register', 'congress', 'truth-social'].includes(normalizedSource)) {
    return 'policy';
  }
  if (['econ-calendar', 'fedwatch', 'fed', 'bls'].includes(normalizedSource)) {
    return 'macro';
  }
  if (['state-department', 'defense', 'geopolitics'].includes(normalizedSource)) {
    return 'geopolitics';
  }
  if ([
    'sec-edgar',
    'earnings',
    'analyst',
    'fda',
    'doj-antitrust',
    'unusual-options',
    'short-interest',
    'warn',
    'breaking-news',
  ].includes(normalizedSource)) {
    return 'corporate';
  }

  return 'other';
}

export function toLiveFeedEvent(input: {
  id: string;
  source: string;
  title: string;
  summary: string;
  severity: string;
  metadata?: Record<string, unknown> | undefined;
  time: Date;
  llmReason?: string;
}): LiveFeedEvent {
  const metadata = input.metadata ?? {};

  return {
    id: input.id,
    title: input.title,
    source: input.source,
    severity: input.severity,
    tickers: getFeedTickers(metadata),
    summary: input.summary,
    url: getFeedUrl(metadata),
    time: input.time.toISOString(),
    category: inferFeedCategory(input.source, metadata),
    llmReason: input.llmReason ?? '',
  };
}

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== socket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

export async function registerWebsocketPlugin(
  server: FastifyInstance,
  options: WebsocketPluginOptions,
): Promise<void> {
  await server.register(websocket);

  const clients = new Set<WebSocket>();
  const heartbeats = new Map<WebSocket, ReturnType<typeof setInterval>>();
  const unsubscribe = options.eventBus.subscribeTopic?.('event:classified', async (payload) => {
    for (const client of clients) {
      sendJson(client, {
        type: 'event',
        data: payload,
      });
    }
  });

  server.get<{ Querystring: { apiKey?: string } }>(
    '/ws/events',
    { websocket: true },
    async (socket, request) => {
      const queryApiKey = typeof request.query.apiKey === 'string'
        ? request.query.apiKey
        : undefined;
      const headerApiKey = typeof request.headers['x-api-key'] === 'string'
        ? request.headers['x-api-key']
        : undefined;
      const validation = validateApiKeyValue(queryApiKey ?? headerApiKey, options.apiKey);

      if (!validation.ok) {
        socket.close(1008, 'Unauthorized');
        return;
      }

      clients.add(socket);
      if (options.clientState) {
        options.clientState.count = clients.size;
      }

      const heartbeat = setInterval(() => {
        sendJson(socket, { type: 'ping' });
      }, 30_000);
      heartbeats.set(socket, heartbeat);

      socket.on('close', () => {
        clients.delete(socket);
        if (options.clientState) {
          options.clientState.count = clients.size;
        }
        const activeHeartbeat = heartbeats.get(socket);
        if (activeHeartbeat) {
          clearInterval(activeHeartbeat);
          heartbeats.delete(socket);
        }
      });
    },
  );

  server.addHook('onClose', async () => {
    unsubscribe?.();

    for (const heartbeat of heartbeats.values()) {
      clearInterval(heartbeat);
    }
    heartbeats.clear();

    for (const client of clients) {
      client.close();
    }
    clients.clear();
    if (options.clientState) {
      options.clientState.count = 0;
    }
  });
}
