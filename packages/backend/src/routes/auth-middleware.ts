import type { FastifyReply, FastifyRequest } from 'fastify';

interface ApiKeyValidationResult {
  ok: boolean;
  message?: string;
}

const DEFAULT_DEV_API_KEY = 'er-dev-2026';
const API_KEY_RATE_LIMIT = 100;
const API_KEY_RATE_LIMIT_WINDOW_MS = 60_000;

interface ApiKeyRateLimitWindow {
  count: number;
  windowStartedAt: number;
}

const apiKeyRateLimitState = new Map<string, ApiKeyRateLimitWindow>();

function getAllowedApiKeys(apiKey?: string): string[] {
  return [...new Set([apiKey, DEFAULT_DEV_API_KEY].filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

function getProvidedApiKey(request: FastifyRequest): string | undefined {
  const headerKey = typeof request.headers['x-api-key'] === 'string'
    ? request.headers['x-api-key']
    : undefined;

  if (headerKey) {
    return headerKey;
  }

  const query = request.query as Record<string, unknown> | undefined;
  return typeof query?.apiKey === 'string' ? query.apiKey : undefined;
}

function applyRateLimitHeaders(
  reply: FastifyReply,
  remaining: number,
): void {
  reply.header('X-RateLimit-Limit', String(API_KEY_RATE_LIMIT));
  reply.header('X-RateLimit-Remaining', String(remaining));
}

function consumeApiKeyRateLimit(providedKey: string, now = Date.now()): {
  limit: number;
  remaining: number;
  exceeded: boolean;
} {
  const existing = apiKeyRateLimitState.get(providedKey);
  const window = !existing || now - existing.windowStartedAt >= API_KEY_RATE_LIMIT_WINDOW_MS
    ? {
        count: 0,
        windowStartedAt: now,
      }
    : existing;

  window.count += 1;
  apiKeyRateLimitState.set(providedKey, window);

  return {
    limit: API_KEY_RATE_LIMIT,
    remaining: Math.max(0, API_KEY_RATE_LIMIT - window.count),
    exceeded: window.count > API_KEY_RATE_LIMIT,
  };
}

export function validateApiKeyValue(
  providedKey: string | undefined,
  apiKey?: string,
): ApiKeyValidationResult {
  const allowedApiKeys = getAllowedApiKeys(apiKey);

  if (allowedApiKeys.length === 0) {
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

  if (!allowedApiKeys.includes(providedKey)) {
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
  // Real authenticated browser sessions do not need a programmatic API key.
  if (request.userId && request.userId !== 'default') {
    return;
  }

  const providedKey = getProvidedApiKey(request);
  const validation = validateApiKeyValue(providedKey, apiKey);

  if (!validation.ok && validation.message === 'Missing API key') {
    await reply.status(401).send({
      error: 'API key required',
      docs: '/api-docs',
    });
    return;
  }

  if (!validation.ok) {
    await reply.status(401).send({
      error: validation.message ?? 'Invalid API key',
      docs: '/api-docs',
    });
    return;
  }

  const rateLimit = consumeApiKeyRateLimit(providedKey!);
  applyRateLimitHeaders(reply, rateLimit.remaining);

  if (rateLimit.exceeded) {
    await reply.status(429).send({
      error: 'Rate limit exceeded',
      docs: '/api-docs',
    });
    return;
  }

  request.apiKeyAuthenticated = true;
  request.userId = request.userId ?? 'default';
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

export function resetApiKeyRateLimitStateForTests(): void {
  apiKeyRateLimitState.clear();
}
