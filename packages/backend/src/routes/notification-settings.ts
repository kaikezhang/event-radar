import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import { requireAuth } from './auth-middleware.js';
import { ensureUserExists, resolveRequestUserId } from './user-context.js';
import { createNotificationSettingsStore } from '../services/notification-settings-store.js';

const DISCORD_WEBHOOK_RE = /^https:\/\/discord\.com\/api\/webhooks\//;

const NotificationSettingsSchema = z.object({
  discordWebhookUrl: z
    .string()
    .url()
    .regex(DISCORD_WEBHOOK_RE, 'Must be a Discord webhook URL')
    .nullable()
    .optional(),
  emailAddress: z.string().email().nullable().optional(),
  minSeverity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM']).optional(),
  enabled: z.boolean().optional(),
});

const TestDiscordSchema = z.object({
  webhookUrl: z.string().url().regex(DISCORD_WEBHOOK_RE, 'Must be a Discord webhook URL'),
});

export interface NotificationSettingsRouteOptions {
  apiKey?: string;
}

export function registerNotificationSettingsRoutes(
  server: FastifyInstance,
  db: Database,
  options?: NotificationSettingsRouteOptions,
): void {
  const store = createNotificationSettingsStore(db);
  const withAuth = async (
    request: Parameters<typeof requireAuth>[0],
    reply: Parameters<typeof requireAuth>[1],
  ) => requireAuth(request, reply, options?.apiKey);

  server.get('/api/v1/settings/notifications', {
    preHandler: withAuth,
  }, async (request) => {
    return store.get(resolveRequestUserId(request));
  });

  server.post('/api/v1/settings/notifications', {
    preHandler: withAuth,
  }, async (request, reply) => {
    const parsed = NotificationSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid notification settings payload',
        details: parsed.error.issues,
      });
    }

    const userId = resolveRequestUserId(request);
    await ensureUserExists(db, userId);

    return reply.send(await store.upsert(userId, parsed.data));
  });

  server.post('/api/v1/settings/notifications/test-discord', {
    preHandler: withAuth,
  }, async (request, reply) => {
    const parsed = TestDiscordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid webhook URL',
        details: parsed.error.issues,
      });
    }

    try {
      const response = await fetch(parsed.data.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'Event Radar',
          embeds: [{
            title: 'Test Notification',
            description: 'Your Discord webhook is working! Event Radar will send alerts here.',
            color: 0x57f287,
            timestamp: new Date().toISOString(),
            footer: { text: 'Event Radar — Test' },
          }],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return reply.status(502).send({
          error: 'Discord webhook test failed',
          detail: `Discord returned ${response.status}: ${text}`,
        });
      }

      return reply.send({ success: true });
    } catch (error) {
      return reply.status(502).send({
        error: 'Discord webhook test failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
