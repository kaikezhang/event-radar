# Technical Review — Alert Quality Redesign

## Verdict
**APPROVE WITH CHANGES**

The direction is correct: adding a final delivery-quality gate is the right place to reduce user-facing noise without destabilizing ingestion, storage, or classifier behavior. The current codebase can support this cleanly.

The plan is not ready to implement exactly as written, though. There are a few architectural mismatches and internal inconsistencies that need to be resolved first:

1. The proposed gate relies on an "enrichment confidence" field that does not exist today in the enrichment schema or prompt. Current confidence lives in classification and LLM judge paths, not enrichment. See [llm-types.ts](/tmp/er-review-codex/packages/shared/src/schemas/llm-types.ts#L85), [classification-prompt.ts](/tmp/er-review-codex/packages/backend/src/pipeline/classification-prompt.ts#L13), and [app.ts](/tmp/er-review-codex/packages/backend/src/app.ts#L954).
2. The plan uses `userWatchlist` inside `isNotableTicker()`, but the current Discord/Bark/Telegram delivery path is global. Per-user watchlists only exist in web-push/user APIs. See [web-push-channel.ts](/tmp/er-review-codex/packages/delivery/src/web-push-channel.ts#L112).
3. Routing is currently severity-based, and `shouldPush=false` only suppresses web push; it does not suppress Discord/Bark/Telegram/webhook. A gate implemented only inside the delivery package would not achieve the stated behavior. See [alert-router.ts](/tmp/er-review-codex/packages/delivery/src/alert-router.ts#L63).
4. The plan says "must have ticker", but its own "useful alerts" examples include macro/policy alerts like oil and Fed actions. A strict ticker-only rule changes product scope and will intentionally remove some alerts the plan itself considers valuable.

## Key Findings

### 1. Implementation feasibility
Feasible with moderate changes, but the exact pseudocode needs revision.

What fits well with the current code:
- There is already a clear insertion point after LLM enrichment and before delivery in [app.ts](/tmp/er-review-codex/packages/backend/src/app.ts#L836).
- The pipeline already persists enrichment into `event.metadata.llm_enrichment`, so audit/debugging is straightforward. See [app.ts](/tmp/er-review-codex/packages/backend/src/app.ts#L847).
- `pipeline_audit` already supports filtered outcomes with flexible `stopped_at` and `reason_category`, so a `delivery_gate` stage can be added without schema changes. See [schema.ts](/tmp/er-review-codex/packages/backend/src/db/schema.ts#L24) and [audit-log.ts](/tmp/er-review-codex/packages/backend/src/pipeline/audit-log.ts#L5).

What must change before implementation:
- The gate needs a real confidence source. Today the available candidates are:
  - classifier confidence: `result.confidence` in [app.ts](/tmp/er-review-codex/packages/backend/src/app.ts#L954)
  - classifier confidence bucket: `result.confidenceLevel` in [app.ts](/tmp/er-review-codex/packages/backend/src/app.ts#L955)
  - LLM judge confidence: stored in `event.metadata.llm_judge.confidence` in [app.ts](/tmp/er-review-codex/packages/backend/src/app.ts#L795)
  - enrichment action only: `🔴 / 🟡 / 🟢` in [llm-types.ts](/tmp/er-review-codex/packages/shared/src/schemas/llm-types.ts#L55)
- The pseudocode is internally inconsistent:
  - it says Monitor needs `confidence >= 0.8`, but the sample implementation always blocks Monitor events
  - it says direction is mandatory, but it still allows delivery when direction is missing if `action === 🔴 High-Quality Setup`

Recommended rule source of truth:
- Use enrichment for `tickers` and `action`
- Use classifier confidence as the numeric threshold
- Optionally use LLM judge confidence as a secondary veto for weak secondary-source events

### 2. Code architecture
`delivery-gate.ts` should live in `packages/backend/src/pipeline/`, not in `packages/delivery/`.

Reason:
- The gate needs raw event data, source-specific logic, audit logging, enrichment output, and likely config loading. That is pipeline logic, not channel-delivery logic.
- Current router semantics are channel routing by severity plus web-push gating, not content gating. See [alert-router.ts](/tmp/er-review-codex/packages/delivery/src/alert-router.ts#L26) and [push-policy.ts](/tmp/er-review-codex/packages/delivery/src/push-policy.ts#L17).

Recommended wiring:
1. `AlertFilter.check()`
2. `LLMGatekeeper.check()`
3. `LLMEnricher.enrich()`
4. `DeliveryGate.check()`
5. If blocked: audit `outcome='filtered'`, `stopped_at='delivery_gate'`, return
6. If allowed: continue to historical enrichment, market regime load, and `AlertRouter.route()`

I would place it before historical enrichment, not after. Historical enrichment is only used for delivery UX today; running it for events that will be dropped adds cost and latency with no user value. See [app.ts](/tmp/er-review-codex/packages/backend/src/app.ts#L869).

One extra change is needed for tiered delivery:
- Add an optional `deliveryTier?: 'critical' | 'high'` or `deliveryChannels?: ChannelName[]` to `AlertEvent`
- Update `AlertRouter` to honor that override instead of relying only on severity

Without that, a `HIGH` severity alert will still go to Bark/Telegram/webhook under the current routing table. See [alert-router.ts](/tmp/er-review-codex/packages/delivery/src/alert-router.ts#L35).

### 3. Notable ticker list
Do not hardcode the list inside `delivery-gate.ts`.

Best fit for the current repo:
- checked-in file: `packages/backend/src/config/notable-tickers.json`
- load once at startup or in `DeliveryGate` constructor
- expose constructor injection `notableTickers?: string[]` for tests

Why this fits:
- The repo already uses a checked-in JSON watchlist loaded from code in [alert-filter.ts](/tmp/er-review-codex/packages/backend/src/pipeline/alert-filter.ts#L70) with [watchlist.json](/tmp/er-review-codex/packages/backend/src/config/watchlist.json#L1)
- It avoids runtime network fetches
- It is trivial to mock in tests

Recommended file format:
- Start with a flat uppercase string array for simplicity
- Add a generator script later if needed

I would not mix "user watchlist" into this global notable list. User watchlists are currently only meaningful for per-user web push. See [web-push-channel.ts](/tmp/er-review-codex/packages/delivery/src/web-push-channel.ts#L128).

If the team wants source-specific behavior, a structured JSON shape is better:

```json
{
  "global": ["AAPL", "MSFT"],
  "sec": ["AAPL", "MSFT"],
  "halts": ["AAPL", "NVDA"]
}
```

That is still cheap to load once and avoids embedding policy into code branches.

### 4. Enrichment prompt changes
The goal is good; the proposed wording is too strong.

Current enrichment prompt allows empty `tickers` and treats enrichment as analyst-style summarization plus action labeling. See [llm-enricher.ts](/tmp/er-review-codex/packages/backend/src/pipeline/llm-enricher.ts#L55) and [llm-types.ts](/tmp/er-review-codex/packages/shared/src/schemas/llm-types.ts#L101).

Risk with "You MUST identify at least one specific US-listed ticker":
- macro/policy events will get hallucinated proxy tickers
- ambiguous or sector-wide events may get an overconfident single-name mapping
- the model may optimize for filling the schema instead of being honest

Better prompt change:
- "Identify directly impacted listed tickers when they are explicit or strongly implied."
- "Do not guess proxies, ETFs, or loosely related names."
- "Return `tickers: []` if there is no clear directly impacted listed ticker."
- "Prefer bullish/bearish, but keep `neutral` when the impact is genuinely unclear."

I would also consider using classifier direction as fallback context when enrichment returns no direction, because classifier already produces `BULLISH | BEARISH | NEUTRAL | MIXED`. See [classification-prompt.ts](/tmp/er-review-codex/packages/backend/src/pipeline/classification-prompt.ts#L13).

### 5. Discord embed redesign
Yes, the redesign is an improvement. The current embed is overloaded. See [discord-webhook.ts](/tmp/er-review-codex/packages/delivery/src/discord-webhook.ts#L70).

Good changes:
- lead with ticker + direction + confidence
- compress analysis into "why it matters" and "risk"
- remove repeated disclaimer from every card
- keep source and timestamp easy to scan

What I would preserve from the current version:
- source link
- filing items for SEC alerts when present
- optional historical stats for high-confidence alerts

Recommended rendering strategy:
- top line: `BA | Bullish | High confidence`
- title/body: event headline
- field 1: `Why it matters`
- field 2: `Risk`
- field 3: `Source / time`
- optional field 4: historical pattern only for `critical` tier

Do not make historical/regime blocks mandatory. Those fields are valuable, but not every alert will have high-quality supporting data.

### 6. Testing strategy
This needs both deterministic tests and a shadow-mode rollout.

Minimum test plan:
- unit tests for `delivery-gate.ts`
  - no ticker
  - enrichment missing
  - neutral-only directions
  - red/high-confidence pass
  - monitor/low-confidence block
  - notable vs non-notable trading halts
  - notable vs non-notable 8-Ks
  - fallback to `event.metadata.ticker`
- integration tests in `packages/backend/src/__tests__/`
  - event reaches enrichment, gets blocked by delivery gate, router not called
  - event passes gate and routes with correct tier override
  - audit row recorded with `stopped_at='delivery_gate'`
- delivery tests in `packages/delivery/src/__tests__/`
  - router honors tier/channel override
  - Discord embed renders the compact format correctly

Before enforcing, add `DELIVERY_GATE_MODE=shadow|enforce`.

Shadow mode is important because it lets you:
- compute how many currently delivered alerts would be blocked
- inspect false negatives
- compare blocked vs delivered events against actual price outcomes later

The existing `pipeline_audit` and outcome tracking make this practical.

### 7. Backward compatibility
No hard DB/API break is required, but there are meaningful behavioral changes.

Safe/additive:
- new backend module
- new audit `stopped_at` value
- optional new `AlertEvent.deliveryTier`

Behavioral risks:
- sharp drop in delivered volume will affect dashboards and delivery-rate expectations
- `HealthMonitorService` currently alerts when there are zero deliveries in 24h during trading hours; with a stricter gate, that may become normal rather than an outage. See [health-monitor.ts](/tmp/er-review-codex/packages/backend/src/services/health-monitor.ts#L34)
- if enrichment is disabled, times out, or returns invalid JSON, a strict fail-closed gate could suppress almost everything

Recommended fallback policy:
- initial rollout should fail open on enrichment outage
- only fail closed when enrichment exists and explicitly signals low quality

### 8. Alternative approaches worth considering
- Reuse more of the existing routing policy instead of replacing it. The current push policy already combines enrichment action, classifier confidence bucket, and historical support in [push-policy.ts](/tmp/er-review-codex/packages/delivery/src/push-policy.ts#L17). The redesign should extend that logic, not fork it into a competing second policy.
- Add cheap source-specific deterministic gating before historical enrichment:
  - trading halts: notable-ticker requirement
  - SEC 8-K: notable-ticker requirement for routine items only
  - this saves latency and LLM spend
- Reuse the existing dedup/story-group machinery before building a new semantic dedup rule. There is already dedup at ingest and story grouping by ticker/time/title similarity in [app.ts](/tmp/er-review-codex/packages/backend/src/app.ts#L562) and [story-group.ts](/tmp/er-review-codex/packages/backend/src/services/story-group.ts#L33).
- If macro/policy alerts remain part of the product, expand the delivery identifier model beyond single-stock tickers:
  - ETF tickers
  - sector identifiers
  - index/futures symbols
  - otherwise the new rule will intentionally remove some high-value alerts

## Recommended Plan Changes Before Implementation
1. Define the gate’s numeric confidence source explicitly. My recommendation: classifier confidence, not enrichment confidence.
2. Put `delivery-gate.ts` in `packages/backend/src/pipeline/`.
3. Run the gate immediately after LLM enrichment and before historical enrichment.
4. Add an optional delivery-tier override to `AlertEvent` and teach `AlertRouter` to use it.
5. Store notable tickers in checked-in JSON loaded once at startup.
6. Use shadow mode first.
7. Clarify product scope on macro alerts: are ticker-less but important macro/policy events still in, or explicitly out?

If those changes are made, the redesign is cleanly implementable in the current codebase and should materially improve user-facing alert quality.
