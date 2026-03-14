import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/connection.js';
import { AlertScorecardService } from '../services/alert-scorecard.js';

const EventIdParamsSchema = {
  type: 'object',
  required: ['eventId'],
  properties: {
    eventId: { type: 'string', format: 'uuid' },
  },
} as const;

export function registerAlertScorecardRoutes(
  server: FastifyInstance,
  db: Database,
): void {
  const service = new AlertScorecardService(db);

  server.get('/api/v1/scorecards/:eventId', {
    schema: { params: EventIdParamsSchema },
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const scorecard = await service.getScorecard(eventId);

    if (!scorecard) {
      return reply.status(404).send({ error: 'Scorecard not found' });
    }

    return scorecard;
  });
}
