import type { FastifyInstance } from 'fastify';
import { requireApiKey } from './auth-middleware.js';
import type { IDeliveryKillSwitch } from '../services/delivery-kill-switch.js';
import type { HealthMonitorService } from '../services/health-monitor.js';

export interface AdminDeliveryRouteOptions {
  apiKey?: string;
  killSwitch: IDeliveryKillSwitch;
  healthMonitor: HealthMonitorService;
}

export function registerAdminDeliveryRoutes(
  server: FastifyInstance,
  options: AdminDeliveryRouteOptions,
): void {
  const withAuth = async (
    request: Parameters<typeof requireApiKey>[0],
    reply: Parameters<typeof requireApiKey>[1],
  ) => requireApiKey(request, reply, options.apiKey);

  const { killSwitch, healthMonitor } = options;

  // Kill switch endpoints
  server.post('/api/admin/delivery/kill', { preHandler: withAuth }, async (request, reply) => {
    const body = request.body as { reason?: string } | undefined;
    const status = await killSwitch.activate(body?.reason);
    return reply.send(status);
  });

  server.post('/api/admin/delivery/resume', { preHandler: withAuth }, async (_request, reply) => {
    const status = await killSwitch.deactivate();
    return reply.send(status);
  });

  server.get('/api/admin/delivery/status', { preHandler: withAuth }, async (_request, reply) => {
    const status = await killSwitch.getStatus();
    return reply.send(status);
  });

  // Health delivery stats (public — useful for monitoring dashboards)
  server.get('/api/health/delivery-stats', async (_request, reply) => {
    const stats = await healthMonitor.getDeliveryStats();
    return reply.send(stats);
  });
}
