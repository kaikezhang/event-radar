import { z } from 'zod';

// ── Confirmation Result ─────────────────────────────────────────

export const ConfirmationResultSchema = z.object({
  eventId: z.string().uuid(),
  sourceCount: z.number().int().min(1),
  sources: z.array(z.string()),
  previousSeverity: z.string(),
  newSeverity: z.string(),
  upgraded: z.boolean(),
  confidenceBoost: z.number().min(0).max(1),
  newConfidence: z.number().min(0).max(1),
});

export type ConfirmationResult = z.infer<typeof ConfirmationResultSchema>;

// ── Confirmation Config ─────────────────────────────────────────

export const ConfirmationConfigSchema = z.object({
  /** Minimum distinct sources required for upgrade. Default: 2 */
  minSourcesForUpgrade: z.number().int().min(2).default(2),
  /** Confidence boost for 2-source confirmation. Default: 0.15 */
  twoSourceBoost: z.number().min(0).max(1).default(0.15),
  /** Confidence boost for 3+ source confirmation. Default: 0.25 */
  threeSourceBoost: z.number().min(0).max(1).default(0.25),
  /** Maximum confidence cap. Default: 0.99 */
  maxConfidence: z.number().min(0).max(1).default(0.99),
});

export type ConfirmationConfig = z.infer<typeof ConfirmationConfigSchema>;
