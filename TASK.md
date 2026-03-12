# TASK.md — Bootstrap Phase 1: Expand Earnings Coverage

## Goal

Expand the earnings bootstrap from 5 tickers / ~60 events to **all 50 Tier 1+2 tickers** with **full historical depth** (2020-2026). Fix the data coverage gaps from Phase 0 PoC.

## Problems to Fix

### 1. Insufficient Historical Depth
The yfinance bridge currently uses `limit=20` for earnings dates and default period for price history (~3 years). This misses most pre-2023 earnings. We need:
- `get_earnings_dates(limit=100)` to get all available history
- Price history with `period="max"` or `start="2019-01-01"` to cover return calculations for events back to 2020

### 2. Only 5 Tickers
Phase 0 only bootstraps NVDA, TSLA, META, AAPL, AMD. We need all 50 tickers from the spec.

### 3. Missing Fiscal Quarter in Headlines
Headlines say "Q earnings beat" without the actual fiscal quarter (e.g., "Q3 FY2025"). The `metrics_earnings` table has `fiscal_quarter` and `fiscal_year` columns but they're not populated. yfinance earnings_dates doesn't directly provide this, so infer it from the date:
- Q1 = Jan-Mar reporting, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec
- Fiscal year = calendar year of the earnings date (approximate, good enough for display)

## What to Build

### 1. Update `helpers/yfinance-bridge.py`
- `get_earnings_dates()`: increase default limit to 100
- `history` command: accept optional `start` date parameter, default to `"2019-01-01"` to get 6+ years of price data
- Add error handling for tickers that don't exist or have no data

### 2. Update `bootstrap-earnings.ts`
- **Expand TICKERS_CONFIG** to include all 50 tickers from spec:
  
  **Tier 1 (15):** NVDA, TSLA, AAPL, MSFT, AMZN, GOOG, META, AMD, PLTR, SMCI, ARM, AVGO, TSM, MSTR, COIN
  
  **Tier 2 (35):** NFLX, JPM, BA, LLY, PFE, JNJ, UNH, V, MA, WMT, HD, CRM, ORCL, ADBE, INTC, MU, QCOM, AMAT, LRCX, KLAC, PANW, CRWD, SNOW, NET, DDOG, SQ, SHOP, UBER, ABNB, RIVN, LCID, NIO, BABA, PDD, SE
  
  For each, include: name, sector, industry, CIK (look up real CIKs), sectorEtf, exchange. Include `previousTickers` where applicable (FB→META already done, GOOG had GOOGL).

- **Fetch more history**: Pass `start="2019-01-01"` to yfinance bridge for price data
- **Fetch more earnings dates**: Use `limit=100`
- **Add fiscal quarter inference**: From earnings date, compute fiscal quarter/year and populate `metrics_earnings.fiscal_quarter` and `metrics_earnings.fiscal_year`
- **Improve headline**: Change from `"NVDA Q earnings beat"` to `"NVDA Q3 FY2025 earnings beat (+5.3% surprise)"`
- **Rate limiting**: Add a 1-second delay between tickers to avoid yfinance rate limits
- **Progress logging**: Print progress like `[12/50] Processing MSFT...`
- **Idempotent**: Already handled — keep the existing dedup logic

### 3. Update Benchmark Data Fetching
- Fetch benchmark data (SPY, QQQ, VIX etc.) with `start="2019-01-01"` too, so market context works for older events

## What NOT to Do
- Do NOT modify the database schema (historical-schema.ts) — it's already correct
- Do NOT add AI analysis (that's a separate task)
- Do NOT touch the real-time pipeline code
- Do NOT modify existing tests that pass — only add new ones if needed
- Do NOT change the migration file

## Verification

After making changes:
```bash
pnpm --filter @event-radar/backend build
pnpm --filter @event-radar/backend test
pnpm --filter @event-radar/backend lint
```

All must pass. Then create a PR.

## Files to Modify
- `packages/backend/src/scripts/helpers/yfinance-bridge.py`
- `packages/backend/src/scripts/bootstrap-earnings.ts`

## Reference
- Full spec: `docs/HISTORICAL-DB-SPEC.md` (v3), section "Tiered Collection Strategy" and "Bootstrap Plan > Phase 1"
- Existing schema: `packages/backend/src/db/historical-schema.ts`
