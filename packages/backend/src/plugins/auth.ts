import { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { validateApiKeyValue } from '../routes/auth-middleware.js';
import { verifyAccessToken, parseCookies } from '../routes/auth.js';

/**
 * Auth Plugin — cookie-based JWT + API key fallback
 *
 * Priority:
 * 1. er_access cookie → JWT verify → set request.userId
 * 2. X-Api-Key header → if valid → request.userId = 'default'
 * 3. AUTH_REQUIRED=false (default) → allow through as 'default'
 * 4. AUTH_REQUIRED=true and neither → 401
 *
 * CSRF: POST/PUT/DELETE require X-CSRF-Token matching er_csrf cookie.
 * CORS: specific origin with credentials support.
 */

declare module 'fastify' {
  interface FastifyRequest {
    apiKeyAuthenticated: boolean;
    userId?: string;
  }
}

interface AuthPluginOptions {
  apiKey: string;
  publicRoutes?: string[];
}

export async function registerAuthPlugin(
  server: FastifyInstance,
  options: AuthPluginOptions,
): Promise<void> {
  const publicRoutes = new Set(options.publicRoutes ?? []);
  const configuredApiKey = process.env.API_KEY ?? options.apiKey;
  const authRequired = process.env.AUTH_REQUIRED === 'true';
  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
  const cspEnabled = process.env.CSP_ENABLED !== 'false'; // default: true

  const CSP_HEADER = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  // CORS + security headers for all responses
  server.addHook('onSend', async (_request, reply) => {
    reply.header('Access-Control-Allow-Origin', corsOrigin);
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, X-CSRF-Token');
    reply.header('Access-Control-Allow-Credentials', 'true');

    if (cspEnabled) {
      reply.header('Content-Security-Policy', CSP_HEADER);
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
    }
  });

  server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    request.apiKeyAuthenticated = false;

    // CORS preflight — always allow
    if (request.method === 'OPTIONS') {
      reply.header('Access-Control-Allow-Origin', corsOrigin);
      reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, X-CSRF-Token');
      reply.header('Access-Control-Allow-Credentials', 'true');
      return reply.status(204).send();
    }

    const pathname = request.url.split('?')[0] ?? request.url;

    // Auth routes are always public
    if (pathname.startsWith('/api/auth/')) {
      return;
    }

    if (publicRoutes.has(pathname)) {
      // Still set userId so route-level requireApiKey preHandlers pass
      if (!authRequired) {
        request.userId = 'default';
      }
      return;
    }

    // 1. Try cookie-based JWT auth
    const cookies = parseCookies(request);
    const accessToken = cookies['er_access'];
    if (accessToken) {
      const payload = await verifyAccessToken(accessToken);
      if (payload) {
        request.userId = payload.sub;

        // CSRF check for state-changing methods
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
          const csrfHeader = request.headers['x-csrf-token'];
          const csrfCookie = cookies['er_csrf'];
          if (csrfCookie && csrfHeader !== csrfCookie) {
            return reply.status(403).send({ error: 'CSRF token mismatch' });
          }
        }

        return;
      }
    }

    // 2. Try API key auth
    const providedKey = typeof request.headers['x-api-key'] === 'string'
      ? request.headers['x-api-key']
      : undefined;
    const validation = validateApiKeyValue(providedKey, configuredApiKey);

    if (validation.ok) {
      request.apiKeyAuthenticated = true;
      request.userId = 'default';
      return;
    }

    // 3. AUTH_REQUIRED=false → allow as default
    if (!authRequired) {
      request.userId = 'default';
      return;
    }

    // 4. Nothing worked → 401
    if (!providedKey) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    return reply.status(401).send({
      error: 'Unauthorized',
      message: validation.message ?? 'Invalid credentials',
    });
  });
}

export function generateApiKey(): string {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
}
