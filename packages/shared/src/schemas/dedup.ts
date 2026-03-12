import { z } from 'zod';

export const DedupMatchTypeSchema = z.enum([
  'exact-id',
  'ticker-window',
  'content-similarity',
  'db-lookup',
  'none',
]);

export type DedupMatchType = z.infer<typeof DedupMatchTypeSchema>;

export const DedupResultSchema = z.object({
  isDuplicate: z.boolean(),
  matchType: DedupMatchTypeSchema,
  matchConfidence: z.number().min(0).max(1),
  originalEventId: z.string().uuid().optional(),
  storyId: z.string().uuid().optional(),
});

export type DedupResult = z.infer<typeof DedupResultSchema>;
