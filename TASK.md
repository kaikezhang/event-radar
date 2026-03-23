# TASK.md — P1 Data Quality: Feed Noise + Severity + BLOCKED cleanup

## ⚠️ DO NOT MERGE ANY PRs. Create PR and STOP.

## Overview
Owner evaluation scored data quality 2/10. The #1 problem: feed is 76% StockTwits noise.
Fix signal-to-noise ratio + severity classification + clean up stale data.

## 1. Downgrade existing StockTwits events to LOW (SQL migration)
- Create migration: `packages/backend/src/db/migrations/008-downgrade-stocktwits-severity.sql`
- SQL: `UPDATE events SET severity = 'LOW' WHERE source = 'stocktwits' AND severity = 'MEDIUM';`
- This affects ~9123 rows
- Also update pipeline_audit: `UPDATE pipeline_audit SET severity = 'LOW' WHERE source = 'stocktwits' AND severity = 'MEDIUM';`

## 2. Smart Feed: hide LOW by default
- File: `packages/web/src/pages/Feed/index.tsx` (or wherever feed filtering happens)
- Smart Feed mode should NOT show LOW severity events at all
- "All Events" mode should show them but with visual de-emphasis (slightly dimmed/smaller)
- Add a pill/badge at top of Smart Feed: "Showing HIGH+ events · X LOW events hidden"
- Clicking the pill reveals LOW events

## 3. Fix trading halt severity — should be HIGH minimum
- File: `packages/backend/src/scanners/trading-halt-scanner.ts` or the scanner's severity logic
- Trading halts are currently classified as MEDIUM — they should be HIGH or CRITICAL
- A stock being halted is ALWAYS a significant event
- Also run a migration to upgrade existing trading halt events:
  `UPDATE events SET severity = 'HIGH' WHERE source = 'trading-halt' AND severity IN ('MEDIUM', 'LOW');`

## 4. Fix null tickers on CRITICAL/HIGH events
- Many breaking-news and truth-social events have null tickers
- File: `packages/backend/src/pipeline/` — the classification/enrichment step
- When LLM classifies an event as HIGH/CRITICAL but ticker is null:
  - Try to extract ticker from the title/content using a simple regex (e.g., $AAPL, TSLA, etc.)
  - If no ticker found, set ticker to the most relevant market ETF (SPY for general market, QQQ for tech, etc.)
  - Add a flag `ticker_inferred: true` in metadata so we know it was auto-assigned

## 5. Feed card quality indicator
- File: `packages/web/src/pages/Feed/FeedHeader.tsx` or feed header area
- Show feed quality stats in the header:
  - "23 events · 5 HIGH+ · 18 LOW" with a quality bar
  - Or simpler: "5 important events today" prominent, then the rest
- This helps users quickly see if there's anything worth their attention

## 6. Hide "BLOCKED" outcome events from the feed
- Check if any events with pipeline_audit outcome='filtered' are showing in the feed
- They should NOT appear in the web feed — only 'delivered' events should show
- Verify the API query: `GET /api/events` should only return events that passed the pipeline
- If BLOCKED events are showing, fix the query filter

## Testing Requirements  
- `pnpm --filter @event-radar/web test` — all tests must pass
- `pnpm --filter @event-radar/backend test` — all tests must pass
- `pnpm --filter @event-radar/web build` — must succeed

## PR
- Branch: `feat/phase4-data-quality`
- Title: `feat: P1 data quality — feed noise, severity fixes, BLOCKED cleanup`
- **DO NOT MERGE. Create PR and stop.**
