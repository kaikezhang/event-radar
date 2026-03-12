# TASK.md — Historical Intelligence ↔ Real-time Pipeline Integration

## Goal

Connect the historical similarity engine (2,400+ events) to the real-time event pipeline so that every alert pushed to users includes historical context: "What happened last time something like this occurred?"

## Architecture Overview

```
Current pipeline (app.ts):
Scanner → EventBus → classify → dedup → LLM classify → store → alert filter → LLM enrich → AlertRouter → push

After this task:
Scanner → EventBus → classify → dedup → LLM classify → store → alert filter → LLM enrich
  → [NEW] Historical Enricher → AlertRouter → push (with historical context)
```

The Historical Enricher slots in **after the alert filter and LLM enrichment, right before delivery**. This is critical — we only run the multi-join similarity DB query on events that will actually be delivered, not on every non-duplicate event. It:
1. Maps the real-time event to a `SimilarityQuery`
2. Calls `findSimilarEvents()` from `services/similarity.ts`
3. Attaches `HistoricalContext` to the `AlertEvent`
4. Delivery channels format the context into the alert message

---

## PR 1: Market Context Cache + Historical Enricher + Delivery Upgrade

### 1A. Market Context Cache (`services/market-context-cache.ts`)

A cache that holds real-time market data needed for similarity queries.

```typescript
export interface MarketSnapshot {
  vixLevel: number;
  spyClose: number;
  spy50ma: number;
  spy200ma: number;
  marketRegime: 'bull' | 'bear' | 'sideways' | 'correction';
  updatedAt: Date;
}

export class MarketContextCache {
  private snapshot: MarketSnapshot | null = null;
  private refreshIntervalMs: number; // default 300_000 (5 min)
  private timer: NodeJS.Timeout | null = null;

  constructor(config?: { refreshIntervalMs?: number });

  /** Start periodic refresh. Calls refresh() on interval, but does NOT await initial refresh (non-blocking). Call once at app startup. */
  start(): void;

  /** Stop periodic refresh. Call on shutdown. */
  stop(): void;

  /** Get current snapshot (may be null if first refresh hasn't completed yet). Callers must handle null gracefully. */
  get(): MarketSnapshot | null;

  /** Force refresh now. */
  refresh(): Promise<void>;
}
```

**Market regime logic:**
- `bull`: SPY > 200MA AND SPY > 50MA
- `bear`: SPY < 200MA AND SPY < 50MA
- `correction`: SPY > 200MA AND SPY < 50MA (pullback in uptrend)
- `recovery`: SPY < 200MA AND SPY > 50MA (rally in downtrend — renamed from "sideways" which was misleading)

**Data source:** Use Yahoo Finance chart API directly (not through PriceService — its cache key includes timestamps that change every call, causing cache misses on periodic refreshes). Fetch SPY and ^VIX daily bars. Snap date boundaries to start-of-day UTC to enable simple internal caching. Store the raw 200-day bars internally and only re-fetch when `updatedAt` is stale (> refreshIntervalMs).

### 1B. Event Type Mapper (`pipeline/event-type-mapper.ts`)

Maps real-time `RawEvent` + LLM classification into a `SimilarityQuery`.

```typescript
export interface MappedEventContext {
  eventType: string;          // mapped to historical event_type
  eventSubtype?: string;      // e.g., 'beat', 'miss', '5.02'
  ticker?: string;
  sector?: string;
  severity?: string;
  // From market context cache:
  vixLevel?: number;
  marketRegime?: string;
  // From event metadata (if available):
  epsSurprisePct?: number;
  consecutiveBeats?: number;
}

export function mapEventToSimilarityQuery(
  event: RawEvent,
  llmResult?: LlmClassificationResult,
  marketSnapshot?: MarketSnapshot,
): MappedEventContext | null;
```

**Mapping rules:**

| Real-time Source | `event.source` | Mapping Logic |
|-----------------|----------------|---------------|
| SEC EDGAR | `sec-edgar` | Map Item numbers to historical types (same as bootstrap-8k classification). Item 2.02→earnings, 5.02→leadership_change, 1.01→contract_material, etc. |
| Earnings Scanner | `earnings` | `eventType: 'earnings'`, subtype from metadata (beat/miss/meet) |
| Breaking News | `breaking-news` | Use `llmResult.eventType` if available. If title contains "earnings"/"revenue"/"EPS" → earnings. Otherwise use LLM eventType or skip. **Note:** when querying earnings-related events, search both `earnings` AND `earnings_results` types (the 8-K bootstrap mapped Item 2.02 as `earnings_results`). |
| StockTwits | `stocktwits` | **Skip** — trending data has no historical analog |
| Reddit | `reddit` | Use `llmResult.eventType` if available, else skip |
| Truth Social | `truth-social` | **Skip for now** — no political events in historical DB yet |
| Analyst | `analyst` | **Skip for now** — no analyst rating events in historical DB yet |
| Econ Calendar | `econ-calendar` | **Skip for now** — no macro events in historical DB yet |
| FDA | `fda` | **Skip for now** — historical schema has `metrics_fda` but no bootstrapped data yet. TODO: Bootstrap FDA events in Phase 3. |
| Congress | `congress` | **Skip for now** — no congressional trading events in historical DB yet |
| DOJ | `doj-antitrust` | **Skip for now** — no antitrust events bootstrapped |
| WhiteHouse | `whitehouse` | **Skip for now** — could map to political events in future |
| Others | * | Use `llmResult.eventType` if it matches a known historical type, else skip |

**Known historical event types** (from DB): `earnings`, `leadership_change`, `other_material`, `regulation_fd`, `earnings_results`, `contract_material`, `shareholder_vote`, `bankruptcy`, `acquisition_disposition`, `delisting`, `auditor_change`, `restructuring`, `off_balance_sheet`

**Ticker extraction:** `event.metadata?.ticker` (already extracted by most scanners). If missing, try to extract from title using the existing `ticker-extractor.ts`.

**Sector lookup:** Query `companies` table by ticker. Use a simple in-memory `Map<string, string>` (no eviction needed — sectors don't change, and even 2,000 entries use trivial memory). Pre-warm with all tickers from `companies` table at startup.

### 1C. Historical Enricher (`pipeline/historical-enricher.ts`)

The main integration point that ties everything together.

```typescript
export interface HistoricalContext {
  matchCount: number;
  confidence: 'insufficient' | 'low' | 'medium' | 'high';
  avgAlphaT5: number;
  avgAlphaT20: number;
  winRateT20: number;        // percentage
  medianAlphaT20: number;
  bestCase?: { ticker: string; alphaT20: number; headline: string };  // nullable when few matches
  worstCase?: { ticker: string; alphaT20: number; headline: string };  // nullable when few matches
  topMatches: Array<{
    ticker: string;
    headline: string;
    eventDate: string;
    alphaT20: number;
    score: number;
  }>;  // top 3 most similar
  patternSummary: string;  // human-readable 1-liner, e.g., "Tech earnings beat in bull market: +12% avg alpha T+20, 68% win rate (15 cases)"
}

export class HistoricalEnricher {
  constructor(
    private db: Database,
    private marketCache: MarketContextCache,
    private config?: { enabled?: boolean; minConfidence?: ConfidenceLevel; timeoutMs?: number },
  );

  /**
   * Enrich a real-time event with historical context.
   * Returns null if:
   *   - Enricher is disabled
   *   - Event cannot be mapped to a historical type
   *   - Similarity search returns 'insufficient' confidence
   *   - Timeout exceeded
   */
  async enrich(
    event: RawEvent,
    llmResult?: LlmClassificationResult,
  ): Promise<HistoricalContext | null>;
}
```

**Configuration:**
- `HISTORICAL_ENRICHMENT_ENABLED` env var (default: `true`)
- `HISTORICAL_MIN_CONFIDENCE` env var (default: `low` — skip 'insufficient')
- `HISTORICAL_TIMEOUT_MS` env var (default: `2000` — don't slow down alerts)

**Timeout implementation** — use `Promise.race` to enforce the timeout:
```typescript
async enrich(event: RawEvent, llmResult?: LlmClassificationResult): Promise<HistoricalContext | null> {
  if (!this.config.enabled) return null;
  try {
    return await Promise.race([
      this.doEnrich(event, llmResult),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), this.config.timeoutMs)),
    ]);
  } catch (err) {
    console.error('[historical-enricher] Error:', err instanceof Error ? err.message : err);
    return null;
  }
}
```
Add a Prometheus counter `historical_enrichment_timeouts_total` to track timeout frequency.

**Pattern summary generation** (in JS, not LLM — fast and free):
```
"{Sector} {eventType} {subtype} in {regime} market: {sign}{avgAlpha}% avg alpha T+20, {winRate}% win rate ({count} cases)"
```
Example: `"Technology earnings beat in correction: +8.3% avg alpha T+20, 62% win rate (18 cases)"`

**Unit conventions (important!):**
- `avgAlphaT5`, `avgAlphaT20`, `medianAlphaT20` are in **decimal form** (e.g., 0.083 = +8.3%). Multiply by 100 when displaying.
- `winRateT20` is in **percentage form** (e.g., 62.0 = 62%). Display as-is.
- Pattern summary and all display code must handle this correctly.

### 1D. Extend AlertEvent Type (`packages/shared` or `packages/delivery`)

Add `historicalContext?: HistoricalContext` to `AlertEvent` interface in `packages/delivery/src/types.ts`:

```typescript
export interface AlertEvent {
  readonly event: RawEvent;
  readonly severity: Severity;
  readonly ticker?: string;
  readonly enrichment?: LLMEnrichment;
  readonly historicalContext?: HistoricalContext;  // NEW
}
```

### 1E. Upgrade Discord Embed (`packages/delivery/src/discord-webhook.ts`)

When `alert.historicalContext` is present and confidence is not 'insufficient':

Add a new embed field after the existing fields:

```typescript
// Historical context field
if (alert.historicalContext && alert.historicalContext.confidence !== 'insufficient') {
  const ctx = alert.historicalContext;
  const sign = ctx.avgAlphaT20 >= 0 ? '+' : '';
  
  let historyText = `**${ctx.patternSummary}**\n`;
  historyText += `Avg Alpha T+20: ${sign}${(ctx.avgAlphaT20 * 100).toFixed(1)}% | `;
  historyText += `Win Rate: ${ctx.winRateT20.toFixed(0)}%\n`;
  
  if (ctx.topMatches.length > 0) {
    historyText += `Most Similar: ${ctx.topMatches[0].ticker} ${ctx.topMatches[0].headline}\n`;
  }
  if (ctx.worstCase) {
    const ws = ctx.worstCase.alphaT20 >= 0 ? '+' : '';
    historyText += `Worst Case: ${ctx.worstCase.ticker} (${ws}${(ctx.worstCase.alphaT20 * 100).toFixed(1)}%)`;
  }

  fields.push({
    name: `📊 Historical Pattern (${ctx.matchCount} cases, ${ctx.confidence.toUpperCase()})`,
    value: truncate(historyText, 1024),
    inline: false,
  });
}
```

### 1F. Upgrade Telegram (`packages/delivery/src/telegram.ts`)

Append historical context as markdown text (Telegram supports markdown):
```
📊 {matchCount} similar cases ({confidence}): avg alpha {avgAlphaT20}%, win rate {winRateT20}%
```

### 1G. Upgrade Bark Push (`packages/delivery/src/bark-pusher.ts`)

Bark messages are short (iOS notification). Append pattern summary to body:

```
[existing title]
[existing body]
📊 18 similar cases: +12% avg alpha, 68% win rate
```

### 1H. Pipeline Integration (`packages/backend/src/app.ts`)

**IMPORTANT: The enricher goes AFTER the alert filter check AND after LLM enrichment, right before `alertRouter.route()`.** This ensures we only run the expensive DB query on events that will actually be delivered. Looking at the current app.ts flow:

```
Step 6: store to DB
Step 7: alert filter check → if blocked, return
        LLM enrich
        [NEW] Historical enrich ← INSERT HERE
        alertRouter.route() → deliver
```

```typescript
// After LLM enrichment, before delivery:
let historicalContext: HistoricalContext | undefined;
if (historicalEnricher) {
  historicalContext = await historicalEnricher.enrich(
    event, llmResult?.ok ? llmResult.value : undefined
  ) ?? undefined;
  // enrich() handles its own errors and timeout internally — always returns null on failure
}

const results = await alertRouter.route({
  event,
  severity: result.severity,
  ticker,
  enrichment,
  historicalContext,  // NEW
});
```

Initialize in `buildApp()`:
```typescript
const marketCache = new MarketContextCache({ refreshIntervalMs: 300_000 });
// Non-blocking initial refresh — don't make buildApp() depend on Yahoo Finance being up
marketCache.start();  // start() triggers first refresh internally, then repeats on interval

const historicalEnricher = new HistoricalEnricher(db, marketCache, {
  enabled: process.env.HISTORICAL_ENRICHMENT_ENABLED !== 'false',
});
```

Add cleanup on shutdown:
```typescript
server.addHook('onClose', async () => {
  marketCache.stop();
});
```

---

## Tests

### Unit Tests (`__tests__/historical-enricher.test.ts`)
- Event type mapping: SEC EDGAR items → correct historical types
- Event type mapping: earnings scanner → earnings beat/miss
- Event type mapping: breaking-news with LLM result → correct type
- Event type mapping: stocktwits → returns null (skipped)
- Similarity query construction with full market context
- Similarity query construction with missing fields (graceful)
- Pattern summary generation
- Timeout handling (enricher returns null, doesn't block)
- Disabled enricher returns null

### Unit Tests (`__tests__/market-context-cache.test.ts`)
- Regime detection: bull, bear, correction, sideways
- Cache returns null before first refresh
- Cache refresh updates snapshot
- Periodic refresh timer

### Integration Test
- Mock event → historical enricher → Discord embed contains pattern

---

## Files to Create
- `packages/backend/src/services/market-context-cache.ts`
- `packages/backend/src/pipeline/event-type-mapper.ts`
- `packages/backend/src/pipeline/historical-enricher.ts`
- `packages/backend/src/__tests__/historical-enricher.test.ts`
- `packages/backend/src/__tests__/market-context-cache.test.ts`

## Files to Modify
- `packages/delivery/src/types.ts` — add `historicalContext` to `AlertEvent`
- `packages/delivery/src/discord-webhook.ts` — render historical context in embed
- `packages/delivery/src/bark-pusher.ts` — append pattern summary
- `packages/delivery/src/telegram.ts` — append pattern summary (markdown)
- `packages/backend/src/app.ts` — initialize enricher + integrate into pipeline (AFTER alert filter, before delivery)
- `packages/delivery/src/__tests__/discord-webhook.test.ts` — test new embed format

## What NOT to Do
- Do NOT use LLM for pattern summary (use string templates — fast and free)
- Do NOT block the alert pipeline if similarity search is slow (timeout + catch)
- Do NOT modify the historical DB schema
- Do NOT modify the similarity engine itself
- Do NOT add new event types to the historical DB (that's future bootstrap work)
- Do NOT build a frontend

## Verification

```bash
pnpm build
pnpm --filter @event-radar/backend test
pnpm --filter @event-radar/delivery test
pnpm --filter @event-radar/backend lint
```

All must pass. Then create a PR.
