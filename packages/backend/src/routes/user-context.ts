import type { FastifyRequest } from 'fastify';
import type { Database } from '../db/connection.js';
import { users } from '../db/schema.js';

export const DEFAULT_USER_ID = 'default';

export function resolveRequestUserId(request: FastifyRequest): string {
  if (request.userId) {
    return request.userId;
  }

  return DEFAULT_USER_ID;
}

export async function ensureUserExists(db: Database, userId: string): Promise<void> {
  await db.insert(users).values({ id: userId }).onConflictDoNothing();
}
