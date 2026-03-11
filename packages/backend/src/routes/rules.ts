import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/connection.js';
import { requireApiKey } from './auth-middleware.js';
import { RuleEngineV2 } from '../services/rule-engine-v2.js';
import { parseRule, validateRule } from '../services/rule-parser.js';

const RuleBodySchema = {
  type: 'object',
  required: ['name', 'dsl'],
  properties: {
    name: { type: 'string', minLength: 1 },
    dsl: { type: 'string', minLength: 1 },
    enabled: { type: 'boolean' },
  },
} as const;

const RuleUpdateBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    dsl: { type: 'string', minLength: 1 },
    enabled: { type: 'boolean' },
  },
} as const;

const RuleIdParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

const ReorderBodySchema = {
  type: 'object',
  required: ['ids'],
  properties: {
    ids: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      minItems: 1,
    },
  },
} as const;

const ValidateRuleBodySchema = {
  type: 'object',
  required: ['dsl'],
  properties: {
    dsl: { type: 'string', minLength: 1 },
  },
} as const;

const TestRuleBodySchema = {
  type: 'object',
  required: ['dsl', 'event'],
  properties: {
    dsl: { type: 'string', minLength: 1 },
    event: { type: 'object', additionalProperties: true },
  },
} as const;

interface RulesRouteOptions {
  apiKey?: string;
}

export function registerRulesRoutes(
  server: FastifyInstance,
  db: Database,
  options?: RulesRouteOptions,
): void {
  const engine = new RuleEngineV2(db);

  const withAuth = async (
    request: Parameters<typeof requireApiKey>[0],
    reply: Parameters<typeof requireApiKey>[1],
  ) => requireApiKey(request, reply, options?.apiKey);

  server.get('/api/v1/rules', {
    preHandler: withAuth,
  }, async () => {
    return { data: await engine.listRules() };
  });

  server.post('/api/v1/rules', {
    schema: { body: RuleBodySchema },
    preHandler: withAuth,
  }, async (request, reply) => {
    const body = request.body as { name: string; dsl: string; enabled?: boolean };
    const validationError = validateDsl(body.dsl, body.name, body.enabled);
    if (validationError) {
      return reply.status(400).send(validationError);
    }

    const rule = await engine.addRule(body);
    return reply.status(201).send(rule);
  });

  server.post('/api/v1/rules/reorder', {
    schema: { body: ReorderBodySchema },
    preHandler: withAuth,
  }, async (request) => {
    const body = request.body as { ids: string[] };
    await engine.reorderRules(body.ids);
    return { success: true };
  });

  server.post('/api/v1/rules/test', {
    schema: { body: TestRuleBodySchema },
    preHandler: withAuth,
  }, async (request, reply) => {
    const body = request.body as { dsl: string; event: Record<string, unknown> };
    const parsed = parseRule(body.dsl);
    if (!parsed.ok) {
      return reply.status(400).send({
        error: 'Invalid rule DSL',
        details: [parsed.error],
      });
    }

    const validation = validateRule(parsed.value);
    if (!validation.ok) {
      return reply.status(400).send({
        error: 'Invalid rule DSL',
        details: validation.error,
      });
    }

    return engine.evaluateRules(body.event, [parsed.value]);
  });

  server.post('/api/v1/rules/validate', {
    schema: { body: ValidateRuleBodySchema },
    preHandler: withAuth,
  }, async (request) => {
    const body = request.body as { dsl: string };
    const validationError = validateDsl(body.dsl);
    if (validationError) {
      return {
        valid: false,
        errors: validationError.details,
      };
    }

    return { valid: true };
  });

  server.put('/api/v1/rules/:id', {
    schema: {
      params: RuleIdParamsSchema,
      body: RuleUpdateBodySchema,
    },
    preHandler: withAuth,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      dsl?: string;
      enabled?: boolean;
    };

    if (body.dsl) {
      const validationError = validateDsl(body.dsl, body.name, body.enabled);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
    }

    try {
      return await engine.updateRule(id, body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not found')) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.status(400).send({
        error: 'Invalid rule DSL',
        details: [{ message }],
      });
    }
  });

  server.delete('/api/v1/rules/:id', {
    schema: { params: RuleIdParamsSchema },
    preHandler: withAuth,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await engine.deleteRule(id);
    return reply.status(204).send();
  });
}

function validateDsl(
  dsl: string,
  name?: string,
  enabled?: boolean,
): { error: string; details: unknown[] } | null {
  const parsed = parseRule(dsl);
  if (!parsed.ok) {
    return {
      error: 'Invalid rule DSL',
      details: [parsed.error],
    };
  }

  const validation = validateRule({
    ...parsed.value,
    name: name ?? parsed.value.name,
    enabled: enabled ?? parsed.value.enabled,
  });
  if (!validation.ok) {
    return {
      error: 'Invalid rule DSL',
      details: validation.error,
    };
  }

  return null;
}
