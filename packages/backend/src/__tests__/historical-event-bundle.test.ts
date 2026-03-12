import { describe, expect, it, vi } from 'vitest';
import * as hist from '../db/historical-schema.js';
import { insertHistoricalEventBundle } from '../scripts/helpers/historical-event-bundle.js';

describe('insertHistoricalEventBundle', () => {
  it('should write the event bundle inside a single database transaction', async () => {
    const insertCalls: Array<{ table: unknown; values: unknown }> = [];
    const returning = vi.fn().mockResolvedValue([{ id: 'event-1' }]);
    const txInsert = vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        insertCalls.push({ table, values });
        if (table === hist.historicalEvents) {
          return { returning };
        }

        return Promise.resolve();
      }),
    }));
    const tx = { insert: txInsert };
    const rootInsert = vi.fn();
    const transaction = vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );

    const db = {
      insert: rootInsert,
      transaction,
    } as unknown as Parameters<typeof insertHistoricalEventBundle>[0];

    const inserted = await insertHistoricalEventBundle(db, {
      eventValues: {
        eventTs: new Date('2026-03-12T00:00:00.000Z'),
        eventTsPrecision: 'day_only',
        eventCategory: 'corporate',
        eventType: 'other_material',
        severity: 'medium',
        headline: 'NVDA 8-K: Other Material Event (Item 8.01)',
      },
      sourceValues: () => ({
        sourceType: 'sec_edgar',
      }),
      metricsEarningsValues: () => ({
        fiscalQuarter: 'FY2026-Q1',
        epsSurprisePct: '99999999',
      }),
      stockContextValues: () => ({
        companyId: 'company-1',
        priceAtEvent: '100.00',
      }),
      marketContextValues: () => ({
        sectorEtfTicker: 'XLK',
      }),
      returnsValues: () => ({
        companyId: 'company-1',
        tickerAtTime: 'NVDA',
        refPrice: '95.00',
        refPriceType: 'prev_close',
        refPriceDate: '2026-03-11',
        sectorBenchmark: 'XLK',
        t0Eligible: false,
      }),
    });

    expect(inserted).toEqual({ id: 'event-1' });
    expect(transaction).toHaveBeenCalledOnce();
    expect(rootInsert).not.toHaveBeenCalled();
    expect(txInsert).toHaveBeenCalledTimes(6);

    expect(insertCalls.find((call) => call.table === hist.eventSources)?.values).toMatchObject({
      eventId: 'event-1',
      sourceType: 'sec_edgar',
    });
    expect(insertCalls.find((call) => call.table === hist.metricsEarnings)?.values).toMatchObject({
      eventId: 'event-1',
      fiscalQuarter: 'FY2026-Q1',
    });
    expect(
      insertCalls.find((call) => call.table === hist.eventStockContext)?.values,
    ).toMatchObject({
      eventId: 'event-1',
      companyId: 'company-1',
    });
    expect(
      insertCalls.find((call) => call.table === hist.eventMarketContext)?.values,
    ).toMatchObject({
      eventId: 'event-1',
      sectorEtfTicker: 'XLK',
    });
    expect(insertCalls.find((call) => call.table === hist.eventReturns)?.values).toMatchObject({
      eventId: 'event-1',
      tickerAtTime: 'NVDA',
      t0Eligible: false,
    });
  });

  it('should skip optional inserts when bundle sections are absent', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 'event-2' }]);
    const txInsert = vi.fn((table: unknown) => ({
      values: vi.fn(() => {
        if (table === hist.historicalEvents) {
          return { returning };
        }

        return Promise.resolve();
      }),
    }));
    const tx = { insert: txInsert };
    const db = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as Parameters<typeof insertHistoricalEventBundle>[0];

    await insertHistoricalEventBundle(db, {
      eventValues: {
        eventTs: new Date('2026-03-12T00:00:00.000Z'),
        eventTsPrecision: 'day_only',
        eventCategory: 'earnings',
        eventType: 'earnings',
        severity: 'high',
        headline: 'NVDA earnings beat',
      },
      sourceValues: () => ({
        sourceType: 'earnings_calendar',
      }),
    });

    expect(txInsert).toHaveBeenCalledTimes(2);
    expect(txInsert).toHaveBeenNthCalledWith(1, hist.historicalEvents);
    expect(txInsert).toHaveBeenNthCalledWith(2, hist.eventSources);
  });
});
