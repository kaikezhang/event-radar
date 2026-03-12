# Current Task: A.2 — Scanner Data Flow Fix + End-to-End Verification

## Context
Backend is running with PG connected. 12 scanners registered. But only DummyScanner produces events. Real scanners (breaking-news, reddit, stocktwits, econ-calendar) poll successfully but emit 0 events. Need to diagnose and fix.

## Goal
Make at least 3 real scanners produce genuine events that get stored in the database.

## Requirements

### 1. Diagnose scanner output
For each scanner that has `lastScanAt` but 0 events, add temporary `console.log` or structured logging to understand:
- Is the HTTP fetch succeeding? What status code?
- Is the response body valid? Any parse errors?
- Is the keyword/relevance filter too strict?
- Are events being created but not emitted through eventBus?

### 2. Fix Breaking News Scanner
- Check if Reuters RSS URL works (may need updating)
- Check AP News RSS URL (rsshub.app may be down)
- Add at least 2 more reliable RSS feeds (e.g., MarketWatch RSS, CNBC RSS, Yahoo Finance RSS)
- Relax keyword filter slightly — add: `merger`, `acquisition`, `layoff`, `guidance`, `earnings`, `bankruptcy`, `stimulus`, `shutdown`
- Add logging: `console.log(\`[breaking-news] Fetched ${items.length} items from ${feed.name}, ${events.length} matched keywords\`)`

### 3. Fix Reddit Scanner
- Check if Reddit RSS (`.json` endpoint) works without auth
- Subreddits to scan: `r/wallstreetbets`, `r/stocks`, `r/investing`
- Verify the response parsing (Reddit JSON structure)
- Add logging similar to breaking-news

### 4. Fix StockTwits Scanner
- Verify StockTwits API endpoint still works
- Check if auth is needed
- Add logging

### 5. Fix FedWatch Scanner
- Verify CME FedWatch data source
- Check if the URL/API has changed

### 6. Fix EconCalendar Scanner
- Verify the calendar JSON config is correct
- Check if events are calendar-driven (only emit on event day)

### 7. Build script improvement
- Add a `postbuild` script or turbo task to copy `src/config/*.json` to `dist/config/`
- Currently `econ-calendar.json` must be manually copied

### 8. Add startup banner
In `packages/backend/src/index.ts`, after server starts, log:
```
console.log('='.repeat(60));
console.log('Event Radar Backend v0.0.1');
console.log(`Scanners: ${registry.count()} registered`);
console.log(`Database: connected`);
console.log(`API Key: ${apiKey}`);
console.log(`Port: ${port}`);
console.log('='.repeat(60));
```

## Verification
- `pnpm build` passes
- Start server with `DATABASE_URL=postgresql://radar:radar@localhost:5432/event_radar node packages/backend/dist/index.js`
- Within 2 minutes, `GET /api/events` returns events from at least 2 non-dummy sources
- **DO NOT merge. DO NOT run gh pr merge.**

## Files likely to modify
- `packages/backend/src/scanners/breaking-news-scanner.ts`
- `packages/backend/src/scanners/reddit-scanner.ts`
- `packages/backend/src/scanners/stocktwits-scanner.ts`
- `packages/backend/src/scanners/fedwatch-scanner.ts`
- `packages/backend/src/scanners/econ-calendar-scanner.ts`
- `packages/backend/src/index.ts`
- `packages/backend/package.json` (postbuild script)
- `packages/backend/tsconfig.json` (if needed for asset copy)
