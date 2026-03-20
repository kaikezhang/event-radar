// Set JWT_SECRET for tests before any imports that use it
process.env.JWT_SECRET = 'test-jwt-secret-for-auth-tests';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { createTestDb, safeClose, cleanTestDb } from './helpers/test-db.js';
import type { Database } from '../db/connection.js';
import type { PGlite } from '@electric-sql/pglite';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuthRoutes } from '../routes/auth.js';
import { registerAuthPlugin } from '../plugins/auth.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

let db: Database;
let client: PGlite;

beforeAll(async () => {
  ({ db, client } = await createTestDb());
});

afterAll(async () => {
  await safeClose(client);
});

function parseCookiesFromResponse(res: { headers: Record<string, string | string[] | undefined> }): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return cookies;
  const items = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const item of items) {
    const parts = item.split(';')[0]!;
    const idx = parts.indexOf('=');
    if (idx === -1) continue;
    cookies[parts.slice(0, idx).trim()] = parts.slice(idx + 1).trim();
  }
  return cookies;
}

async function buildTestServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });

  // Register auth plugin with AUTH_REQUIRED=false for backward compat testing
  await registerAuthPlugin(server, {
    apiKey: 'test-api-key',
    publicRoutes: ['/health'],
  });

  registerAuthRoutes(server, db);

  // Test routes for auth middleware verification
  server.get('/api/protected', async (request) => {
    return { userId: request.userId, authenticated: request.apiKeyAuthenticated };
  });

  server.post('/api/test-csrf', async () => ({ ok: true }));
  server.post('/api/test-csrf-pass', async () => ({ ok: true }));

  await server.ready();
  return server;
}

describe('Auth endpoints', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await cleanTestDb(db);
  });

  describe('POST /api/auth/magic-link', () => {
    it('sends magic link and stores token hash', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/magic-link',
        payload: { email: 'test@example.com' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.message).toBe('Check your email');

      // Verify token was stored in DB
      const tokens = await db.select().from(schema.magicLinkTokens);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]!.email).toBe('test@example.com');
      expect(tokens[0]!.usedAt).toBeNull();
    });

    it('rejects invalid email', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/magic-link',
        payload: { email: 'not-an-email' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rate limits after 3 requests per hour', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await server.inject({
          method: 'POST',
          url: '/api/auth/magic-link',
          payload: { email: 'ratelimit@example.com' },
        });
        expect(res.statusCode).toBe(200);
      }

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/magic-link',
        payload: { email: 'ratelimit@example.com' },
      });
      expect(res.statusCode).toBe(429);
    });
  });

  describe('POST /api/auth/verify', () => {
    it('verifies valid token and sets cookies', async () => {
      const token = randomBytes(32).toString('hex');
      const tokenHash = sha256(token);

      await db.insert(schema.magicLinkTokens).values({
        email: 'user@example.com',
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { token },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.user.email).toBe('user@example.com');

      // Check cookies set
      const cookies = parseCookiesFromResponse(res);
      expect(cookies['er_access']).toBeTruthy();
      expect(cookies['er_refresh']).toBeTruthy();
      expect(cookies['er_csrf']).toBeTruthy();

      // Verify user was created in DB
      const users = await db.select().from(schema.users).where(eq(schema.users.id, 'user@example.com'));
      expect(users).toHaveLength(1);
      expect(users[0]!.email).toBe('user@example.com');

      // Verify token was marked as used
      const tokens = await db.select().from(schema.magicLinkTokens);
      expect(tokens[0]!.usedAt).not.toBeNull();

      // Verify refresh token was stored
      const refreshTokens = await db.select().from(schema.refreshTokens);
      expect(refreshTokens).toHaveLength(1);
      expect(refreshTokens[0]!.userId).toBe('user@example.com');
    });

    it('rejects expired token', async () => {
      const token = randomBytes(32).toString('hex');
      const tokenHash = sha256(token);

      await db.insert(schema.magicLinkTokens).values({
        email: 'user@example.com',
        tokenHash,
        expiresAt: new Date(Date.now() - 1000), // expired
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { token },
      });

      expect(res.statusCode).toBe(401);
    });

    it('rejects already-used token', async () => {
      const token = randomBytes(32).toString('hex');
      const tokenHash = sha256(token);

      await db.insert(schema.magicLinkTokens).values({
        email: 'user@example.com',
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        usedAt: new Date(), // already used
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { token },
      });

      expect(res.statusCode).toBe(401);
    });

    it('atomic verify prevents double-use (concurrent requests)', async () => {
      const token = randomBytes(32).toString('hex');
      const tokenHash = sha256(token);

      await db.insert(schema.magicLinkTokens).values({
        email: 'user@example.com',
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const [res1, res2] = await Promise.all([
        server.inject({ method: 'POST', url: '/api/auth/verify', payload: { token } }),
        server.inject({ method: 'POST', url: '/api/auth/verify', payload: { token } }),
      ]);

      const statuses = [res1.statusCode, res2.statusCode].sort();
      expect(statuses).toEqual([200, 401]);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('rotates refresh token', async () => {
      // Create user and initial refresh token
      await db.insert(schema.users).values({ id: 'user@example.com', email: 'user@example.com' });

      const refreshToken = randomBytes(32).toString('hex');
      const tokenHash = sha256(refreshToken);
      const familyId = crypto.randomUUID();

      await db.insert(schema.refreshTokens).values({
        userId: 'user@example.com',
        tokenHash,
        familyId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: {
          cookie: `er_refresh=${refreshToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);

      const cookies = parseCookiesFromResponse(res);
      expect(cookies['er_access']).toBeTruthy();
      expect(cookies['er_refresh']).toBeTruthy();
      // New refresh token should be different from old one
      expect(cookies['er_refresh']).not.toBe(refreshToken);

      // Old token should be revoked
      const oldToken = await db.select().from(schema.refreshTokens).where(eq(schema.refreshTokens.tokenHash, tokenHash));
      expect(oldToken[0]!.revokedAt).not.toBeNull();
      expect(oldToken[0]!.replacedBy).not.toBeNull();

      // New token should exist in same family
      const allTokens = await db.select().from(schema.refreshTokens);
      expect(allTokens).toHaveLength(2);
      const newToken = allTokens.find(t => t.tokenHash !== tokenHash);
      expect(newToken!.familyId).toBe(familyId);
    });

    it('revokes entire family on token reuse (replay attack)', async () => {
      await db.insert(schema.users).values({ id: 'user@example.com', email: 'user@example.com' });

      const refreshToken = randomBytes(32).toString('hex');
      const tokenHash = sha256(refreshToken);
      const familyId = crypto.randomUUID();

      // Insert an already-revoked token (simulating reuse)
      await db.insert(schema.refreshTokens).values({
        userId: 'user@example.com',
        tokenHash,
        familyId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revokedAt: new Date(),
      });

      // Also add a sibling token in the same family (the "real" active token)
      const siblingHash = sha256(randomBytes(32).toString('hex'));
      await db.insert(schema.refreshTokens).values({
        userId: 'user@example.com',
        tokenHash: siblingHash,
        familyId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: {
          cookie: `er_refresh=${refreshToken}`,
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Token reuse detected');

      // Sibling should now be revoked too
      const sibling = await db.select().from(schema.refreshTokens).where(eq(schema.refreshTokens.tokenHash, siblingHash));
      expect(sibling[0]!.revokedAt).not.toBeNull();
    });

    it('rejects expired refresh token', async () => {
      await db.insert(schema.users).values({ id: 'user@example.com', email: 'user@example.com' });

      const refreshToken = randomBytes(32).toString('hex');
      await db.insert(schema.refreshTokens).values({
        userId: 'user@example.com',
        tokenHash: sha256(refreshToken),
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() - 1000), // expired
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: { cookie: `er_refresh=${refreshToken}` },
      });

      expect(res.statusCode).toBe(401);
    });

    it('rejects missing refresh cookie', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/refresh',
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears cookies and revokes refresh token', async () => {
      await db.insert(schema.users).values({ id: 'user@example.com', email: 'user@example.com' });

      const refreshToken = randomBytes(32).toString('hex');
      const tokenHash = sha256(refreshToken);
      await db.insert(schema.refreshTokens).values({
        userId: 'user@example.com',
        tokenHash,
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { cookie: `er_refresh=${refreshToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);

      // Cookie should be cleared (Max-Age=0)
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie!;
      expect(cookieStr).toContain('Max-Age=0');

      // Token should be revoked
      const token = await db.select().from(schema.refreshTokens).where(eq(schema.refreshTokens.tokenHash, tokenHash));
      expect(token[0]!.revokedAt).not.toBeNull();
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns user for valid JWT', async () => {
      await db.insert(schema.users).values({ id: 'user@example.com', email: 'user@example.com', displayName: 'Test User' });

      const secret = new TextEncoder().encode('test-jwt-secret-for-auth-tests');
      const accessToken = await new SignJWT({ sub: 'user@example.com', email: 'user@example.com' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(secret);

      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: `er_access=${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe('user@example.com');
      expect(body.email).toBe('user@example.com');
      expect(body.displayName).toBe('Test User');
    });

    it('returns the default user for missing cookie when auth is not required', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        id: 'default',
        email: null,
        displayName: null,
      });
    });

    it('returns 401 for invalid JWT', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: 'er_access=invalid-jwt-token' },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});

describe('Auth middleware', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await cleanTestDb(db);
  });

  it('allows access via JWT cookie', async () => {
    const secret = new TextEncoder().encode('test-jwt-secret-for-auth-tests');
    const accessToken = await new SignJWT({ sub: 'user@example.com', email: 'user@example.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    const res = await server.inject({
      method: 'GET',
      url: '/api/protected',
      headers: { cookie: `er_access=${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe('user@example.com');
  });

  it('allows access via API key (backward compat)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/protected',
      headers: { 'x-api-key': 'test-api-key' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe('default');
    expect(res.json().authenticated).toBe(true);
  });

  it('allows access without auth when AUTH_REQUIRED=false (default)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/protected',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe('default');
  });

  it('checks CSRF for POST with JWT cookie', async () => {
    const secret = new TextEncoder().encode('test-jwt-secret-for-auth-tests');
    const accessToken = await new SignJWT({ sub: 'user@example.com', email: 'user@example.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    const csrfToken = 'test-csrf-token';

    // POST with mismatching CSRF token should be rejected
    const res = await server.inject({
      method: 'POST',
      url: '/api/test-csrf',
      headers: {
        cookie: `er_access=${accessToken}; er_csrf=${csrfToken}`,
        'x-csrf-token': 'wrong-csrf-token',
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('CSRF token mismatch');
  });

  it('passes CSRF check when tokens match', async () => {
    const secret = new TextEncoder().encode('test-jwt-secret-for-auth-tests');
    const accessToken = await new SignJWT({ sub: 'user@example.com', email: 'user@example.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    const csrfToken = 'valid-csrf-token';

    const res = await server.inject({
      method: 'POST',
      url: '/api/test-csrf-pass',
      headers: {
        cookie: `er_access=${accessToken}; er_csrf=${csrfToken}`,
        'x-csrf-token': csrfToken,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it('CORS headers include credentials support', async () => {
    const res = await server.inject({
      method: 'OPTIONS',
      url: '/api/protected',
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
