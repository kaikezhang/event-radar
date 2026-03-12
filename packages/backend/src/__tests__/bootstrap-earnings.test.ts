import { describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as hist from '../db/historical-schema.js';
import {
  buildExistingEarningsDedupWhereClause,
  buildMetricsEarningsInsertValues,
  processTickerConfigs,
  resolveCoverageDateTo,
} from '../scripts/bootstrap-earnings.js';

describe('bootstrap-earnings helpers', () => {
  describe('buildExistingEarningsDedupWhereClause', () => {
    const renderWhereClause = () => {
      const dialect = new PgDialect();
      const query = dialect.sqlToQuery(
        sql`select * from ${hist.historicalEvents} where ${buildExistingEarningsDedupWhereClause(
          'company-1',
          'NVDA',
          '2024-05-22',
        )}`,
      );

      return query.sql;
    };

    it('should include company_id in the dedup key', () => {
      expect(renderWhereClause()).toContain('"historical_events"."company_id"');
    });

    it('should include ticker_at_time in the dedup key', () => {
      expect(renderWhereClause()).toContain('"historical_events"."ticker_at_time"');
    });

    it('should compare the event timestamp by date', () => {
      expect(renderWhereClause()).toContain('DATE("historical_events"."event_ts")');
    });

    it('should not filter deduplication by bootstrap batch', () => {
      expect(renderWhereClause()).not.toContain('bootstrap_batch');
    });

    it('should not filter deduplication by event type', () => {
      expect(renderWhereClause()).not.toContain('event_type');
    });
  });

  describe('processTickerConfigs', () => {
    const tickers = [
      { ticker: 'NVDA', name: 'NVIDIA Corporation' },
      { ticker: 'TSLA', name: 'Tesla, Inc.' },
      { ticker: 'AAPL', name: 'Apple Inc.' },
    ] as const;

    it('should continue processing after a ticker handler throws', async () => {
      const handled: string[] = [];

      await processTickerConfigs(
        tickers,
        async (cfg) => {
          handled.push(cfg.ticker);
          if (cfg.ticker === 'TSLA') {
            throw new Error('boom');
          }
        },
        {
          delayMs: 25,
          sleepFn: vi.fn().mockResolvedValue(undefined),
          logger: { log: vi.fn(), error: vi.fn() },
        },
      );

      expect(handled).toEqual(['NVDA', 'TSLA', 'AAPL']);
    });

    it('should log the ticker symbol when a ticker handler fails', async () => {
      const logger = { log: vi.fn(), error: vi.fn() };

      await processTickerConfigs(
        tickers,
        async (cfg) => {
          if (cfg.ticker === 'TSLA') {
            throw new Error('boom');
          }
        },
        {
          delayMs: 25,
          sleepFn: vi.fn().mockResolvedValue(undefined),
          logger,
        },
      );

      expect(logger.error).toHaveBeenCalledWith(
        '  [ERROR] Failed to process TSLA:',
        expect.any(Error),
      );
    });

    it('should sleep between tickers even when a ticker handler fails', async () => {
      const sleepFn = vi.fn().mockResolvedValue(undefined);

      await processTickerConfigs(
        tickers,
        async (cfg) => {
          if (cfg.ticker === 'TSLA') {
            throw new Error('boom');
          }
        },
        {
          delayMs: 25,
          sleepFn,
          logger: { log: vi.fn(), error: vi.fn() },
        },
      );

      expect(sleepFn).toHaveBeenCalledTimes(2);
      expect(sleepFn).toHaveBeenNthCalledWith(1, 25);
      expect(sleepFn).toHaveBeenNthCalledWith(2, 25);
    });

    it('should not sleep after the last ticker', async () => {
      const sleepFn = vi.fn().mockResolvedValue(undefined);

      await processTickerConfigs([{ ticker: 'NVDA', name: 'NVIDIA Corporation' }], async () => {}, {
        delayMs: 25,
        sleepFn,
        logger: { log: vi.fn(), error: vi.fn() },
      });

      expect(sleepFn).not.toHaveBeenCalled();
    });
  });

  describe('resolveCoverageDateTo', () => {
    it('should use the last earnings date when events exist', () => {
      expect(resolveCoverageDateTo(['2024-01-31', '2024-04-30', '2024-07-31'])).toBe('2024-07-31');
    });

    it('should fall back to the current UTC date when no events exist', () => {
      expect(resolveCoverageDateTo([], new Date('2026-03-12T15:45:00.000Z'))).toBe('2026-03-12');
    });
  });

  describe('decimal precision safety', () => {
    it('should widen eps_surprise_pct to numeric(10, 2)', () => {
      expect(hist.metricsEarnings.epsSurprisePct.getSQLType()).toBe('numeric(10, 2)');
    });

    it('should widen revenue_surprise_pct to numeric(10, 2)', () => {
      expect(hist.metricsEarnings.revenueSurprisePct.getSQLType()).toBe('numeric(10, 2)');
    });

    it('should widen yoy_revenue_growth to numeric(10, 2)', () => {
      expect(hist.metricsEarnings.yoyRevenueGrowth.getSQLType()).toBe('numeric(10, 2)');
    });

    it('should widen yoy_eps_growth to numeric(10, 2)', () => {
      expect(hist.metricsEarnings.yoyEpsGrowth.getSQLType()).toBe('numeric(10, 2)');
    });

    it('should clamp null surprise values without changing them', async () => {
      const module = await import('../scripts/bootstrap-earnings.js');
      const clamp = (module as Record<string, unknown>)['clampPercentageForDecimalStorage'];

      expect(typeof clamp).toBe('function');
      if (typeof clamp !== 'function') return;

      expect(clamp(null)).toBeNull();
    });

    it('should leave in-range surprise values unchanged', async () => {
      const module = await import('../scripts/bootstrap-earnings.js');
      const clamp = (module as Record<string, unknown>)['clampPercentageForDecimalStorage'];

      expect(typeof clamp).toBe('function');
      if (typeof clamp !== 'function') return;

      expect(clamp(18282)).toBe(18282);
    });

    it('should clamp large positive surprise values to the storage ceiling', async () => {
      const module = await import('../scripts/bootstrap-earnings.js');
      const clamp = (module as Record<string, unknown>)['clampPercentageForDecimalStorage'];

      expect(typeof clamp).toBe('function');
      if (typeof clamp !== 'function') return;

      expect(clamp(123456789)).toBe(99999999);
    });

    it('should clamp large negative surprise values to the storage floor', async () => {
      const module = await import('../scripts/bootstrap-earnings.js');
      const clamp = (module as Record<string, unknown>)['clampPercentageForDecimalStorage'];

      expect(typeof clamp).toBe('function');
      if (typeof clamp !== 'function') return;

      expect(clamp(-123456789)).toBe(-99999999);
    });

    it('should clamp all percentage fields before inserting earnings metrics', () => {
      const values = buildMetricsEarningsInsertValues('event-1', 'FY2026-Q1', {
        date: '2026-03-12',
        eps_estimate: 1.25,
        eps_actual: 1.5,
        surprise_pct: 123456789,
        revenue_surprise_pct: -123456789,
        yoy_revenue_growth: 123456789,
        yoy_eps_growth: -123456789,
      });

      expect(values).toMatchObject({
        eventId: 'event-1',
        epsSurprisePct: '99999999',
        revenueSurprisePct: '-99999999',
        yoyRevenueGrowth: '99999999',
        yoyEpsGrowth: '-99999999',
      });
    });
  });
});
