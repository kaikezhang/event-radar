# Review: StockTwits Scanner Dedup Plan

> Reviewer: Claude Code (CEO + Eng) | Date: 2026-03-16
> Plan: `docs/plans/2026-03-16-stocktwits-dedup.md`

---

## Verdict: Good problem analysis, but the proposed implementation has 3 blocking API issues

The plan correctly identifies the root cause (restart wipes `previousTrending`, `seenTrending` declared but never used). The state-change-only approach is the right direction. However, the proposed code won't compile as written.

---

## Question 1: SeenIdBuffer vs Alert-Filter Cooldown — Which Is Simpler?

**Alert-filter cooldown is significantly simpler and I'd recommend it as the primary approach.**

Why:

| Factor | SeenIdBuffer | Alert-Filter Cooldown |
|--------|-------------|----------------------|
| API changes needed | 3 new methods (see Q2) | Zero — already has per-ticker+type cooldown with persistence |
| Prevents DB writes | Yes | No — events still stored, filtered at delivery |
| Restart-safe | Yes (persisted) | Yes (persisted to `/tmp/event-radar-seen/ticker-cooldown.json`) |
| Time-based expiry | No — ring buffer evicts by count, not time | Yes — built-in `tickerCooldownMs` with `pruneExpired()` |
| Complexity | High — need `trendingExitTimes` map (see Q5) | Low — 5-line rule in `checkSocial()` |

**However**, the plan's point about DB bloat is valid. StockTwits trending events with 72 dupes per ticker per day is real waste.

**Recommendation**: Do both.
1. **Quick win (Phase 1)**: Add a StockTwits-specific cooldown in `checkSocial()` for `social-trending` events — bump cooldown to 24h for this type. This stops the bleeding immediately with ~5 lines of code.
2. **Proper fix (Phase 2)**: Fix `SeenIdBuffer` APIs and use it in the scanner to prevent events from being created at all.

---

## Question 2: Does SeenIdBuffer Have the APIs We Need?

**No. Three critical gaps:**

### Gap 1: `add()` returns `void`, not `boolean`

The plan assumes:
```typescript
if (this.seenTrending.add(sym.symbol)) { // ← returns void, not boolean
```

Actual signature (`scrape-utils.ts:93`):
```typescript
add(id: string): void {
  if (this.idSet.has(id)) return;  // silently returns
  // ...
}
```

**Fix**: Change `add()` to return `boolean`, or use `has()` + `add()` separately:
```typescript
if (!this.seenTrending.has(sym.symbol)) {
  this.seenTrending.add(sym.symbol);
  events.push({ ... });
}
```

### Gap 2: No `remove()` method

The plan's `pruneNonTrending()` calls `this.seenTrending.remove(ticker)` — this method doesn't exist on `SeenIdBuffer`. It's a ring buffer backed by an array + set; removing from the middle would break the ring invariant.

**Fix**: Add a `remove()` method that splices from the array and deletes from the set. Or redesign as a `Map<string, number>` (ticker → timestamp) instead of a ring buffer.

### Gap 3: No `entries()` method

The plan iterates `this.seenTrending.entries?.()` — doesn't exist. The internal `ids` array and `idSet` are private.

**Fix**: Expose an iterator, e.g., `[Symbol.iterator]()` that yields the ids array.

**Bottom line**: SeenIdBuffer was designed for message-ID dedup (write-once, never remove, FIFO eviction). Using it for trending-state tracking requires fundamentally different semantics (time-based expiry, removal). Consider a new `TrendingStateTracker` class instead of bolting onto SeenIdBuffer.

---

## Question 3: Is 24h Cooldown for Trending Exit the Right Duration?

**24h is reasonable but the implementation is broken.**

The `trendingExitTimes: Map<string, number>` is **in-memory only** — it resets on restart. This re-introduces the exact bug the plan is trying to fix:

1. AAPL leaves trending at 10am
2. Backend restarts at 11am
3. `trendingExitTimes` is empty
4. AAPL is still in `seenTrending` (persisted) so no event — good
5. But the exit timer is lost — AAPL will never get pruned from `seenTrending` unless evicted by ring buffer capacity

**Fix**: Either persist `trendingExitTimes` to disk alongside the seen buffer, or use a `Map<string, number>` (ticker → lastSeenTimestamp) that gets persisted, and prune based on `now - lastSeen > 24h`.

On the duration itself: 24h seems right. StockTwits trending lists churn intra-day but the same mega-cap names (SPY, AAPL, TSLA) cycle back frequently. 24h prevents the "AAPL trending" alert fatigue while still catching genuinely new trending events after a gap.

---

## Question 4: Will the Cleanup SQL Correctly Deduplicate?

**Yes, with one caveat.**

The SQL is correct:
```sql
DELETE FROM events
WHERE id NOT IN (
  SELECT DISTINCT ON (ticker, DATE(created_at)) id
  FROM events
  WHERE source = 'stocktwits' AND title LIKE '%entered StockTwits trending%'
  ORDER BY ticker, DATE(created_at), created_at ASC
)
AND source = 'stocktwits'
AND title LIKE '%entered StockTwits trending%';
```

- The outer `WHERE` clause properly scopes to only stocktwits trending events — won't touch other event types. Good.
- `DISTINCT ON (ticker, DATE(created_at))` keeps the earliest per ticker per day. Correct.

**Caveat**: The `ticker` reference in `DISTINCT ON` assumes `ticker` is a column on the `events` table. Check the schema — if ticker is stored in a JSONB `metadata` column, this needs to be `metadata->>'ticker'` instead. Verify against `packages/backend/src/db/schema.ts`.

**Suggestion**: Run this in a transaction with a `SELECT COUNT(*)` first to verify the blast radius before deleting.

---

## Question 5: Edge Cases and Bugs

### Bug 1: Ring buffer capacity vs trending list size

`SeenIdBuffer(200)` holds 200 entries. If StockTwits returns 30 trending symbols per poll, and the scanner polls every 60s, the buffer fills after ~7 polls. Older tickers get FIFO-evicted — not because they stopped trending, but because the buffer is full. An evicted-but-still-trending ticker would trigger a duplicate event.

**Fix**: Use a time-based map, not a capacity-based ring buffer. Or increase capacity significantly (e.g., 2000).

### Bug 2: Race between add and prune

In the proposed flow:
```
1. for sym in symbols → seenTrending.add(sym)
2. pruneNonTrending(currentTrending)
```

Step 2 iterates `seenTrending` and removes tickers not in `currentTrending`. But step 1 just added ALL current trending tickers. So pruning would only remove tickers from *previous* polls that are no longer trending — which is correct. No race here on second look.

### Bug 3: `previousVolumes` and `previousSentiments` also reset on restart

The plan only addresses `previousTrending` but `previousVolumes` (line 98) and `previousSentiments` (line 99) have the same restart problem. After restart, the first poll will have `previousRatio === undefined` and `previousVolume === undefined`, so no false-positive sentiment flips or volume spikes. This is actually fine — the undefined checks at lines 208 and 237 handle this gracefully.

### Bug 4: Social filter blocks most StockTwits trending events anyway

Look at `checkSocial()` in `alert-filter.ts` (line 320): it requires `upvotes >= 1000 OR comments >= 500 OR high_engagement flag` for social events. StockTwits trending events don't carry upvote/comment counts — they have `watchlist_count`. So **most StockTwits trending events are already being blocked by the alert filter** unless `high_engagement` is set.

This means the 72 duplicate SPY events in the DB were created *before* the alert filter existed, or the filter is disabled. Worth checking — the dedup fix may already be partially solved.

---

## Summary of Recommendations

| Priority | Action | Effort |
|----------|--------|--------|
| P0 | Fix `add()` return type to `boolean` (or use `has()` + `add()`) | 5 min |
| P0 | Don't use SeenIdBuffer for trending state — build a `TrendingStateMap` with time-based expiry + persistence | 1-2h |
| P1 | Add StockTwits trending-specific 24h cooldown in `checkSocial()` as quick-win | 15 min |
| P1 | Persist `trendingExitTimes` (or replace with timestamp-based map) | 30 min |
| P2 | Verify `ticker` column exists in events table for cleanup SQL | 5 min |
| P2 | Check if `checkSocial()` is already blocking most of these events | 15 min |
| P2 | Remove dead `previousTrending` + `previousVolumes` as planned | 5 min |

**Overall**: The diagnosis is spot-on. The fix direction is right. But the implementation needs a different data structure — SeenIdBuffer is a square peg for a round hole. Either extend it substantially or (better) create a purpose-built `TrendingStateTracker` with the semantics this feature actually needs: time-based expiry, removal, iteration, and persistence.
