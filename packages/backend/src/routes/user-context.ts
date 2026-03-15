import type { FastifyRequest } from 'fastify';
import type { Database } from '../db/connection.js';
import { users } from '../db/schema.js';

export const DEFAULT_USER_ID = 'default';

export function resolveRequestUserId(request: FastifyRequest): string {
  // 1. Check userId set by auth plugin (from JWT cookie)
  if (request.userId) {
    return request.userId;
  }

  // 2. Fall back to x-user-id header (with warning)
  const headerValue = request.headers['x-user-id'];
  if (typeof headerValue === 'string') {
    const trimmedValue = headerValue.trim();
    if (trimmedValue.length > 0) {
      console.warn(`[auth] Deprecated: user resolved via x-user-id header (${trimmedValue})`);
      return trimmedValue;
    }
  }

  // 3. Fall back to 'default'
  return DEFAULT_USER_ID;
}

export async function ensureUserExists(db: Database, userId: string): Promise<void> {
  await db.insert(users).values({ id: userId }).onConflictDoNothing();
}
