# CLAUDE.md — Event Radar

## Project
Real-time stock market event detection + AI-powered historical analysis platform. Monorepo with pnpm workspaces.

## Structure
- `packages/backend/` — Fastify API + scanners + pipeline
- `packages/delivery/` — Discord webhook, Bark push, Telegram, generic webhook
- `packages/shared/` — Types, schemas, base classes
- `services/sec-scanner/` — Python SEC EDGAR scanner

## Commands
- `pnpm --filter @event-radar/backend build` — Build backend
- `pnpm --filter @event-radar/backend test` — Run tests  
- `pnpm --filter @event-radar/backend dev` — Dev server (port 3001)
- `pnpm --filter @event-radar/backend lint` — Lint

## Rules
- TypeScript strict mode
- ESM with .js extensions in imports
- Use existing patterns (BaseScanner, EventBus, RuleEngine)
- All new files need tests
- Do NOT merge PRs — create PR and stop
- Run `pnpm --filter @event-radar/backend test` before creating PR — all tests must pass
- DB: PostgreSQL with Drizzle ORM (see `packages/backend/src/db/schema.ts`)
- DB URL: `postgresql://radar:radar@localhost:5432/event_radar`

## Current Task: Historical Event Database — Phase 0 (Proof of Concept)

### Goal
Implement the historical event database schema and a bootstrap script that populates it with earnings data for 5 tickers. This is the foundation for the entire AI analysis layer.

### Full Spec
Read `docs/HISTORICAL-DB-SPEC.md` (v3) for the complete database specification. You are implementing Phase 0 (proof of concept) of the bootstrap plan.

### What to Build

#### 1. New Drizzle Schema (`packages/backend/src/db/historical-schema.ts`)

Create a NEW schema file (don't modify the existing `schema.ts` — the historical tables are separate from the real-time event detection tables).

Tables to create (from the v3 spec):
- `companies` — company master
- `ticker_history` — ticker changes over time (FB→META etc.)
- `stock_splits` — split/reverse-split records with adjustment_factor
- `historical_events` — core event records with precise timestamps
- `event_participants` — multi-entity events (M&A acquirer/target, politicians, etc.)
- `event_sources` — provenance tracking
- `metrics_earnings` — typed earnings metrics (EPS, revenue, guidance)
- `metrics_restructuring` — typed restructuring metrics
- `metrics_mna` — typed M&A metrics
- `metrics_fda` — typed FDA metrics
- `metrics_macro` — typed macro metrics
- `metrics_other` — JSONB fallback
- `event_market_context` — macro snapshot at event time
- `event_stock_context` — stock state at event time
- `event_returns` — quantified price impact with SPY + sector alpha
- `event_peer_impact` — peer/contagion effects
- `event_analysis` — AI causal analysis (versioned)
- `event_chains` + `event_chain_members` — event lifecycle chains
- `event_type_patterns` — aggregated pattern stats
- `backfill_coverage` — coverage tracking ledger

Use the exact field definitions from `docs/HISTORICAL-DB-SPEC.md` v3.

#### 2. SQL Migration (`packages/backend/src/db/migrations/historical-tables.sql`)

Generate the raw SQL migration from the Drizzle schema. This will be run against the existing database (which already has the real-time `events`, `event_outcomes`, etc. tables).

#### 3. Bootstrap Script (`packages/backend/src/scripts/bootstrap-earnings.ts`)

A standalone TypeScript script that:

1. **Creates company records** for: NVDA, TSLA, META, AAPL, AMD
   - Include sector, industry, CIK numbers
   - Include ticker_history (META was FB until 2022-06-09)

2. **Fetches earnings data** via yfinance (use `child_process` to run Python):
   ```python
   import yfinance as yf
   import json
   ticker = yf.Ticker("NVDA")
   # Get earnings dates + EPS data
   earnings = ticker.get_earnings_dates(limit=20)
   # Get historical prices for return calculation
   hist = ticker.history(period="3y")
   ```

3. **For each earnings event:**
   - Creates `historical_events` record with:
     - `event_ts` from earnings calendar
     - `event_ts_precision = 'day_session'`
     - `event_ts_source = 'earnings_calendar'`
     - Classification: `event_category='earnings'`, `event_type='earnings'`, `event_subtype` = 'beat'/'miss'/'in_line' based on surprise
     - `severity` based on |surprise_pct|: >10% = critical, >5% = high, >2% = medium, else low
   - Creates `metrics_earnings` with EPS actual/estimate/surprise
   - Creates `event_stock_context` with price data, 30d/90d returns, RSI, MA signals
   - Creates `event_market_context` with SPY, VIX, sector ETF data
   - Creates `event_returns` with T+0 through T+60 returns + SPY alpha + sector alpha
     - ref_price = previous trading day close
     - Sector benchmark: SOXX for NVDA/AMD, XLK for AAPL, XLC for META, XLY for TSLA
   - Registers in `backfill_coverage`

4. **Computes `consecutive_beats`** after all earnings loaded (requires chronological pass)

5. **Computes `event_type_patterns`** for earnings_beat in tech sector

6. **Prints summary** of what was loaded

### Technical Notes

- Use `child_process.execSync()` to call Python for yfinance data. The server has Python 3 + yfinance installed.
- For FRED data (VIX, rates): use yfinance `^VIX`, `^TNX` (10Y), `^IRX` (13-week T-bill) as proxies. Actual FRED integration comes later.
- RSI-14 calculation: standard Wilder's smoothing on 14-day closes
- 50MA/200MA: simple moving averages
- Don't worry about perfect PIT for this PoC — yfinance adjusted prices are fine
- The script should be idempotent (can re-run without duplicating data)

### File Organization
```
packages/backend/src/
  db/
    historical-schema.ts     ← NEW: all historical tables
    migrations/
      historical-tables.sql  ← NEW: raw SQL migration
  scripts/
    bootstrap-earnings.ts    ← NEW: earnings data bootstrap
    helpers/
      yfinance-bridge.py     ← NEW: Python helper for yfinance calls
      technical-indicators.ts ← NEW: RSI, MA calculations
```

### Success Criteria
- All 20 tables created in PostgreSQL
- ~40 earnings events loaded for 5 tickers (2 years × 4 quarters × 5 tickers)
- Each event has: stock context, market context, returns (T+0 to T+60), and earnings metrics
- `event_type_patterns` has at least one aggregated pattern row
- Script runs idempotently
- `pnpm --filter @event-radar/backend build` succeeds
- Create a PR with all changes (do NOT merge)

### What NOT to Do
- Don't modify existing `schema.ts` or any existing code
- Don't implement similarity matching yet (Phase 1)
- Don't implement AI analysis yet (Phase 1)  
- Don't add any API endpoints yet
- Don't worry about non-earnings event types yet
