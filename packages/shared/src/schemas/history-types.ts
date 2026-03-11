import { z } from 'zod';
import { SeveritySchema } from './severity.js';

export const HistoryEventSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  ticker: z.string().nullable(),
  source: z.string(),
  type: z.string(),
  severity: SeveritySchema.nullable(),
  direction: z.string().nullable(),
  headline: z.string(),
  summary: z.string().nullable(),
  sector: z.string(),
  metadata: z.record(z.unknown()).nullable(),
});

export const HistoryPaginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalCount: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export const HistoryResponseSchema = z.object({
  data: z.array(HistoryEventSchema),
  pagination: HistoryPaginationSchema,
});

export const SectorAggregateSchema = z.object({
  sector: z.string(),
  count: z.number().int().min(0),
  criticalCount: z.number().int().min(0),
  highCount: z.number().int().min(0),
  tickers: z.array(z.string()),
});

export const SectorAggregateResponseSchema = z.object({
  sectors: z.array(SectorAggregateSchema),
});

export type HistoryEvent = z.infer<typeof HistoryEventSchema>;
export type HistoryPagination = z.infer<typeof HistoryPaginationSchema>;
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;
export type SectorAggregate = z.infer<typeof SectorAggregateSchema>;
export type SectorAggregateResponse = z.infer<typeof SectorAggregateResponseSchema>;
