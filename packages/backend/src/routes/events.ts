import type { FastifyInstance } from 'fastify';
import { eq, sql, and, count } from 'drizzle-orm';
import { events } from '../db/schema.js';
import type { Database } from '../db/connection.js';

export function registerEventRoutes(
  server: FastifyInstance,
  db: Database,
): void {
  server.get('/api/events', async (request) => {
    const { source, severity, limit, offset } = request.query as {
      source?: string;
      severity?: string;
      limit?: string;
      offset?: string;
    };

    const pageLimit = Math.min(Number(limit) || 50, 200);
    const pageOffset = Number(offset) || 0;

    const conditions = [];
    if (source) conditions.push(eq(events.source, source));
    if (severity) conditions.push(eq(events.severity, severity));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(events)
        .where(where)
        .orderBy(sql`${events.receivedAt} desc`)
        .limit(pageLimit)
        .offset(pageOffset),
      db.select({ total: count() }).from(events).where(where),
    ]);

    return { data, total };
  });

  server.get('/api/events/sources', async () => {
    const rows = await db
      .selectDistinct({ source: events.source })
      .from(events)
      .orderBy(events.source);

    return { sources: rows.map((r) => r.source) };
  });

  server.get('/api/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    if (!event) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    return event;
  });

  server.get('/api/stats', async () => {
    const [bySource, bySeverity, [{ total }]] = await Promise.all([
      db
        .select({ source: events.source, count: count() })
        .from(events)
        .groupBy(events.source),
      db
        .select({ severity: events.severity, count: count() })
        .from(events)
        .groupBy(events.severity),
      db.select({ total: count() }).from(events),
    ]);

    return { bySource, bySeverity, total };
  });
}
