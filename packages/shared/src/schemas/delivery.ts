import { z } from 'zod';
import { SeveritySchema } from './severity.js';

export const DeliveryChannelSchema = z.enum([
  'bark',
  'discord',
  'telegram',
  'webhook',
]);
export type DeliveryChannel = z.infer<typeof DeliveryChannelSchema>;

export const DeliveryResultSchema = z.object({
  channel: DeliveryChannelSchema,
  success: z.boolean(),
  messageId: z.string().optional(),
  error: z.string().optional(),
  retryCount: z.number().int().min(0),
  latencyMs: z.number().min(0),
});
export type DeliveryResult = z.infer<typeof DeliveryResultSchema>;

export const TelegramConfigSchema = z.object({
  botToken: z.string().min(1),
  chatId: z.string().min(1),
  minSeverity: SeveritySchema,
  enabled: z.boolean(),
});
export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;

export const WebhookConfigSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(1),
  minSeverity: SeveritySchema,
  enabled: z.boolean(),
  headers: z.record(z.string()).optional(),
});
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

export const DeliveryConfigSchema = z.object({
  telegram: TelegramConfigSchema.optional(),
  webhook: WebhookConfigSchema.optional(),
});
export type DeliveryConfig = z.infer<typeof DeliveryConfigSchema>;
