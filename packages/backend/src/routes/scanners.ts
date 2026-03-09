import type { FastifyInstance } from 'fastify';
import type { ScannerRegistry } from '@event-radar/shared';

export function registerScannerRoutes(
  server: FastifyInstance,
  registry: ScannerRegistry,
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
}
