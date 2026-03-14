import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ScannerRegistry } from '@event-radar/shared';
import { normalizeScannerId } from '@event-radar/shared/scanner-registry';
import type { Database } from '../db/connection.js';
import { events } from '../db/schema.js';

export function registerScannerRoutes(
  server: FastifyInstance,
  registry: ScannerRegistry,
  db?: Database,
): void {
  /**
   * GET /api/scanners/status
   * Returns health status for all registered scanners.
   * Includes: scanner name, last success time, error count, status (healthy/degraded/down)
   * Alerts if scanner hasn't succeeded in 5 minutes.
   */
  server.get('/api/scanners/status', async (_request, reply) => {
    const healthList = registry.healthAll();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    const scanners = healthList.map((h) => {
      let status: 'healthy' | 'degraded' | 'down' = h.status;

      // Override status based on last scan time
      if (h.lastScanAt) {
        const lastScan = new Date(h.lastScanAt).getTime();
        if (lastScan < fiveMinutesAgo) {
          status = 'down';
        } else if (h.errorCount > 5) {
          status = 'degraded';
        }
      } else if (h.errorCount > 0) {
        status = 'down';
      }

      return {
        name: h.scanner,
        status,
        lastSuccessAt: h.lastScanAt,
        errorCount: h.errorCount,
        message: h.message,
        alert: status === 'down',
      };
    });

    const healthyCount = scanners.filter((s) => s.status === 'healthy').length;
    const degradedCount = scanners.filter((s) => s.status === 'degraded').length;
    const downCount = scanners.filter((s) => s.status === 'down').length;

    return reply.send({
      scanners,
      summary: {
        total: scanners.length,
        healthy: healthyCount,
        degraded: degradedCount,
        down: downCount,
        alert: downCount > 0,
      },
    });
  });

  server.get<{
    Params: { name: string };
    Querystring: { limit?: string };
  }>('/api/v1/scanners/:name/events', async (request, reply) => {
    if (!db) {
      return reply.code(503).send({ error: 'Database not configured' });
    }

    const paramsResult = z.object({ name: z.string().trim().min(1) }).safeParse(request.params);
    const queryResult = z.object({
      limit: z.coerce.number().int().min(1).max(50).default(10),
    }).safeParse(request.query);

    if (!paramsResult.success || !queryResult.success) {
      return reply.code(400).send({ error: 'Invalid scanner request' });
    }

    const scannerName = normalizeScannerId(paramsResult.data.name);

    const rows = await db
      .select({
        id: events.id,
        title: events.title,
        summary: events.summary,
        severity: events.severity,
        metadata: events.metadata,
        receivedAt: events.receivedAt,
        createdAt: events.createdAt,
      })
      .from(events)
      .where(eq(events.source, scannerName))
      .orderBy(desc(events.receivedAt), desc(events.createdAt))
      .limit(queryResult.data.limit);

    return reply.send({
      scanner: scannerName,
      count: rows.length,
      events: rows.map((row) => {
        const metadata =
          row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
            ? row.metadata as Record<string, unknown>
            : {};
        const tickers = Array.isArray(metadata.tickers)
          ? metadata.tickers.filter((ticker): ticker is string => typeof ticker === 'string')
          : typeof metadata.ticker === 'string'
            ? [metadata.ticker]
            : [];

        return {
          id: row.id,
          title: row.title,
          summary: row.summary ?? '',
          severity: row.severity ?? 'MEDIUM',
          tickers,
          received_at: row.receivedAt.toISOString(),
        };
      }),
    });
  });
}
