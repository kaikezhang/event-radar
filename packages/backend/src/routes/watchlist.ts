import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { watchlist } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import { requireApiKey } from './auth-middleware.js';

export interface WatchlistRouteOptions {
  apiKey?: string;
}

export function registerWatchlistRoutes(
  server: FastifyInstance,
  db: Database,
  options?: WatchlistRouteOptions,
): void {
  const withAuth = async (
    request: Parameters<typeof requireApiKey>[0],
    reply: Parameters<typeof requireApiKey>[1],
  ) => requireApiKey(request, reply, options?.apiKey);

  /**
   * GET /api/watchlist
   * List all watchlist tickers
   */
  server.get('/api/watchlist', { preHandler: withAuth }, async () => {
    const data = await db
      .select()
      .from(watchlist)
      .orderBy(watchlist.addedAt);

    return { data };
  });

  /**
   * POST /api/watchlist
   * Add a ticker to the watchlist
   */
  server.post('/api/watchlist', {
    preHandler: withAuth,
    schema: {
      body: {
        type: 'object',
        required: ['ticker'],
        properties: {
          ticker: {
            type: 'string',
            pattern: '^[A-Z]{1,5}$',
            description: 'Ticker symbol (1-5 uppercase letters)',
          },
          notes: {
            type: 'string',
            description: 'Optional notes',
          },
        },
      },
    },
  }, async (request, reply) => {
    const { ticker, notes } = request.body as { ticker: string; notes?: string };

    // Check if ticker already exists
    const [existing] = await db
      .select()
      .from(watchlist)
      .where(eq(watchlist.ticker, ticker))
      .limit(1);

    if (existing) {
      return reply.status(409).send({ error: 'Ticker already in watchlist' });
    }

    const [inserted] = await db
      .insert(watchlist)
      .values({ ticker, notes: notes ?? null })
      .returning();

    return reply.status(201).send(inserted);
  });

  /**
   * DELETE /api/watchlist/:ticker
   * Remove a ticker from the watchlist
   */
  server.delete('/api/watchlist/:ticker', {
    preHandler: withAuth,
    schema: {
      params: {
        type: 'object',
        required: ['ticker'],
        properties: {
          ticker: {
            type: 'string',
            description: 'Ticker symbol to remove',
          },
        },
      },
    },
  }, async (request, reply) => {
    const { ticker } = request.params as { ticker: string };
    const upperTicker = ticker.toUpperCase();

    const deleted = await db
      .delete(watchlist)
      .where(eq(watchlist.ticker, upperTicker))
      .returning();

    if (deleted.length === 0) {
      return reply.status(404).send({ error: 'Ticker not found in watchlist' });
    }

    return { ok: true };
  });
}
