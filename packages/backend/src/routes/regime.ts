import type { FastifyInstance } from 'fastify';
import type { IMarketRegimeService } from '@event-radar/shared';
import { z } from 'zod';
import { requireApiKey } from './auth-middleware.js';
import { MarketRegimeService, toRegimeHistoryPoint, type RegimeHistoryPoint } from '../services/market-regime.js';

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
  const historyService = marketRegimeService as IMarketRegimeService & {
    getHistory?: (hours: number) => Promise<RegimeHistoryPoint[]>;
    getRegimeHistory?: (hours: number) => Promise<RegimeHistoryPoint[]>;
  };
  const HistoryQuerySchema = z.object({
    hours: z.coerce.number().int().min(1).max(168).default(24),
  });

  server.get('/api/regime', { preHandler: withAuth }, async (_request, reply) => {
    const snapshot = await marketRegimeService.getRegimeSnapshot();
    return reply.send(snapshot);
  });

  server.get('/api/v1/regime/history', { preHandler: withAuth }, async (request, reply) => {
    const parsed = HistoryQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'hours must be between 1 and 168',
      });
    }

    const snapshots = typeof historyService.getRegimeHistory === 'function'
      ? await historyService.getRegimeHistory(parsed.data.hours)
      : typeof historyService.getHistory === 'function'
        ? await historyService.getHistory(parsed.data.hours)
        : [];

    if (snapshots.length > 0) {
      return reply.send({ snapshots });
    }

    const snapshot = await marketRegimeService.getRegimeSnapshot();
    return reply.send({
      snapshots: [toRegimeHistoryPoint(snapshot)],
    });
  });
}
