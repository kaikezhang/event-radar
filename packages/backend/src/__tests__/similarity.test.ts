import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import * as hist from '../db/historical-schema.js';
import {
  calculateAggregateStats,
  calculateConfidence,
  findSimilarEvents,
  parseSeverityCsv,
  scoreCandidate,
  type AggregateStatsInput,
  type HistoricalSimilarityCandidate,
  type SimilarityQuery,
} from '../services/similarity.js';
import { cleanTestDb, createTestDb, safeClose } from './helpers/test-db.js';

let sharedDb: Database;
let sharedClient: PGlite;

const TECH_COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const SECOND_TECH_COMPANY_ID = '00000000-0000-0000-0000-000000000002';
const THIRD_TECH_COMPANY_ID = '00000000-0000-0000-0000-000000000003';
const HEALTH_COMPANY_ID = '00000000-0000-0000-0000-000000000004';
const ENERGY_COMPANY_ID = '00000000-0000-0000-0000-000000000005';

beforeAll(async () => {
  ({ db: sharedDb, client: sharedClient } = await createTestDb());
  await createHistoricalTables(sharedDb);
});

afterAll(async () => {
  await safeClose(sharedClient);
});

function makeCandidate(
  overrides: Partial<HistoricalSimilarityCandidate> = {},
): HistoricalSimilarityCandidate {
  return {
    eventId: randomUUID(),
    eventType: 'earnings',
    eventSubtype: 'beat',
    severity: 'high',
    ticker: 'AAPL',
    headline: 'Apple beats and raises guidance',
    eventDate: '2026-01-10T21:00:00.000Z',
    sector: 'Technology',
    marketCapTier: 'mega',
    marketRegime: 'bull',
    vixLevel: 18,
    return30d: 0.12,
    epsSurprisePct: 9.5,
    consecutiveBeats: 4,
    returnT1: 0.03,
    returnT5: 0.07,
    returnT20: 0.14,
    alphaT1: 0.01,
    alphaT5: 0.04,
    alphaT20: 0.12,
    ...overrides,
  };
}

const BASE_QUERY: SimilarityQuery = {
  eventType: 'earnings',
  eventSubtype: 'beat',
  sector: 'Technology',
  severity: 'high',
  vixLevel: 20,
  marketRegime: 'bull',
  return30d: 0.08,
  marketCapTier: 'mega',
  epsSurprisePct: 10,
  consecutiveBeats: 4,
};

async function createHistoricalTables(db: Database): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS companies (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      sector TEXT,
      industry TEXT,
      country TEXT DEFAULT 'US',
      cik TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS historical_events (
      id UUID PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      event_ts TIMESTAMPTZ NOT NULL,
      market_session TEXT,
      event_ts_precision TEXT NOT NULL DEFAULT 'day_only',
      event_ts_source TEXT,
      event_ts_verified BOOLEAN DEFAULT FALSE,
      event_category TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_subtype TEXT,
      severity TEXT NOT NULL DEFAULT 'medium',
      headline TEXT NOT NULL,
      description TEXT,
      company_id UUID REFERENCES companies(id),
      ticker_at_time TEXT,
      tags TEXT[] NOT NULL DEFAULT '{}',
      collection_tier TEXT DEFAULT 'full',
      bootstrap_batch TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS event_sources (
      id UUID PRIMARY KEY,
      event_id UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_name TEXT,
      source_url TEXT,
      source_native_id TEXT,
      published_at TIMESTAMPTZ,
      ingested_at TIMESTAMPTZ DEFAULT NOW(),
      extraction_method TEXT,
      confidence DECIMAL(3, 2)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS metrics_earnings (
      event_id UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
      fiscal_quarter TEXT,
      eps_actual DECIMAL(8, 3),
      eps_estimate DECIMAL(8, 3),
      eps_surprise_pct DECIMAL(10, 2),
      revenue_actual_m DECIMAL(12, 2),
      revenue_estimate_m DECIMAL(12, 2),
      revenue_surprise_pct DECIMAL(10, 2),
      guidance_direction TEXT,
      guidance_detail TEXT,
      consecutive_beats INT,
      yoy_revenue_growth DECIMAL(10, 2),
      yoy_eps_growth DECIMAL(10, 2)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS metrics_other (
      event_id UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
      metrics JSONB NOT NULL DEFAULT '{}'
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS event_market_context (
      event_id UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
      vix_close DECIMAL(6, 2),
      market_regime TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS event_stock_context (
      event_id UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id),
      price_at_event DECIMAL(10, 2) NOT NULL,
      return_30d DECIMAL(6, 3),
      market_cap_b DECIMAL(10, 2),
      market_cap_tier TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS event_returns (
      id UUID PRIMARY KEY,
      event_id UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id),
      ticker_at_time TEXT NOT NULL,
      ref_price DECIMAL(10, 2) NOT NULL,
      ref_price_type TEXT NOT NULL,
      ref_price_date DATE NOT NULL,
      return_t1 DECIMAL(6, 3),
      return_t5 DECIMAL(6, 3),
      return_t20 DECIMAL(6, 3),
      alpha_t1 DECIMAL(6, 3),
      alpha_t5 DECIMAL(6, 3),
      alpha_t20 DECIMAL(6, 3),
      calc_version INT DEFAULT 1
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS event_type_patterns (
      id UUID PRIMARY KEY,
      event_type TEXT NOT NULL,
      event_subtype TEXT,
      sector TEXT,
      market_cap_tier TEXT,
      sample_size INT NOT NULL,
      date_range_start DATE,
      date_range_end DATE,
      avg_alpha_t5 DECIMAL(6, 3),
      avg_alpha_t20 DECIMAL(6, 3),
      avg_alpha_t60 DECIMAL(6, 3),
      median_alpha_t20 DECIMAL(6, 3),
      std_dev_alpha_t20 DECIMAL(6, 3),
      win_rate_t5 DECIMAL(5, 3),
      win_rate_t20 DECIMAL(5, 3),
      best_case_event_id UUID REFERENCES historical_events(id),
      worst_case_event_id UUID REFERENCES historical_events(id),
      typical_pattern TEXT,
      key_differentiators TEXT,
      calc_version INT DEFAULT 1,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS backfill_coverage (
      id UUID PRIMARY KEY,
      company_id UUID REFERENCES companies(id),
      ticker TEXT,
      source_type TEXT NOT NULL,
      date_from DATE NOT NULL,
      date_to DATE NOT NULL,
      scan_completed BOOLEAN DEFAULT FALSE,
      events_found INT DEFAULT 0,
      scanned_at TIMESTAMPTZ DEFAULT NOW(),
      notes TEXT
    )
  `);
}

async function cleanHistoricalTables(db: Database): Promise<void> {
  await db.execute(sql`DELETE FROM event_type_patterns`);
  await db.execute(sql`DELETE FROM backfill_coverage`);
  await db.execute(sql`DELETE FROM event_sources`);
  await db.execute(sql`DELETE FROM metrics_earnings`);
  await db.execute(sql`DELETE FROM metrics_other`);
  await db.execute(sql`DELETE FROM event_market_context`);
  await db.execute(sql`DELETE FROM event_stock_context`);
  await db.execute(sql`DELETE FROM event_returns`);
  await db.execute(sql`DELETE FROM historical_events`);
  await db.execute(sql`DELETE FROM companies`);
}

async function seedHistoricalFixture(db: Database): Promise<{
  strongestEventId: string;
}> {
  await db.insert(hist.companies).values([
    {
      id: TECH_COMPANY_ID,
      name: 'Apple Inc.',
      sector: 'Technology',
      industry: 'Consumer Electronics',
      country: 'US',
    },
    {
      id: SECOND_TECH_COMPANY_ID,
      name: 'Microsoft Corporation',
      sector: 'Technology',
      industry: 'Software',
      country: 'US',
    },
    {
      id: THIRD_TECH_COMPANY_ID,
      name: 'NVIDIA Corporation',
      sector: 'Technology',
      industry: 'Semiconductors',
      country: 'US',
    },
    {
      id: HEALTH_COMPANY_ID,
      name: 'Pfizer Inc.',
      sector: 'Healthcare',
      industry: 'Biotechnology',
      country: 'US',
    },
    {
      id: ENERGY_COMPANY_ID,
      name: 'Exxon Mobil Corporation',
      sector: 'Energy',
      industry: 'Oil & Gas',
      country: 'US',
    },
  ]);

  const strongestEventId = '10000000-0000-0000-0000-000000000001';

  await insertHistoricalEvent(db, {
    eventId: strongestEventId,
    companyId: TECH_COMPANY_ID,
    ticker: 'AAPL',
    eventTs: '2026-01-15T21:00:00.000Z',
    eventSubtype: 'beat',
    severity: 'critical',
    headline: 'Apple beats and raises guidance',
    sector: 'Technology',
    marketCapTier: 'mega',
    marketRegime: 'bull',
    vixLevel: 18,
    return30d: 0.11,
    epsSurprisePct: 10.5,
    consecutiveBeats: 4,
    returnT1: 0.03,
    returnT5: 0.07,
    returnT20: 0.14,
    alphaT1: 0.01,
    alphaT5: 0.05,
    alphaT20: 0.12,
    sourceName: 'SEC EDGAR',
  });

  await insertHistoricalEvent(db, {
    eventId: '10000000-0000-0000-0000-000000000002',
    companyId: SECOND_TECH_COMPANY_ID,
    ticker: 'MSFT',
    eventTs: '2025-11-20T21:00:00.000Z',
    eventSubtype: 'beat',
    severity: 'high',
    headline: 'Microsoft posts solid cloud beat',
    sector: 'Technology',
    marketCapTier: 'mega',
    marketRegime: 'bull',
    vixLevel: 22,
    return30d: 0.09,
    epsSurprisePct: 11.2,
    consecutiveBeats: 5,
    returnT1: 0.02,
    returnT5: 0.06,
    returnT20: 0.11,
    alphaT1: 0.01,
    alphaT5: 0.04,
    alphaT20: 0.09,
    sourceName: 'Press Release',
  });

  await insertHistoricalEvent(db, {
    eventId: '10000000-0000-0000-0000-000000000003',
    companyId: THIRD_TECH_COMPANY_ID,
    ticker: 'NVDA',
    eventTs: '2025-08-28T21:00:00.000Z',
    eventSubtype: 'beat',
    severity: 'high',
    headline: 'NVIDIA clears another earnings bar',
    sector: 'Technology',
    marketCapTier: 'mega',
    marketRegime: 'correction',
    vixLevel: 24,
    return30d: 0.16,
    epsSurprisePct: 13.5,
    consecutiveBeats: 6,
    returnT1: 0.04,
    returnT5: 0.08,
    returnT20: 0.13,
    alphaT1: 0.02,
    alphaT5: 0.06,
    alphaT20: 0.11,
    sourceName: 'SEC EDGAR',
  });

  await insertHistoricalEvent(db, {
    eventId: '10000000-0000-0000-0000-000000000004',
    companyId: HEALTH_COMPANY_ID,
    ticker: 'PFE',
    eventTs: '2024-04-30T21:00:00.000Z',
    eventSubtype: 'miss',
    severity: 'medium',
    headline: 'Pfizer misses and trims outlook',
    sector: 'Healthcare',
    marketCapTier: 'large',
    marketRegime: 'bear',
    vixLevel: 31,
    return30d: -0.08,
    epsSurprisePct: -6.5,
    consecutiveBeats: 0,
    returnT1: -0.02,
    returnT5: -0.06,
    returnT20: -0.11,
    alphaT1: -0.01,
    alphaT5: -0.04,
    alphaT20: -0.18,
    sourceName: 'SEC EDGAR',
  });

  await insertHistoricalEvent(db, {
    eventId: '10000000-0000-0000-0000-000000000005',
    companyId: ENERGY_COMPANY_ID,
    ticker: 'XOM',
    eventTs: '2023-01-27T21:00:00.000Z',
    eventSubtype: 'beat',
    severity: 'high',
    headline: 'Exxon delivers strong commodity-led beat',
    sector: 'Energy',
    marketCapTier: 'large',
    marketRegime: 'bull',
    vixLevel: 19,
    return30d: 0.05,
    epsSurprisePct: 6.2,
    consecutiveBeats: 2,
    returnT1: 0.01,
    returnT5: 0.03,
    returnT20: 0.05,
    alphaT1: 0,
    alphaT5: 0.02,
    alphaT20: 0.03,
    sourceName: 'Earnings Call',
  });

  await insertHistoricalEvent(db, {
    eventId: '10000000-0000-0000-0000-000000000006',
    companyId: HEALTH_COMPANY_ID,
    ticker: 'PFE',
    eventTs: '2025-07-15T14:00:00.000Z',
    eventSubtype: 'approval',
    severity: 'high',
    headline: 'Pfizer receives key FDA approval',
    sector: 'Healthcare',
    marketCapTier: 'large',
    marketRegime: 'bull',
    vixLevel: 17,
    return30d: 0.04,
    returnT1: 0.05,
    returnT5: 0.09,
    returnT20: 0.15,
    alphaT1: 0.03,
    alphaT5: 0.07,
    alphaT20: 0.14,
    eventType: 'fda',
    eventCategory: 'clinical',
    sourceName: 'FDA',
  });

  await db.insert(hist.eventTypePatterns).values([
    {
      id: '20000000-0000-0000-0000-000000000001',
      eventType: 'earnings',
      eventSubtype: 'beat',
      sector: 'Technology',
      marketCapTier: 'mega',
      sampleSize: 32,
      dateRangeStart: '2021-01-01',
      dateRangeEnd: '2025-12-31',
      avgAlphaT5: '0.042',
      avgAlphaT20: '0.097',
      medianAlphaT20: '0.091',
      stdDevAlphaT20: '0.103',
      winRateT5: '0.656',
      winRateT20: '0.688',
      bestCaseEventId: strongestEventId,
      worstCaseEventId: '10000000-0000-0000-0000-000000000004',
      typicalPattern: 'Initial post-earnings drift higher',
      keyDifferentiators: 'Mega-cap AI exposure',
    },
    {
      id: '20000000-0000-0000-0000-000000000002',
      eventType: 'earnings',
      eventSubtype: 'miss',
      sector: 'Healthcare',
      marketCapTier: 'large',
      sampleSize: 14,
      dateRangeStart: '2022-01-01',
      dateRangeEnd: '2025-12-31',
      avgAlphaT5: '-0.031',
      avgAlphaT20: '-0.082',
      medianAlphaT20: '-0.075',
      stdDevAlphaT20: '0.141',
      winRateT5: '0.286',
      winRateT20: '0.214',
      bestCaseEventId: '10000000-0000-0000-0000-000000000006',
      worstCaseEventId: '10000000-0000-0000-0000-000000000004',
      typicalPattern: 'Weak follow-through after guide-down',
      keyDifferentiators: 'Patent cliff exposure',
    },
  ]);

  await db.insert(hist.backfillCoverage).values([
    {
      id: '30000000-0000-0000-0000-000000000001',
      companyId: TECH_COMPANY_ID,
      ticker: 'AAPL',
      sourceType: 'earnings',
      dateFrom: '2021-01-01',
      dateTo: '2025-12-31',
      scanCompleted: true,
      eventsFound: 12,
      notes: 'full refresh',
    },
    {
      id: '30000000-0000-0000-0000-000000000002',
      companyId: SECOND_TECH_COMPANY_ID,
      ticker: 'MSFT',
      sourceType: 'earnings',
      dateFrom: '2021-01-01',
      dateTo: '2025-12-31',
      scanCompleted: false,
      eventsFound: 9,
      notes: 'pending manual review',
    },
  ]);

  return { strongestEventId };
}

async function insertHistoricalEvent(
  db: Database,
  input: {
    eventId: string;
    companyId: string;
    ticker: string;
    eventTs: string;
    eventSubtype: string;
    severity: string;
    headline: string;
    sector: string;
    marketCapTier: string;
    marketRegime: string;
    vixLevel: number;
    return30d: number;
    epsSurprisePct?: number;
    consecutiveBeats?: number;
    returnT1: number;
    returnT5: number;
    returnT20: number;
    alphaT1: number;
    alphaT5: number;
    alphaT20: number;
    sourceName: string;
    eventType?: string;
    eventCategory?: string;
  },
): Promise<void> {
  await db.insert(hist.historicalEvents).values({
    id: input.eventId,
    eventTs: new Date(input.eventTs),
    eventCategory: input.eventCategory ?? 'corporate',
    eventType: input.eventType ?? 'earnings',
    eventSubtype: input.eventSubtype,
    severity: input.severity,
    headline: input.headline,
    description: `${input.headline} description`,
    companyId: input.companyId,
    tickerAtTime: input.ticker,
    tags: [input.eventSubtype, input.ticker],
  });

  await db.insert(hist.eventSources).values({
    id: randomUUID(),
    eventId: input.eventId,
    sourceType: 'filing',
    sourceName: input.sourceName,
    sourceUrl: `https://example.com/${input.eventId}`,
    sourceNativeId: `source-${input.eventId}`,
    publishedAt: new Date(input.eventTs),
    confidence: '0.98',
  });

  await db.execute(sql`
    INSERT INTO event_market_context (event_id, vix_close, market_regime)
    VALUES (${input.eventId}, ${String(input.vixLevel)}, ${input.marketRegime})
  `);

  await db.execute(sql`
    INSERT INTO event_stock_context (
      event_id,
      company_id,
      price_at_event,
      return_30d,
      market_cap_b,
      market_cap_tier
    )
    VALUES (
      ${input.eventId},
      ${input.companyId},
      '100.00',
      ${String(input.return30d)},
      ${input.marketCapTier === 'mega' ? '250.00' : '50.00'},
      ${input.marketCapTier}
    )
  `);

  await db.execute(sql`
    INSERT INTO event_returns (
      id,
      event_id,
      company_id,
      ticker_at_time,
      ref_price,
      ref_price_type,
      ref_price_date,
      return_t1,
      return_t5,
      return_t20,
      alpha_t1,
      alpha_t5,
      alpha_t20
    )
    VALUES (
      ${randomUUID()},
      ${input.eventId},
      ${input.companyId},
      ${input.ticker},
      '100.00',
      'close',
      ${input.eventTs.slice(0, 10)},
      ${String(input.returnT1)},
      ${String(input.returnT5)},
      ${String(input.returnT20)},
      ${String(input.alphaT1)},
      ${String(input.alphaT5)},
      ${String(input.alphaT20)}
    )
  `);

  if ((input.eventType ?? 'earnings') === 'earnings') {
    await db.insert(hist.metricsEarnings).values({
      eventId: input.eventId,
      fiscalQuarter: 'Q4',
      epsActual: '1.22',
      epsEstimate: '1.11',
      epsSurprisePct: input.epsSurprisePct != null ? String(input.epsSurprisePct) : null,
      consecutiveBeats: input.consecutiveBeats ?? null,
    });
  } else {
    await db.insert(hist.metricsOther).values({
      eventId: input.eventId,
      metrics: {
        approvalType: input.eventSubtype,
      },
    });
  }
}

describe('similarity service', () => {
  beforeEach(async () => {
    await cleanTestDb(sharedDb);
    await cleanHistoricalTables(sharedDb);
  });

  it('awards points across the defined similarity factors', () => {
    const result = scoreCandidate(BASE_QUERY, makeCandidate());

    expect(result.score).toBe(17);
    expect(result.scoreBreakdown).toMatchObject({
      subtypeMatch: 4,
      sameSector: 3,
      sameMarketCapTier: 2,
      sameMarketRegime: 2,
      similarVix: 1,
      similarMomentum: 1,
      recencyBonus: 1,
      metricsBonus: 3,
    });
  });

  it('caps earnings metric bonus at three points', () => {
    const result = scoreCandidate(BASE_QUERY, makeCandidate({
      epsSurprisePct: 11.8,
      consecutiveBeats: 4,
    }));

    expect(result.scoreBreakdown.metricsBonus).toBe(3);
  });

  it('allows callers to pin recency scoring with a reference date', () => {
    const recentCandidate = makeCandidate({
      eventDate: '2024-03-15T00:00:00.000Z',
    });

    expect(scoreCandidate(BASE_QUERY, recentCandidate, new Date('2026-03-12T00:00:00.000Z'))).toMatchObject({
      scoreBreakdown: expect.objectContaining({
        recencyBonus: 1,
      }),
    });

    expect(scoreCandidate(BASE_QUERY, recentCandidate, new Date('2028-03-16T00:00:00.000Z'))).toMatchObject({
      scoreBreakdown: expect.not.objectContaining({
        recencyBonus: 1,
      }),
    });
  });

  it('computes confidence bands from sample size and alpha dispersion', () => {
    expect(calculateConfidence([0.11, 0.08])).toBe('insufficient');
    expect(calculateConfidence([0.11, 0.08, 0.12, 0.09])).toBe('low');
    expect(calculateConfidence([0.3, -0.2, 0.25, -0.18, 0.29])).toBe('medium');
    expect(calculateConfidence([0.12, 0.1, 0.08, 0.11, 0.09])).toBe('high');
  });

  it('computes aggregate stats from matched events', () => {
    const stats = calculateAggregateStats([
      {
        ticker: 'AAPL',
        headline: 'Apple beats',
        returnT1: 0.03,
        returnT5: 0.07,
        returnT20: 0.14,
        alphaT1: 0.01,
        alphaT5: 0.05,
        alphaT20: 0.12,
      },
      {
        ticker: 'MSFT',
        headline: 'Microsoft beats',
        returnT1: 0.01,
        returnT5: 0.04,
        returnT20: 0.09,
        alphaT1: 0,
        alphaT5: 0.03,
        alphaT20: 0.08,
      },
      {
        ticker: 'PFE',
        headline: 'Pfizer misses',
        returnT1: -0.02,
        returnT5: -0.05,
        returnT20: -0.1,
        alphaT1: -0.01,
        alphaT5: -0.04,
        alphaT20: -0.16,
      },
    ] satisfies AggregateStatsInput[]);

    expect(stats).toMatchObject({
      count: 3,
      avgReturnT1: 0.0067,
      avgReturnT5: 0.02,
      avgReturnT20: 0.0433,
      avgAlphaT1: 0,
      avgAlphaT5: 0.0133,
      avgAlphaT20: 0.0133,
      winRateT20: 66.67,
      medianAlphaT20: 0.08,
      bestCase: {
        ticker: 'AAPL',
        alphaT20: 0.12,
      },
      worstCase: {
        ticker: 'PFE',
        alphaT20: -0.16,
      },
    });
  });

  it('keeps best and worst case identical when only one similar event exists', () => {
    const stats = calculateAggregateStats([
      {
        ticker: 'AAPL',
        headline: 'Apple beats',
        returnT1: 0.03,
        returnT5: 0.07,
        returnT20: 0.14,
        alphaT1: 0.01,
        alphaT5: 0.05,
        alphaT20: 0.12,
      },
    ] satisfies AggregateStatsInput[]);

    expect(stats.bestCase).toEqual({
      ticker: 'AAPL',
      alphaT20: 0.12,
      headline: 'Apple beats',
    });
    expect(stats.worstCase).toEqual(stats.bestCase);
  });

  it('fetches, scores, filters, and sorts similar historical events', async () => {
    await seedHistoricalFixture(sharedDb);

    const result = await findSimilarEvents(sharedDb, {
      ...BASE_QUERY,
      limit: 3,
      minScore: 8,
    });

    expect(result.totalCandidates).toBe(4);
    expect(result.events).toHaveLength(3);
    expect(result.events.map((event) => event.ticker)).toEqual(['AAPL', 'MSFT', 'NVDA']);
    expect(result.events[0]).toMatchObject({
      ticker: 'AAPL',
      score: 17,
    });
    expect(result.confidence).toBe('low');
    expect(result.stats.count).toBe(4);
  });

  it('logs and drops unrecognized severity filters from CSV input', () => {
    const logger = {
      debug: vi.fn(),
    };

    expect(parseSeverityCsv('high, bogus, medium, ???', logger)).toEqual(['high', 'medium']);
    expect(logger.debug).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenNthCalledWith(
      1,
      { severity: 'bogus' },
      'Ignoring unrecognized historical severity filter',
    );
    expect(logger.debug).toHaveBeenNthCalledWith(
      2,
      { severity: '???' },
      'Ignoring unrecognized historical severity filter',
    );
  });
});
