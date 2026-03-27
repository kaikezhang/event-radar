import { eq } from 'drizzle-orm';
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

const KNOWN_EVENT_TYPES = new Set([
  'earnings_beat',
  'earnings_miss',
  'earnings_guidance',
  'sec_form_8k',
  'sec_form_4',
  'sec_form_10q',
  'sec_form_10k',
  'fda_approval',
  'fda_rejection',
  'fda_orphan_drug',
  'ftc_antitrust',
  'executive_order',
  'federal_register',
  'economic_data',
  'fed_announcement',
  'insider_large_trade',
  'social_volume_spike',
  'news_breaking',
]);

const LEGACY_EVENT_TYPE_ALIASES: Record<string, string> = {
  filing: 'sec_form_8k',
  earnings: 'earnings_beat',
  insider: 'insider_large_trade',
  macro: 'fed_announcement',
  political: 'executive_order',
  social: 'social_volume_spike',
  earnings_results: 'earnings_beat',
  leadership_change: 'sec_form_8k',
  other_material: 'sec_form_8k',
  regulation_fd: 'sec_form_8k',
  contract_material: 'sec_form_8k',
  shareholder_vote: 'sec_form_8k',
  bankruptcy: 'sec_form_8k',
  acquisition_disposition: 'sec_form_8k',
  delisting: 'sec_form_8k',
  auditor_change: 'sec_form_8k',
  restructuring: 'sec_form_8k',
  off_balance_sheet: 'sec_form_8k',
  fda: 'fda_approval',
};

const SEC_ITEM_MAP: Record<string, { eventType: string; priority: number }> = {
  '2.02': { eventType: 'sec_form_8k', priority: 0 },
  '2.05': { eventType: 'sec_form_8k', priority: 1 },
  '5.02': { eventType: 'sec_form_8k', priority: 2 },
  '1.01': { eventType: 'sec_form_8k', priority: 3 },
  '1.03': { eventType: 'sec_form_8k', priority: 3 },
  '2.01': { eventType: 'sec_form_8k', priority: 3 },
  '2.03': { eventType: 'sec_form_8k', priority: 3 },
  '3.01': { eventType: 'sec_form_8k', priority: 3 },
  '4.01': { eventType: 'sec_form_8k', priority: 3 },
  '5.07': { eventType: 'sec_form_8k', priority: 3 },
  '7.01': { eventType: 'sec_form_8k', priority: 3 },
  '8.01': { eventType: 'sec_form_8k', priority: 3 },
};

const SKIPPED_SOURCES = new Set([
  'truth-social',
  'econ-calendar',
]);

const sectorCache = new Map<string, string>();

function normalizeSecItem(item: unknown): string | null {
  if (typeof item !== 'string') {
    return null;
  }

  return item.match(/\d+\.\d{2}/)?.[0] ?? null;
}

function resolveSecEventType(event: RawEvent): { eventType?: string; eventSubtype?: string } {
  const rawType = typeof event.type === 'string' ? event.type.trim().toLowerCase() : '';
  const formType = typeof event.metadata?.['form_type'] === 'string'
    ? event.metadata['form_type'].trim().toLowerCase()
    : '';

  if (rawType === 'form-4' || rawType === 'sec_form_4' || formType === '4') {
    return { eventType: 'sec_form_4' };
  }

  const rawItems = event.metadata?.['item_types'];
  if (!Array.isArray(rawItems)) {
    return { eventType: rawType === 'sec_form_8k' ? 'sec_form_8k' : undefined };
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

  const normalized = eventType.trim().toLowerCase();
  const aliased = LEGACY_EVENT_TYPE_ALIASES[normalized] ?? normalized;

  return KNOWN_EVENT_TYPES.has(aliased) ? aliased : undefined;
}

function resolveFdaEventType(
  event: RawEvent,
  llmResult?: LlmClassificationResult,
): string | undefined {
  const llmType = normalizeHistoricalType(llmResult?.eventType);
  if (llmType) {
    return llmType;
  }

  const title = `${event.title} ${event.body}`.toLowerCase();
  if (title.includes('orphan drug')) {
    return 'fda_orphan_drug';
  }

  const actionType = typeof event.metadata?.['action_type'] === 'string'
    ? event.metadata['action_type'].trim().toLowerCase()
    : '';

  if (actionType === 'approval') {
    return 'fda_approval';
  }

  if (actionType === 'crl' || actionType === 'safety') {
    return 'fda_rejection';
  }

  return 'news_breaking';
}

function resolveSourceFallbackType(
  event: RawEvent,
  llmResult?: LlmClassificationResult,
): string | undefined {
  const llmType = normalizeHistoricalType(llmResult?.eventType);
  if (llmType) {
    return llmType;
  }

  switch (event.source.toLowerCase()) {
    case 'fda':
      return resolveFdaEventType(event, llmResult);
    case 'federal-register':
      return 'federal_register';
    case 'fed':
      return 'fed_announcement';
    case 'econ-calendar':
      return 'economic_data';
    case 'truth-social':
      return 'social_volume_spike';
    case 'trading-halt':
      return 'news_breaking';
    case 'breaking-news':
    case 'newswire':
    case 'businesswire':
    case 'pr-newswire':
    case 'globenewswire':
      return 'news_breaking';
    default:
      return undefined;
  }
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

function lookupSector(ticker: string): string | undefined {
  return sectorCache.get(ticker.toUpperCase());
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
  } else {
    eventType = resolveSourceFallbackType(event, llmResult);
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
