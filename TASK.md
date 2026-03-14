# Current Task: Unify Historical Enricher with event_outcomes

## Problem
The historical enricher currently uses a separate `historical_events` table with rigid `eventType` matching. This causes most non-SEC events (breaking-news, trading-halt, etc.) to get no historical context because they can't be mapped to predefined event types.

Meanwhile, `event_outcomes` has 4600+ rows from actual system operation with real event/ticker/source data. This should be the PRIMARY data source for historical similarity matching.

## Goal
Refactor the historical enricher to use `event_outcomes` + `events` as the primary data source for finding similar past events. Fall back to `historical_events` only when no matches found in event_outcomes.

## Requirements

### 1. New similarity query against event_outcomes
Create a new function `findSimilarFromOutcomes(db, query)` in `services/similarity.ts` (or a new file `services/outcome-similarity.ts`):

```typescript
interface OutcomeSimilarityQuery {
  ticker?: string;       // exact match (highest weight)
  source?: string;       // exact match
  severity?: string;     // exact or adjacent match
  titleKeywords?: string[]; // fuzzy title match via ILIKE
  limit?: number;        // default 5
  excludeEventId?: string; // exclude the current event
}

interface OutcomeSimilarEvent {
  eventId: string;
  ticker: string;
  title: string;
  source: string;
  severity: string;
  eventTime: string;
  eventPrice: number | null;
  change1h: number | null;
  change1d: number | null;
  change1w: number | null;
  change1m: number | null;
  score: number; // similarity score 0-1
}
```

**Matching strategy (scored):**
- Same ticker: +0.4
- Same source: +0.2  
- Same/adjacent severity: +0.15
- Title keyword overlap (at least 1 keyword match via ILIKE): +0.25
- Recency bonus: events within 90 days get +0.05

**SQL approach:**
```sql
SELECT eo.*, e.title, e.source, e.severity
FROM event_outcomes eo
JOIN events e ON e.id = eo.event_id
WHERE (e.source = $source OR eo.ticker = $ticker)
ORDER BY event_time DESC
LIMIT 100
```
Then score in TypeScript and return top N.

### 2. Update HistoricalEnricher
In `pipeline/historical-enricher.ts`:

1. In `doEnrich()`, FIRST try `findSimilarFromOutcomes()` 
2. If >= 2 results with score > 0.3, build HistoricalContext from them
3. Only if no outcome matches, fall back to existing `findSimilarEvents()` (historical_events table)
4. Remove the dependency on `mapEventToSimilarityQuery()` returning non-null for the outcomes path — outcomes matching should work for ALL sources

### 3. HistoricalContext changes
The existing `HistoricalContext` type should be extended or the enricher output should include:
- `similarEvents`: array of past similar events with title, time, ticker, price changes
- `avgChange1d`, `avgChange1w`: average returns from similar events (when data available)
- Keep existing fields (`confidence`, `similarCount`, `avgReturn`, etc.) for backward compat

### 4. Dashboard display
In the delivery feed response (`routes/delivery-feed.ts`), include historical context when available:
- Add `historical` field to feed items with similar events list + average returns

### 5. Tests
- Add tests for `findSimilarFromOutcomes` in a new test file
- Update historical-enricher tests to verify the fallback chain
- All existing tests must still pass

## Constraints
- TypeScript strict mode, ESM with `.js` extensions
- Do NOT modify the `historical_events` table or its schema
- Do NOT break existing similarity.ts — add new functions alongside
- Use Drizzle ORM for queries where possible, raw SQL with `sql` tag when needed
- Run `pnpm build && pnpm --filter @event-radar/backend test` before creating PR

## Branch
`feat/unified-historical-enricher`
