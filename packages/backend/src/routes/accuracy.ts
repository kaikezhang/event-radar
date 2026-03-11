import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ClassificationAccuracyService } from '../services/classification-accuracy.js';
import { DirectionAnalyticsService } from '../services/direction-analytics.js';
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

const DirectionQuerySchema = {
  type: 'object',
  properties: {
    period: { type: 'string', enum: ['7d', '30d', '90d', 'all'] },
  },
} as const;

const MispredictionsQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    period: { type: 'string', enum: ['7d', '30d', '90d', 'all'] },
  },
} as const;

interface AccuracyRouteOptions {
  apiKey?: string;
}

async function requireApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
  apiKey?: string,
): Promise<void> {
  if (request.apiKeyAuthenticated) {
    return;
  }

  const providedKey = request.headers['x-api-key'];
  if (!providedKey) {
    await reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing X-API-Key header',
    });
    return;
  }

  if (apiKey && providedKey !== apiKey) {
    await reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
    return;
  }

  request.apiKeyAuthenticated = true;
}

export function registerAccuracyRoutes(
  server: FastifyInstance,
  db: Database,
  options?: AccuracyRouteOptions,
): void {
  const accuracyService = new ClassificationAccuracyService(db);
  const directionService = new DirectionAnalyticsService(db);

  server.get('/api/v1/accuracy/stats', {
    schema: { querystring: AccuracyStatsQuerySchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
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
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const details = await accuracyService.getEventAccuracy(id);

    if (!details) {
      return reply.status(404).send({ error: 'Accuracy data not found' });
    }

    return details;
  });

  server.get('/api/v1/accuracy/direction', {
    schema: { querystring: DirectionQuerySchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request) => {
    const query = request.query as {
      period?: '7d' | '30d' | '90d' | 'all';
    };
    return directionService.getDirectionBreakdown({ period: query.period });
  });

  server.get('/api/v1/accuracy/calibration', {
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request) => {
    const query = request.query as {
      period?: '7d' | '30d' | '90d' | 'all';
    };
    return directionService.getConfidenceCalibration({ period: query.period });
  });

  server.get('/api/v1/accuracy/mispredictions', {
    schema: { querystring: MispredictionsQuerySchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request) => {
    const query = request.query as {
      limit?: number;
      period?: '7d' | '30d' | '90d' | 'all';
    };
    return directionService.getTopMispredictions({
      limit: query.limit,
      period: query.period,
    });
  });
}
