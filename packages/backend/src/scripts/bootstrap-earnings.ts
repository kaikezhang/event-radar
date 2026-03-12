/**
 * Bootstrap script: populates historical event database with earnings data
 * for 5 tickers (NVDA, TSLA, META, AAPL, AMD).
 *
 * Usage: npx tsx src/scripts/bootstrap-earnings.ts
 *
 * Idempotent: safe to re-run. Uses bootstrap_batch + ticker_at_time to detect existing events.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import * as hist from '../db/historical-schema.js';
import {
  computeRSI,
  computeSMA,
  compute52WeekRange,
  computeAvgVolume,
  computeReturn,
  findBarIndex,
  getCloseAtOffset,
  computeExtremes,
  determineRegime,
  classifyOutcome,
  classifyMarketCap,
  type PriceBar,
} from './helpers/technical-indicators.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BOOTSTRAP_BATCH = 'phase0_earnings_v1';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://radar:radar@localhost:5432/event_radar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BRIDGE = path.join(__dirname, 'helpers', 'yfinance-bridge.py');

const TICKERS_CONFIG = [
  { ticker: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', industry: 'Semiconductors', cik: '1045810', sectorEtf: 'SOXX', exchange: 'NASDAQ' },
  { ticker: 'TSLA', name: 'Tesla, Inc.', sector: 'Consumer Discretionary', industry: 'Auto Manufacturers', cik: '1318605', sectorEtf: 'XLY', exchange: 'NASDAQ' },
  { ticker: 'META', name: 'Meta Platforms, Inc.', sector: 'Technology', industry: 'Internet Content & Information', cik: '1326801', sectorEtf: 'XLC', exchange: 'NASDAQ',
    previousTickers: [{ ticker: 'FB', from: '2012-05-18', to: '2022-06-08', reason: 'rebrand' }],
  },
  { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology', industry: 'Consumer Electronics', cik: '320193', sectorEtf: 'XLK', exchange: 'NASDAQ' },
  { ticker: 'AMD', name: 'Advanced Micro Devices, Inc.', sector: 'Technology', industry: 'Semiconductors', cik: '2488', sectorEtf: 'SOXX', exchange: 'NASDAQ' },
] as const;

// Return horizons in trading days
const RETURN_HORIZONS = [0, 1, 3, 5, 10, 20, 60] as const;

// ---------------------------------------------------------------------------
// Python bridge
// ---------------------------------------------------------------------------

function callPython<T>(cmd: Record<string, unknown>): T {
  const result = execSync(`python3 "${PYTHON_BRIDGE}" '${JSON.stringify(cmd)}'`, {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: 120_000,
  });
  return JSON.parse(result) as T;
}

interface EarningsDate {
  date: string;
  eps_estimate: number | null;
  eps_actual: number | null;
  surprise_pct: number | null;
}

interface YfResponse<T> {
  error: string | null;
  data: T[];
}

function fetchEarningsDates(ticker: string): EarningsDate[] {
  const res = callPython<YfResponse<EarningsDate>>({
    action: 'earnings_dates',
    ticker,
    limit: 40,
  });
  if (res.error) {
    console.warn(`  [WARN] earnings_dates for ${ticker}: ${res.error}`);
    return [];
  }
  return res.data;
}

function fetchHistory(ticker: string, period = '3y'): PriceBar[] {
  const res = callPython<YfResponse<PriceBar>>({
    action: 'history',
    ticker,
    period,
  });
  if (res.error) {
    console.warn(`  [WARN] history for ${ticker}: ${res.error}`);
    return [];
  }
  return res.data;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function determineSeverity(surprisePct: number | null): 'critical' | 'high' | 'medium' | 'low' {
  if (surprisePct == null) return 'medium';
  const abs = Math.abs(surprisePct);
  if (abs > 10) return 'critical';
  if (abs > 5) return 'high';
  if (abs > 2) return 'medium';
  return 'low';
}

function determineSubtype(surprisePct: number | null): 'beat' | 'miss' | 'in_line' {
  if (surprisePct == null) return 'in_line';
  if (surprisePct > 0.5) return 'beat';
  if (surprisePct < -0.5) return 'miss';
  return 'in_line';
}

/** Find the previous trading day index (the bar before eventIdx). */
function findPrevTradingDay(bars: PriceBar[], eventIdx: number): number {
  return eventIdx > 0 ? eventIdx - 1 : -1;
}

/** Convert earnings date to YYYY-MM-DD for bar matching. */
function earningsDateToBarDate(dateStr: string): string {
  // yfinance returns ISO timestamps; extract just the date part
  return dateStr.slice(0, 10);
}

/**
 * Compute returns at various horizons for both the stock and a benchmark.
 */
function computeReturns(
  bars: PriceBar[],
  refPrice: number,
  eventIdx: number,
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const h of RETURN_HORIZONS) {
    const close = getCloseAtOffset(bars, eventIdx, h);
    result[`t${h}`] = computeReturn(refPrice, close ?? 0);
    if (close == null) result[`t${h}`] = null;
  }
  return result;
}

/** Get VIX percentile: what % of the past year's VIX closes were below current. */
function computeVixPercentile(vixBars: PriceBar[], asOfIdx: number): number | null {
  const lookback = 252;
  const start = Math.max(0, asOfIdx - lookback);
  const slice = vixBars.slice(start, asOfIdx + 1);
  if (slice.length < 20) return null;

  const current = slice[slice.length - 1].close;
  if (current == null) return null;

  let below = 0;
  for (const bar of slice) {
    if (bar.close != null && bar.close < current) below++;
  }
  return +((below / slice.length) * 100).toFixed(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Historical DB Bootstrap: Earnings Phase 0 ===\n');

  // Connect to DB
  const pool = new pg.Pool({ connectionString: DB_URL });
  const db = drizzle(pool);

  // Run migration
  console.log('Running migration...');
  const migrationSql = (await import('node:fs')).readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', 'historical-tables.sql'),
    'utf-8',
  );
  await pool.query(migrationSql);
  console.log('Migration complete.\n');

  // Fetch market data upfront (SPY, VIX, sector ETFs)
  console.log('Fetching market benchmark data...');
  const benchmarkTickers = ['SPY', 'QQQ', 'IWM', '^VIX', '^TNX', 'SOXX', 'XLC', 'XLK', 'XLY'];
  const benchmarkData: Record<string, PriceBar[]> = {};
  for (const t of benchmarkTickers) {
    console.log(`  Fetching ${t}...`);
    benchmarkData[t] = fetchHistory(t, '3y');
  }
  console.log('Benchmark data loaded.\n');

  const summary = { companies: 0, events: 0, skipped: 0 };

  for (const cfg of TICKERS_CONFIG) {
    console.log(`\n--- Processing ${cfg.ticker} (${cfg.name}) ---`);

    // 1. Upsert company
    const existing = await db
      .select()
      .from(hist.companies)
      .where(eq(hist.companies.cik, cfg.cik))
      .limit(1);

    let companyId: string;
    if (existing.length > 0) {
      companyId = existing[0].id;
      console.log(`  Company exists: ${companyId}`);
    } else {
      const [inserted] = await db
        .insert(hist.companies)
        .values({
          name: cfg.name,
          sector: cfg.sector,
          industry: cfg.industry,
          cik: cfg.cik,
        })
        .returning({ id: hist.companies.id });
      companyId = inserted.id;
      summary.companies++;
      console.log(`  Created company: ${companyId}`);
    }

    // 2. Upsert ticker history
    const existingTickers = await db
      .select()
      .from(hist.tickerHistory)
      .where(eq(hist.tickerHistory.companyId, companyId));

    if (existingTickers.length === 0) {
      // Insert previous tickers if any (META was FB)
      if ('previousTickers' in cfg && cfg.previousTickers) {
        for (const prev of cfg.previousTickers) {
          await db.insert(hist.tickerHistory).values({
            companyId,
            ticker: prev.ticker,
            exchange: cfg.exchange,
            effectiveFrom: prev.from,
            effectiveTo: prev.to,
            changeReason: prev.reason,
          });
        }
      }

      // Insert current ticker
      const fromDate = 'previousTickers' in cfg && cfg.previousTickers
        ? cfg.previousTickers[cfg.previousTickers.length - 1].to
        : '1980-01-01';
      // Day after the previous ticker ended
      const effectiveFrom = 'previousTickers' in cfg && cfg.previousTickers
        ? incrementDate(fromDate)
        : '1980-01-01';

      await db.insert(hist.tickerHistory).values({
        companyId,
        ticker: cfg.ticker,
        exchange: cfg.exchange,
        effectiveFrom,
        effectiveTo: null,
      });
      console.log(`  Ticker history created`);
    }

    // 3. Fetch earnings data
    console.log(`  Fetching earnings dates...`);
    const earningsDates = fetchEarningsDates(cfg.ticker);
    console.log(`  Found ${earningsDates.length} earnings dates`);

    // 4. Fetch stock price history
    console.log(`  Fetching price history...`);
    const stockBars = fetchHistory(cfg.ticker, '3y');
    console.log(`  Got ${stockBars.length} price bars`);

    if (stockBars.length === 0) {
      console.warn(`  [SKIP] No price data for ${cfg.ticker}`);
      continue;
    }

    // 5. Process each earnings event
    const spyBars = benchmarkData['SPY'] ?? [];
    const vixBars = benchmarkData['^VIX'] ?? [];
    const tnxBars = benchmarkData['^TNX'] ?? [];
    const qqqBars = benchmarkData['QQQ'] ?? [];
    const iwmBars = benchmarkData['IWM'] ?? [];
    const sectorBars = benchmarkData[cfg.sectorEtf] ?? [];

    // Sort earnings chronologically (oldest first)
    const sortedEarnings = [...earningsDates].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const eventIds: { id: string; date: string; subtype: string }[] = [];

    for (const earning of sortedEarnings) {
      const barDate = earningsDateToBarDate(earning.date);

      // Check idempotency: skip if already loaded
      const existingEvent = await db
        .select({ id: hist.historicalEvents.id })
        .from(hist.historicalEvents)
        .where(
          and(
            eq(hist.historicalEvents.companyId, companyId),
            eq(hist.historicalEvents.bootstrapBatch, BOOTSTRAP_BATCH),
            eq(hist.historicalEvents.tickerAtTime, cfg.ticker),
            sql`DATE(${hist.historicalEvents.eventTs}) = ${barDate}`,
          ),
        )
        .limit(1);

      if (existingEvent.length > 0) {
        summary.skipped++;
        eventIds.push({ id: existingEvent[0].id, date: barDate, subtype: determineSubtype(earning.surprise_pct) });
        continue;
      }

      const eventIdx = findBarIndex(stockBars, barDate);
      if (eventIdx < 0) {
        console.warn(`  [SKIP] No price bar for ${barDate}`);
        summary.skipped++;
        continue;
      }

      const subtype = determineSubtype(earning.surprise_pct);
      const severity = determineSeverity(earning.surprise_pct);
      const surpriseStr = earning.surprise_pct != null ? `${earning.surprise_pct > 0 ? '+' : ''}${earning.surprise_pct.toFixed(1)}%` : '';
      const headline = `${cfg.ticker} Q earnings ${subtype}${surpriseStr ? ` (${surpriseStr} surprise)` : ''}`;

      // -- Insert historical_events --
      const [event] = await db
        .insert(hist.historicalEvents)
        .values({
          eventTs: new Date(earning.date),
          marketSession: 'after_hours', // Most US earnings are after-hours
          eventTsPrecision: 'day_session',
          eventTsSource: 'earnings_calendar',
          eventCategory: 'earnings',
          eventType: 'earnings',
          eventSubtype: subtype,
          severity,
          headline,
          companyId,
          tickerAtTime: cfg.ticker,
          collectionTier: 'full',
          bootstrapBatch: BOOTSTRAP_BATCH,
        })
        .returning({ id: hist.historicalEvents.id });

      eventIds.push({ id: event.id, date: barDate, subtype });

      // -- Insert event_sources --
      await db.insert(hist.eventSources).values({
        eventId: event.id,
        sourceType: 'earnings_calendar',
        sourceName: 'yfinance',
        extractionMethod: 'api_structured',
        confidence: '0.90',
      });

      // -- Insert metrics_earnings --
      await db.insert(hist.metricsEarnings).values({
        eventId: event.id,
        epsActual: earning.eps_actual != null ? String(earning.eps_actual) : null,
        epsEstimate: earning.eps_estimate != null ? String(earning.eps_estimate) : null,
        epsSurprisePct: earning.surprise_pct != null ? String(earning.surprise_pct) : null,
      });

      // -- Insert event_stock_context --
      const currentClose = stockBars[eventIdx].close;
      if (currentClose != null) {
        const closes = stockBars.slice(0, eventIdx + 1).map((b) => b.close).filter((c): c is number => c != null);
        const rsi = computeRSI(closes);
        const sma50 = computeSMA(closes, 50);
        const sma200 = computeSMA(closes, 200);
        const { high: high52w, low: low52w } = compute52WeekRange(stockBars, eventIdx);
        const avgVol = computeAvgVolume(stockBars, 20, eventIdx);

        const price30dAgo = getCloseAtOffset(stockBars, eventIdx, -22);
        const price90dAgo = getCloseAtOffset(stockBars, eventIdx, -63);

        await db.insert(hist.eventStockContext).values({
          eventId: event.id,
          companyId,
          priceAtEvent: String(currentClose),
          price30dAgo: price30dAgo != null ? String(price30dAgo) : null,
          price90dAgo: price90dAgo != null ? String(price90dAgo) : null,
          high52w: high52w != null ? String(high52w) : null,
          low52w: low52w != null ? String(low52w) : null,
          return30d: price30dAgo != null ? String(computeReturn(price30dAgo, currentClose)) : null,
          return90d: price90dAgo != null ? String(computeReturn(price90dAgo, currentClose)) : null,
          distanceFrom52wHigh: high52w != null ? String(computeReturn(high52w, currentClose)) : null,
          distanceFrom52wLow: low52w != null ? String(computeReturn(low52w, currentClose)) : null,
          rsi14: rsi != null ? String(rsi) : null,
          above50ma: sma50 != null ? currentClose > sma50 : null,
          above200ma: sma200 != null ? currentClose > sma200 : null,
          avgVolume20d: avgVol,
          pitCompleteness: 'full',
        });
      }

      // -- Insert event_market_context --
      const spyIdx = findBarIndex(spyBars, barDate);
      const vixIdx = findBarIndex(vixBars, barDate);
      const sectorIdx = findBarIndex(sectorBars, barDate);

      if (spyIdx >= 0) {
        const spyClose = spyBars[spyIdx].close;
        const spyPrevClose = spyIdx > 0 ? spyBars[spyIdx - 1].close : null;
        const spyChange = spyPrevClose != null && spyClose != null ? computeReturn(spyPrevClose, spyClose) : null;

        const qqqIdx = findBarIndex(qqqBars, barDate);
        const qqqPrevClose = qqqIdx > 0 ? qqqBars[qqqIdx - 1].close : null;
        const qqqClose = qqqIdx >= 0 ? qqqBars[qqqIdx].close : null;
        const qqqChange = qqqPrevClose != null && qqqClose != null ? computeReturn(qqqPrevClose, qqqClose) : null;

        const iwmIdx = findBarIndex(iwmBars, barDate);
        const iwmPrevClose = iwmIdx > 0 ? iwmBars[iwmIdx - 1].close : null;
        const iwmClose = iwmIdx >= 0 ? iwmBars[iwmIdx].close : null;
        const iwmChange = iwmPrevClose != null && iwmClose != null ? computeReturn(iwmPrevClose, iwmClose) : null;

        const vixClose = vixIdx >= 0 ? vixBars[vixIdx].close : null;
        const vixPercentile = vixIdx >= 0 ? computeVixPercentile(vixBars, vixIdx) : null;

        const tnxIdx = findBarIndex(tnxBars, barDate);
        const tnxClose = tnxIdx >= 0 ? tnxBars[tnxIdx].close : null;

        const sectorClose = sectorIdx >= 0 ? sectorBars[sectorIdx].close : null;
        const sectorPrevClose = sectorIdx > 0 ? sectorBars[sectorIdx - 1].close : null;
        const sectorChange = sectorPrevClose != null && sectorClose != null ? computeReturn(sectorPrevClose, sectorClose) : null;

        // Sector 30d return
        const sector30dAgoIdx = sectorIdx >= 0 ? Math.max(0, sectorIdx - 22) : -1;
        const sector30dAgoClose = sector30dAgoIdx >= 0 ? sectorBars[sector30dAgoIdx].close : null;
        const sector30d = sector30dAgoClose != null && sectorClose != null ? computeReturn(sector30dAgoClose, sectorClose) : null;

        // Market regime from SPY
        const spyCloses = spyBars.slice(0, spyIdx + 1).map((b) => b.close).filter((c): c is number => c != null);
        const spySma50 = computeSMA(spyCloses, 50);
        const spySma200 = computeSMA(spyCloses, 200);
        const regime = spyClose != null ? determineRegime(spyClose, spySma50, spySma200) : null;

        await db.insert(hist.eventMarketContext).values({
          eventId: event.id,
          spyClose: spyClose != null ? String(spyClose) : null,
          spyChangePct: spyChange != null ? String(spyChange) : null,
          qqqChangePct: qqqChange != null ? String(qqqChange) : null,
          iwmChangePct: iwmChange != null ? String(iwmChange) : null,
          vixClose: vixClose != null ? String(vixClose) : null,
          vixPercentile1y: vixPercentile != null ? String(vixPercentile) : null,
          treasury10y: tnxClose != null ? String(tnxClose) : null,
          sectorEtfTicker: cfg.sectorEtf,
          sectorEtfChange: sectorChange != null ? String(sectorChange) : null,
          sectorEtf30d: sector30d != null ? String(sector30d) : null,
          marketRegime: regime,
        });
      }

      // -- Insert event_returns --
      const prevIdx = findPrevTradingDay(stockBars, eventIdx);
      if (prevIdx >= 0 && stockBars[prevIdx].close != null) {
        const refPrice = stockBars[prevIdx].close!;
        const refDate = stockBars[prevIdx].date;

        const stockReturns = computeReturns(stockBars, refPrice, eventIdx);
        const spyRefIdx = findBarIndex(spyBars, refDate);
        const spyRefPrice = spyRefIdx >= 0 ? spyBars[spyRefIdx].close : null;
        const spyReturns = spyRefPrice != null ? computeReturns(spyBars, spyRefPrice, findBarIndex(spyBars, barDate)) : {};

        // Compute alpha = stock return - SPY return
        const alpha: Record<string, number | null> = {};
        for (const h of RETURN_HORIZONS) {
          const sr = stockReturns[`t${h}`];
          const br = spyReturns[`t${h}`];
          alpha[`t${h}`] = sr != null && br != null ? +(sr - br).toFixed(4) : null;
        }

        // Sector alpha
        const sectorRefIdx = findBarIndex(sectorBars, refDate);
        const sectorRefPrice = sectorRefIdx >= 0 ? sectorBars[sectorRefIdx].close : null;
        const sectorReturns = sectorRefPrice != null
          ? computeReturns(sectorBars, sectorRefPrice, findBarIndex(sectorBars, barDate))
          : {};
        const sectorAlphaT5 = stockReturns['t5'] != null && sectorReturns['t5'] != null
          ? +(stockReturns['t5'] - sectorReturns['t5']).toFixed(4)
          : null;
        const sectorAlphaT20 = stockReturns['t20'] != null && sectorReturns['t20'] != null
          ? +(stockReturns['t20'] - sectorReturns['t20']).toFixed(4)
          : null;

        // Overnight gap
        const eventOpen = stockBars[eventIdx].open;
        const overnightGap = eventOpen != null ? computeReturn(refPrice, eventOpen) : null;

        // Volume
        const eventVol = stockBars[eventIdx].volume;
        const avgVol20d = computeAvgVolume(stockBars, 20, eventIdx);
        const volRatio = eventVol != null && avgVol20d != null && avgVol20d > 0
          ? +(eventVol / avgVol20d).toFixed(2)
          : null;

        // Extremes
        const extremes = computeExtremes(stockBars, refPrice, eventIdx, 60);

        const outcomeT20 = classifyOutcome(alpha['t20']);

        await db.insert(hist.eventReturns).values({
          eventId: event.id,
          companyId,
          tickerAtTime: cfg.ticker,
          refPrice: String(refPrice),
          refPriceType: 'prev_close',
          refPriceDate: refDate,

          returnT0: stockReturns['t0'] != null ? String(stockReturns['t0']) : null,
          returnT1: stockReturns['t1'] != null ? String(stockReturns['t1']) : null,
          returnT3: stockReturns['t3'] != null ? String(stockReturns['t3']) : null,
          returnT5: stockReturns['t5'] != null ? String(stockReturns['t5']) : null,
          returnT10: stockReturns['t10'] != null ? String(stockReturns['t10']) : null,
          returnT20: stockReturns['t20'] != null ? String(stockReturns['t20']) : null,
          returnT60: stockReturns['t60'] != null ? String(stockReturns['t60']) : null,

          spyReturnT0: spyReturns['t0'] != null ? String(spyReturns['t0']) : null,
          spyReturnT1: spyReturns['t1'] != null ? String(spyReturns['t1']) : null,
          spyReturnT3: spyReturns['t3'] != null ? String(spyReturns['t3']) : null,
          spyReturnT5: spyReturns['t5'] != null ? String(spyReturns['t5']) : null,
          spyReturnT10: spyReturns['t10'] != null ? String(spyReturns['t10']) : null,
          spyReturnT20: spyReturns['t20'] != null ? String(spyReturns['t20']) : null,
          spyReturnT60: spyReturns['t60'] != null ? String(spyReturns['t60']) : null,

          alphaT0: alpha['t0'] != null ? String(alpha['t0']) : null,
          alphaT1: alpha['t1'] != null ? String(alpha['t1']) : null,
          alphaT3: alpha['t3'] != null ? String(alpha['t3']) : null,
          alphaT5: alpha['t5'] != null ? String(alpha['t5']) : null,
          alphaT10: alpha['t10'] != null ? String(alpha['t10']) : null,
          alphaT20: alpha['t20'] != null ? String(alpha['t20']) : null,
          alphaT60: alpha['t60'] != null ? String(alpha['t60']) : null,

          sectorBenchmark: cfg.sectorEtf,
          sectorAlphaT5: sectorAlphaT5 != null ? String(sectorAlphaT5) : null,
          sectorAlphaT20: sectorAlphaT20 != null ? String(sectorAlphaT20) : null,

          overnightGapPct: overnightGap != null ? String(overnightGap) : null,
          maxDrawdownPct: extremes.maxDrawdownPct != null ? String(extremes.maxDrawdownPct) : null,
          maxDrawdownDay: extremes.maxDrawdownDay,
          maxRunupPct: extremes.maxRunupPct != null ? String(extremes.maxRunupPct) : null,
          maxRunupDay: extremes.maxRunupDay,

          volumeEventDay: eventVol,
          volumeAvg20d: avgVol20d,
          volumeRatio: volRatio != null ? String(volRatio) : null,

          outcomeT20,
          t0Eligible: true,
        });
      }

      summary.events++;
      process.stdout.write('.');
    }

    console.log(); // newline after dots

    // 6. Compute consecutive_beats for this ticker
    console.log(`  Computing consecutive beats...`);
    const allEarnings = await db
      .select({
        eventId: hist.historicalEvents.id,
        eventTs: hist.historicalEvents.eventTs,
        subtype: hist.historicalEvents.eventSubtype,
      })
      .from(hist.historicalEvents)
      .where(
        and(
          eq(hist.historicalEvents.companyId, companyId),
          eq(hist.historicalEvents.eventType, 'earnings'),
          eq(hist.historicalEvents.bootstrapBatch, BOOTSTRAP_BATCH),
        ),
      )
      .orderBy(hist.historicalEvents.eventTs);

    let consecutiveBeats = 0;
    for (const e of allEarnings) {
      if (e.subtype === 'beat') {
        consecutiveBeats++;
      } else {
        consecutiveBeats = 0;
      }
      await db
        .update(hist.metricsEarnings)
        .set({ consecutiveBeats })
        .where(eq(hist.metricsEarnings.eventId, e.eventId));
    }

    // 7. Register backfill coverage
    const existingCoverage = await db
      .select()
      .from(hist.backfillCoverage)
      .where(
        and(
          eq(hist.backfillCoverage.companyId, companyId),
          eq(hist.backfillCoverage.sourceType, 'earnings'),
        ),
      )
      .limit(1);

    if (existingCoverage.length === 0) {
      const dates = sortedEarnings.map((e) => earningsDateToBarDate(e.date));
      await db.insert(hist.backfillCoverage).values({
        companyId,
        ticker: cfg.ticker,
        sourceType: 'earnings',
        dateFrom: dates[0] ?? '2023-01-01',
        dateTo: dates[dates.length - 1] ?? '2026-03-12',
        scanCompleted: true,
        eventsFound: eventIds.length,
        notes: `Bootstrap batch: ${BOOTSTRAP_BATCH}`,
      });
    }

    console.log(`  Done: ${eventIds.length} earnings events`);
  }

  // 8. Compute event_type_patterns for earnings beats in tech
  console.log('\n--- Computing event_type_patterns ---');
  await computePatterns(db);

  // 9. Print summary
  console.log('\n=== Bootstrap Summary ===');
  console.log(`Companies created: ${summary.companies}`);
  console.log(`Events created: ${summary.events}`);
  console.log(`Events skipped (already existed): ${summary.skipped}`);

  // Count totals from DB
  const [{ count: totalEvents }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(hist.historicalEvents)
    .where(eq(hist.historicalEvents.bootstrapBatch, BOOTSTRAP_BATCH));

  const [{ count: totalReturns }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(hist.eventReturns);

  const [{ count: totalPatterns }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(hist.eventTypePatterns);

  console.log(`\nDB totals:`);
  console.log(`  historical_events: ${totalEvents}`);
  console.log(`  event_returns: ${totalReturns}`);
  console.log(`  event_type_patterns: ${totalPatterns}`);

  await pool.end();
  console.log('\nDone!');
}

async function computePatterns(db: ReturnType<typeof drizzle>) {
  // Earnings beat pattern for tech sector
  const beatReturns = await db
    .select({
      eventId: hist.historicalEvents.id,
      eventTs: hist.historicalEvents.eventTs,
      alphaT5: hist.eventReturns.alphaT5,
      alphaT20: hist.eventReturns.alphaT20,
      alphaT60: hist.eventReturns.alphaT60,
    })
    .from(hist.historicalEvents)
    .innerJoin(hist.eventReturns, eq(hist.historicalEvents.id, hist.eventReturns.eventId))
    .innerJoin(hist.companies, eq(hist.historicalEvents.companyId, hist.companies.id))
    .where(
      and(
        eq(hist.historicalEvents.eventType, 'earnings'),
        eq(hist.historicalEvents.eventSubtype, 'beat'),
        eq(hist.companies.sector, 'Technology'),
      ),
    );

  if (beatReturns.length === 0) {
    console.log('  No beat returns to aggregate');
    return;
  }

  const alphaT5s = beatReturns.map((r) => parseFloat(r.alphaT5 ?? '0')).filter((v) => !isNaN(v));
  const alphaT20s = beatReturns.map((r) => parseFloat(r.alphaT20 ?? '0')).filter((v) => !isNaN(v));
  const alphaT60s = beatReturns.map((r) => parseFloat(r.alphaT60 ?? '0')).filter((v) => !isNaN(v));

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const median = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const stdDev = (arr: number[]) => {
    if (arr.length < 2) return 0;
    const m = avg(arr);
    return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1));
  };
  const winRate = (arr: number[]) => arr.length > 0 ? arr.filter((v) => v > 0).length / arr.length : 0;

  const dates = beatReturns
    .map((r) => r.eventTs)
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime());

  // Find best and worst case by T+20 alpha
  let bestIdx = 0;
  let worstIdx = 0;
  for (let i = 1; i < beatReturns.length; i++) {
    const a = parseFloat(beatReturns[i].alphaT20 ?? '0');
    if (a > parseFloat(beatReturns[bestIdx].alphaT20 ?? '0')) bestIdx = i;
    if (a < parseFloat(beatReturns[worstIdx].alphaT20 ?? '0')) worstIdx = i;
  }

  // Upsert pattern
  await db
    .insert(hist.eventTypePatterns)
    .values({
      eventType: 'earnings',
      eventSubtype: 'beat',
      sector: 'Technology',
      sampleSize: beatReturns.length,
      dateRangeStart: dates.length > 0 ? dates[0].toISOString().slice(0, 10) : null,
      dateRangeEnd: dates.length > 0 ? dates[dates.length - 1].toISOString().slice(0, 10) : null,
      avgAlphaT5: String(+avg(alphaT5s).toFixed(4)),
      avgAlphaT20: String(+avg(alphaT20s).toFixed(4)),
      avgAlphaT60: String(+avg(alphaT60s).toFixed(4)),
      medianAlphaT20: String(+median(alphaT20s).toFixed(4)),
      stdDevAlphaT20: String(+stdDev(alphaT20s).toFixed(4)),
      winRateT5: String(+winRate(alphaT5s).toFixed(3)),
      winRateT20: String(+winRate(alphaT20s).toFixed(3)),
      bestCaseEventId: beatReturns[bestIdx].eventId,
      worstCaseEventId: beatReturns[worstIdx].eventId,
      typicalPattern: 'Tech earnings beats typically show initial gap-up followed by consolidation',
    })
    .onConflictDoNothing();

  console.log(`  Computed pattern: earnings/beat/Technology — ${beatReturns.length} samples`);
}

function incrementDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

main().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
