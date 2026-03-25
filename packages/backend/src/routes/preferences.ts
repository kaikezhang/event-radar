import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import { requireApiKey } from './auth-middleware.js';
import { ensureUserExists, resolveRequestUserId } from '../utils/request-user.js';
import {
  createUserPreferencesStore,
  isValidTimezone,
} from '../services/user-preferences-store.js';

const TimeStringSchema = z.string().regex(/^\d{2}:\d{2}$/).refine((value) => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}, 'Invalid time value');

const PreferencesUpdateSchema = z.object({
  quietStart: TimeStringSchema.nullable().optional(),
  quietEnd: TimeStringSchema.nullable().optional(),
  timezone: z.string().trim().min(1).refine(isValidTimezone, 'Invalid timezone').optional(),
  dailyPushCap: z.number().int().min(0).max(1000).optional(),
  pushNonWatchlist: z.boolean().optional(),
}).superRefine((value, ctx) => {
  const hasQuietStart = Object.prototype.hasOwnProperty.call(value, 'quietStart');
  const hasQuietEnd = Object.prototype.hasOwnProperty.call(value, 'quietEnd');

  if (hasQuietStart !== hasQuietEnd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'quietStart and quietEnd must be updated together',
      path: ['quietStart'],
    });
    return;
  }

  if (!hasQuietStart || !hasQuietEnd) {
    return;
  }

  const bothNull = value.quietStart === null && value.quietEnd === null;
  const bothStrings = typeof value.quietStart === 'string' && typeof value.quietEnd === 'string';

  if (!bothNull && !bothStrings) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'quietStart and quietEnd must both be strings or both be null',
      path: ['quietStart'],
    });
  }
});

export interface PreferencesRouteOptions {
  apiKey?: string;
}

export function registerPreferencesRoutes(
  server: FastifyInstance,
  db: Database,
  options?: PreferencesRouteOptions,
): void {
  const store = createUserPreferencesStore(db);
  const withAuth = async (
    request: Parameters<typeof requireApiKey>[0],
    reply: Parameters<typeof requireApiKey>[1],
  ) => requireApiKey(request, reply, options?.apiKey);

  server.get('/api/v1/preferences', {
    preHandler: withAuth,
  }, async (request) => {
    return store.get(resolveRequestUserId(request));
  });

  server.put('/api/v1/preferences', {
    preHandler: withAuth,
  }, async (request, reply) => {
    const parsed = PreferencesUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid preferences payload',
        details: parsed.error.issues,
      });
    }

    const userId = resolveRequestUserId(request);
    await ensureUserExists(db, userId);

    return reply.send(await store.upsert(userId, parsed.data));
  });
}
