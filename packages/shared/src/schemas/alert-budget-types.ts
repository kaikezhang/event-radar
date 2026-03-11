import { z } from 'zod';
import { PrioritySchema } from './rule-types.js';

export const BudgetConfigSchema = z.object({
  maxAlertsPerHour: z.number().int().min(1).max(1000).default(50),
  priorityShares: z.object({
    CRITICAL: z.number().min(0).max(1).default(0),
    HIGH: z.number().min(0).max(1).default(0.4),
    MEDIUM: z.number().min(0).max(1).default(0.35),
    LOW: z.number().min(0).max(1).default(0.25),
  }),
  windowMinutes: z.number().int().min(1).max(1440).default(60),
});
export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;

export const BudgetUsageSchema = z.object({
  window: z.object({
    startedAt: z.string(),
    minutes: z.number().int().min(1),
  }),
  total: z.object({
    used: z.number().int().min(0),
    limit: z.number().int().min(1),
  }),
  byPriority: z.record(
    z.string(),
    z.object({
      used: z.number().int().min(0),
      limit: z.number().int().min(0),
    }),
  ),
  suppressed: z.number().int().min(0),
});
export type BudgetUsage = z.infer<typeof BudgetUsageSchema>;

export const BudgetDecisionSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
  queuePosition: z.number().int().min(1).optional(),
});
export type BudgetDecision = z.infer<typeof BudgetDecisionSchema>;

export const SeverityResultSchema = z.object({
  severity: PrioritySchema,
  reason: z.string(),
  locked: z.boolean(),
  sourceCount: z.number().int().min(0),
});
export type SeverityResult = z.infer<typeof SeverityResultSchema>;

export const SeverityChangeSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  previousSeverity: PrioritySchema,
  newSeverity: PrioritySchema,
  reason: z.string(),
  changedBy: z.enum(['system', 'user']),
  createdAt: z.string(),
});
export type SeverityChange = z.infer<typeof SeverityChangeSchema>;
