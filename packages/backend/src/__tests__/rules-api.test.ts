import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { PGlite } from '@electric-sql/pglite';
import type { Database } from '../db/connection.js';
import { registerRulesRoutes } from '../routes/rules.js';
import {
  cleanTestDb,
  createTestDb,
  safeClose,
  safeCloseServer,
} from './helpers/test-db.js';

const TEST_API_KEY = 'rules-test-key';

describe('Rules API', () => {
  let db: Database;
  let client: PGlite;
  let apiServer: FastifyInstance;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
    apiServer = Fastify({ logger: false });
    registerRulesRoutes(apiServer, db, { apiKey: TEST_API_KEY });
    await apiServer.ready();
  });

  afterAll(async () => {
    await safeCloseServer(apiServer);
    await safeClose(client);
  });

  beforeEach(async () => {
    await cleanTestDb(db);
  });

  it('requires API key authentication', async () => {
    const response = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/rules',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'API key required',
      docs: '/api-docs',
    });
  });

  it.each([
    {
      method: 'POST' as const,
      url: '/api/v1/rules',
      payload: {
        name: 'Critical SEC',
        dsl: 'IF source = "sec-edgar" THEN priority = "HIGH"',
      },
    },
    {
      method: 'PUT' as const,
      url: `/api/v1/rules/${randomUUID()}`,
      payload: {
        name: 'Updated rule',
        dsl: 'IF source = "sec-edgar" THEN priority = "HIGH"',
      },
    },
    {
      method: 'DELETE' as const,
      url: `/api/v1/rules/${randomUUID()}`,
    },
    {
      method: 'POST' as const,
      url: '/api/v1/rules/reorder',
      payload: {
        ids: [randomUUID()],
      },
    },
    {
      method: 'POST' as const,
      url: '/api/v1/rules/test',
      payload: {
        dsl: 'IF source = "sec-edgar" THEN priority = "HIGH"',
        event: {},
      },
    },
    {
      method: 'POST' as const,
      url: '/api/v1/rules/validate',
      payload: {
        dsl: 'IF source = "sec-edgar" THEN priority = "HIGH"',
      },
    },
  ])('returns 401 without API key for $method $url', async ({ method, url, payload }) => {
    const response = await apiServer.inject({
      method,
      url,
      payload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'API key required',
      docs: '/api-docs',
    });
  });

  it('returns an empty list when no rules exist', async () => {
    const response = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/rules',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [] });
  });

  it('creates and lists rules', async () => {
    const createResponse = await apiServer.inject({
      method: 'POST',
      url: '/api/v1/rules',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: {
        name: 'Critical SEC',
        dsl: 'IF source = "sec-edgar" AND severity >= "HIGH" THEN priority = "CRITICAL"',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().name).toBe('Critical SEC');

    const listResponse = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/rules',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data).toHaveLength(1);
  });

  it('updates and deletes rules', async () => {
    const createResponse = await apiServer.inject({
      method: 'POST',
      url: '/api/v1/rules',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: {
        name: 'To update',
        dsl: 'IF source = "sec-edgar" THEN priority = "HIGH"',
      },
    });
    const created = createResponse.json() as { id: string };

    const updateResponse = await apiServer.inject({
      method: 'PUT',
      url: `/api/v1/rules/${created.id}`,
      headers: { 'x-api-key': TEST_API_KEY },
      payload: {
        name: 'Updated rule',
        dsl: 'IF confidence < 0.3 THEN tag = "low-quality", notify = false',
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().name).toBe('Updated rule');

    const deleteResponse = await apiServer.inject({
      method: 'DELETE',
      url: `/api/v1/rules/${created.id}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(deleteResponse.statusCode).toBe(204);
  });

  it('returns 404 when deleting a non-existent rule', async () => {
    const response = await apiServer.inject({
      method: 'DELETE',
      url: `/api/v1/rules/${randomUUID()}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Rule not found' });
  });

  it('reorders rules', async () => {
    const first = await apiServer.inject({
      method: 'POST',
      url: '/api/v1/rules',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: {
        name: 'First',
        dsl: 'IF source = "sec-edgar" THEN priority = "HIGH"',
      },
    });
    const second = await apiServer.inject({
      method: 'POST',
      url: '/api/v1/rules',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: {
        name: 'Second',
        dsl: 'IF ticker = "AAPL" THEN priority = "CRITICAL"',
      },
    });

    const firstBody = first.json() as { id: string };
    const secondBody = second.json() as { id: string };

    const reorderResponse = await apiServer.inject({
      method: 'POST',
      url: '/api/v1/rules/reorder',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { ids: [secondBody.id, firstBody.id] },
    });

    expect(reorderResponse.statusCode).toBe(200);
    expect(reorderResponse.json()).toEqual({ success: true });

    const listResponse = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/rules',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(listResponse.json().data.map((rule: { id: string }) => rule.id)).toEqual([
      secondBody.id,
      firstBody.id,
    ]);
  });

  it('rejects reorder requests that omit existing rules', async () => {
    const first = await apiServer.inject({
      method: 'POST',
      url: '/api/v1/rules',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: {
        name: 'First',
        dsl: 'IF source = "sec-edgar" THEN priority = "HIGH"',
      },
    });
    await apiServer.inject({
      method: 'POST',
      url: '/api/v1/rules',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: {
        name: 'Second',
        dsl: 'IF ticker = "AAPL" THEN priority = "CRITICAL"',
      },
    });

    const firstBody = first.json() as { id: string };
    const response = await apiServer.inject({
      method: 'POST',
      url: '/api/v1/rules/reorder',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { ids: [firstBody.id] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'Invalid rule order',
      details: [
        expect.objectContaining({
          message: expect.stringContaining('submitted rule IDs must match the full rule set'),
        }),
      ],
    });
  });

  it('tests a rule against an event payload', async () => {
    const response = await apiServer.inject({
      method: 'POST',
      url: '/api/v1/rules/test',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: {
        dsl: 'IF keyword CONTAINS "bankruptcy" THEN priority = "CRITICAL", notify = true',
        event: {
          source: 'sec-edgar',
          keyword: 'bankruptcy filing',
          severity: 'HIGH',
          confidence: 0.92,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      matched: true,
      ruleId: expect.any(String),
      ruleName: expect.any(String),
      actions: {
        priority: 'CRITICAL',
        notify: true,
      },
    });
  });

  it('validates DSL and reports parse errors', async () => {
    const validResponse = await apiServer.inject({
      method: 'POST',
      url: '/api/v1/rules/validate',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: {
        dsl: 'IF source = "sec-edgar" THEN priority = "HIGH"',
      },
    });

    expect(validResponse.statusCode).toBe(200);
    expect(validResponse.json()).toEqual({ valid: true });

    const invalidResponse = await apiServer.inject({
      method: 'POST',
      url: '/api/v1/rules/validate',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: {
        dsl: 'IF source = "sec-edgar" priority = "HIGH"',
      },
    });

    expect(invalidResponse.statusCode).toBe(200);
    expect(invalidResponse.json()).toEqual({
      valid: false,
      errors: [
        expect.objectContaining({
          message: expect.stringContaining('Expected THEN'),
          line: 1,
        }),
      ],
    });
  });
});
