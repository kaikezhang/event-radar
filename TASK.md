# TASK.md — Phase 1 Fix + Phase 2: SEC 8-K Bootstrap

## Part 1: Fix Phase 1 Overflow Issues

### Problem
`eps_surprise_pct` column is `decimal(6,2)` which can't hold values like -10,883% (MSTR) or 18,282% (CRWD). Same issue may affect `revenue_surprise_pct`, `yoy_revenue_growth`, `yoy_eps_growth`.

### Fix
1. **Update schema** (`packages/backend/src/db/historical-schema.ts`):
   - `eps_surprise_pct`: change from `decimal(6,2)` to `decimal(10,2)`
   - `revenue_surprise_pct`: change from `decimal(6,2)` to `decimal(10,2)`
   - `yoy_revenue_growth`: change from `decimal(6,2)` to `decimal(10,2)`
   - `yoy_eps_growth`: change from `decimal(6,2)` to `decimal(10,2)`

2. **Generate ALTER TABLE migration** (`packages/backend/src/db/migrations/fix-decimal-precision.sql`):
   ```sql
   ALTER TABLE metrics_earnings ALTER COLUMN eps_surprise_pct TYPE decimal(10,2);
   ALTER TABLE metrics_earnings ALTER COLUMN revenue_surprise_pct TYPE decimal(10,2);
   ALTER TABLE metrics_earnings ALTER COLUMN yoy_revenue_growth TYPE decimal(10,2);
   ALTER TABLE metrics_earnings ALTER COLUMN yoy_eps_growth TYPE decimal(10,2);
   ```

3. **Clamp surprise values** in `bootstrap-earnings.ts`: If `|eps_surprise_pct| > 99999999` (8 digits), clamp to ±99999999. This is a safety net; the wider column should handle it.

## Part 2: SEC 8-K Bootstrap Script

Build a new bootstrap script that fetches SEC 8-K filings for all 50 tickers and populates the historical event database.

### What to Build

#### 1. Python Bridge Extension (`packages/backend/src/scripts/helpers/edgar-bridge.py`)

A Python script that uses `edgartools` to fetch 8-K filings:

```python
# Commands:
#   filings_8k — get 8-K filings for a company by CIK
#     Input: {"command": "filings_8k", "cik": "1045810", "start_date": "2022-01-01", "end_date": "2026-12-31"}
#     Output: {"data": [{"accession": "...", "filed": "2024-01-15", "form": "8-K", "items": ["2.02", "9.01"], "primary_doc_url": "...", "description": "..."}]}
```

For each 8-K filing, extract:
- Filing date
- Item numbers (e.g., "2.02", "1.01", "5.02")
- Accession number (for dedup)
- Primary document URL
- Filing description/title

**SEC EDGAR requires a User-Agent header.** Use: `Event-Radar/1.0 (takaikezhang@gmail.com)`

Set this via environment variable before importing edgartools:
```python
import os
os.environ['EDGAR_IDENTITY'] = 'Event-Radar/1.0 takaikezhang@gmail.com'
```

#### 2. Bootstrap Script (`packages/backend/src/scripts/bootstrap-8k.ts`)

A standalone TypeScript script that:

1. **Reads existing companies** from the database (created by earnings bootstrap)
2. **For each company with a CIK:**
   - Fetches 8-K filings via edgar-bridge.py
   - Date range: Tier 1 tickers → 2022-01-01 to present, Tier 2 → 2024-01-01 to present
   - Rate limit: 1 second between API calls (SEC rate limit is 10 req/s, but be conservative)

3. **Classifies each 8-K by Item number** (rule-based, no AI):

   | Item | Category | Event Type | Severity Default |
   |------|----------|-----------|-----------------|
   | 1.01 | corporate | contract_material | medium |
   | 1.02 | corporate | bankruptcy | critical |
   | 1.03 | corporate | mine_safety | low |
   | 2.01 | corporate | acquisition_disposition | high |
   | 2.02 | earnings | earnings_results | high |
   | 2.03 | corporate | off_balance_sheet | medium |
   | 2.04 | corporate | triggering_event | medium |
   | 2.05 | restructuring | restructuring | high |
   | 2.06 | corporate | impairment | high |
   | 3.01 | corporate | delisting | critical |
   | 3.02 | corporate | charter_amendment | low |
   | 3.03 | corporate | ticker_change | medium |
   | 4.01 | corporate | auditor_change | medium |
   | 4.02 | corporate | financial_restatement | critical |
   | 5.01 | corporate | strategy_update | medium |
   | 5.02 | leadership | leadership_change | high |
   | 5.03 | corporate | bylaw_amendment | low |
   | 5.07 | corporate | shareholder_vote | medium |
   | 7.01 | corporate | regulation_fd | medium |
   | 8.01 | corporate | other_material | medium |
   | 9.01 | corporate | financial_exhibit | low |

   **Skip items 3.02, 3.03, 5.03, 9.01** — too routine, low value.

   When a filing has multiple items (e.g., "2.02" + "9.01"), use the **highest-priority item** (lowest item number in category priority: earnings > restructuring > leadership > corporate).

4. **For each classified event, creates:**
   - `historical_events` record with:
     - `event_ts` = filing date
     - `event_ts_precision = 'day'`
     - `event_ts_source = 'sec_filing'`
     - `event_category`, `event_type` from classification table above
     - `severity` from classification, upgraded if multiple significant items
     - `headline` = e.g., "NVDA 8-K: Leadership Change (Item 5.02)"
     - `collection_tier` = 'tier1' or 'tier2'
     - `bootstrap_batch` = 'phase2_8k_v1'
   - `event_sources` record with:
     - `source_type = 'sec_edgar'`
     - `source_url` = EDGAR filing URL
     - `source_native_id` = accession number
   - `event_stock_context` — reuse the same logic from bootstrap-earnings (price, RSI, MA, etc.)
   - `event_market_context` — same as earnings bootstrap
   - `event_returns` — same multi-horizon returns calculation

5. **Dedup:**
   - By `company_id + event_ts + event_type` (same as earnings)
   - Also by accession number in `event_sources` to avoid re-processing the same filing
   - **Skip 8-K filings with only item 2.02** — these are earnings results already covered by the earnings bootstrap. Only process if the 8-K has OTHER items besides 2.02.

6. **Progress logging:** `[12/50] Processing MSFT 8-K filings... found 45 filings, 32 after dedup`

7. **Error handling:** try/catch per ticker, continue on failure

### Reuse
- Import and reuse functions from `bootstrap-earnings.ts`:
  - `computeRSI`, `computeSMA`, `compute52WeekRange`, etc. from `helpers/technical-indicators.ts`
  - Market context computation logic
  - Returns computation logic
- **If the earnings bootstrap exports helper functions, import them. If not, extract shared logic into `helpers/` modules.**

### Price Data
- Reuse the same yfinance bridge for price data
- Companies and price data should already be cached from earnings bootstrap
- If a company doesn't exist in DB (shouldn't happen), skip it

## Files to Create
- `packages/backend/src/scripts/helpers/edgar-bridge.py` — NEW
- `packages/backend/src/scripts/bootstrap-8k.ts` — NEW

## Files to Modify
- `packages/backend/src/db/historical-schema.ts` — decimal precision fix
- `packages/backend/src/db/migrations/fix-decimal-precision.sql` — NEW migration

## What NOT to Do
- Do NOT add Claude/LLM analysis — that's a separate task
- Do NOT modify the real-time pipeline code
- Do NOT parse the actual 8-K document text (just use item numbers + filing metadata)
- Do NOT merge any PR

## Verification

```bash
pnpm --filter @event-radar/backend build
pnpm --filter @event-radar/backend test
pnpm --filter @event-radar/backend lint
```

All must pass. Then create a PR.
