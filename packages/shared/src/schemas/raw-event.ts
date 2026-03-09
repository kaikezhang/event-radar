import { z } from 'zod';

export const RawEventSchema = z.object({
  id: z.string().uuid(),
  source: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  url: z.string().url().optional(),
  timestamp: z.coerce.date(),
  metadata: z.record(z.unknown()).optional(),
});

export type RawEvent = z.infer<typeof RawEventSchema>;
