import type { FastifyInstance } from 'fastify';
import type { IMarketRegimeService } from '@event-radar/shared';
import { requireApiKey } from './auth-middleware.js';
import { MarketRegimeService } from '../services/market-regime.js';

export interface RegimeRouteOptions {
  apiKey?: string;
  marketRegimeService?: IMarketRegimeService;
}

export function registerRegimeRoutes(
  server: FastifyInstance,
  options?: RegimeRouteOptions,
): void {
  const withAuth = async (
    request: Parameters<typeof requireApiKey>[0],
    reply: Parameters<typeof requireApiKey>[1],
  ) => requireApiKey(request, reply, options?.apiKey);

  const marketRegimeService = options?.marketRegimeService ?? new MarketRegimeService();

  server.get('/api/regime', { preHandler: withAuth }, async (_request, reply) => {
    const snapshot = await marketRegimeService.getRegimeSnapshot();
    return reply.send(snapshot);
  });
}
