import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import type { RawEvent } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { storeEvent } from '../db/event-store.js';
import {
  backfillMissingEventPrices,
  createMissingEventOutcomes,
  normalizeFordTickers,
  normalizeStoredTicker,
} from '../scripts/v7-quick-fixes.js';
import { cleanTestDb, createTestDb, safeClose } from './helpers/test-db.js';

let sharedDb: Database;
let sharedClient: PGlite;

beforeAll(async () => {
  ({ db: sharedDb, client: sharedClient } = await createTestDb());
});

afterAll(async () => {
  await safeClose(sharedClient);
});

beforeEach(async () => {
  await cleanTestDb(sharedDb);
});

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: randomUUID(),
    source: 'breaking-news',
    type: 'breaking',
    title: 'Ford launch event',
    body: 'Ford launch details',
    timestamp: new Date('2026-03-20T15:00:00.000Z'),
    metadata: {
      ticker: 'FORD',
      tickers: ['FORD'],
    },
    ...overrides,
  };
}

describe('v7 quick fixes helpers', () => {
  describe('normalizeStoredTicker', () => {
    it('maps FORD to F', () => {
      expect(normalizeStoredTicker('FORD')).toBe('F');
    });

    it('uppercases and trims other tickers', () => {
      expect(normalizeStoredTicker(' nvda ')).toBe('NVDA');
    });

    it('returns null for blank values', () => {
      expect(normalizeStoredTicker('   ')).toBeNull();
    });
  });

  describe('normalizeFordTickers', () => {
    it('updates event ticker, metadata ticker, metadata tickers, and outcome ticker', async () => {
      const eventId = await storeEvent(sharedDb, {
        event: makeEvent(),
        severity: 'HIGH',
      });

      await sharedDb.execute(sql`
        INSERT INTO event_outcomes (event_id, ticker, event_time)
        VALUES (${eventId}, 'FORD', '2026-03-20T15:00:00.000Z')
      `);

      const result = await normalizeFordTickers(sharedDb);

      expect(result.eventsUpdated).toBe(1);
      expect(result.outcomesUpdated).toBe(1);

      const eventRow = await sharedClient.query(
        'SELECT ticker, metadata FROM events WHERE id = $1',
        [eventId],
      );
      const outcomeRow = await sharedClient.query(
        'SELECT ticker FROM event_outcomes WHERE event_id = $1',
        [eventId],
      );

      expect((eventRow.rows[0] as { ticker: string }).ticker).toBe('F');
      expect((eventRow.rows[0] as { metadata: { ticker: string; tickers: string[] } }).metadata).toMatchObject({
        ticker: 'F',
        tickers: ['F'],
      });
      expect((outcomeRow.rows[0] as { ticker: string }).ticker).toBe('F');
    });

    it('leaves non-FORD tickers untouched', async () => {
      const eventId = await storeEvent(sharedDb, {
        event: makeEvent({
          metadata: {
            ticker: 'GM',
            tickers: ['GM'],
          },
        }),
        severity: 'HIGH',
      });

      const result = await normalizeFordTickers(sharedDb);

      expect(result.eventsUpdated).toBe(0);

      const eventRow = await sharedClient.query(
        'SELECT ticker, metadata FROM events WHERE id = $1',
        [eventId],
      );
      expect((eventRow.rows[0] as { ticker: string }).ticker).toBe('GM');
      expect((eventRow.rows[0] as { metadata: { ticker: string; tickers: string[] } }).metadata).toMatchObject({
        ticker: 'GM',
        tickers: ['GM'],
      });
    });
  });

  describe('createMissingEventOutcomes', () => {
    it('creates an outcome row from the top-level event ticker when missing', async () => {
      const eventId = await storeEvent(sharedDb, {
        event: makeEvent({
          metadata: {
            ticker: 'NVDA',
          },
        }),
        severity: 'HIGH',
      });

      const created = await createMissingEventOutcomes(sharedDb);

      expect(created).toBe(1);

      const outcomeRow = await sharedClient.query(
        'SELECT ticker FROM event_outcomes WHERE event_id = $1',
        [eventId],
      );
      expect((outcomeRow.rows[0] as { ticker: string }).ticker).toBe('NVDA');
    });

    it('creates an outcome row from metadata.tickers when the top-level ticker is null', async () => {
      const eventId = await storeEvent(sharedDb, {
        event: makeEvent({
          metadata: {
            tickers: ['AMD'],
          },
        }),
        severity: 'HIGH',
      });

      await sharedDb.execute(sql`
        UPDATE events
        SET ticker = NULL,
            metadata = jsonb_set(metadata - 'ticker', '{tickers}', '["AMD"]'::jsonb)
        WHERE id = ${eventId}
      `);

      const created = await createMissingEventOutcomes(sharedDb);

      expect(created).toBe(1);

      const outcomeRow = await sharedClient.query(
        'SELECT ticker FROM event_outcomes WHERE event_id = $1',
        [eventId],
      );
      expect((outcomeRow.rows[0] as { ticker: string }).ticker).toBe('AMD');
    });

    it('normalizes FORD to F when creating missing outcome rows', async () => {
      const eventId = await storeEvent(sharedDb, {
        event: makeEvent(),
        severity: 'HIGH',
      });

      const created = await createMissingEventOutcomes(sharedDb);

      expect(created).toBe(1);

      const outcomeRow = await sharedClient.query(
        'SELECT ticker FROM event_outcomes WHERE event_id = $1',
        [eventId],
      );
      expect((outcomeRow.rows[0] as { ticker: string }).ticker).toBe('F');
    });

    it('skips outcome creation for long metadata tickers that would overflow event_outcomes.ticker', async () => {
      const eventId = await storeEvent(sharedDb, {
        event: makeEvent({
          metadata: {
            tickers: ['HEAVYPULP.X'],
          },
        }),
        severity: 'HIGH',
      });

      await sharedDb.execute(sql`
        UPDATE events
        SET ticker = NULL,
            metadata = jsonb_set(coalesce(metadata, '{}'::jsonb) - 'ticker', '{tickers}', '["HEAVYPULP.X"]'::jsonb)
        WHERE id = ${eventId}
      `);

      const created = await createMissingEventOutcomes(sharedDb);
      expect(created).toBe(0);

      const outcomeRow = await sharedClient.query(
        'SELECT ticker FROM event_outcomes WHERE event_id = $1',
        [eventId],
      );
      expect(outcomeRow.rows).toHaveLength(0);
    });

    it('skips outcome creation for digits-only metadata tickers', async () => {
      const eventId = await storeEvent(sharedDb, {
        event: makeEvent({
          metadata: {
            tickers: ['123456'],
          },
        }),
        severity: 'HIGH',
      });

      await sharedDb.execute(sql`
        UPDATE events
        SET ticker = NULL,
            metadata = jsonb_set(coalesce(metadata, '{}'::jsonb) - 'ticker', '{tickers}', '["123456"]'::jsonb)
        WHERE id = ${eventId}
      `);

      const created = await createMissingEventOutcomes(sharedDb);
      expect(created).toBe(0);

      const outcomeRow = await sharedClient.query(
        'SELECT ticker FROM event_outcomes WHERE event_id = $1',
        [eventId],
      );
      expect(outcomeRow.rows).toHaveLength(0);
    });
  });

  describe('backfillMissingEventPrices', () => {
    it('backfills a missing event price using the normalized outcome ticker', async () => {
      const eventId = await storeEvent(sharedDb, {
        event: makeEvent(),
        severity: 'HIGH',
      });

      await sharedDb.execute(sql`
        INSERT INTO event_outcomes (event_id, ticker, event_time, event_price)
        VALUES (${eventId}, 'FORD', '2026-03-20T15:00:00.000Z', NULL)
      `);

      const priceService = {
        getPriceAt: vi.fn().mockResolvedValue({ ok: true, value: 11.42 }),
      };

      const updated = await backfillMissingEventPrices(sharedDb, priceService);

      expect(updated).toBe(1);
      expect(priceService.getPriceAt).toHaveBeenCalledWith('F', expect.any(Date));

      const row = await sharedClient.query(
        'SELECT ticker, event_price FROM event_outcomes WHERE event_id = $1',
        [eventId],
      );
      expect((row.rows[0] as { ticker: string }).ticker).toBe('F');
      expect(Number((row.rows[0] as { event_price: string }).event_price)).toBeCloseTo(11.42, 2);
    });

    it('skips rows that already have event_price', async () => {
      const eventId = await storeEvent(sharedDb, {
        event: makeEvent({
          metadata: {
            ticker: 'AAPL',
          },
        }),
        severity: 'HIGH',
      });

      await sharedDb.execute(sql`
        INSERT INTO event_outcomes (event_id, ticker, event_time, event_price)
        VALUES (${eventId}, 'AAPL', '2026-03-20T15:00:00.000Z', '199.50')
      `);

      const priceService = {
        getPriceAt: vi.fn(),
      };

      const updated = await backfillMissingEventPrices(sharedDb, priceService);

      expect(updated).toBe(0);
      expect(priceService.getPriceAt).not.toHaveBeenCalled();
    });

    it('skips rows when price lookup fails', async () => {
      const eventId = await storeEvent(sharedDb, {
        event: makeEvent({
          metadata: {
            ticker: 'TSLA',
          },
        }),
        severity: 'HIGH',
      });

      await sharedDb.execute(sql`
        INSERT INTO event_outcomes (event_id, ticker, event_time, event_price)
        VALUES (${eventId}, 'TSLA', '2026-03-20T15:00:00.000Z', NULL)
      `);

      const priceService = {
        getPriceAt: vi.fn().mockResolvedValue({ ok: false, error: new Error('no data') }),
      };

      const updated = await backfillMissingEventPrices(sharedDb, priceService);

      expect(updated).toBe(0);
    });

    it('continues backfilling after an individual price lookup throws', async () => {
      const badEventId = await storeEvent(sharedDb, {
        event: makeEvent({
          title: 'Bad ticker row',
          metadata: {
            ticker: 'TSLA',
          },
        }),
        severity: 'HIGH',
      });

      const goodEventId = await storeEvent(sharedDb, {
        event: makeEvent({
          title: 'Good ticker row',
          metadata: {
            ticker: 'NVDA',
          },
        }),
        severity: 'HIGH',
      });

      await sharedDb.execute(sql`
        INSERT INTO event_outcomes (event_id, ticker, event_time, event_price)
        VALUES
          (${badEventId}, 'TSLA', '2026-03-20T15:00:00.000Z', NULL),
          (${goodEventId}, 'NVDA', '2026-03-20T15:00:00.000Z', NULL)
      `);

      const priceService = {
        getPriceAt: vi.fn(async (ticker: string) => {
          if (ticker === 'TSLA') {
            throw new Error('transient yahoo failure');
          }

          return { ok: true, value: 905.12 };
        }),
      };

      const updated = await backfillMissingEventPrices(sharedDb, priceService);

      expect(updated).toBe(1);
      expect(priceService.getPriceAt).toHaveBeenCalledTimes(2);

      const rows = await sharedClient.query(
        'SELECT ticker, event_price FROM event_outcomes WHERE event_id IN ($1, $2) ORDER BY ticker ASC',
        [goodEventId, badEventId],
      );
      expect(rows.rows).toMatchObject([
        { ticker: 'NVDA', event_price: '905.12' },
        { ticker: 'TSLA', event_price: null },
      ]);
    });
  });
});
