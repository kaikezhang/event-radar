import type { FastifyInstance } from 'fastify';
import { OutcomeTracker } from '../services/outcome-tracker.js';
import type { Database } from '../db/connection.js';

const EventIdParamsSchema = {
  type: 'object',
  required: ['eventId'],
  properties: {
    eventId: { type: 'string', format: 'uuid' },
  },
} as const;

const TickerParamsSchema = {
  type: 'object',
  required: ['ticker'],
  properties: {
    ticker: { type: 'string', pattern: '^[A-Z]{1,10}$' },
  },
} as const;

const StatsQuerySchema = {
  type: 'object',
  properties: {
    eventType: { type: 'string' },
    severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
    source: { type: 'string' },
  },
} as const;

const TickerQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  },
} as const;

export function registerOutcomeRoutes(
  server: FastifyInstance,
  db: Database,
): void {
  const tracker = new OutcomeTracker(db);

  /**
   * GET /api/v1/outcomes/:eventId
   * Get outcome for a specific event.
   */
  server.get('/api/v1/outcomes/:eventId', {
    schema: { params: EventIdParamsSchema },
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const outcome = await tracker.getOutcome(eventId);

    if (!outcome) {
      return reply.status(404).send({ error: 'Outcome not found' });
    }

    return outcome;
  });

  /**
   * GET /api/v1/outcomes/stats
   * Get aggregate outcome statistics.
   */
  server.get('/api/v1/outcomes/stats', {
    schema: { querystring: StatsQuerySchema },
  }, async (request) => {
    const query = request.query as {
      eventType?: string;
      severity?: string;
      source?: string;
    };

    const stats = await tracker.getOutcomeStats({
      eventType: query.eventType,
      severity: query.severity,
      source: query.source,
    });

    return stats;
  });

  /**
   * GET /api/v1/outcomes/ticker/:ticker
   * Get outcomes for a specific ticker.
   */
  server.get('/api/v1/outcomes/ticker/:ticker', {
    schema: {
      params: TickerParamsSchema,
      querystring: TickerQuerySchema,
    },
  }, async (request) => {
    const { ticker } = request.params as { ticker: string };
    const query = request.query as { limit?: number };
    const limit = query.limit ?? 50;

    const outcomes = await tracker.getOutcomesByTicker(ticker, limit);

    return { data: outcomes };
  });
}
