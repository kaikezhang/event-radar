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
  if (['federal-register', 'truth-social'].includes(normalizedSource)) {
    return 'policy';
  }
  if (['econ-calendar', 'fed', 'bls'].includes(normalizedSource)) {
    return 'macro';
  }
  if (['state-department', 'defense', 'geopolitics'].includes(normalizedSource)) {
    return 'geopolitics';
  }
  if ([
    'sec-edgar',
    'fda',
    'breaking-news',
    'businesswire',
    'globenewswire',
    'pr-newswire',
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

// ── Connection rate limiter (per IP) ─────────────────────────────────────────
const WS_MAX_CONNECTIONS_PER_IP = 10;
const WS_CONNECTION_WINDOW_MS = 60_000; // 1 minute
const WS_MAX_MESSAGES_PER_CONNECTION = 100;
const WS_MESSAGE_WINDOW_MS = 60_000; // 1 minute

const connectionTimestamps = new Map<string, number[]>();

function checkConnectionRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (connectionTimestamps.get(ip) ?? []).filter(
    (t) => now - t < WS_CONNECTION_WINDOW_MS,
  );

  if (timestamps.length >= WS_MAX_CONNECTIONS_PER_IP) {
    connectionTimestamps.set(ip, timestamps);
    return false;
  }

  timestamps.push(now);
  connectionTimestamps.set(ip, timestamps);
  return true;
}

// ── Message rate limiter (per connection) ────────────────────────────────────

class MessageRateLimiter {
  private timestamps: number[] = [];

  check(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < WS_MESSAGE_WINDOW_MS);
    if (this.timestamps.length >= WS_MAX_MESSAGES_PER_CONNECTION) {
      return false;
    }
    this.timestamps.push(now);
    return true;
  }
}

// Exported for testing
export { checkConnectionRateLimit, connectionTimestamps, WS_MAX_CONNECTIONS_PER_IP, WS_MAX_MESSAGES_PER_CONNECTION };

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
      // ── Connection rate limiting (per IP) ──
      const ip = request.ip;
      if (!checkConnectionRateLimit(ip)) {
        socket.close(1008, 'Too many connections');
        return;
      }

      // ── Auth: prefer header-based, keep query string for backward compat ──
      // Sec-WebSocket-Protocol subprotocol auth: client sends "auth.<apiKey>"
      const protocolHeader = request.headers['sec-websocket-protocol'];
      let protocolApiKey: string | undefined;
      if (typeof protocolHeader === 'string') {
        const protocols = protocolHeader.split(',').map((p) => p.trim());
        const authProtocol = protocols.find((p) => p.startsWith('auth.'));
        if (authProtocol) {
          protocolApiKey = authProtocol.slice(5); // strip "auth." prefix
        }
      }

      const headerApiKey = typeof request.headers['x-api-key'] === 'string'
        ? request.headers['x-api-key']
        : undefined;

      // Query string auth — backward compat with deprecation warning
      const queryApiKey = typeof request.query.apiKey === 'string'
        ? request.query.apiKey
        : undefined;
      if (queryApiKey) {
        server.log.warn(
          '[ws] DEPRECATED: API key in query string (?apiKey=) is insecure and will be removed in a future release. ' +
          'Use Sec-WebSocket-Protocol subprotocol (auth.<key>) or X-Api-Key header instead.',
        );
      }

      // Priority: subprotocol > header > query string (deprecated)
      const apiKeyToValidate = protocolApiKey ?? headerApiKey ?? queryApiKey;
      const validation = validateApiKeyValue(apiKeyToValidate, options.apiKey);

      if (!validation.ok) {
        // Allow keyless connections when auth is not required
        const authRequired = process.env.AUTH_REQUIRED === 'true';
        if (authRequired || apiKeyToValidate) {
          socket.close(1008, 'Unauthorized');
          return;
        }
      }

      // If authenticated via subprotocol, echo it back so the browser accepts
      if (protocolApiKey) {
        // The subprotocol is already negotiated by @fastify/websocket based on
        // the Sec-WebSocket-Protocol header; no extra action needed here.
      }

      clients.add(socket);
      if (options.clientState) {
        options.clientState.count = clients.size;
      }

      // ── Message rate limiting ──
      const msgLimiter = new MessageRateLimiter();

      socket.on('message', () => {
        if (!msgLimiter.check()) {
          socket.close(1008, 'Message rate limit exceeded');
        }
      });

      const heartbeat = setInterval(() => {
        if (socket.readyState === socket.OPEN) {
          socket.ping();
        }
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
