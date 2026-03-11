import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Shared API key authentication middleware.
 * Checks X-API-Key header against the configured key.
 * Sets request.apiKeyAuthenticated = true on success.
 */
export async function requireApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
  apiKey?: string,
): Promise<void> {
  if (request.apiKeyAuthenticated) {
    return;
  }

  const providedKey = request.headers['x-api-key'];
  if (!providedKey) {
    await reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing X-API-Key header',
    });
    return;
  }

  if (apiKey && providedKey !== apiKey) {
    await reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
    return;
  }

  request.apiKeyAuthenticated = true;
}
