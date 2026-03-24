import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/connection.js';
import { WeeklyReportService } from '../services/weekly-report.js';
import { requireApiKey } from './auth-middleware.js';

const WeeklyReportQuerySchema = {
  type: 'object',
  required: ['date'],
  properties: {
    date: { type: 'string', format: 'date' },
    format: { type: 'string', enum: ['json', 'markdown'] },
  },
} as const;

interface ReportRouteOptions {
  apiKey?: string;
}

export function registerReportRoutes(
  server: FastifyInstance,
  db: Database,
  options?: ReportRouteOptions,
): void {
  const service = new WeeklyReportService(db);

  server.get('/api/v1/reports/weekly', {
    schema: { querystring: WeeklyReportQuerySchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request, reply) => {
    const { date, format } = request.query as {
      date: string;
      format?: 'json' | 'markdown';
    };
    const report = await service.generateWeeklyReport(date);

    // Cron setup intentionally stays outside the app for now.
    // The orchestrator can schedule a weekly POST to Discord by calling this endpoint
    // with `format=markdown` and forwarding the markdown payload to the Discord webhook.
    if (format === 'markdown') {
      return reply.type('text/markdown; charset=utf-8').send(report.markdown);
    }

    return report;
  });
}
