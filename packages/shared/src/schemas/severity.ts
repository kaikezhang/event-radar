import { z } from 'zod';

export const SeveritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export type Severity = z.infer<typeof SeveritySchema>;
