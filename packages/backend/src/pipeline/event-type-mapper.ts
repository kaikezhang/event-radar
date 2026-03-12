import { eq, sql } from 'drizzle-orm';
import type { LlmClassificationResult, RawEvent } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { companies, tickerHistory } from '../db/historical-schema.js';
import { extractTickers } from '../scanners/ticker-extractor.js';
import type { MarketSnapshot } from '../services/market-context-cache.js';

export interface MappedEventContext {
  eventType: string;
  eventSubtype?: string;
  ticker?: string;
  sector?: string;
  severity?: string;
  vixLevel?: number;
  marketRegime?: string;
  epsSurprisePct?: number;
  consecutiveBeats?: number;
}

const KNOWN_HISTORICAL_TYPES = new Set([
  'earnings',
  'leadership_change',
  'other_material',
  'regulation_fd',
  'earnings_results',
  'contract_material',
  'shareholder_vote',
  'bankruptcy',
  'acquisition_disposition',
  'delisting',
  'auditor_change',
  'restructuring',
  'off_balance_sheet',
]);

const SEC_ITEM_MAP: Record<string, { eventType: string; priority: number }> = {
  '2.02': { eventType: 'earnings_results', priority: 0 },
  '2.05': { eventType: 'restructuring', priority: 1 },
  '5.02': { eventType: 'leadership_change', priority: 2 },
  '1.01': { eventType: 'contract_material', priority: 3 },
  '1.03': { eventType: 'bankruptcy', priority: 3 },
  '2.01': { eventType: 'acquisition_disposition', priority: 3 },
  '2.03': { eventType: 'off_balance_sheet', priority: 3 },
  '3.01': { eventType: 'delisting', priority: 3 },
  '4.01': { eventType: 'auditor_change', priority: 3 },
  '5.07': { eventType: 'shareholder_vote', priority: 3 },
  '7.01': { eventType: 'regulation_fd', priority: 3 },
  '8.01': { eventType: 'other_material', priority: 3 },
};

const SKIPPED_SOURCES = new Set([
  'stocktwits',
  'truth-social',
  'analyst',
  'econ-calendar',
  'fda',
  'congress',
  'doj-antitrust',
  'whitehouse',
]);

const sectorCache = new Map<string, string>();

function normalizeSecItem(item: unknown): string | null {
  if (typeof item !== 'string') {
    return null;
  }

  return item.match(/\d+\.\d{2}/)?.[0] ?? null;
}

function resolveSecEventType(event: RawEvent): { eventType?: string; eventSubtype?: string } {
  const rawItems = event.metadata?.['item_types'];
  if (!Array.isArray(rawItems)) {
    return {};
  }

  const normalized = rawItems
    .map(normalizeSecItem)
    .filter((item): item is string => item != null && SEC_ITEM_MAP[item] != null)
    .sort((left, right) => {
      const leftConfig = SEC_ITEM_MAP[left]!;
      const rightConfig = SEC_ITEM_MAP[right]!;
      if (leftConfig.priority !== rightConfig.priority) {
        return leftConfig.priority - rightConfig.priority;
      }

      return Number.parseFloat(left) - Number.parseFloat(right);
    });

  const primaryItem = normalized[0];
  if (!primaryItem) {
    return {};
  }

  return {
    eventType: SEC_ITEM_MAP[primaryItem]?.eventType,
    eventSubtype: primaryItem,
  };
}

function normalizeHistoricalType(eventType?: string): string | undefined {
  if (!eventType) {
    return undefined;
  }

  return KNOWN_HISTORICAL_TYPES.has(eventType) ? eventType : undefined;
}

function extractTicker(event: RawEvent): string | undefined {
  const metadataTicker = event.metadata?.['ticker'];
  if (typeof metadataTicker === 'string' && metadataTicker.trim().length > 0) {
    return metadataTicker.trim().toUpperCase();
  }

  const extracted = extractTickers(`${event.title} ${event.body}`);
  return extracted[0]?.toUpperCase();
}

function extractNumericMetadata(
  event: RawEvent,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = event.metadata?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function maybeAssign<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

export async function warmSectorCacheWithTickers(db: Database): Promise<void> {
  try {
    const rows = await db
      .select({
        ticker: tickerHistory.ticker,
        sector: companies.sector,
      })
      .from(tickerHistory)
      .innerJoin(companies, eq(companies.id, tickerHistory.companyId));

    for (const row of rows) {
      if (!row.ticker || !row.sector) {
        continue;
      }

      sectorCache.set(row.ticker.toUpperCase(), row.sector);
    }
  } catch {
    // Historical ticker metadata is optional in lightweight test databases.
  }
}

export const prewarmSectorCache = warmSectorCacheWithTickers;

export function lookupSector(ticker: string): string | undefined {
  return sectorCache.get(ticker.toUpperCase());
}

export async function resolveSectorForTicker(
  db: Database,
  ticker: string,
): Promise<string | undefined> {
  const normalizedTicker = ticker.toUpperCase();
  const cached = sectorCache.get(normalizedTicker);
  if (cached) {
    return cached;
  }

  try {
    const rows = await db
      .select({
        ticker: tickerHistory.ticker,
        sector: companies.sector,
      })
      .from(tickerHistory)
      .innerJoin(companies, eq(companies.id, tickerHistory.companyId))
      .where(eq(sql`upper(${tickerHistory.ticker})`, normalizedTicker));

    const sector = rows[0]?.sector ?? undefined;
    if (sector) {
      sectorCache.set(normalizedTicker, sector);
    }

    return sector;
  } catch {
    return undefined;
  }
}

export function resetSectorCacheForTests(): void {
  sectorCache.clear();
}

export function mapEventToSimilarityQuery(
  event: RawEvent,
  llmResult?: LlmClassificationResult,
  marketSnapshot?: MarketSnapshot | null,
): MappedEventContext | null {
  const source = event.source.toLowerCase();
  if (SKIPPED_SOURCES.has(source)) {
    return null;
  }

  let eventType: string | undefined;
  let eventSubtype: string | undefined;

  if (source === 'sec-edgar') {
    const secMapping = resolveSecEventType(event);
    eventType = secMapping.eventType;
    eventSubtype = secMapping.eventSubtype;
  } else if (source === 'earnings') {
    eventType = 'earnings';
    const subtype = event.metadata?.['result'] ?? event.metadata?.['surprise_type'];
    if (typeof subtype === 'string' && subtype.trim().length > 0) {
      eventSubtype = subtype.trim().toLowerCase();
    }
  } else if (source === 'breaking-news') {
    if (/earnings|revenue|eps/i.test(event.title)) {
      eventType = 'earnings';
    } else {
      eventType = normalizeHistoricalType(llmResult?.eventType);
    }
  } else if (source === 'reddit') {
    eventType = normalizeHistoricalType(llmResult?.eventType);
  } else {
    eventType = normalizeHistoricalType(llmResult?.eventType);
  }

  if (!eventType) {
    return null;
  }

  const mapped: MappedEventContext = { eventType };
  maybeAssign(mapped, 'eventSubtype', eventSubtype);

  const ticker = extractTicker(event);
  maybeAssign(mapped, 'ticker', ticker);
  maybeAssign(mapped, 'sector', ticker ? lookupSector(ticker) : undefined);
  maybeAssign(mapped, 'severity', llmResult?.severity?.toLowerCase());
  maybeAssign(mapped, 'vixLevel', marketSnapshot?.vixLevel);
  maybeAssign(mapped, 'marketRegime', marketSnapshot?.marketRegime);
  maybeAssign(
    mapped,
    'epsSurprisePct',
    extractNumericMetadata(event, ['epsSurprisePct', 'eps_surprise_pct', 'surprise_pct']),
  );
  maybeAssign(
    mapped,
    'consecutiveBeats',
    extractNumericMetadata(event, ['consecutiveBeats', 'consecutive_beats']),
  );

  return mapped;
}
