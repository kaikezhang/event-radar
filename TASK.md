# Current Task: D.3 — Smart Alert Filter (AI-Powered Alert Gate)

## Problem
All scanner events are pushed to Discord/Bark, causing alert fatigue. Need an intelligent filter layer that only pushes truly relevant, actionable events.

## Architecture

```
Scanner → DB (store ALL events) → SmartAlertFilter → Delivery (only important ones)
                                       |
                              Layer 1: Rule-based filter (free, fast)
                              Layer 2: LLM enrichment (Claude API, only for L1 survivors)
```

## Layer 1: Rule-Based Pre-Filter (zero cost)

Create `packages/backend/src/pipeline/alert-filter.ts`:

### Filter Rules:
1. **Dedup cooldown**: Same ticker → max 1 alert per hour
2. **Reddit/StockTwits social noise filter**:
   - Only pass posts with `high_engagement: true` (>500 upvotes OR >200 comments within 2h)
   - OR posts mentioning a watchlist ticker with >100 upvotes
3. **Breaking News**: Only pass if contains a known ticker OR keywords like "crash", "surge", "halt", "FDA approval", "acquisition", "bankruptcy", "tariff", "fed rate"
4. **Routine events skip**: Skip dummy scanner events entirely from delivery
5. **Earnings/FDA calendar**: Only push if it's today or tomorrow (not weeks away)
6. **Congress trades**: Always pass (these are always interesting)
7. **Insider trades**: Always pass if value > $1M
8. **Options unusual activity**: Always pass (already pre-filtered by scanner)

### Config:
- Watchlist tickers loaded from `packages/backend/src/config/watchlist.json`
- Create default watchlist: `["NVDA", "TSLA", "AAPL", "MSFT", "AMZN", "GOOG", "META", "AMD", "PLTR", "SMCI", "ARM", "AVGO", "TSM", "MSTR", "COIN"]`
- Filter rules configurable via env vars (e.g., `SOCIAL_MIN_UPVOTES=500`)

### Interface:
```typescript
interface FilterResult {
  pass: boolean;        // Should this event be delivered?
  reason: string;       // Why passed/blocked (for logging)
  enrichWithLLM: boolean; // Should Layer 2 process this?
}
```

## Layer 2: LLM Enrichment (Claude API, only ~10-30 events/day)

Create `packages/backend/src/pipeline/llm-enricher.ts`:

### Use Anthropic Claude API directly:
- Model: `claude-sonnet-4-20250514` (fast + cheap)
- API Key from env: `ANTHROPIC_API_KEY`
- Use `@anthropic-ai/sdk` npm package

### For each event that passes Layer 1:
Send to Claude with this prompt structure:
```
You are a stock market event analyst. Analyze this event and provide:
1. A concise 1-2 sentence summary (in Chinese, 简洁有力)
2. Impact analysis: why this matters for investors (1-2 sentences, Chinese)  
3. Suggested action: one of [🔴 立即关注, 🟡 持续观察, 🟢 仅供参考]
4. Affected tickers and expected direction (bullish/bearish/neutral)

Event: {title}
Details: {body}
Source: {source}
Metadata: {metadata}
```

### Response format:
```typescript
interface LLMEnrichment {
  summary: string;          // AI-generated Chinese summary
  impact: string;           // Why it matters
  action: '🔴 立即关注' | '🟡 持续观察' | '🟢 仅供参考';
  tickers: Array<{ symbol: string; direction: 'bullish' | 'bearish' | 'neutral' }>;
}
```

### Error handling:
- If LLM fails, still deliver the event but with original title/body (no enrichment)
- Timeout: 10 seconds per request
- Log LLM usage for cost tracking

## Layer 3: Smart Delivery Format

Modify `packages/delivery/src/discord-webhook.ts`:

### Enhanced Discord embed (when LLM enrichment available):
```
Title: 🔴 [action emoji] AI Summary
Description: Impact analysis
Fields:
  - Tickers: NVDA 📈, TSLA 📉
  - Source: [link]
  - Action: 立即关注
Footer: Event Radar • AI Enhanced • {severity}
```

### Bark push (when LLM enrichment available):
- Title: action + first ticker
- Body: AI summary (not raw title)

## Integration Point

In `app.ts`, modify the EventBus → AlertRouter subscription:

```typescript
// BEFORE: eventBus → classify → dedup → alertRouter
// AFTER:  eventBus → classify → dedup → alertFilter(L1) → llmEnricher(L2) → alertRouter
```

Only events where `filterResult.pass === true` reach the AlertRouter.
Events where `filterResult.enrichWithLLM === true` get LLM processing first.

## Environment Variables
```
# Smart Alert Filter
ALERT_FILTER_ENABLED=true
SOCIAL_MIN_UPVOTES=500
SOCIAL_MIN_COMMENTS=200
TICKER_COOLDOWN_MINUTES=60
INSIDER_MIN_VALUE=1000000

# LLM Enrichment (Claude)
ANTHROPIC_API_KEY=<from Claude Max subscription>
LLM_ENRICHMENT_ENABLED=true
LLM_MODEL=claude-sonnet-4-20250514
LLM_TIMEOUT_MS=10000
```

## Files to Create/Modify
- CREATE: `packages/backend/src/pipeline/alert-filter.ts`
- CREATE: `packages/backend/src/pipeline/llm-enricher.ts` 
- CREATE: `packages/backend/src/config/watchlist.json`
- CREATE: `packages/backend/src/__tests__/alert-filter.test.ts`
- MODIFY: `packages/backend/src/app.ts` (wire filter into pipeline)
- MODIFY: `packages/delivery/src/discord-webhook.ts` (enhanced embed format)
- MODIFY: `packages/delivery/src/bark-pusher.ts` (use AI summary)
- MODIFY: `packages/delivery/src/types.ts` (add enrichment to AlertEvent)

## Testing
- Unit tests for alert-filter rules
- Verify: dummy events are filtered out
- Verify: low-engagement social posts are filtered out
- Verify: high-impact events pass through with LLM enrichment
- `pnpm --filter @event-radar/backend test` passes
- `pnpm --filter @event-radar/backend build` succeeds

## Git
- Branch: `feat/smart-alert-filter`
- Commit, push, create PR
- **DO NOT merge. DO NOT run gh pr merge.**
