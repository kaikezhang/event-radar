import type { FastifyInstance } from 'fastify';
import { SubmitFeedbackInputSchema } from '@event-radar/shared';
import { UserFeedbackService } from '../services/user-feedback.js';
import type { Database } from '../db/connection.js';
import { requireApiKey } from './auth-middleware.js';

const EventIdParamsSchema = {
  type: 'object',
  required: ['eventId'],
  properties: {
    eventId: { type: 'string', format: 'uuid' },
  },
} as const;

const SubmitFeedbackBodySchema = {
  type: 'object',
  required: ['verdict'],
  properties: {
    verdict: {
      type: 'string',
      enum: ['correct', 'incorrect', 'partially_correct'],
    },
    note: { type: 'string' },
  },
} as const;

interface FeedbackRouteOptions {
  apiKey?: string;
}

export function registerFeedbackRoutes(
  server: FastifyInstance,
  db: Database,
  options?: FeedbackRouteOptions,
): void {
  const feedbackService = new UserFeedbackService(db);

  // Register /stats BEFORE parametric /:eventId to avoid route shadowing
  server.get('/api/v1/feedback/stats', {
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async () => {
    return feedbackService.getFeedbackStats();
  });

  server.post('/api/v1/feedback/:eventId', {
    schema: {
      params: EventIdParamsSchema,
      body: SubmitFeedbackBodySchema,
    },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const parsed = SubmitFeedbackInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid feedback input',
        details: parsed.error.issues,
      });
    }

    await feedbackService.submitFeedback(
      eventId,
      parsed.data.verdict,
      parsed.data.note,
    );

    return reply.status(201).send({ success: true });
  });

  server.get('/api/v1/feedback/:eventId', {
    schema: { params: EventIdParamsSchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const feedback = await feedbackService.getFeedback(eventId);

    if (!feedback) {
      return reply.status(404).send({ error: 'Feedback not found' });
    }

    return feedback;
  });
}
