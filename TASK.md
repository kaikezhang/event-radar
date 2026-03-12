# TASK.md — Similarity Matching Engine + Query API

## Goal

Build the similarity matching engine and a query API that answers: **"What happened last time something like this occurred?"** This is the core product feature — finding historically similar events and showing their outcomes.

## What to Build

### 1. Similarity Matching Service (`packages/backend/src/services/similarity.ts`)

Implement `findSimilarEvents(newEvent, options)` that:

1. **Retrieves candidates** from `historical_events` with the same `event_type` that have return data
2. **Scores each candidate** on multiple dimensions:

   | Factor | Points | Condition |
   |--------|--------|-----------|
   | Subtype match | +4 | `event_subtype` matches exactly |
   | Same sector | +3 | Company sector matches |
   | Same market cap tier | +2 | `market_cap_tier` matches (from `event_stock_context`) |
   | Same market regime | +2 | `market_regime` matches (from `event_market_context`) |
   | Similar VIX | +1 | `|vix_diff| < 5` |
   | Similar momentum | +1 | Same sign on `return_30d` (both up or both down) |
   | Recency bonus | +1 | Event within last 2 years |
   | Metrics bonus | +1-3 | For earnings: similar surprise %, similar consecutive_beats |

3. **Returns top N** candidates sorted by score descending

4. **Computes confidence level:**
   - `insufficient` — fewer than 3 results
   - `low` — 3-4 results
   - `medium` — 5+ results but `std_dev(alpha_t20) > 0.15`
   - `high` — 5+ results and `std_dev(alpha_t20) <= 0.15`

5. **Computes aggregate stats:**
   - Average return (T+1, T+5, T+20)
   - Average alpha (T+1, T+5, T+20)
   - Win rate (% of events with positive alpha_t20)
   - Best case / worst case
   - Median return

#### Interface

```typescript
interface SimilarityQuery {
  eventType: string;          // e.g., 'earnings'
  eventSubtype?: string;      // e.g., 'beat', 'miss'
  ticker?: string;            // for same-company bonus
  sector?: string;            // e.g., 'Technology'
  severity?: string;          // filter: only same severity or higher
  // Context at event time:
  vixLevel?: number;
  marketRegime?: string;      // 'bull', 'bear', 'sideways', 'correction'
  return30d?: number;         // stock's 30d momentum
  marketCapTier?: string;
  // For earnings:
  epsSurprisePct?: number;
  consecutiveBeats?: number;
  // Options:
  limit?: number;             // default 10
  minScore?: number;          // default 0
}

interface SimilarityResult {
  events: SimilarEvent[];     // scored + sorted
  confidence: 'insufficient' | 'low' | 'medium' | 'high';
  stats: AggregateStats;
  totalCandidates: number;
}

interface SimilarEvent {
  eventId: string;
  ticker: string;
  headline: string;
  eventDate: string;
  score: number;
  scoreBreakdown: Record<string, number>;  // which factors contributed
  returnT1: number;
  returnT5: number;
  returnT20: number;
  alphaT5: number;
  alphaT20: number;
}

interface AggregateStats {
  count: number;
  avgReturnT1: number;
  avgReturnT5: number;
  avgReturnT20: number;
  avgAlphaT5: number;
  avgAlphaT20: number;
  winRateT20: number;        // % with positive alpha
  medianAlphaT20: number;
  bestCase: { ticker: string; alphaT20: number; headline: string };
  worstCase: { ticker: string; alphaT20: number; headline: string };
}
```

### 2. Query API Endpoints (`packages/backend/src/routes/historical.ts`)

Add Fastify routes:

#### `GET /api/historical/similar`
Query params map to `SimilarityQuery`. Returns `SimilarityResult`.

Example: `GET /api/historical/similar?eventType=earnings&eventSubtype=beat&sector=Technology&vixLevel=20&limit=10`

#### `GET /api/historical/events`
List/search historical events with filters.
- `?ticker=NVDA` — by ticker
- `?eventType=earnings` — by type
- `?from=2024-01-01&to=2025-01-01` — date range
- `?severity=high,critical` — severity filter
- `?limit=20&offset=0` — pagination

Returns: events with their stock context, market context, and returns.

#### `GET /api/historical/events/:id`
Single event with all related data (context, returns, metrics, sources).

#### `GET /api/historical/patterns`
List aggregated `event_type_patterns` — pre-computed pattern stats.

#### `GET /api/historical/stats`
Database summary: event counts by type, ticker, time range, coverage stats.

### 3. Tests

Write Vitest tests for:
- Similarity scoring logic (unit tests with mock data)
- Confidence level calculation
- Aggregate stats computation
- API endpoint integration tests (using test DB or mocked service)

## Technical Notes

- Use drizzle-orm for queries (already set up)
- The DB already has all the data populated — just query it
- For performance: the similarity scoring runs in JS after fetching candidates from DB. With ~2,400 events this is fast enough. No need for vector DB or embedding-based search.
- Use zod for request validation on API endpoints
- Follow existing patterns in `packages/backend/src/routes/` for route structure

## Files to Create
- `packages/backend/src/services/similarity.ts` — core matching engine
- `packages/backend/src/routes/historical.ts` — API routes
- `packages/backend/src/__tests__/similarity.test.ts` — unit tests

## Files to Modify
- `packages/backend/src/index.ts` or route registration — register new routes

## What NOT to Do
- Do NOT build a frontend — API only for now
- Do NOT implement real-time event processing — this is historical query only
- Do NOT add authentication (will come later)
- Do NOT modify the database schema
- Do NOT modify existing bootstrap scripts

## Verification

```bash
pnpm --filter @event-radar/backend build
pnpm --filter @event-radar/backend test
pnpm --filter @event-radar/backend lint
```

All must pass. Then create a PR.
