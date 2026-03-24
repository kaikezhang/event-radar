import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requireApiKey, resetApiKeyRateLimitStateForTests } from '../routes/auth-middleware.js';

const TEST_API_KEY = 'test-api-key-middleware';

describe('requireApiKey middleware', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    resetApiKeyRateLimitStateForTests();
    server = Fastify({ logger: false });

    server.get('/protected', {
      preHandler: async (request, reply) => requireApiKey(request, reply, TEST_API_KEY),
    }, async () => ({ ok: true }));

    server.get('/protected/default-user', {
      preHandler: [
        async (request) => {
          request.userId = 'default';
        },
        async (request, reply) => requireApiKey(request, reply, TEST_API_KEY),
      ],
    }, async () => ({ ok: true }));

    server.get('/protected/session-user', {
      preHandler: [
        async (request) => {
          request.userId = 'user-123';
        },
        async (request, reply) => requireApiKey(request, reply, TEST_API_KEY),
      ],
    }, async () => ({ ok: true }));

    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns docs guidance when the api key is missing', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/protected',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'API key required',
      docs: '/api-docs',
    });
  });

  it('accepts x-api-key headers and adds rate limit headers', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-ratelimit-limit']).toBe('100');
    expect(response.headers['x-ratelimit-remaining']).toBe('99');
  });

  it('accepts apiKey query params on protected routes', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/protected?apiKey=${TEST_API_KEY}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-ratelimit-limit']).toBe('100');
    expect(response.headers['x-ratelimit-remaining']).toBe('99');
  });

  it('rejects the anonymous default user without an api key', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/protected/default-user',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'API key required',
      docs: '/api-docs',
    });
  });

  it('allows real authenticated users without an api key', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/protected/session-user',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('returns 429 after the per-key in-memory limit is exhausted', async () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': TEST_API_KEY,
        },
      });

      expect(response.statusCode).toBe(200);
    }

    const overflow = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(overflow.statusCode).toBe(429);
    expect(overflow.headers['x-ratelimit-limit']).toBe('100');
    expect(overflow.headers['x-ratelimit-remaining']).toBe('0');
    expect(overflow.json()).toEqual({
      error: 'Rate limit exceeded',
      docs: '/api-docs',
    });
  });
});
