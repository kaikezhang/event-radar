import { describe, it, expect, vi } from 'vitest';
import { OutcomeTracker } from '../services/outcome-tracker.js';
import type { RawEvent } from '@event-radar/shared';

// ── Mock helpers ────────────────────────────────────────────────

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: 'evt-001',
    source: 'sec-8k',
    type: 'filing',
    title: 'AAPL 8-K Filing',
    body: 'AAPL filed 8-K',
    url: 'https://example.com',
    timestamp: new Date('2024-03-04T10:00:00Z'),
    metadata: { ticker: 'AAPL' },
    ...overrides,
  };
}

/** Minimal mock database that stores rows in-memory. */
function makeMockDb() {
  const outcomes: Record<string, unknown>[] = [];
  const eventsTable: Record<string, unknown>[] = [
    { id: 'evt-001', source: 'sec-8k', severity: 'HIGH' },
    { id: 'evt-002', source: 'reddit', severity: 'LOW' },
  ];

  // Build a chainable query builder mock
  const makeChain = (rows: Record<string, unknown>[]) => {
    let _where: unknown; // eslint-disable-line @typescript-eslint/no-unused-vars
    let _limit: number | undefined; // eslint-disable-line @typescript-eslint/no-unused-vars
    const chain = {
      from: () => chain,
      where: (w: unknown) => {
        _where = w;
        return chain;
      },
      orderBy: () => chain,
      limit: (n: number) => {
        _limit = n;
        return chain;
      },
      offset: () => chain,
      onConflictDoNothing: () => Promise.resolve(),
      set: () => chain,
      then: (resolve: (v: unknown) => void) => resolve(rows),
    };
    return chain;
  };

  return {
    select: () => makeChain([{ total: 0 }]),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => Promise.resolve(),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
    execute: () => Promise.resolve({ rows: [] }),
    _outcomes: outcomes,
    _events: eventsTable,
  } as unknown;
}

// ── Tests ───────────────────────────────────────────────────────

describe('OutcomeTracker', () => {
  describe('extractTicker', () => {
    it('should extract ticker from event metadata', async () => {
      const db = makeMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = new OutcomeTracker(db as any);
      const event = makeEvent({ metadata: { ticker: 'TSLA' } });

      // Access private method via prototype for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticker = (tracker as any).extractTicker(event);
      expect(ticker).toBe('TSLA');
    });

    it('should extract first ticker from tickers array', async () => {
      const db = makeMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = new OutcomeTracker(db as any);
      const event = makeEvent({ metadata: { tickers: ['GOOG', 'MSFT'] } });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticker = (tracker as any).extractTicker(event);
      expect(ticker).toBe('GOOG');
    });

    it('should return null when no ticker in metadata', async () => {
      const db = makeMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = new OutcomeTracker(db as any);
      const event = makeEvent({ metadata: {} });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticker = (tracker as any).extractTicker(event);
      expect(ticker).toBeNull();
    });

    it('should return null when metadata is undefined', async () => {
      const db = makeMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = new OutcomeTracker(db as any);
      const event = makeEvent({ metadata: undefined });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticker = (tracker as any).extractTicker(event);
      expect(ticker).toBeNull();
    });
  });

  describe('scheduleOutcomeTracking', () => {
    it('should return error when event has no ticker', async () => {
      const db = makeMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = new OutcomeTracker(db as any);
      const event = makeEvent({ metadata: {} });

      const result = await tracker.scheduleOutcomeTracking(event);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No ticker found');
      }
    });

    it('should schedule tracking for event with ticker', async () => {
      const insertValues = vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      });
      const db = {
        ...makeMockDb(),
        insert: () => ({ values: insertValues }),
      };

      const mockPriceService = {
        getPriceAt: vi.fn().mockResolvedValue({ ok: true, value: 179.5 }),
      };

      const tracker = new OutcomeTracker(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        db as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockPriceService as any,
      );

      const event = makeEvent({ metadata: { ticker: 'AAPL' } });
      const result = await tracker.scheduleOutcomeTracking(event);

      expect(result.ok).toBe(true);
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt-001',
          ticker: 'AAPL',
          eventPrice: '179.5',
        }),
      );
    });

    it('should handle null price gracefully', async () => {
      const insertValues = vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      });
      const db = {
        ...makeMockDb(),
        insert: () => ({ values: insertValues }),
      };

      const mockPriceService = {
        getPriceAt: vi.fn().mockResolvedValue({ ok: true, value: null }),
      };

      const tracker = new OutcomeTracker(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        db as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockPriceService as any,
      );

      const event = makeEvent();
      const result = await tracker.scheduleOutcomeTracking(event);

      expect(result.ok).toBe(true);
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          eventPrice: null,
        }),
      );
    });

    it('should handle price service errors gracefully', async () => {
      const insertValues = vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      });
      const db = {
        ...makeMockDb(),
        insert: () => ({ values: insertValues }),
      };

      const mockPriceService = {
        getPriceAt: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error('Network error'),
        }),
      };

      const tracker = new OutcomeTracker(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        db as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockPriceService as any,
      );

      const event = makeEvent();
      const result = await tracker.scheduleOutcomeTracking(event);

      // Should still succeed — we just record null for event price
      expect(result.ok).toBe(true);
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          eventPrice: null,
        }),
      );
    });
  });

  describe('getOutcome', () => {
    it('should return null when no outcome found', async () => {
      const selectMock = () => {
        const chain = {
          from: () => chain,
          where: () => chain,
          limit: () => Promise.resolve([]),
        };
        return chain;
      };

      const db = { ...makeMockDb(), select: selectMock };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = new OutcomeTracker(db as any);

      const result = await tracker.getOutcome('nonexistent');
      expect(result).toBeNull();
    });

    it('should return outcome record when found', async () => {
      const mockOutcome = {
        id: 1,
        eventId: 'evt-001',
        ticker: 'AAPL',
        eventTime: new Date('2024-03-04T10:00:00Z'),
        eventPrice: '179.50',
        price1h: '180.00',
        price1d: null,
        price1w: null,
        price1m: null,
        change1h: '0.2786',
        change1d: null,
        change1w: null,
        change1m: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const selectMock = () => {
        const chain = {
          from: () => chain,
          where: () => chain,
          limit: () => Promise.resolve([mockOutcome]),
        };
        return chain;
      };

      const db = { ...makeMockDb(), select: selectMock };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = new OutcomeTracker(db as any);

      const result = await tracker.getOutcome('evt-001');
      expect(result).toEqual(mockOutcome);
      expect(result?.ticker).toBe('AAPL');
      expect(result?.change1h).toBe('0.2786');
    });
  });

  describe('getOutcomesByTicker', () => {
    it('should return outcomes for a ticker', async () => {
      const mockOutcomes = [
        {
          id: 1,
          eventId: 'evt-001',
          ticker: 'AAPL',
          eventTime: new Date('2024-03-04T10:00:00Z'),
          eventPrice: '179.50',
          price1h: '180.00',
          price1d: '181.20',
          price1w: null,
          price1m: null,
        },
        {
          id: 2,
          eventId: 'evt-003',
          ticker: 'AAPL',
          eventTime: new Date('2024-03-01T10:00:00Z'),
          eventPrice: '177.00',
          price1h: '177.50',
          price1d: '178.00',
          price1w: '180.00',
          price1m: null,
        },
      ];

      const selectMock = () => {
        const chain = {
          from: () => chain,
          where: () => chain,
          orderBy: () => chain,
          limit: () => Promise.resolve(mockOutcomes),
        };
        return chain;
      };

      const db = { ...makeMockDb(), select: selectMock };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = new OutcomeTracker(db as any);

      const results = await tracker.getOutcomesByTicker('AAPL', 10);
      expect(results).toHaveLength(2);
      expect(results[0]?.ticker).toBe('AAPL');
      expect(results[1]?.ticker).toBe('AAPL');
    });

    it('should respect limit parameter', async () => {
      const limitSpy = vi.fn().mockResolvedValue([]);
      const selectMock = () => {
        const chain = {
          from: () => chain,
          where: () => chain,
          orderBy: () => chain,
          limit: limitSpy,
        };
        return chain;
      };

      const db = { ...makeMockDb(), select: selectMock };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = new OutcomeTracker(db as any);

      await tracker.getOutcomesByTicker('AAPL', 5);
      expect(limitSpy).toHaveBeenCalledWith(5);
    });
  });

  describe('priceColumnKey', () => {
    it('should map DB column names to schema keys', () => {
      const db = makeMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = new OutcomeTracker(db as any);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((tracker as any).priceColumnKey('price_1h')).toBe('price1h');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((tracker as any).priceColumnKey('price_1d')).toBe('price1d');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((tracker as any).priceColumnKey('price_1w')).toBe('price1w');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((tracker as any).priceColumnKey('price_1m')).toBe('price1m');
    });
  });

  describe('changeColumnKey', () => {
    it('should map DB change column names to schema keys', () => {
      const db = makeMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = new OutcomeTracker(db as any);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((tracker as any).changeColumnKey('change_1h')).toBe('change1h');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((tracker as any).changeColumnKey('change_1d')).toBe('change1d');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((tracker as any).changeColumnKey('change_1w')).toBe('change1w');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((tracker as any).changeColumnKey('change_1m')).toBe('change1m');
    });
  });
});
