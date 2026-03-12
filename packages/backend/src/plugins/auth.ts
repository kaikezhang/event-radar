import { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';

/**
 * API Key Authentication Plugin
 * 
 * Requires X-API-Key header for protected routes.
 * - Env var: API_KEY (required)
 * - Header: X-API-Key: <key>
 * - Returns 401 if missing or invalid
 * - /health is always public (no auth required)
 */

declare module 'fastify' {
  interface FastifyRequest {
    apiKeyAuthenticated: boolean;
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
  const { apiKey, publicRoutes = ['/health', '/api/health/ping', '/metrics', '/ws/'] } = options;

  // CORS headers for all responses
  server.addHook('onSend', async (_request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, Authorization');
  });

  server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // CORS preflight — always allow
    if (request.method === 'OPTIONS') {
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, Authorization');
      return reply.status(204).send();
    }

    // Skip auth for public routes
    const isPublicRoute = publicRoutes.some(route => 
      request.url.startsWith(route)
    );
    
    if (isPublicRoute) {
      request.apiKeyAuthenticated = false;
      return;
    }

    // Check for API key
    const providedKey = request.headers['x-api-key'];
    
    if (!providedKey) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing X-API-Key header',
      });
    }

    if (providedKey !== apiKey) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid API key',
      });
    }

    request.apiKeyAuthenticated = true;
  });
}

export function generateApiKey(): string {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
}
