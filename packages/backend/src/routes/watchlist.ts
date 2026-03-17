import type { FastifyInstance } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { watchlist, tickerReference } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import { requireApiKey } from './auth-middleware.js';
import { ensureUserExists, resolveRequestUserId } from './user-context.js';

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
  server.get('/api/watchlist', { preHandler: withAuth }, async (request) => {
    const userId = resolveRequestUserId(request);
    const data = await db
      .select({
        id: watchlist.id,
        userId: watchlist.userId,
        ticker: watchlist.ticker,
        notes: watchlist.notes,
        addedAt: watchlist.addedAt,
        name: tickerReference.name,
        sectionId: watchlist.sectionId,
        sortOrder: watchlist.sortOrder,
      })
      .from(watchlist)
      .leftJoin(tickerReference, eq(watchlist.ticker, tickerReference.ticker))
      .where(eq(watchlist.userId, userId))
      .orderBy(watchlist.sortOrder, watchlist.addedAt);

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
            pattern: '^[A-Z.]{1,10}$',
            description: 'Ticker symbol (1-10 uppercase letters/dots, e.g. BRK.B)',
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
    const userId = resolveRequestUserId(request);

    await ensureUserExists(db, userId);

    // Check if ticker already exists
    const [existing] = await db
      .select()
      .from(watchlist)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.ticker, ticker)))
      .limit(1);

    if (existing) {
      return reply.status(409).send({ error: 'Ticker already in watchlist' });
    }

    // Check if ticker exists in reference table
    const [knownTicker] = await db
      .select()
      .from(tickerReference)
      .where(eq(tickerReference.ticker, ticker))
      .limit(1);

    const [inserted] = await db
      .insert(watchlist)
      .values({ userId, ticker, notes: notes ?? null })
      .returning();

    const response: Record<string, unknown> = { ...inserted };
    if (!knownTicker) {
      response.warning = `Ticker "${ticker}" not found in our reference database. It may still be valid.`;
    }

    return reply.status(201).send(response);
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
    const userId = resolveRequestUserId(request);

    const deleted = await db
      .delete(watchlist)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.ticker, upperTicker)))
      .returning();

    if (deleted.length === 0) {
      return reply.status(404).send({ error: 'Ticker not found in watchlist' });
    }

    return { ok: true };
  });
}
