import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { EventBus } from '@event-radar/shared';
import type { RawEvent } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { eq, desc } from 'drizzle-orm';
import { events } from '../db/schema.js';

export interface WebSocketClient {
  socket: {
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: 'message', handler: (data: unknown) => void): void;
    on(event: 'close', handler: () => void): void;
    on(event: 'pong', handler: () => void): void;
    on(event: 'error', handler: (err: unknown) => void): void;
  };
  apiKey: string;
  filters: EventFilters;
  isAlive: boolean;
}

export interface EventFilters {
  ticker?: string;
  severity?: string[];
  source?: string[];
  tier?: number[];
}

export interface WsMessage {
  type: 'event' | 'heartbeat' | 'init' | 'error' | 'filters_update';
  payload: unknown;
  timestamp: number;
}

export interface LiveEvent {
  id: string;
  source: string;
  sourceEventId: string | null;
  title: string;
  summary: string | null;
  severity: string | null;
  metadata: Record<string, unknown> | null;
  receivedAt: Date;
}

// In-memory store for connected clients
const clients = new Map<string, WebSocketClient>();

// Heartbeat interval
let heartbeatInterval: NodeJS.Timeout | null = null;

const HEARTBEAT_INTERVAL_MS = 30000;

export interface WebSocketPluginOptions {
  eventBus?: EventBus;
  db?: Database;
  getApiKey: () => string;
}

function serializeEvent(event: LiveEvent): Record<string, unknown> {
  return {
    id: event.id,
    source: event.source,
    sourceEventId: event.sourceEventId,
    title: event.title,
    summary: event.summary,
    severity: event.severity,
    metadata: event.metadata,
    receivedAt: event.receivedAt?.toISOString(),
    direction: (event.metadata as Record<string, unknown>)?.direction as string | undefined,
    ticker: (event.metadata as Record<string, unknown>)?.ticker as string | undefined,
    tier: (event.metadata as Record<string, unknown>)?.tier as number | undefined,
  };
}

function matchesFilters(event: LiveEvent, filters: EventFilters): boolean {
  if (filters.severity && filters.severity.length > 0) {
    if (!event.severity || !filters.severity.includes(event.severity)) {
      return false;
    }
  }

  if (filters.source && filters.source.length > 0) {
    if (!filters.source.includes(event.source)) {
      return false;
    }
  }

  if (filters.tier && filters.tier.length > 0) {
    const eventTier = (event.metadata as Record<string, unknown>)?.tier as number | undefined;
    if (eventTier === undefined || !filters.tier.includes(eventTier)) {
      return false;
    }
  }

  if (filters.ticker) {
    const eventTicker = (event.metadata as Record<string, unknown>)?.ticker as string | undefined;
    if (!eventTicker || !eventTicker.toLowerCase().includes(filters.ticker.toLowerCase())) {
      return false;
    }
  }

  return true;
}

function broadcastEvent(event: LiveEvent, excludeClientId?: string): void {
  const message: WsMessage = {
    type: 'event',
    payload: serializeEvent(event),
    timestamp: Date.now(),
  };

  const messageStr = JSON.stringify(message);

  for (const [clientId, client] of clients) {
    if (clientId === excludeClientId) continue;
    
    if (matchesFilters(event, client.filters)) {
      try {
        client.socket.send(messageStr);
      } catch (err: unknown) {
        console.error(`Failed to send event to client ${clientId}:`, err);
      }
    }
  }
}

function broadcastHeartbeat(): void {
  const message: WsMessage = {
    type: 'heartbeat',
    payload: { timestamp: Date.now() },
    timestamp: Date.now(),
  };

  const messageStr = JSON.stringify(message);

  for (const [clientId, client] of clients) {
    try {
      client.socket.send(messageStr);
    } catch (err: unknown) {
      console.error(`Failed to send heartbeat to client ${clientId}:`, err);
    }
  }
}

async function sendInitialEvents(
  client: WebSocketClient,
  db: Database,
  limit: number = 50
): Promise<void> {
  try {
    const query = db
      .select()
      .from(events)
      .orderBy(desc(events.receivedAt))
      .limit(limit);

    const conditions = [];

    if (client.filters.severity && client.filters.severity.length > 0) {
      conditions.push(eq(events.severity, client.filters.severity[0] as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'));
    }

    if (client.filters.source && client.filters.source.length > 0) {
      conditions.push(eq(events.source, client.filters.source[0]));
    }

    const initialEvents = await query;

    const filteredEvents = initialEvents
      .map((e) => ({
        ...e,
        metadata: e.metadata as Record<string, unknown> | null,
      }))
      .filter((e) => matchesFilters(e, client.filters));

    const message: WsMessage = {
      type: 'init',
      payload: {
        events: filteredEvents.map(serializeEvent),
        total: filteredEvents.length,
      },
      timestamp: Date.now(),
    };

    client.socket.send(JSON.stringify(message));
  } catch (err: unknown) {
    console.error('Failed to send initial events:', err);
    
    const errorMessage: WsMessage = {
      type: 'error',
      payload: { message: 'Failed to load initial events' },
      timestamp: Date.now(),
    };
    client.socket.send(JSON.stringify(errorMessage));
  }
}

export async function registerWebSocketPlugin(
  server: FastifyInstance,
  options: WebSocketPluginOptions
): Promise<void> {
  await server.register(websocket, {
    options: {
      maxPayload: 1024 * 1024, // 1MB max message size
    },
  });

  // Subscribe to event bus if provided
  if (options.eventBus) {
    options.eventBus.subscribe(async (event: RawEvent) => {
      const liveEvent: LiveEvent = {
        id: event.id,
        source: event.source,
        sourceEventId: (event.metadata as Record<string, unknown>)?.sourceEventId as string | null,
        title: event.title,
        summary: (event.metadata as Record<string, unknown>)?.summary as string | null,
        severity: (event.metadata as Record<string, unknown>)?.severity as string | null,
        metadata: event.metadata as Record<string, unknown> | null,
        receivedAt: new Date(),
      };

      broadcastEvent(liveEvent);
    });
  }

  // Start heartbeat interval
  if (!heartbeatInterval) {
    heartbeatInterval = setInterval(broadcastHeartbeat, HEARTBEAT_INTERVAL_MS);
  }

  server.get('/ws/events', { websocket: true }, async (socket, request) => {
    // Extract API key from query params
    const url = new URL(request.url, 'http://localhost');
    const apiKey = url.searchParams.get('apiKey');
    const providedKey = options.getApiKey();

    // Validate API key
    if (apiKey !== providedKey) {
      const errorMsg: WsMessage = {
        type: 'error',
        payload: { message: 'Invalid or missing API key' },
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(errorMsg));
      socket.close(4001, 'Unauthorized');
      return;
    }

    // Generate client ID
    const clientId = crypto.randomUUID();
    
    // Initialize client
    const client: WebSocketClient = {
      socket,
      apiKey,
      filters: {},
      isAlive: true,
    };

    clients.set(clientId, client);

    console.log(`WebSocket client connected: ${clientId}`);

    // Send initial events if database is available
    if (options.db) {
      await sendInitialEvents(client, options.db);
    }

    // Handle incoming messages
    socket.on('message', async (data: unknown) => {
      try {
        const message = JSON.parse(String(data));

        if (message.type === 'filters_update') {
          client.filters = message.payload as EventFilters;
          
          // Re-send filtered events when filters change
          if (options.db) {
            await sendInitialEvents(client, options.db);
          }

          const ackMessage: WsMessage = {
            type: 'filters_update',
            payload: { success: true },
            timestamp: Date.now(),
          };
          socket.send(JSON.stringify(ackMessage));
        }
      } catch (err: unknown) {
        console.error('Failed to parse WebSocket message:', err);
        
        const errorMsg: WsMessage = {
          type: 'error',
          payload: { message: 'Invalid message format' },
          timestamp: Date.now(),
        };
        socket.send(JSON.stringify(errorMsg));
      }
    });

    // Handle pong for heartbeat
    socket.on('pong', () => {
      client.isAlive = true;
    });

    // Handle close
    socket.on('close', () => {
      clients.delete(clientId);
      console.log(`WebSocket client disconnected: ${clientId}`);
    });

    // Handle errors
    socket.on('error', (err: unknown) => {
      console.error(`WebSocket error for client ${clientId}:`, err);
      clients.delete(clientId);
    });
  });

  // Cleanup on server close
  server.addHook('onClose', async () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    // Close all client connections
    for (const [clientId, client] of clients) {
      try {
        client.socket.close(1001, 'Server shutting down');
      } catch (err: unknown) {
        console.error(`Error closing client ${clientId}:`, err);
      }
    }
    clients.clear();
  });
}

// Helper to get connected client count
export function getConnectedClientCount(): number {
  return clients.size;
}

// Helper to check if a client is connected
export function isClientConnected(clientId: string): boolean {
  return clients.has(clientId);
}
