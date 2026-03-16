# StockTwits Scanner — State-Change-Only Events

> Date: 2026-03-16 | Author: Wanwan

## Problem

StockTwits scanner emits "AAPL entered StockTwits trending" every poll cycle (~1min) for tickers that are continuously trending. This floods the database:
- SPY: 72 duplicate trending events
- USO: 70 duplicates
- AAPL: 16 duplicates

A ticker that's trending every day isn't news. Only **state changes** matter — when a ticker **newly enters** trending after not being trending.

## Current Implementation

`packages/backend/src/scanners/stocktwits-scanner.ts`:
- `previousTrending: Set<string>` — in-memory only, **resets on restart**
- `seenTrending: SeenIdBuffer(200)` — declared but **never used**
- On each poll: checks `!previousTrending.has(sym.symbol)` → emits event
- After poll: `previousTrending = currentTrending` (updates in-memory set)

**Root cause**: After restart, `previousTrending` is empty → ALL trending tickers emit events. Also, `previousTrending` only tracks one poll cycle — there's no long-term memory.

## Proposed Fix

### Change 1: Use `SeenIdBuffer` for persistent trending state

Replace the `previousTrending: Set<string>` with the already-declared `seenTrending: SeenIdBuffer`.

```typescript
// Before (broken)
private previousTrending: Set<string> = new Set();

// After (fixed)
// Remove previousTrending
// Use seenTrending (already declared, already has persistence)
```

`SeenIdBuffer` already:
- Persists to `/tmp/event-radar-seen/stocktwits-trending.json`
- Survives restarts
- Has `add(id)` and dedup check via `has(id)` (or `add` returns false if seen)

### Change 2: Make trending events state-change-only

```typescript
private async pollTrending(): Promise<RawEvent[]> {
  const events: RawEvent[] = [];
  // ... fetch trending symbols ...
  
  const currentTrending = new Set(symbols.map(s => s.symbol));
  
  for (const sym of symbols) {
    // Only emit if this ticker was NOT in the seen buffer
    // seenTrending.add() returns false if already seen
    if (this.seenTrending.add(sym.symbol)) {
      events.push({
        // ... new trending event ...
      });
    }
  }
  
  // IMPORTANT: Prune tickers that are no longer trending
  // So they can re-enter trending in the future
  this.pruneNonTrending(currentTrending);
  
  this.trackedSymbols = symbols.map(s => s.symbol);
  return events;
}
```

### Change 3: Prune non-trending tickers after a cooldown

The key insight: a ticker should be pruned from the seen buffer **only after it's been off the trending list for a period** (e.g., 24h). This prevents:
- Ticker trends → emits event
- Ticker drops off trending for 5 minutes
- Ticker re-trends → emits ANOTHER event (noise)

Implementation:
```typescript
// New: track when tickers left trending
private trendingExitTimes: Map<string, number> = new Map();
private static readonly TRENDING_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

private pruneNonTrending(currentTrending: Set<string>): void {
  const now = Date.now();
  
  // Record exit time for tickers that just left trending
  for (const [ticker] of this.seenTrending.entries?.() ?? []) {
    if (!currentTrending.has(ticker)) {
      if (!this.trendingExitTimes.has(ticker)) {
        this.trendingExitTimes.set(ticker, now);
      }
    } else {
      // Still trending — clear exit time
      this.trendingExitTimes.delete(ticker);
    }
  }
  
  // Remove tickers that have been off trending for > 24h
  for (const [ticker, exitTime] of this.trendingExitTimes) {
    if (now - exitTime > StockTwitsScanner.TRENDING_COOLDOWN_MS) {
      this.seenTrending.remove(ticker);
      this.trendingExitTimes.delete(ticker);
    }
  }
}
```

### Change 4: Clean up existing duplicate data

One-time SQL to deduplicate existing StockTwits trending events:
```sql
-- Keep only the earliest "entered StockTwits trending" per ticker per day
DELETE FROM events
WHERE id NOT IN (
  SELECT DISTINCT ON (ticker, DATE(created_at))
    id
  FROM events
  WHERE source = 'stocktwits' AND title LIKE '%entered StockTwits trending%'
  ORDER BY ticker, DATE(created_at), created_at ASC
)
AND source = 'stocktwits'
AND title LIKE '%entered StockTwits trending%';
```

### Change 5: Remove unused `previousTrending` and `previousVolumes`

Clean up unused state variables.

## SeenIdBuffer API Check

Need to verify `SeenIdBuffer` supports:
- `add(id)` — returns boolean (true if new, false if already seen)
- Persistence — auto-save on add
- Iteration — for pruning (may need to check if `.entries()` exists)

If `SeenIdBuffer` doesn't have `remove()` or `entries()`, we may need to:
- Add those methods
- Or use a separate persistent Map (like alert-filter's cooldown map)

## Alternative: Simpler Approach

If modifying `SeenIdBuffer` is too complex, a simpler approach:

Use the **alert-filter's per-ticker cooldown** mechanism (already has persistence + pruning):
- StockTwits trending events get a **24h cooldown** per ticker
- Same mechanism already works for other event types

This means: in `alert-filter.ts`, add a special rule for `source=stocktwits, type=social-trending`:
```typescript
if (source === 'stocktwits' && event.type === 'social-trending') {
  const ticker = event.metadata?.ticker;
  // Use 24h cooldown instead of default 60min
  return this.applyTickerCooldown(ticker, result, 24 * 60 * 60 * 1000);
}
```

**Pros**: Simpler, reuses existing infrastructure
**Cons**: Events still get created and stored, just filtered at delivery time. Wastes DB space.

## Recommendation

**Use the SeenIdBuffer approach** (Changes 1-3) — prevents events from being created at all. Cleaner.

## Testing

- Test: ticker trending for first time → event emitted
- Test: same ticker trending next poll → no event
- Test: ticker leaves trending for < 24h, re-enters → no event
- Test: ticker leaves trending for > 24h, re-enters → event emitted
- Test: restart → previously seen tickers still suppressed
- Test: cleanup SQL removes duplicates
