import type { FastifyInstance } from 'fastify';
import type { EventBus, Priority } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { requireApiKey } from './auth-middleware.js';
import { AlertBudgetService } from '../services/alert-budget.js';
import { ProgressiveSeverityService } from '../services/progressive-severity.js';

const UsageQuerySchema = {
  type: 'object',
  properties: {
    windowMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
  },
} as const;

const LimitQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
} as const;

const EventIdParamsSchema = {
  type: 'object',
  required: ['eventId'],
  properties: {
    eventId: { type: 'string', format: 'uuid' },
  },
} as const;

const UpdateBudgetConfigBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    maxAlertsPerHour: { type: 'integer', minimum: 1, maximum: 1000 },
    windowMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
    priorityShares: {
      type: 'object',
      additionalProperties: false,
      properties: {
        CRITICAL: { type: 'number', minimum: 0, maximum: 1 },
        HIGH: { type: 'number', minimum: 0, maximum: 1 },
        MEDIUM: { type: 'number', minimum: 0, maximum: 1 },
        LOW: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
  },
} as const;

const LockSeverityBodySchema = {
  type: 'object',
  required: ['severity', 'reason'],
  additionalProperties: false,
  properties: {
    severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
    reason: { type: 'string', minLength: 1 },
  },
} as const;

interface AlertBudgetRouteOptions {
  apiKey?: string;
  eventBus?: EventBus;
}

export function registerAlertBudgetRoutes(
  server: FastifyInstance,
  db: Database,
  options?: AlertBudgetRouteOptions,
): void {
  const budgetService = new AlertBudgetService(db);
  const severityService = new ProgressiveSeverityService(db, {
    eventBus: options?.eventBus,
  });

  server.get('/api/v1/budget/usage', {
    schema: { querystring: UsageQuerySchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request) => {
    const query = request.query as { windowMinutes?: number };
    return budgetService.getUsage(query.windowMinutes);
  });

  server.get('/api/v1/budget/config', {
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async () => {
    return budgetService.getBudgetConfig();
  });

  server.put('/api/v1/budget/config', {
    schema: { body: UpdateBudgetConfigBodySchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request) => {
    return budgetService.updateBudgetConfig(
      request.body as {
        maxAlertsPerHour?: number;
        windowMinutes?: number;
        priorityShares?: Partial<Record<Priority, number>>;
      },
    );
  });

  server.get('/api/v1/budget/suppressed', {
    schema: { querystring: LimitQuerySchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request) => {
    const query = request.query as { limit?: number };
    return budgetService.listSuppressed(query.limit ?? 20);
  });

  server.get('/api/v1/severity/:eventId', {
    schema: { params: EventIdParamsSchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const result = await severityService.getEffectiveSeverity(eventId);

    if (result.sourceCount === 0 && result.reason === 'Event not found') {
      return reply.status(404).send({ error: 'Event not found' });
    }

    return result;
  });

  server.post('/api/v1/severity/:eventId/lock', {
    schema: {
      params: EventIdParamsSchema,
      body: LockSeverityBodySchema,
    },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const body = request.body as { severity: Priority; reason: string };
    const current = await severityService.getEffectiveSeverity(eventId);

    if (current.sourceCount === 0 && current.reason === 'Event not found') {
      return reply.status(404).send({ error: 'Event not found' });
    }

    await severityService.lockSeverity(eventId, body.severity, body.reason);
    return severityService.getEffectiveSeverity(eventId);
  });

  server.get('/api/v1/severity/:eventId/history', {
    schema: { params: EventIdParamsSchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request) => {
    const { eventId } = request.params as { eventId: string };
    return severityService.getSeverityHistory(eventId);
  });
}
