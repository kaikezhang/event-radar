import type { FastifyInstance } from 'fastify';
import { ClassificationAccuracyService } from '../services/classification-accuracy.js';
import type { Database } from '../db/connection.js';

const EventIdParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

const AccuracyStatsQuerySchema = {
  type: 'object',
  properties: {
    period: { type: 'string', enum: ['7d', '30d', '90d', 'all'] },
    groupBy: { type: 'string', enum: ['source', 'eventType'] },
  },
} as const;

export function registerAccuracyRoutes(
  server: FastifyInstance,
  db: Database,
): void {
  const accuracyService = new ClassificationAccuracyService(db);

  server.get('/api/v1/accuracy/stats', {
    schema: { querystring: AccuracyStatsQuerySchema },
  }, async (request) => {
    const query = request.query as {
      period?: '7d' | '30d' | '90d' | 'all';
      groupBy?: 'source' | 'eventType';
    };

    const stats = await accuracyService.getAccuracyStats({
      period: query.period,
      groupBy: query.groupBy,
    });

    if (query.groupBy === 'source') {
      return { ...stats, groups: stats.bySource };
    }

    if (query.groupBy === 'eventType') {
      return { ...stats, groups: stats.byEventType };
    }

    return stats;
  });

  server.get('/api/v1/accuracy/events/:id', {
    schema: { params: EventIdParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const details = await accuracyService.getEventAccuracy(id);

    if (!details) {
      return reply.status(404).send({ error: 'Accuracy data not found' });
    }

    return details;
  });
}
