import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/connection.js';
import { AlertScorecardService } from '../services/alert-scorecard.js';
import { ScorecardAggregationService } from '../services/scorecard-aggregation.js';
import { requireApiKey } from './auth-middleware.js';

const EventIdParamsSchema = {
  type: 'object',
  required: ['eventId'],
  properties: {
    eventId: { type: 'string', format: 'uuid' },
  },
} as const;

const ScorecardSummaryQuerySchema = {
  type: 'object',
  properties: {
    days: { type: 'integer', minimum: 1, maximum: 365 },
  },
} as const;

interface AlertScorecardRouteOptions {
  apiKey?: string;
}

export function registerAlertScorecardRoutes(
  server: FastifyInstance,
  db: Database,
  options?: AlertScorecardRouteOptions,
): void {
  const service = new AlertScorecardService(db);
  const aggregationService = new ScorecardAggregationService(db);

  server.get('/api/v1/scorecards/summary', {
    schema: { querystring: ScorecardSummaryQuerySchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request) => {
    const { days } = request.query as { days?: number };
    return aggregationService.getSummary({ days });
  });

  server.get('/api/v1/scorecards/severity-breakdown', {
    schema: { querystring: ScorecardSummaryQuerySchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request) => {
    const { days } = request.query as { days?: number };
    return aggregationService.getSeverityBreakdown({ days });
  });

  server.get('/api/v1/scorecards/:eventId', {
    schema: { params: EventIdParamsSchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const scorecard = await service.getScorecard(eventId);

    if (!scorecard) {
      return reply.status(404).send({ error: 'Scorecard not found' });
    }

    return scorecard;
  });
}
