import { z } from 'zod';

export const ScannerHealthSchema = z.object({
  scanner: z.string(),
  status: z.enum(['healthy', 'degraded', 'down']),
  lastScanAt: z.coerce.date().nullable(),
  errorCount: z.number().int().nonnegative(),
  message: z.string().optional(),
  consecutiveErrors: z.number().int().nonnegative().optional(),
  currentIntervalMs: z.number().nonnegative().optional(),
  inBackoff: z.boolean().optional(),
});

export type ScannerHealth = z.infer<typeof ScannerHealthSchema>;
