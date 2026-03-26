import { z } from 'zod';

export const DeliveryChannelSchema = z.enum([
  'discord',
  'webPush',
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

export const DiscordConfigSchema = z.object({
  webhookUrl: z.string().url(),
});
export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;

export const DeliveryConfigSchema = z.object({
  discord: DiscordConfigSchema.optional(),
});
export type DeliveryConfig = z.infer<typeof DeliveryConfigSchema>;
