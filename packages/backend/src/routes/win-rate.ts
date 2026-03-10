import type { FastifyInstance } from 'fastify';
import { WinRateAnalysis } from '../services/win-rate-analysis.js';
import type { Database } from '../db/connection.js';

const IntervalQuerySchema = {
  type: 'object',
  properties: {
    interval: {
      type: 'string',
      pattern: '^\\d+\\s+(days?|weeks?|months?)$',
      description: 'PostgreSQL interval, e.g. "30 days", "12 weeks"',
    },
  },
} as const;

const LimitQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
  },
} as const;

const BucketQuerySchema = {
  type: 'object',
  properties: {
    bucketDays: { type: 'integer', minimum: 1, maximum: 90, default: 7 },
  },
} as const;

export function registerWinRateRoutes(
  server: FastifyInstance,
  db: Database,
): void {
  const analysis = new WinRateAnalysis(db);

  /**
   * GET /api/v1/analytics/win-rate/by-source
   */
  server.get(
    '/api/v1/analytics/win-rate/by-source',
    { schema: { querystring: IntervalQuerySchema } },
    async (request) => {
      const { interval } = request.query as { interval?: string };
      const data = await analysis.getWinRateBySource(interval);
      return { data };
    },
  );

  /**
   * GET /api/v1/analytics/win-rate/by-severity
   */
  server.get(
    '/api/v1/analytics/win-rate/by-severity',
    { schema: { querystring: IntervalQuerySchema } },
    async (request) => {
      const { interval } = request.query as { interval?: string };
      const data = await analysis.getWinRateBySeverity(interval);
      return { data };
    },
  );

  /**
   * GET /api/v1/analytics/win-rate/by-event-type
   */
  server.get(
    '/api/v1/analytics/win-rate/by-event-type',
    { schema: { querystring: IntervalQuerySchema } },
    async (request) => {
      const { interval } = request.query as { interval?: string };
      const data = await analysis.getWinRateByEventType(interval);
      return { data };
    },
  );

  /**
   * GET /api/v1/analytics/direction-accuracy
   */
  server.get('/api/v1/analytics/direction-accuracy', async () => {
    const data = await analysis.getDirectionAccuracy();
    return { data };
  });

  /**
   * GET /api/v1/analytics/top-signals
   */
  server.get(
    '/api/v1/analytics/top-signals',
    { schema: { querystring: LimitQuerySchema } },
    async (request) => {
      const { limit } = request.query as { limit?: number };
      const data = await analysis.getTopPerformingSignals(limit ?? 10);
      return { data };
    },
  );

  /**
   * GET /api/v1/analytics/performance-trend
   */
  server.get(
    '/api/v1/analytics/performance-trend',
    { schema: { querystring: BucketQuerySchema } },
    async (request) => {
      const { bucketDays } = request.query as { bucketDays?: number };
      const data = await analysis.getPerformanceOverTime(bucketDays ?? 7);
      return { data };
    },
  );
}
