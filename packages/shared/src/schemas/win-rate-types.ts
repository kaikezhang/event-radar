import { z } from 'zod';

export const WinRateBreakdownSchema = z.object({
  category: z.string(),
  totalEvents: z.number().int(),
  trackedEvents: z.number().int(),
  winRate1h: z.number(),
  winRate1d: z.number(),
  winRate1w: z.number(),
  avgReturn1d: z.number(),
  medianReturn1d: z.number(),
  bestReturn: z.number(),
  worstReturn: z.number(),
});

export type WinRateBreakdown = z.infer<typeof WinRateBreakdownSchema>;

export const DirectionAccuracyBucketSchema = z.object({
  total: z.number().int(),
  correct: z.number().int(),
  accuracy: z.number(),
});

export const DirectionAccuracySchema = z.object({
  totalPredictions: z.number().int(),
  correctPredictions: z.number().int(),
  accuracy: z.number(),
  byDirection: z.object({
    bullish: DirectionAccuracyBucketSchema,
    bearish: DirectionAccuracyBucketSchema,
    neutral: DirectionAccuracyBucketSchema,
  }),
});

export type DirectionAccuracy = z.infer<typeof DirectionAccuracySchema>;

export const SignalPerformanceSchema = z.object({
  eventType: z.string(),
  source: z.string(),
  count: z.number().int(),
  winRate1d: z.number(),
  avgReturn1d: z.number(),
  sharpeRatio: z.number(),
});

export type SignalPerformance = z.infer<typeof SignalPerformanceSchema>;

export const PerformanceTrendSchema = z.object({
  bucketStart: z.coerce.date(),
  bucketEnd: z.coerce.date(),
  totalEvents: z.number().int(),
  winRate1d: z.number(),
  avgReturn1d: z.number(),
});

export type PerformanceTrend = z.infer<typeof PerformanceTrendSchema>;
