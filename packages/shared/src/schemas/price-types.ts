import { z } from 'zod';

export const PriceDataSchema = z.object({
  ticker: z.string().min(1).max(10),
  date: z.coerce.date(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().int().min(0),
});

export type PriceData = z.infer<typeof PriceDataSchema>;

export const PriceChangeSchema = z.object({
  ticker: z.string().min(1).max(10),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  fromPrice: z.number(),
  toPrice: z.number(),
  absolute: z.number(),
  percent: z.number(),
});

export type PriceChange = z.infer<typeof PriceChangeSchema>;

export const PriceIntervalSchema = z.object({
  interval: z.number(), // hours: 1, 24, 168, 720
  label: z.string(), // "T+1h", "T+1d", "T+1w", "T+1m"
  price: z.number().nullable(),
  change: z.number().nullable(), // percent change from event price
  absolute: z.number().nullable(),
});

export type PriceInterval = z.infer<typeof PriceIntervalSchema>;

export const PriceAfterEventSchema = z.object({
  ticker: z.string().min(1).max(10),
  eventTime: z.coerce.date(),
  prices: z.array(PriceIntervalSchema),
});

export type PriceAfterEvent = z.infer<typeof PriceAfterEventSchema>;

export const IntervalStatsSchema = z.object({
  label: z.string(),
  avgChange: z.number(),
  medianChange: z.number(),
  winRate: z.number(),
  sampleSize: z.number(),
});

export type IntervalStats = z.infer<typeof IntervalStatsSchema>;

export const TypeStatsSchema = z.object({
  count: z.number(),
  avgChange1d: z.number(),
  winRate1d: z.number(),
});

export type TypeStats = z.infer<typeof TypeStatsSchema>;

export const OutcomeStatsSchema = z.object({
  totalEvents: z.number(),
  trackedEvents: z.number(),
  byInterval: z.array(IntervalStatsSchema),
  byEventType: z.record(z.string(), TypeStatsSchema),
  bySource: z.record(z.string(), TypeStatsSchema),
});

export type OutcomeStats = z.infer<typeof OutcomeStatsSchema>;
