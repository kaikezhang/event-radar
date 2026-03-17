import type { FastifyInstance } from 'fastify';
import { and, eq, sql, count } from 'drizzle-orm';
import { watchlistSections, watchlist } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import { requireApiKey } from './auth-middleware.js';
import { ensureUserExists, resolveRequestUserId } from './user-context.js';

const VALID_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'] as const;
const MAX_SECTIONS = 20;

export interface WatchlistSectionRouteOptions {
  apiKey?: string;
}

export function registerWatchlistSectionRoutes(
  server: FastifyInstance,
  db: Database,
  options?: WatchlistSectionRouteOptions,
): void {
  const withAuth = async (
    request: Parameters<typeof requireApiKey>[0],
    reply: Parameters<typeof requireApiKey>[1],
  ) => requireApiKey(request, reply, options?.apiKey);

  /**
   * GET /api/watchlist/sections
   * List user's sections ordered by sortOrder
   */
  server.get('/api/watchlist/sections', { preHandler: withAuth }, async (request) => {
    const userId = resolveRequestUserId(request);
    const data = await db
      .select()
      .from(watchlistSections)
      .where(eq(watchlistSections.userId, userId))
      .orderBy(watchlistSections.sortOrder);

    return { data };
  });

  /**
   * POST /api/watchlist/sections
   * Create a new section
   */
  server.post('/api/watchlist/sections', {
    preHandler: withAuth,
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          color: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { name, color } = request.body as { name: string; color?: string };
    const userId = resolveRequestUserId(request);

    await ensureUserExists(db, userId);

    // Validate color
    const resolvedColor = color ?? 'gray';
    if (!VALID_COLORS.includes(resolvedColor as typeof VALID_COLORS[number])) {
      return reply.status(400).send({ error: `Invalid color. Must be one of: ${VALID_COLORS.join(', ')}` });
    }

    // Check max sections
    const [{ value: sectionCount }] = await db
      .select({ value: count() })
      .from(watchlistSections)
      .where(eq(watchlistSections.userId, userId));

    if (sectionCount >= MAX_SECTIONS) {
      return reply.status(400).send({ error: `Maximum ${MAX_SECTIONS} sections allowed` });
    }

    // Check unique name
    const [existing] = await db
      .select()
      .from(watchlistSections)
      .where(and(eq(watchlistSections.userId, userId), eq(watchlistSections.name, name.trim())))
      .limit(1);

    if (existing) {
      return reply.status(409).send({ error: 'A section with this name already exists' });
    }

    // Determine next sortOrder
    const [maxOrder] = await db
      .select({ maxSort: sql<number>`COALESCE(MAX(${watchlistSections.sortOrder}), -1)` })
      .from(watchlistSections)
      .where(eq(watchlistSections.userId, userId));

    const [inserted] = await db
      .insert(watchlistSections)
      .values({
        userId,
        name: name.trim(),
        color: resolvedColor,
        sortOrder: (maxOrder?.maxSort ?? -1) + 1,
      })
      .returning();

    return reply.status(201).send(inserted);
  });

  /**
   * PATCH /api/watchlist/sections/:id
   * Update a section
   */
  server.patch('/api/watchlist/sections/:id', {
    preHandler: withAuth,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          color: { type: 'string' },
          sortOrder: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; color?: string; sortOrder?: number };
    const userId = resolveRequestUserId(request);

    // Verify ownership
    const [section] = await db
      .select()
      .from(watchlistSections)
      .where(and(eq(watchlistSections.id, id), eq(watchlistSections.userId, userId)))
      .limit(1);

    if (!section) {
      return reply.status(404).send({ error: 'Section not found' });
    }

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const trimmedName = body.name.trim();
      // Check unique name (excluding current section)
      const [existing] = await db
        .select()
        .from(watchlistSections)
        .where(and(
          eq(watchlistSections.userId, userId),
          eq(watchlistSections.name, trimmedName),
        ))
        .limit(1);

      if (existing && existing.id !== id) {
        return reply.status(409).send({ error: 'A section with this name already exists' });
      }
      updates.name = trimmedName;
    }

    if (body.color !== undefined) {
      if (!VALID_COLORS.includes(body.color as typeof VALID_COLORS[number])) {
        return reply.status(400).send({ error: `Invalid color. Must be one of: ${VALID_COLORS.join(', ')}` });
      }
      updates.color = body.color;
    }

    if (body.sortOrder !== undefined) {
      updates.sortOrder = body.sortOrder;
    }

    if (Object.keys(updates).length === 0) {
      return section;
    }

    const [updated] = await db
      .update(watchlistSections)
      .set(updates)
      .where(and(eq(watchlistSections.id, id), eq(watchlistSections.userId, userId)))
      .returning();

    return updated;
  });

  /**
   * DELETE /api/watchlist/sections/:id
   * Delete a section (tickers move to null/unsectioned)
   */
  server.delete('/api/watchlist/sections/:id', {
    preHandler: withAuth,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = resolveRequestUserId(request);

    const deleted = await db
      .delete(watchlistSections)
      .where(and(eq(watchlistSections.id, id), eq(watchlistSections.userId, userId)))
      .returning();

    if (deleted.length === 0) {
      return reply.status(404).send({ error: 'Section not found' });
    }

    return { ok: true };
  });

  /**
   * PATCH /api/watchlist/reorder
   * Bulk update ticker positions
   */
  server.patch('/api/watchlist/reorder', {
    preHandler: withAuth,
    schema: {
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['ticker', 'sortOrder'],
              properties: {
                ticker: { type: 'string' },
                sortOrder: { type: 'integer' },
                sectionId: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { items } = request.body as {
      items: Array<{ ticker: string; sortOrder: number; sectionId?: string | null }>;
    };
    const userId = resolveRequestUserId(request);

    if (items.length === 0) {
      return { ok: true };
    }

    // Update all items in a single transaction
    await db.transaction(async (tx) => {
      for (const item of items) {
        const updates: Record<string, unknown> = { sortOrder: item.sortOrder };
        if (item.sectionId !== undefined) {
          updates.sectionId = item.sectionId;
        }

        await tx
          .update(watchlist)
          .set(updates)
          .where(and(eq(watchlist.userId, userId), eq(watchlist.ticker, item.ticker)));
      }
    });

    return { ok: true };
  });
}
