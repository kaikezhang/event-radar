# Current Task: Feed Quality — Hybrid L1/L2 Filter + LLM Judge Upgrade

## Context

The current alert pipeline filters too aggressively (0 events delivered ever). Two independent reviews (CC + Codex) agreed on a **hybrid L1 deterministic + L2 LLM** approach instead of the originally proposed "pure LLM Judge" strategy.

Reviews are at:
- `docs/REVIEW-CC-FEED-STRATEGY.md`
- `docs/REVIEW-CODEX-FEED-STRATEGY.md`
- `docs/FEED-STRATEGY.md` (original proposal)

## Deliverables

### 1. Rewrite LLM Gatekeeper → LLM Judge (`packages/backend/src/pipeline/llm-gatekeeper.ts`)

Transform the current simple PASS/BLOCK gatekeeper into a smarter LLM Judge:

**New prompt requirements:**
- Add **few-shot examples** (4-5: clear pass, clear block, edge cases)
- Add **market session context** in the prompt: `RTH | PRE | POST | CLOSED` (derive from current ET time)
- Add **source reliability tier**: primary/government vs secondary/aggregator
- Add **event age** in minutes
- Add **input sanitization**: wrap event content in XML tags with anti-injection instruction
- Output remains simple `PASS|BLOCK <confidence> <reason>` format (don't overcomplicate with JSON scores)

**New operational features:**
- **Circuit breaker**: After 3 consecutive LLM failures, fall back to rule-based filter for 60s, then retry
- **Per-source rate limiter**: Max 20 LLM calls per source per 10-minute window (prevents scanner bug cost spikes)
- Log all decisions with full context for observability

**Helper function needed:**
```typescript
function getMarketSession(): 'RTH' | 'PRE' | 'POST' | 'CLOSED' {
  // Use America/New_York timezone
  // RTH: Mon-Fri 9:30-16:00 ET
  // PRE: Mon-Fri 4:00-9:30 ET  
  // POST: Mon-Fri 16:00-20:00 ET
  // CLOSED: weekends, holidays, overnight
}
```

### 2. Modify Alert Filter — Remove Keyword Filter, Keep Useful Rules (`packages/backend/src/pipeline/alert-filter.ts`)

**REMOVE:**
- `BREAKING_KEYWORDS` array and the keyword-match check for breaking news
- `PRIMARY_SOURCES` bypass (all sources now go through the same flow)

**KEEP (these are cheap, fast, and accurate):**
- `RETROSPECTIVE_PATTERNS` regex filter — catches "Why X stock dropped" etc. with ~0% false positive
- `CLICKBAIT_PATTERNS` regex filter
- Ticker cooldown (60 min per ticker)
- Insider trade $1M minimum value filter
- Social engagement thresholds (but raise them: upvotes 500→1000, comments 200→500)
- Staleness check — but unify to 2h for all sources

**MODIFY:**
- Remove the primary/secondary source distinction for staleness
  - Currently: primary 24h, secondary 1h
  - New: all sources 2h during market hours, extend to "next tradable session" for overnight/weekend events
- Make staleness session-aware using `getMarketSession()`

### 3. Modify Pipeline to Route All Sources Through LLM Judge (`packages/backend/src/app.ts`)

Currently the LLM gatekeeper only runs on secondary sources. Change to:
- L1 deterministic filters run on ALL events (retrospective, clickbait, staleness, cooldown, social threshold)
- Events that PASS L1 go to L2 LLM Judge (regardless of source)
- If LLM Judge circuit breaker is open → fall back to conservative pass-through for primary sources, block for secondary

The pipeline flow becomes:
```
Scanner → Dedup → L1 Filter (fast rules) → L2 LLM Judge → Enrich → Deliver
```

### 4. Add `/api/v1/feed` Endpoint (`packages/backend/src/routes/dashboard.ts`)

New public endpoint for the web app:
- `GET /api/v1/feed?limit=50&before=<cursor>&ticker=<symbol>`
- Returns events from `pipeline_audit` where `outcome = 'delivered'`
- Join with `events` table for full event data
- No API key required (public feed)
- Response shape:
```json
{
  "events": [
    {
      "id": "uuid",
      "title": "...",
      "source": "...",
      "severity": "CRITICAL|HIGH|MEDIUM",
      "tickers": ["NVDA"],
      "summary": "...",
      "url": "...",
      "time": "ISO timestamp",
      "category": "policy|macro|corporate|geopolitics|other",
      "llmReason": "why this was pushed"
    }
  ],
  "cursor": "next-page-cursor",
  "total": 42
}
```

### 5. Update Web App to Use `/api/v1/feed` (`packages/web/src/lib/api.ts`)

Replace the current hacky `getFeed()` that fetches from `/api/events` with a clean call to `/api/v1/feed`.

### 6. Tests

- Unit tests for `getMarketSession()` — test all 4 sessions + edge cases (9:29 vs 9:30, 16:00 vs 16:01)
- Unit tests for circuit breaker logic in LLM Judge
- Unit tests for the new staleness rules (session-aware)
- Update existing `alert-filter.test.ts` to reflect removed keyword filter and updated thresholds
- Integration test for `/api/v1/feed` endpoint

## Technical Notes

- LLM provider: use existing `LLMProvider` interface and `OPENAI_DIRECT_API_KEY` env var
- LLM model: `gpt-4o-mini` (fast, cheap, good enough for classification)
- Existing tests: 904 tests across the project, all must continue passing
- TypeScript strict mode, ESM with `.js` extensions
- Run `pnpm test` before creating PR — all tests must pass
- Create PR to main branch, do NOT merge

## Files to Modify

1. `packages/backend/src/pipeline/llm-gatekeeper.ts` — major rewrite
2. `packages/backend/src/pipeline/alert-filter.ts` — remove keyword filter, update thresholds
3. `packages/backend/src/app.ts` — route all sources through LLM Judge
4. `packages/backend/src/routes/dashboard.ts` — add `/api/v1/feed`
5. `packages/web/src/lib/api.ts` — use `/api/v1/feed`
6. `packages/backend/src/__tests__/alert-filter.test.ts` — update for new rules
7. New: `packages/backend/src/__tests__/llm-judge.test.ts`
8. New: `packages/backend/src/__tests__/feed-api.test.ts`
