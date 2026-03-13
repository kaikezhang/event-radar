import { z } from 'zod';

export const RegimeLabelSchema = z.enum([
  'extreme_oversold',
  'oversold',
  'neutral',
  'overbought',
  'extreme_overbought',
]);

export type RegimeLabel = z.infer<typeof RegimeLabelSchema>;

export const RegimeDirectionSchema = z.enum(['bullish', 'bearish', 'neutral']);

export type RegimeDirection = z.infer<typeof RegimeDirectionSchema>;

export const RegimeSnapshotSchema = z.object({
  score: z.number().min(-100).max(100),
  label: RegimeLabelSchema,
  spy: z.number().optional(),
  factors: z.object({
    vix: z.object({
      value: z.number(),
      zscore: z.number(),
    }),
    spyRsi: z.object({
      value: z.number().min(0).max(100),
      signal: z.enum(['oversold', 'neutral', 'overbought']),
    }),
    spy52wPosition: z.object({
      pctFromHigh: z.number(),
      pctFromLow: z.number(),
    }),
    maSignal: z.object({
      sma20: z.number(),
      sma50: z.number(),
      signal: z.enum(['golden_cross', 'death_cross', 'neutral']),
    }),
    yieldCurve: z.object({
      spread: z.number(),
      inverted: z.boolean(),
    }),
  }),
  amplification: z.object({
    bullish: z.number().positive(),
    bearish: z.number().positive(),
  }),
  updatedAt: z.string().datetime(),
});

export type RegimeSnapshot = z.infer<typeof RegimeSnapshotSchema>;

export const RegimeHistoryPointSchema = z.object({
  at: z.string().datetime(),
  score: z.number().min(-100).max(100),
  vix: z.number(),
  spy: z.number(),
  regime: z.enum(['bull', 'bear', 'correction', 'neutral']),
  factors: z.object({
    label: RegimeLabelSchema,
    rsi: z.number().min(0).max(100),
    ma_cross: z.enum(['golden_cross', 'death_cross', 'neutral']),
    yield_curve: z.number(),
    vix_zscore: z.number(),
    pct_from_high: z.number(),
    pct_from_low: z.number(),
  }),
});

export type RegimeHistoryPoint = z.infer<typeof RegimeHistoryPointSchema>;
