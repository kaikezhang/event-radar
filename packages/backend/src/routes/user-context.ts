import type { FastifyRequest } from 'fastify';
import type { Database } from '../db/connection.js';
import { users } from '../db/schema.js';

export const DEFAULT_USER_ID = 'default';

export function resolveRequestUserId(request: FastifyRequest): string {
  // Prefer explicit x-user-id when request is API-key authenticated as the default user.
  const headerValue = request.headers['x-user-id'];
  if (typeof headerValue === 'string') {
    const trimmedValue = headerValue.trim();
    const canOverrideDefaultUser =
      request.apiKeyAuthenticated || request.userId === DEFAULT_USER_ID || !request.userId;

    if (trimmedValue.length > 0 && canOverrideDefaultUser) {
      console.warn(`[auth] Deprecated: user resolved via x-user-id header (${trimmedValue})`);
      return trimmedValue;
    }
  }

  if (request.userId) {
    return request.userId;
  }

  return DEFAULT_USER_ID;
}

export async function ensureUserExists(db: Database, userId: string): Promise<void> {
  await db.insert(users).values({ id: userId }).onConflictDoNothing();
}
