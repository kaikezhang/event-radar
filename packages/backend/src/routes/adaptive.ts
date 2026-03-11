import type { FastifyInstance } from 'fastify';
import { AdaptiveClassifierService } from '../services/adaptive-classifier.js';
import { WeightHistoryService } from '../services/weight-history.js';
import type { Database } from '../db/connection.js';
import { requireApiKey } from './auth-middleware.js';

const LimitQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
} as const;

interface AdaptiveRouteOptions {
  apiKey?: string;
}

export function registerAdaptiveRoutes(
  server: FastifyInstance,
  db: Database,
  options?: AdaptiveRouteOptions,
): void {
  const adaptiveService = new AdaptiveClassifierService(db);
  const weightHistoryService = new WeightHistoryService(db);

  server.get('/api/v1/adaptive/weights', {
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async () => {
    return adaptiveService.getSourceWeights();
  });

  server.post('/api/v1/adaptive/recalculate', {
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async () => {
    return adaptiveService.recalculateWeights('manual_recalculation');
  });

  server.get('/api/v1/adaptive/queue', {
    schema: { querystring: LimitQuerySchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request) => {
    const query = request.query as { limit?: number };
    return adaptiveService.getReclassificationQueue(query.limit ?? 20);
  });

  server.get('/api/v1/adaptive/history', {
    schema: { querystring: LimitQuerySchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request) => {
    const query = request.query as { limit?: number };
    return weightHistoryService.getHistory(query.limit ?? 20);
  });
}
