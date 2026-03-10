import { describe, it, expect, vi } from 'vitest';
import { WinRateAnalysis } from '../services/win-rate-analysis.js';

// ── Mock helpers ────────────────────────────────────────────────

function makeMockDb(
  executeResult: Record<string, unknown>[] = [],
) {
  return {
    execute: vi.fn().mockResolvedValue({ rows: executeResult }),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  } as unknown;
}

// ── Tests ───────────────────────────────────────────────────────

describe('WinRateAnalysis', () => {
  describe('getWinRateBySource', () => {
    it('should return win rate breakdown by source', async () => {
      const mockRows = [
        {
          category: 'sec-8k',
          total_events: 20,
          tracked_events: 15,
          win_rate_1h: 60.0,
          win_rate_1d: 55.5,
          win_rate_1w: 52.0,
          avg_return_1d: 1.2345,
          median_return_1d: 0.8,
          best_return: 5.5,
          worst_return: -3.2,
        },
      ];

      const db = makeMockDb(mockRows);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analysis = new WinRateAnalysis(db as any);
      const result = await analysis.getWinRateBySource();

      expect(result).toHaveLength(1);
      expect(result[0]?.category).toBe('sec-8k');
      expect(result[0]?.totalEvents).toBe(20);
      expect(result[0]?.trackedEvents).toBe(15);
      expect(result[0]?.winRate1d).toBe(55.5);
      expect(result[0]?.avgReturn1d).toBe(1.2345);
    });

    it('should pass interval filter when provided', async () => {
      const db = makeMockDb([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analysis = new WinRateAnalysis(db as any);
      await analysis.getWinRateBySource('30 days');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const executeFn = (db as any).execute as ReturnType<typeof vi.fn>;
      expect(executeFn).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no data', async () => {
      const db = makeMockDb([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analysis = new WinRateAnalysis(db as any);
      const result = await analysis.getWinRateBySource();

      expect(result).toEqual([]);
    });
  });

  describe('getWinRateBySeverity', () => {
    it('should return breakdown grouped by severity', async () => {
      const mockRows = [
        {
          category: 'HIGH',
          total_events: 10,
          tracked_events: 8,
          win_rate_1h: 70.0,
          win_rate_1d: 62.5,
          win_rate_1w: 50.0,
          avg_return_1d: 2.1,
          median_return_1d: 1.5,
          best_return: 8.0,
          worst_return: -4.0,
        },
        {
          category: 'LOW',
          total_events: 30,
          tracked_events: 25,
          win_rate_1h: 48.0,
          win_rate_1d: 44.0,
          win_rate_1w: 40.0,
          avg_return_1d: 0.3,
          median_return_1d: 0.1,
          best_return: 3.0,
          worst_return: -2.0,
        },
      ];

      const db = makeMockDb(mockRows);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analysis = new WinRateAnalysis(db as any);
      const result = await analysis.getWinRateBySeverity();

      expect(result).toHaveLength(2);
      expect(result[0]?.category).toBe('HIGH');
      expect(result[1]?.category).toBe('LOW');
    });
  });

  describe('getWinRateByEventType', () => {
    it('should return breakdown grouped by event type', async () => {
      const mockRows = [
        {
          category: 'insider_trade',
          total_events: 12,
          tracked_events: 10,
          win_rate_1h: 65.0,
          win_rate_1d: 60.0,
          win_rate_1w: 55.0,
          avg_return_1d: 1.8,
          median_return_1d: 1.2,
          best_return: 6.0,
          worst_return: -2.5,
        },
      ];

      const db = makeMockDb(mockRows);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analysis = new WinRateAnalysis(db as any);
      const result = await analysis.getWinRateByEventType();

      expect(result).toHaveLength(1);
      expect(result[0]?.category).toBe('insider_trade');
    });
  });

  describe('getDirectionAccuracy', () => {
    it('should aggregate direction accuracy correctly', async () => {
      const mockRows = [
        { direction: 'BULLISH', total: 50, correct: 35 },
        { direction: 'BEARISH', total: 30, correct: 20 },
        { direction: 'NEUTRAL', total: 10, correct: 6 },
      ];

      const db = makeMockDb(mockRows);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analysis = new WinRateAnalysis(db as any);
      const result = await analysis.getDirectionAccuracy();

      expect(result.totalPredictions).toBe(90);
      expect(result.correctPredictions).toBe(61);
      expect(result.accuracy).toBeCloseTo(67.78, 1);
      expect(result.byDirection.bullish.total).toBe(50);
      expect(result.byDirection.bullish.correct).toBe(35);
      expect(result.byDirection.bullish.accuracy).toBe(70);
      expect(result.byDirection.bearish.total).toBe(30);
      expect(result.byDirection.bearish.accuracy).toBeCloseTo(66.67, 1);
      expect(result.byDirection.neutral.total).toBe(10);
    });

    it('should handle empty data', async () => {
      const db = makeMockDb([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analysis = new WinRateAnalysis(db as any);
      const result = await analysis.getDirectionAccuracy();

      expect(result.totalPredictions).toBe(0);
      expect(result.correctPredictions).toBe(0);
      expect(result.accuracy).toBe(0);
      expect(result.byDirection.bullish.total).toBe(0);
      expect(result.byDirection.bearish.total).toBe(0);
      expect(result.byDirection.neutral.total).toBe(0);
    });
  });

  describe('getTopPerformingSignals', () => {
    it('should return top signals sorted by Sharpe ratio', async () => {
      const mockRows = [
        {
          event_type: 'insider_buy',
          source: 'sec-form4',
          cnt: 15,
          win_rate_1d: 73.33,
          avg_return_1d: 2.5,
          sharpe_ratio: 1.8,
        },
        {
          event_type: 'tariff',
          source: 'truth-social',
          cnt: 8,
          win_rate_1d: 62.5,
          avg_return_1d: 1.1,
          sharpe_ratio: 0.9,
        },
      ];

      const db = makeMockDb(mockRows);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analysis = new WinRateAnalysis(db as any);
      const result = await analysis.getTopPerformingSignals(10);

      expect(result).toHaveLength(2);
      expect(result[0]?.eventType).toBe('insider_buy');
      expect(result[0]?.source).toBe('sec-form4');
      expect(result[0]?.sharpeRatio).toBe(1.8);
      expect(result[1]?.sharpeRatio).toBe(0.9);
    });

    it('should default to limit 10', async () => {
      const db = makeMockDb([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analysis = new WinRateAnalysis(db as any);
      await analysis.getTopPerformingSignals();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const executeFn = (db as any).execute as ReturnType<typeof vi.fn>;
      expect(executeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPerformanceOverTime', () => {
    it('should return bucketed performance trend', async () => {
      const mockRows = [
        {
          bucket_start: '2024-03-01T00:00:00Z',
          total_events: 12,
          win_rate_1d: 58.33,
          avg_return_1d: 0.85,
        },
        {
          bucket_start: '2024-03-08T00:00:00Z',
          total_events: 18,
          win_rate_1d: 61.11,
          avg_return_1d: 1.12,
        },
      ];

      const db = makeMockDb(mockRows);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analysis = new WinRateAnalysis(db as any);
      const result = await analysis.getPerformanceOverTime(7);

      expect(result).toHaveLength(2);
      expect(result[0]?.totalEvents).toBe(12);
      expect(result[0]?.bucketStart).toBeInstanceOf(Date);
      expect(result[0]?.bucketEnd).toBeInstanceOf(Date);
      // bucketEnd should be 7 days after bucketStart
      const diffMs =
        result[0]!.bucketEnd.getTime() - result[0]!.bucketStart.getTime();
      expect(diffMs).toBe(7 * 86_400_000);
    });

    it('should default to 7-day buckets', async () => {
      const db = makeMockDb([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analysis = new WinRateAnalysis(db as any);
      await analysis.getPerformanceOverTime();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const executeFn = (db as any).execute as ReturnType<typeof vi.fn>;
      expect(executeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle null values in rows gracefully', async () => {
      const mockRows = [
        {
          category: null,
          total_events: null,
          tracked_events: null,
          win_rate_1h: null,
          win_rate_1d: null,
          win_rate_1w: null,
          avg_return_1d: null,
          median_return_1d: null,
          best_return: null,
          worst_return: null,
        },
      ];

      const db = makeMockDb(mockRows);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analysis = new WinRateAnalysis(db as any);
      const result = await analysis.getWinRateBySource();

      expect(result).toHaveLength(1);
      expect(result[0]?.category).toBe('unknown');
      expect(result[0]?.totalEvents).toBe(0);
      expect(result[0]?.winRate1d).toBe(0);
    });

    it('should handle plain array result from db.execute', async () => {
      // Some drizzle versions return plain array instead of { rows: [...] }
      const mockRows = [
        {
          category: 'reddit',
          total_events: 5,
          tracked_events: 3,
          win_rate_1h: 40.0,
          win_rate_1d: 33.33,
          win_rate_1w: 33.33,
          avg_return_1d: -0.5,
          median_return_1d: -0.3,
          best_return: 2.0,
          worst_return: -4.0,
        },
      ];

      const db = {
        execute: vi.fn().mockResolvedValue(mockRows), // plain array, no .rows
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analysis = new WinRateAnalysis(db as any);
      const result = await analysis.getWinRateBySource();

      expect(result).toHaveLength(1);
      expect(result[0]?.category).toBe('reddit');
    });
  });
});
