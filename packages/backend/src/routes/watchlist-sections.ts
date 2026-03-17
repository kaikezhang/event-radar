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
    const { name: rawName, color } = request.body as { name: string; color?: string };
    const name = rawName.trim();
    const userId = resolveRequestUserId(request);

    if (!name) {
      return reply.status(400).send({ error: 'Section name cannot be empty' });
    }

    await ensureUserExists(db, userId);

    // Validate color
    const resolvedColor = color ?? 'gray';
    if (!VALID_COLORS.includes(resolvedColor as typeof VALID_COLORS[number])) {
      return reply.status(400).send({ error: `Invalid color. Must be one of: ${VALID_COLORS.join(', ')}` });
    }

    try {
      const inserted = await db.transaction(async (tx) => {
        // Check max sections
        const [{ value: sectionCount }] = await tx
          .select({ value: count() })
          .from(watchlistSections)
          .where(eq(watchlistSections.userId, userId));

        if (sectionCount >= MAX_SECTIONS) {
          throw Object.assign(new Error(`Maximum ${MAX_SECTIONS} sections allowed`), { statusCode: 400 });
        }

        // Check unique name
        const [existing] = await tx
          .select()
          .from(watchlistSections)
          .where(and(eq(watchlistSections.userId, userId), eq(watchlistSections.name, name)))
          .limit(1);

        if (existing) {
          throw Object.assign(new Error('A section with this name already exists'), { statusCode: 409 });
        }

        // Determine next sortOrder
        const [maxOrder] = await tx
          .select({ maxSort: sql<number>`COALESCE(MAX(${watchlistSections.sortOrder}), -1)` })
          .from(watchlistSections)
          .where(eq(watchlistSections.userId, userId));

        const [row] = await tx
          .insert(watchlistSections)
          .values({
            userId,
            name,
            color: resolvedColor,
            sortOrder: (maxOrder?.maxSort ?? -1) + 1,
          })
          .returning();

        return row;
      });

      return reply.status(201).send(inserted);
    } catch (err: unknown) {
      if (err instanceof Error && 'statusCode' in err) {
        const code = (err as Error & { statusCode: number }).statusCode;
        return reply.status(code).send({ error: err.message });
      }
      if (err instanceof Error && err.message.includes('idx_ws_user_name')) {
        return reply.status(409).send({ error: 'A section with this name already exists' });
      }
      throw err;
    }
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
      if (!trimmedName) {
        return reply.status(400).send({ error: 'Section name cannot be empty' });
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

    try {
      const updated = await db.transaction(async (tx) => {
        if (updates.name) {
          const [existing] = await tx
            .select()
            .from(watchlistSections)
            .where(and(
              eq(watchlistSections.userId, userId),
              eq(watchlistSections.name, updates.name as string),
            ))
            .limit(1);

          if (existing && existing.id !== id) {
            throw Object.assign(new Error('A section with this name already exists'), { statusCode: 409 });
          }
        }

        const [row] = await tx
          .update(watchlistSections)
          .set(updates)
          .where(and(eq(watchlistSections.id, id), eq(watchlistSections.userId, userId)))
          .returning();

        return row;
      });

      return updated;
    } catch (err: unknown) {
      if (err instanceof Error && 'statusCode' in err) {
        const code = (err as Error & { statusCode: number }).statusCode;
        return reply.status(code).send({ error: err.message });
      }
      if (err instanceof Error && err.message.includes('idx_ws_user_name')) {
        return reply.status(409).send({ error: 'A section with this name already exists' });
      }
      throw err;
    }
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

    // Validate all sectionIds belong to current user
    const sectionIds = [...new Set(items.filter(i => i.sectionId).map(i => i.sectionId as string))];
    if (sectionIds.length > 0) {
      const ownedSections = await db
        .select({ id: watchlistSections.id })
        .from(watchlistSections)
        .where(and(eq(watchlistSections.userId, userId)));
      const ownedIds = new Set(ownedSections.map(s => s.id));
      const invalid = sectionIds.filter(id => !ownedIds.has(id));
      if (invalid.length > 0) {
        return reply.status(400).send({ error: 'Invalid section ID(s) — not owned by current user' });
      }
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
