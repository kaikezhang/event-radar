import type { FastifyReply, FastifyRequest } from 'fastify';

interface ApiKeyValidationResult {
  ok: boolean;
  message?: string;
}

export function validateApiKeyValue(
  providedKey: string | undefined,
  apiKey?: string,
): ApiKeyValidationResult {
  if (!apiKey) {
    return {
      ok: false,
      message: 'API key not configured',
    };
  }

  if (!providedKey) {
    return {
      ok: false,
      message: 'Missing API key',
    };
  }

  if (apiKey && providedKey !== apiKey) {
    return {
      ok: false,
      message: 'Invalid API key',
    };
  }

  return { ok: true };
}

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
  // Already authenticated via JWT cookie (set by auth plugin) — skip API key check
  if (request.userId) {
    return;
  }

  if (request.apiKeyAuthenticated) {
    return;
  }

  const providedKey = typeof request.headers['x-api-key'] === 'string'
    ? request.headers['x-api-key']
    : undefined;
  const validation = validateApiKeyValue(providedKey, apiKey);

  if (!validation.ok && validation.message === 'Missing API key') {
    await reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing X-API-Key header',
    });
    return;
  }

  if (!validation.ok) {
    await reply.status(401).send({
      error: 'Unauthorized',
      message: validation.message ?? 'Invalid API key',
    });
    return;
  }

  request.apiKeyAuthenticated = true;
}

/**
 * Stricter auth middleware for sensitive routes.
 * Rejects the anonymous 'default' user — requires a real authenticated identity
 * (JWT or valid API key with a non-default userId).
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  apiKey?: string,
): Promise<void> {
  // First run normal API key check
  await requireApiKey(request, reply, apiKey);
  if (reply.sent) return;

  // Reject anonymous/default user on sensitive routes
  const userId = request.userId;
  if (!userId || userId === 'default') {
    await reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication required for this endpoint',
    });
  }
}
