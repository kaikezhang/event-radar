# TASK.md — DQ-5: Killer Features — Daily Briefing + Price Context

## ⚠️ DO NOT MERGE ANY PRs. Create PR and STOP.

## Overview
Two features that make users come back every day:
1. Enhanced Daily Briefing with AI summary
2. Price context on event cards

## 1. Enhanced Daily Market Briefing
- File: `packages/web/src/components/DailyBriefing.tsx`
- Current: simple count of events in last 24h + top event
- Enhance to a proper morning briefing:

### Data to show:
- **Event count by severity**: "3 CRITICAL, 12 HIGH, 45 MEDIUM in the last 24h"
- **Top 3 events**: Show title + ticker + severity for the 3 highest-severity events
- **Source breakdown**: "SEC filings: 5, Breaking news: 3, Trading halts: 2"
- **Watchlist activity**: "Events affecting your watchlist: 8" (if user has watchlist)

### UI:
- Expandable card at top of feed (collapsed by default shows "Daily Briefing · 3 critical events")
- Click to expand and see full briefing
- "Dismiss for today" button (already exists)
- Show a "View all" link to History page
- Use a warm gradient background to make it visually distinct

### API:
- Create `GET /api/v1/briefing/daily` endpoint in backend
- File: `packages/backend/src/routes/` — new file `briefing.ts`
- Returns: `{ date, totalEvents, bySeverity: {CRITICAL, HIGH, MEDIUM, LOW}, topEvents: [...], bySource: {...}, watchlistEvents: number }`
- Query events from last 24h, aggregate by severity and source
- Top events = ORDER BY severity priority DESC, created_at DESC LIMIT 3

## 2. Price Context on Event Cards
- File: `packages/web/src/components/AlertCard.tsx`
- For events with a ticker, show current price + daily change
- Use the existing `/api/price/:ticker` endpoint

### Implementation:
- Add a small price chip next to the ticker on event cards:
  - "AAPL $178.50 (+2.3%)" in green for positive, red for negative
- Don't fetch price for every card on initial load (too many API calls!)
- Instead: batch-fetch prices for visible tickers when feed loads
  - Create a new endpoint `GET /api/price/batch?tickers=AAPL,NVDA,TSLA`
  - File: `packages/backend/src/routes/price.ts` — add batch endpoint
  - Returns: `{ AAPL: { price: 178.50, change: 2.3, changePercent: 1.3 }, ... }`
  - Cache prices for 5 minutes (in-memory or simple object cache)
- Show price only for the unique tickers in the current viewport
- If price fetch fails, just don't show the price chip (graceful degradation)

### Price chip design:
- Small, inline with ticker chip
- Green text + ▲ for positive change
- Red text + ▼ for negative change
- Gray if market closed or data unavailable
- Font size: same as ticker chip (text-xs)

## 3. "Restore briefing" in Settings
- File: `packages/web/src/pages/Settings.tsx`
- CrowdTest found: once you dismiss the daily briefing, you can't get it back until tomorrow
- Add a button in Settings: "Show today's briefing" that clears the dismiss flag
- Or better: add a "Daily Briefing" toggle in notification settings

## Testing
- `pnpm --filter @event-radar/backend test` — all tests must pass
- `pnpm --filter @event-radar/web test` — all tests must pass
- `pnpm --filter @event-radar/web build` — must succeed
- Add tests for the new briefing API endpoint
- Add tests for the batch price endpoint

## PR
- Branch: `feat/dq5-briefing-price`
- Title: `feat: DQ-5 daily briefing + price context on event cards`
- **DO NOT MERGE. Create PR and stop.**
