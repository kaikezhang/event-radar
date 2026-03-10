import { z } from 'zod';

// ── Cross-Source Dedup Types ────────────────────────────────────

export const CrossSourceMatchTypeSchema = z.enum([
  'exact',    // same source + same sourceId → 100% duplicate
  'strong',   // same ticker + same eventType + time<5min + title similarity>0.8
  'likely',   // same ticker + time<30min + content similarity>0.7
  'none',
]);

export type CrossSourceMatchType = z.infer<typeof CrossSourceMatchTypeSchema>;

export const CrossSourceDedupResultSchema = z.object({
  isDuplicate: z.boolean(),
  matchType: CrossSourceMatchTypeSchema,
  confidence: z.number().min(0).max(1),
  matchedEventId: z.string().uuid().optional(),
  /** All matched duplicate event IDs (for multi-source merge) */
  duplicateIds: z.array(z.string().uuid()),
});

export type CrossSourceDedupResult = z.infer<typeof CrossSourceDedupResultSchema>;

// ── Source URL tracking ─────────────────────────────────────────

export const SourceUrlSchema = z.object({
  source: z.string(),
  url: z.string().optional(),
  receivedAt: z.string().datetime(),
});

export type SourceUrl = z.infer<typeof SourceUrlSchema>;

// ── Merge types ─────────────────────────────────────────────────

export const MergedEventDataSchema = z.object({
  /** The primary event ID (earliest received) */
  primaryId: z.string().uuid(),
  /** IDs of events that were merged into the primary */
  mergedFrom: z.array(z.string().uuid()),
  /** All source URLs from merged events */
  sourceUrls: z.array(SourceUrlSchema),
});

export type MergedEventData = z.infer<typeof MergedEventDataSchema>;

// ── Dedup options ───────────────────────────────────────────────

export const CrossSourceDedupOptionsSchema = z.object({
  /** Time window for strong match in minutes. Default: 5 */
  strongWindowMinutes: z.number().int().min(1).default(5),
  /** Time window for likely match in minutes. Default: 30 */
  likelyWindowMinutes: z.number().int().min(1).default(30),
  /** Title similarity threshold for strong match. Default: 0.8 */
  strongTitleThreshold: z.number().min(0).max(1).default(0.8),
  /** Content similarity threshold for likely match. Default: 0.7 */
  likelyContentThreshold: z.number().min(0).max(1).default(0.7),
  /** Max candidates to evaluate. Default: 100 */
  maxCandidates: z.number().int().min(1).default(100),
});

export type CrossSourceDedupOptions = z.infer<typeof CrossSourceDedupOptionsSchema>;
