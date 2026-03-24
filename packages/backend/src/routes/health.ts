import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/connection.js';
import type { ScannerRegistry } from '@event-radar/shared';
import { events } from '../db/schema.js';

interface HealthRouteOptions {
  db?: Database;
  registry: ScannerRegistry;
  version: string;
  startTime: number;
}

async function getDatabaseStatus(db?: Database): Promise<'connected' | 'disconnected' | 'unknown'> {
  if (!db) {
    return 'unknown';
  }

  try {
    await db.select({ id: events.id }).from(events).limit(1);
    return 'connected';
  } catch {
    return 'disconnected';
  }
}

export function registerHealthRoutes(
  server: FastifyInstance,
  options: HealthRouteOptions,
): void {
  server.get('/api/health', async (_request, reply) => {
    const scannerHealth = options.registry.healthAll();
    const database = await getDatabaseStatus(options.db);
    const activeScanners = scannerHealth.filter((scanner) => scanner.status !== 'down').length;

    return reply.send({
      status: database === 'disconnected' ? 'degraded' : 'healthy',
      version: options.version,
      uptime: Math.floor((Date.now() - options.startTime) / 1000),
      timestamp: new Date().toISOString(),
      services: {
        database,
        scanners: {
          active: activeScanners,
          total: scannerHealth.length,
        },
      },
    });
  });
}
