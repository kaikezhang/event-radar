import { z } from 'zod';

export const SimilarityOptionsSchema = z.object({
  maxResults: z.number().int().min(1).max(50).default(10),
  timeWindowMinutes: z.number().int().min(1).max(10080).default(60),
  minScore: z.number().min(0).max(1).default(0.5),
  sameTickerOnly: z.boolean().default(false),
});

export type SimilarityOptions = z.infer<typeof SimilarityOptionsSchema>;

export const SimilarityScoreSchema = z.object({
  composite: z.number().min(0).max(1),
  ticker: z.number().min(0).max(1),
  time: z.number().min(0).max(1),
  content: z.number().min(0).max(1),
});

export type SimilarityScore = z.infer<typeof SimilarityScoreSchema>;

export const SimilarEventSchema = z.object({
  eventId: z.string().uuid(),
  score: z.number().min(0).max(1),
  tickerScore: z.number().min(0).max(1),
  timeScore: z.number().min(0).max(1),
  contentScore: z.number().min(0).max(1),
  event: z.record(z.unknown()),
});

export type SimilarEvent = z.infer<typeof SimilarEventSchema>;
