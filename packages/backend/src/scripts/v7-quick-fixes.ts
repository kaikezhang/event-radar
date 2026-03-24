import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import type { Database } from '../db/connection.js';
import { eventOutcomes, events } from '../db/schema.js';
import { PriceService } from '../services/price-service.js';
import { normalizeOutcomeTicker } from '../utils/outcome-ticker.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://radar:radar@localhost:5432/event_radar';
const FORD_TICKER = 'FORD';
const NORMALIZED_FORD_TICKER = 'F';

type PriceLookupService = Pick<PriceService, 'getPriceAt'>;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function normalizeStoredTicker(value: unknown): string | null {
  return normalizeOutcomeTicker(value);
}

function normalizeTickersArray(
  value: unknown,
): { tickers: unknown[] | undefined; changed: boolean; firstTicker: string | null } {
  if (!Array.isArray(value)) {
    return { tickers: undefined, changed: false, firstTicker: null };
  }

  const nextTickers: unknown[] = [];
  let changed = false;
  let firstTicker: string | null = null;

  for (const entry of value) {
    if (typeof entry === 'string') {
      const normalized = normalizeStoredTicker(entry);
      if (!normalized) {
        changed = true;
        continue;
      }

      if (firstTicker == null) {
        firstTicker = normalized;
      }

      if (normalized !== entry) {
        changed = true;
      }

      if (!nextTickers.includes(normalized)) {
        nextTickers.push(normalized);
      } else {
        changed = true;
      }
      continue;
    }

    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const record = entry as Record<string, unknown>;
      const normalizedSymbol = normalizeStoredTicker(record['symbol']);
      if (!normalizedSymbol) {
        nextTickers.push(entry);
        continue;
      }

      if (firstTicker == null) {
        firstTicker = normalizedSymbol;
      }

      if (normalizedSymbol !== record['symbol']) {
        changed = true;
        nextTickers.push({ ...record, symbol: normalizedSymbol });
      } else {
        nextTickers.push(entry);
      }
      continue;
    }

    nextTickers.push(entry);
  }

  return { tickers: nextTickers, changed, firstTicker };
}

function normalizeEventMetadata(
  value: unknown,
): {
  metadata: Record<string, unknown>;
  changed: boolean;
  resolvedTicker: string | null;
} {
  const metadata = { ...asRecord(value) };
  let changed = false;

  const normalizedMetadataTicker = normalizeStoredTicker(metadata['ticker']);
  if (typeof metadata['ticker'] === 'string') {
    if (normalizedMetadataTicker == null) {
      delete metadata['ticker'];
      changed = true;
    } else if (metadata['ticker'] !== normalizedMetadataTicker) {
      metadata['ticker'] = normalizedMetadataTicker;
      changed = true;
    }
  }

  const normalizedTickers = normalizeTickersArray(metadata['tickers']);
  if (normalizedTickers.tickers !== undefined && normalizedTickers.changed) {
    metadata['tickers'] = normalizedTickers.tickers;
    changed = true;
  }

  const resolvedTicker = normalizedMetadataTicker ?? normalizedTickers.firstTicker;
  return { metadata, changed, resolvedTicker };
}

function resolveStructuredTicker(eventTicker: unknown, metadata: unknown): string | null {
  const normalizedEventTicker = normalizeStoredTicker(eventTicker);
  if (normalizedEventTicker) {
    return normalizedEventTicker;
  }

  const normalizedMetadata = normalizeEventMetadata(metadata);
  return normalizedMetadata.resolvedTicker;
}

export async function normalizeFordTickers(
  db: Database,
): Promise<{ eventsUpdated: number; outcomesUpdated: number }> {
  const eventRows = await db
    .select({
      id: events.id,
      ticker: events.ticker,
      metadata: events.metadata,
    })
    .from(events)
    .where(sql`
      upper(coalesce(${events.ticker}, '')) = ${FORD_TICKER}
      OR upper(coalesce(${events.metadata}->>'ticker', '')) = ${FORD_TICKER}
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(coalesce(${events.metadata}->'tickers', '[]'::jsonb)) AS metadata_ticker(value)
        WHERE upper(
          CASE
            WHEN jsonb_typeof(metadata_ticker.value) = 'string'
              THEN trim(both '"' FROM metadata_ticker.value::text)
            ELSE coalesce(metadata_ticker.value->>'symbol', '')
          END
        ) = ${FORD_TICKER}
      )
    `);

  let eventsUpdated = 0;
  for (const row of eventRows) {
    const normalizedMetadata = normalizeEventMetadata(row.metadata);
    const nextTicker = normalizeStoredTicker(row.ticker) ?? normalizedMetadata.resolvedTicker;
    const shouldUpdateTicker = nextTicker != null && nextTicker !== row.ticker;

    if (!shouldUpdateTicker && !normalizedMetadata.changed) {
      continue;
    }

    await db
      .update(events)
      .set({
        ...(shouldUpdateTicker ? { ticker: nextTicker } : {}),
        ...(normalizedMetadata.changed ? { metadata: normalizedMetadata.metadata } : {}),
      })
      .where(eq(events.id, row.id));
    eventsUpdated += 1;
  }

  const updatedOutcomeRows = await db
    .update(eventOutcomes)
    .set({
      ticker: NORMALIZED_FORD_TICKER,
      updatedAt: new Date(),
    })
    .where(sql`upper(${eventOutcomes.ticker}) = ${FORD_TICKER}`)
    .returning({ id: eventOutcomes.id });

  return {
    eventsUpdated,
    outcomesUpdated: updatedOutcomeRows.length,
  };
}

export async function createMissingEventOutcomes(db: Database): Promise<number> {
  const rows = await db
    .select({
      eventId: events.id,
      ticker: events.ticker,
      metadata: events.metadata,
      receivedAt: events.receivedAt,
      outcomeId: eventOutcomes.id,
    })
    .from(events)
    .leftJoin(eventOutcomes, eq(eventOutcomes.eventId, events.id))
    .where(isNull(eventOutcomes.id));

  let created = 0;

  for (const row of rows) {
    const ticker = resolveStructuredTicker(row.ticker, row.metadata);
    if (!ticker) {
      continue;
    }

    await db
      .insert(eventOutcomes)
      .values({
        eventId: row.eventId,
        ticker,
        eventTime: row.receivedAt,
      })
      .onConflictDoNothing();
    created += 1;
  }

  return created;
}

export async function backfillMissingEventPrices(
  db: Database,
  priceService: PriceLookupService,
): Promise<number> {
  const rows = await db
    .select({
      id: eventOutcomes.id,
      ticker: eventOutcomes.ticker,
      eventTime: eventOutcomes.eventTime,
      eventPrice: eventOutcomes.eventPrice,
      eventTicker: events.ticker,
      metadata: events.metadata,
    })
    .from(eventOutcomes)
    .innerJoin(events, eq(events.id, eventOutcomes.eventId))
    .where(isNull(eventOutcomes.eventPrice));

  let updated = 0;

  for (const row of rows) {
    const ticker = normalizeStoredTicker(row.ticker) ?? resolveStructuredTicker(row.eventTicker, row.metadata);
    if (!ticker) {
      continue;
    }

    const nextValues: {
      ticker?: string;
      eventPrice?: string;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (ticker !== row.ticker) {
      nextValues.ticker = ticker;
    }

    try {
      const priceResult = await priceService.getPriceAt(ticker, row.eventTime);
      if (priceResult.ok && priceResult.value != null) {
        nextValues.eventPrice = String(priceResult.value);
        updated += 1;
      } else if (nextValues.ticker == null) {
        continue;
      }
    } catch {
      if (nextValues.ticker == null) {
        continue;
      }
    }

    await db
      .update(eventOutcomes)
      .set(nextValues)
      .where(eq(eventOutcomes.id, row.id));
  }

  return updated;
}

export async function runV7QuickFixes(
  db: Database,
  priceService: PriceLookupService = new PriceService(),
): Promise<{
  eventsUpdated: number;
  outcomesUpdated: number;
  createdOutcomes: number;
  backfilledEventPrices: number;
}> {
  const normalized = await normalizeFordTickers(db);
  const createdOutcomes = await createMissingEventOutcomes(db);
  const backfilledEventPrices = await backfillMissingEventPrices(db, priceService);

  return {
    ...normalized,
    createdOutcomes,
    backfilledEventPrices,
  };
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema }) as unknown as Database;

  try {
    const result = await runV7QuickFixes(db);
    console.log('[v7-quick-fixes] Completed with summary:');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryHref && import.meta.url === entryHref) {
  main().catch((error) => {
    console.error('[v7-quick-fixes] Fatal error:', error);
    process.exit(1);
  });
}
