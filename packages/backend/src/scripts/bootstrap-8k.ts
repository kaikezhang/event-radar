/**
 * Bootstrap script: populates the historical event database with SEC 8-K events
 * for the Phase 1 Tier 1 + Tier 2 universe.
 *
 * Usage: npx tsx src/scripts/bootstrap-8k.ts
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as hist from '../db/historical-schema.js';
import {
  TICKERS_CONFIG,
  PRICE_HISTORY_START,
  buildEventMarketContextValues,
  buildEventReturnsValues,
  buildEventStockContextValues,
  fetchHistory,
  findBarIndexOnOrAfter,
  loadBenchmarkHistory,
  resolveScriptAssetPath,
  runHistoricalMigrations,
  sleep,
} from './bootstrap-earnings.js';

const BOOTSTRAP_BATCH = 'phase2_8k_v1';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://radar:radar@localhost:5432/event_radar';
const SEC_DELAY_MS = 1_000;

const EDGAR_BRIDGE = resolveScriptAssetPath('helpers', 'edgar-bridge.py');
const TIER1_TICKERS = new Set([
  'NVDA',
  'TSLA',
  'AAPL',
  'MSFT',
  'AMZN',
  'GOOG',
  'META',
  'AMD',
  'PLTR',
  'SMCI',
  'ARM',
  'AVGO',
  'TSM',
  'MSTR',
  'COIN',
]);
const ROUTINE_SKIP_ITEMS = new Set(['3.02', '3.03', '5.03', '9.01']);
const SEVERITY_ORDER = ['low', 'medium', 'high', 'critical'] as const;
type Severity = (typeof SEVERITY_ORDER)[number];
type EventCategory = 'earnings' | 'restructuring' | 'leadership' | 'corporate';

interface EdgarFiling {
  accession: string;
  filed: string;
  form: string;
  items: string[];
  primary_doc_url: string | null;
  description: string | null;
}

interface EdgarResponse<T> {
  error: string | null;
  data: T[];
}

interface ItemClassification {
  item: string;
  eventCategory: EventCategory;
  eventType: string;
  severity: Severity;
  headlineLabel: string;
}

interface Classified8kEvent extends ItemClassification {
  items: string[];
  severity: Severity;
}

const ITEM_CLASSIFICATIONS: Record<string, ItemClassification> = {
  '1.01': {
    item: '1.01',
    eventCategory: 'corporate',
    eventType: 'contract_material',
    severity: 'medium',
    headlineLabel: 'Material Contract',
  },
  '1.02': {
    item: '1.02',
    eventCategory: 'corporate',
    eventType: 'bankruptcy',
    severity: 'critical',
    headlineLabel: 'Bankruptcy',
  },
  '1.03': {
    item: '1.03',
    eventCategory: 'corporate',
    eventType: 'mine_safety',
    severity: 'low',
    headlineLabel: 'Mine Safety',
  },
  '2.01': {
    item: '2.01',
    eventCategory: 'corporate',
    eventType: 'acquisition_disposition',
    severity: 'high',
    headlineLabel: 'Acquisition Or Disposition',
  },
  '2.02': {
    item: '2.02',
    eventCategory: 'earnings',
    eventType: 'earnings_results',
    severity: 'high',
    headlineLabel: 'Earnings Results',
  },
  '2.03': {
    item: '2.03',
    eventCategory: 'corporate',
    eventType: 'off_balance_sheet',
    severity: 'medium',
    headlineLabel: 'Off Balance Sheet',
  },
  '2.04': {
    item: '2.04',
    eventCategory: 'corporate',
    eventType: 'triggering_event',
    severity: 'medium',
    headlineLabel: 'Triggering Event',
  },
  '2.05': {
    item: '2.05',
    eventCategory: 'restructuring',
    eventType: 'restructuring',
    severity: 'high',
    headlineLabel: 'Reorganization Or Restructuring',
  },
  '2.06': {
    item: '2.06',
    eventCategory: 'corporate',
    eventType: 'impairment',
    severity: 'high',
    headlineLabel: 'Impairment',
  },
  '3.01': {
    item: '3.01',
    eventCategory: 'corporate',
    eventType: 'delisting',
    severity: 'critical',
    headlineLabel: 'Delisting',
  },
  '4.01': {
    item: '4.01',
    eventCategory: 'corporate',
    eventType: 'auditor_change',
    severity: 'medium',
    headlineLabel: 'Auditor Change',
  },
  '4.02': {
    item: '4.02',
    eventCategory: 'corporate',
    eventType: 'financial_restatement',
    severity: 'critical',
    headlineLabel: 'Financial Restatement',
  },
  '5.01': {
    item: '5.01',
    eventCategory: 'corporate',
    eventType: 'strategy_update',
    severity: 'medium',
    headlineLabel: 'Strategy Update',
  },
  '5.02': {
    item: '5.02',
    eventCategory: 'leadership',
    eventType: 'leadership_change',
    severity: 'high',
    headlineLabel: 'Leadership Change',
  },
  '5.07': {
    item: '5.07',
    eventCategory: 'corporate',
    eventType: 'shareholder_vote',
    severity: 'medium',
    headlineLabel: 'Shareholder Vote',
  },
  '7.01': {
    item: '7.01',
    eventCategory: 'corporate',
    eventType: 'regulation_fd',
    severity: 'medium',
    headlineLabel: 'Regulation FD',
  },
  '8.01': {
    item: '8.01',
    eventCategory: 'corporate',
    eventType: 'other_material',
    severity: 'medium',
    headlineLabel: 'Other Material Event',
  },
  '9.01': {
    item: '9.01',
    eventCategory: 'corporate',
    eventType: 'financial_exhibit',
    severity: 'low',
    headlineLabel: 'Financial Exhibit',
  },
};

const CATEGORY_PRIORITY: Record<EventCategory, number> = {
  earnings: 0,
  restructuring: 1,
  leadership: 2,
  corporate: 3,
};

function callEdgarBridge<T>(cmd: Record<string, unknown>): T {
  const result = execFileSync('python3', [EDGAR_BRIDGE, JSON.stringify(cmd)], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: 120_000,
  });
  return JSON.parse(result) as T;
}

function normalize8kItems(items: readonly string[]): string[] {
  const normalized = items
    .map((item) => item.match(/\d+\.\d{2}/)?.[0] ?? item)
    .filter((item) => ITEM_CLASSIFICATIONS[item] != null);
  return [...new Set(normalized)];
}

function upgradeSeverity(baseSeverity: Severity, itemCount: number): Severity {
  if (itemCount <= 1) return baseSeverity;
  const currentIndex = SEVERITY_ORDER.indexOf(baseSeverity);
  return SEVERITY_ORDER[Math.min(SEVERITY_ORDER.length - 1, currentIndex + 1)]!;
}

function compareClassificationPriority(left: ItemClassification, right: ItemClassification): number {
  const categoryDelta =
    CATEGORY_PRIORITY[left.eventCategory] - CATEGORY_PRIORITY[right.eventCategory];
  if (categoryDelta !== 0) return categoryDelta;
  return Number.parseFloat(left.item) - Number.parseFloat(right.item);
}

export function shouldSkip8kFiling(items: string[]): boolean {
  const actionableItems = normalize8kItems(items).filter((item) => !ROUTINE_SKIP_ITEMS.has(item));
  if (actionableItems.length === 0) return true;
  return actionableItems.length === 1 && actionableItems[0] === '2.02';
}

export function classify8kItems(items: string[]): Classified8kEvent | null {
  const actionableItems = normalize8kItems(items).filter((item) => !ROUTINE_SKIP_ITEMS.has(item));
  if (actionableItems.length === 0) return null;
  if (actionableItems.length === 1 && actionableItems[0] === '2.02') return null;

  const rankedItems = actionableItems
    .map((item) => ITEM_CLASSIFICATIONS[item]!)
    .sort(compareClassificationPriority);
  const primary = rankedItems[0];

  return {
    ...primary,
    items: actionableItems,
    severity: upgradeSeverity(primary.severity, actionableItems.length),
  };
}

export function format8kHeadline(ticker: string, item: string, eventType: string): string {
  const headlineLabel = ITEM_CLASSIFICATIONS[item]?.headlineLabel ?? eventType
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
  return `${ticker} 8-K: ${headlineLabel} (Item ${item})`;
}

export function resolveTickerTier(ticker: string): 'tier1' | 'tier2' {
  return TIER1_TICKERS.has(ticker) ? 'tier1' : 'tier2';
}

export function resolve8kDateRange(
  ticker: string,
  now = new Date(),
): { startDate: string; endDate: string } {
  return {
    startDate: resolveTickerTier(ticker) === 'tier1' ? '2022-01-01' : '2024-01-01',
    endDate: now.toISOString().slice(0, 10),
  };
}

export function buildExisting8kDedupWhereClause(
  companyId: string,
  eventType: string,
  filedDate: string,
) {
  return and(
    eq(hist.historicalEvents.companyId, companyId),
    eq(hist.historicalEvents.eventType, eventType),
    sql`DATE(${hist.historicalEvents.eventTs}) = ${filedDate}`,
  );
}

function fetch8kFilings(cik: string, startDate: string, endDate: string): EdgarFiling[] {
  const response = callEdgarBridge<EdgarResponse<EdgarFiling>>({
    command: 'filings_8k',
    cik,
    start_date: startDate,
    end_date: endDate,
  });

  if (response.error) {
    throw new Error(response.error);
  }

  return response.data.filter((filing) => filing.form === '8-K' && filing.filed != null);
}

async function accessionAlreadyProcessed(
  db: ReturnType<typeof drizzle>,
  accession: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: hist.eventSources.id })
    .from(hist.eventSources)
    .where(
      and(
        eq(hist.eventSources.sourceType, 'sec_edgar'),
        eq(hist.eventSources.sourceNativeId, accession),
      ),
    )
    .limit(1);

  return existing.length > 0;
}

async function upsert8kCoverage(
  db: ReturnType<typeof drizzle>,
  companyId: string,
  ticker: string,
  startDate: string,
  endDate: string,
  eventsFound: number,
): Promise<void> {
  const existing = await db
    .select({ id: hist.backfillCoverage.id })
    .from(hist.backfillCoverage)
    .where(
      and(
        eq(hist.backfillCoverage.companyId, companyId),
        eq(hist.backfillCoverage.sourceType, 'sec_8k'),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(hist.backfillCoverage).values({
      companyId,
      ticker,
      sourceType: 'sec_8k',
      dateFrom: startDate,
      dateTo: endDate,
      scanCompleted: true,
      eventsFound,
      notes: `Bootstrap batch: ${BOOTSTRAP_BATCH}`,
    });
    return;
  }

  await db
    .update(hist.backfillCoverage)
    .set({
      ticker,
      dateFrom: startDate,
      dateTo: endDate,
      scanCompleted: true,
      eventsFound,
      notes: `Bootstrap batch: ${BOOTSTRAP_BATCH}`,
    })
    .where(eq(hist.backfillCoverage.id, existing[0].id));
}

async function main() {
  console.log('=== Historical DB Bootstrap: SEC 8-K Phase 2 ===\n');

  const pool = new pg.Pool({ connectionString: DB_URL });
  const db = drizzle(pool);

  console.log('Running migration...');
  await runHistoricalMigrations(pool);
  console.log('Migration complete.\n');

  console.log('Fetching market benchmark data...');
  const benchmarkData = await loadBenchmarkHistory(TICKERS_CONFIG);
  console.log('Benchmark data loaded.\n');

  const companyRows = await db
    .select({
      id: hist.companies.id,
      cik: hist.companies.cik,
    })
    .from(hist.companies)
    .where(inArray(hist.companies.cik, TICKERS_CONFIG.map((cfg) => cfg.cik)));

  const companyByCik = new Map(
    companyRows
      .filter((row): row is { id: string; cik: string } => row.cik != null)
      .map((row) => [row.cik, row]),
  );

  const summary = { events: 0, skipped: 0, failed: 0 };

  for (const [index, cfg] of TICKERS_CONFIG.entries()) {
    const progressLabel = `[${index + 1}/${TICKERS_CONFIG.length}] Processing ${cfg.ticker} 8-K filings...`;
    const company = companyByCik.get(cfg.cik);

    if (company == null) {
      console.warn(`${progressLabel} skipped, company missing from DB`);
      summary.skipped++;
      if (index < TICKERS_CONFIG.length - 1) {
        await sleep(SEC_DELAY_MS);
      }
      continue;
    }

    try {
      const { startDate, endDate } = resolve8kDateRange(cfg.ticker);
      const filings = fetch8kFilings(cfg.cik, startDate, endDate).sort((left, right) =>
        left.filed.localeCompare(right.filed),
      );
      const stockTicker = cfg.historyTicker ?? cfg.ticker;
      const stockBars = fetchHistory(stockTicker, PRICE_HISTORY_START);

      if (stockBars.length === 0) {
        console.warn(`${progressLabel} no price history for ${stockTicker}`);
        summary.skipped++;
        continue;
      }

      let insertedCount = 0;

      for (const filing of filings) {
        if (shouldSkip8kFiling(filing.items)) {
          continue;
        }

        if (await accessionAlreadyProcessed(db, filing.accession)) {
          continue;
        }

        const classified = classify8kItems(filing.items);
        if (classified == null) {
          continue;
        }

        const existingEvent = await db
          .select({ id: hist.historicalEvents.id })
          .from(hist.historicalEvents)
          .where(buildExisting8kDedupWhereClause(company.id, classified.eventType, filing.filed))
          .limit(1);
        if (existingEvent.length > 0) {
          continue;
        }

        const eventIdx = findBarIndexOnOrAfter(stockBars, filing.filed);
        if (eventIdx < 0) {
          console.warn(`  [SKIP] No price bar on or after ${filing.filed} for ${cfg.ticker}`);
          summary.skipped++;
          continue;
        }
        const pricingDate = stockBars[eventIdx]!.date;

        const [event] = await db
          .insert(hist.historicalEvents)
          .values({
            eventTs: new Date(`${filing.filed}T00:00:00.000Z`),
            eventTsPrecision: 'day_only',
            eventTsSource: 'sec_filing',
            eventCategory: classified.eventCategory,
            eventType: classified.eventType,
            eventSubtype: classified.item,
            severity: classified.severity,
            headline: format8kHeadline(cfg.ticker, classified.item, classified.eventType),
            description: filing.description,
            companyId: company.id,
            tickerAtTime: cfg.ticker,
            collectionTier: resolveTickerTier(cfg.ticker),
            bootstrapBatch: BOOTSTRAP_BATCH,
          })
          .returning({ id: hist.historicalEvents.id });

        await db.insert(hist.eventSources).values({
          eventId: event.id,
          sourceType: 'sec_edgar',
          sourceName: 'SEC EDGAR',
          sourceUrl: filing.primary_doc_url,
          sourceNativeId: filing.accession,
          publishedAt: new Date(`${filing.filed}T00:00:00.000Z`),
          extractionMethod: 'api_structured',
          confidence: '1.00',
        });

        const stockContextValues = buildEventStockContextValues({
          eventId: event.id,
          companyId: company.id,
          stockBars,
          eventIdx,
        });
        if (stockContextValues != null) {
          await db.insert(hist.eventStockContext).values(stockContextValues);
        }

        const marketContextValues = buildEventMarketContextValues({
          eventId: event.id,
          pricingDate,
          benchmarkData,
          sectorEtf: cfg.sectorEtf,
        });
        if (marketContextValues != null) {
          await db.insert(hist.eventMarketContext).values(marketContextValues);
        }

        const returnsValues = buildEventReturnsValues({
          eventId: event.id,
          companyId: company.id,
          tickerAtTime: cfg.ticker,
          pricingDate,
          stockBars,
          eventIdx,
          benchmarkData,
          sectorEtf: cfg.sectorEtf,
          t0Eligible: false,
        });
        if (returnsValues != null) {
          await db.insert(hist.eventReturns).values(returnsValues);
        }

        insertedCount++;
        summary.events++;
      }

      await upsert8kCoverage(db, company.id, cfg.ticker, startDate, endDate, insertedCount);
      console.log(`${progressLabel} found ${filings.length} filings, ${insertedCount} after dedup`);
    } catch (error) {
      summary.failed++;
      console.error(`  [ERROR] Failed to process ${cfg.ticker}:`, error);
    } finally {
      if (index < TICKERS_CONFIG.length - 1) {
        await sleep(SEC_DELAY_MS);
      }
    }
  }

  console.log('\n=== 8-K Bootstrap Summary ===');
  console.log(`Events created: ${summary.events}`);
  console.log(`Events skipped: ${summary.skipped}`);
  console.log(`Tickers failed: ${summary.failed}`);

  await pool.end();
  console.log('\nDone!');
}

const isDirectRun =
  process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
