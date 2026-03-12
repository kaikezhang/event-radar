import { z } from 'zod';
import { SeveritySchema } from './severity.js';

export const ImpactEventSchema = z.object({
  eventId: z.string().uuid(),
  timestamp: z.string().datetime(),
  ticker: z.string(),
  headline: z.string(),
  severity: SeveritySchema.nullable(),
  direction: z.string(),
  priceAtEvent: z.number().nullable(),
  priceChange1h: z.number(),
  priceChange1d: z.number(),
  priceChange1w: z.number(),
});

export const ImpactResponseSchema = z.object({
  events: z.array(ImpactEventSchema),
});

export type ImpactEvent = z.infer<typeof ImpactEventSchema>;
export type ImpactResponse = z.infer<typeof ImpactResponseSchema>;
