import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import { requireApiKey } from './auth-middleware.js';
import { ensureUserExists, resolveRequestUserId } from './user-context.js';
import { createPushSubscriptionStore } from '../services/push-subscription-store.js';

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
});

const DeleteSubscriptionSchema = z.object({
  endpoint: z.string().url(),
});

export interface PushSubscriptionRouteOptions {
  apiKey?: string;
}

export function registerPushSubscriptionRoutes(
  server: FastifyInstance,
  db: Database,
  options?: PushSubscriptionRouteOptions,
): void {
  const store = createPushSubscriptionStore(db);
  const withAuth = async (
    request: Parameters<typeof requireApiKey>[0],
    reply: Parameters<typeof requireApiKey>[1],
  ) => requireApiKey(request, reply, options?.apiKey);

  server.post('/api/push-subscriptions', {
    preHandler: withAuth,
  }, async (request, reply) => {
    const parsed = PushSubscriptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid push subscription payload',
        details: parsed.error.issues,
      });
    }

    const userId = resolveRequestUserId(request);
    await ensureUserExists(db, userId);

    await store.upsertSubscription({
      userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({ ok: true });
  });

  server.delete('/api/push-subscriptions', {
    preHandler: withAuth,
  }, async (request, reply) => {
    const parsed = DeleteSubscriptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid push subscription payload',
        details: parsed.error.issues,
      });
    }

    const removed = await store.removeSubscription(
      resolveRequestUserId(request),
      parsed.data.endpoint,
    );

    if (!removed) {
      return reply.status(404).send({ error: 'Push subscription not found' });
    }

    return { ok: true };
  });
}
