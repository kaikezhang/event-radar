import { drizzle } from 'drizzle-orm/node-postgres';
import * as hist from '../../db/historical-schema.js';

type HistoricalDb = ReturnType<typeof drizzle>;
type EventScopedValues<T extends { eventId: string }> = Omit<T, 'eventId'> | T;

export interface HistoricalEventBundleInput {
  eventValues: typeof hist.historicalEvents.$inferInsert;
  sourceValues: (eventId: string) => EventScopedValues<typeof hist.eventSources.$inferInsert>;
  metricsEarningsValues?: (
    eventId: string,
  ) => EventScopedValues<typeof hist.metricsEarnings.$inferInsert> | null;
  stockContextValues?: (
    eventId: string,
  ) => EventScopedValues<typeof hist.eventStockContext.$inferInsert> | null;
  marketContextValues?: (
    eventId: string,
  ) => EventScopedValues<typeof hist.eventMarketContext.$inferInsert> | null;
  returnsValues?: (eventId: string) => EventScopedValues<typeof hist.eventReturns.$inferInsert> | null;
}

export async function insertHistoricalEventBundle(
  db: Pick<HistoricalDb, 'transaction'>,
  input: HistoricalEventBundleInput,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [event] = await tx
      .insert(hist.historicalEvents)
      .values(input.eventValues)
      .returning({ id: hist.historicalEvents.id });

    await tx.insert(hist.eventSources).values({
      ...input.sourceValues(event.id),
      eventId: event.id,
    });

    const metricsEarningsValues = input.metricsEarningsValues?.(event.id);
    if (metricsEarningsValues != null) {
      await tx.insert(hist.metricsEarnings).values({
        ...metricsEarningsValues,
        eventId: event.id,
      });
    }

    const stockContextValues = input.stockContextValues?.(event.id);
    if (stockContextValues != null) {
      await tx.insert(hist.eventStockContext).values({
        ...stockContextValues,
        eventId: event.id,
      });
    }

    const marketContextValues = input.marketContextValues?.(event.id);
    if (marketContextValues != null) {
      await tx.insert(hist.eventMarketContext).values({
        ...marketContextValues,
        eventId: event.id,
      });
    }

    const returnsValues = input.returnsValues?.(event.id);
    if (returnsValues != null) {
      await tx.insert(hist.eventReturns).values({
        ...returnsValues,
        eventId: event.id,
      });
    }

    return event;
  });
}
