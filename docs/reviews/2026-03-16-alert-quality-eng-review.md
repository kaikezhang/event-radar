# Engineering Review: Alert Quality Redesign

> Reviewer: Codex (Paranoid Eng lens) | Date: 2026-03-16 | Plan: `docs/plans/2026-03-16-alert-quality-redesign.md`
> Status: BLOCK

---

### Critical (must fix before implementation)

**1. [Delivery Gate] Enrichment failure becomes silent alert loss**

The proposed gate makes `LLMEnrichment` mandatory for delivery, but the current enricher is explicitly best-effort. `LLMEnricher.enrich()` returns `null` when the client is unavailable, the request times out, OpenAI returns empty content, JSON parsing fails, schema validation fails, or any exception is thrown (`packages/backend/src/pipeline/llm-enricher.ts:117-169`). The app currently treats that as non-fatal and still routes the alert (`packages/backend/src/app.ts:836-859`, `packages/backend/src/app.ts:941-959`).

If you add the gate exactly as proposed (`docs/plans/2026-03-16-alert-quality-redesign.md:72-98`), a transient LLM outage turns into a recall cliff: high-value alerts stop delivering with no fallback path. The LLM Judge already has a circuit breaker and degraded-mode behavior (`packages/backend/src/pipeline/llm-gatekeeper.ts:211-219` plus `packages/backend/src/app.ts:748-833`). The new gate has none.

**Fix**: The gate needs an explicit degraded-mode policy before rollout:
- `enrichment_unavailable` must be a first-class state, not an implicit block.
- Add a circuit breaker / fail-open policy for primary sources or high-severity deterministic events.
- Audit and metric this separately from true policy blocks.

---

**2. [Confidence] The plan gates on a confidence field that does not exist**

The plan repeatedly says "confidence >= 0.7 / 0.8 / 0.85" (`docs/plans/2026-03-16-alert-quality-redesign.md:42`, `docs/plans/2026-03-16-alert-quality-redesign.md:86-98`, `docs/plans/2026-03-16-alert-quality-redesign.md:191-193`). But `LLMEnrichmentSchema` has no confidence field at all; it only contains summary/impact/action/tickers/regimeContext (`packages/shared/src/schemas/llm-types.ts:85-109`). `AlertEvent` also has no enrichment-confidence slot (`packages/delivery/src/types.ts:50-69`).

Today, all delivery confidence logic uses the classification/judge confidence bucket, not enrichment confidence (`packages/delivery/src/push-policy.ts:17-27`, `packages/delivery/src/push-policy.ts:69-76`). That is a different signal. Classification confidence answers "how sure are we about the event classification," not "how sure are we about this ticker-specific bullish/bearish read."

As written, the sample gate actually blocks every `🟡 Monitor` event unconditionally because there is no confidence value to test (`docs/plans/2026-03-16-alert-quality-redesign.md:94-98`).

**Fix**: Define the confidence contract before coding:
- Decide whether confidence comes from classifier, judge, enricher, or a new combined score.
- Extend the shared schema and `AlertEvent` type explicitly.
- Persist it to audit/DB and define which component owns it.

---

**3. [Prompt Design] "MUST identify a US-listed ticker" will cause hallucinations**

The current enricher prompt allows `tickers` to be empty (`packages/backend/src/pipeline/llm-enricher.ts:55-81`). The redesign changes that to "You MUST identify at least one specific US-listed ticker symbol" and says empty tickers means the event will not be sent (`docs/plans/2026-03-16-alert-quality-redesign.md:144-153`).

That is exactly how you get fabricated symbols and fake proxy mappings:
- macro shocks get mapped to `SPY`/`QQQ`
- private-company news gets mapped to a loosely related public comp
- regulatory/sector events get forced onto the most obvious megacap

The pressure gets worse because the same prompt also says neutral should be rare (`docs/plans/2026-03-16-alert-quality-redesign.md:151-152`). You are incentivizing the model to output false certainty to avoid suppression.

This is especially dangerous because the classifier already produces `direction` and `confidence` (`packages/backend/src/pipeline/classification-prompt.ts:13-20`). The plan introduces a second independent direction system without defining precedence when classifier and enricher disagree.

**Fix**:
- Keep "no ticker found" as an acceptable output.
- Prefer deterministic ticker extraction / mapping before asking the LLM.
- Define conflict resolution between classifier direction and enrichment ticker directions.

---

**4. [Scope Regression] The new ticker requirement contradicts the current product scope**

The current LLM Judge explicitly treats unscheduled macro and government shocks as core PASS cases: sanctions, tariffs, executive orders, macro data, geopolitical shocks (`packages/backend/src/pipeline/llm-gatekeeper.ts:113-119`). The plan itself lists "oil price breaks $100" and "Fed lowers bank capital requirements" as examples of useful alerts (`docs/plans/2026-03-16-alert-quality-redesign.md:18`, `docs/plans/2026-03-16-alert-quality-redesign.md:48-49`).

Those events often do not have one clean single-stock ticker. A hard "must have ticker or block" rule (`docs/plans/2026-03-16-alert-quality-redesign.md:73-78`) silently changes the product from "event radar" to "single-stock alerting only." That may be a valid product choice, but it is not acknowledged as a scope cut.

Without an explicit replacement for macro/sector/index alerts, this plan will lose important alerts, not just noisy ones.

**Fix**: Decide this explicitly:
- Either retire macro/sector alerts from scope and say so.
- Or support non-single-name instruments/classes (`SPY`, `XLE`, `TLT`, futures, sector baskets, `asset_class` tags) instead of forcing single-stock output.

---

**5. [Architecture] `userWatchlist` cannot be used inside the current pre-delivery gate**

The plan's `isNotableTicker()` uses `userWatchlist.has(ticker)` (`docs/plans/2026-03-16-alert-quality-redesign.md:126-133`). That does not fit the current architecture.

The gate is proposed inside the backend pipeline before delivery fan-out (`docs/plans/2026-03-16-alert-quality-redesign.md:199-203`), while the current router sends one shared alert payload to shared channels (`packages/backend/src/app.ts:941-959`, `packages/delivery/src/alert-router.ts:59-66`). There is no user context at that point.

If you implement `userWatchlist` as a union of all user watchlists, one user's microcap makes the whole system push that name. If you implement it per-user, the gate has to move after recipient selection, which is a different architecture.

**Fix**: Remove `userWatchlist` from Phase 1, or redesign delivery to be recipient-aware before using per-user gating.

---

### Major (should fix)

**6. [Gate Logic] The sample rules have correctness bugs**

There are several logic holes in the proposed `shouldDeliver()` sample:

- `🟡 Monitor` comments say "confidence >= 0.8", but the function always returns `deliver: false` for Monitor (`docs/plans/2026-03-16-alert-quality-redesign.md:94-98`).
- `🔴 High-Quality Setup` bypasses the direction requirement entirely (`docs/plans/2026-03-16-alert-quality-redesign.md:80-84`), so an event with only `event.metadata.ticker` and zero ticker directions can still pass. That violates the stated design goal.
- The SEC 8-K rule checks only `tickers[0]` (`docs/plans/2026-03-16-alert-quality-redesign.md:109-113`). A multi-ticker event can be blocked because the first extracted symbol is not notable even if another affected symbol is.
- Trading halt gating only checks `event.metadata.ticker` in the sample (`docs/plans/2026-03-16-alert-quality-redesign.md:100-105`), not the enrichment tickers.

**Fix**: Write a proper truth table and tests before implementation. The current pseudo-code is not safe to translate directly.

---

**7. [Routing] New delivery tiers are not wired into the current router**

The plan introduces gate tiers `critical | high | standard` and says "critical => Discord + Bark push", "high => Discord only" (`docs/plans/2026-03-16-alert-quality-redesign.md:66-69`, `docs/plans/2026-03-16-alert-quality-redesign.md:187-193`).

The current router ignores any such tier. Channel fan-out is still driven by classification severity (`CRITICAL/HIGH/MEDIUM/LOW`) via `ROUTING_TABLE` (`packages/delivery/src/alert-router.ts:26-40`, `packages/delivery/src/alert-router.ts:63-66`).

So if the gate says "Discord only" but the classifier says `HIGH`, the current router still sends Bark + Telegram + Discord + Webhook. The plan is not just missing an implementation detail here; it is describing behavior the current contract cannot express.

**Fix**: Add an explicit delivery-tier field to `AlertEvent` and make the router consume it, or rewrite routing around gate decisions.

---

**8. [Audit Integration] Current audit/query surfaces are not ready for a new gate**

Phase 1 says "Pipeline audit records gate pass/block" (`docs/plans/2026-03-16-alert-quality-redesign.md:199-204`). The current audit log writes one terminal row per event with `outcome`, `stoppedAt`, `reason`, and optional delivery channels (`packages/backend/src/pipeline/audit-log.ts:5-18`, `packages/backend/src/pipeline/audit-log.ts:44-55`).

That is enough to log a block at `stopped_at = 'delivery_gate'`, but it is not enough to analyze the new system well:
- a pass through the gate is not separately queryable from any other delivered event
- there is no structured field for `gate_status = pass|block|unavailable|fallback`
- `/api/v1/judge` only understands `llm_judge` plus delivered PASS metadata (`packages/backend/src/routes/judge.ts:58-66`, `packages/backend/src/routes/judge.ts:97-109`)
- the trace view builds enrichment info from event metadata, not stage-specific audit records (`packages/backend/src/routes/ai-observability.ts:1219-1299`)

If you want to backtest the gate or explain "why did we suppress this?", you need richer audit semantics than one free-text reason string.

**Fix**: Add structured gate metadata to event metadata and/or extend `pipeline_audit` with explicit delivery-gate fields before rollout.

---

**9. [Notable Tickers] Hardcoded notable-list design is brittle**

`NOTABLE_TICKERS = new Set([...])` is easy to ship and easy to rot (`docs/plans/2026-03-16-alert-quality-redesign.md:137-141`).

Failure modes that are not covered in the plan:
- ticker normalization (`BRK.B` vs `BRK-B`, `BF.B`, class shares, ETF symbols, punctuation)
- stale constituents after index rebalances
- ADRs and non-index but still liquid/important names
- hot-reload/file corruption behavior if the plan later loads from file
- what happens when a notable company changes ticker after a merger/rebrand

The current filter/watchlist code only uppercases symbols; it does not canonicalize them (`packages/backend/src/pipeline/alert-filter.ts:133-136`).

**Fix**: Treat "notable" as a maintained dataset with canonicalization rules, update cadence, validation, and fail-open/fail-closed behavior. Do not ship a magic list without ownership.

---

**10. [Transition Safety] Phase order and test plan do not protect recall**

The plan puts Delivery Gate first and prompt hardening second (`docs/plans/2026-03-16-alert-quality-redesign.md:197-218`). That means Phase 1 makes delivery stricter using today's imperfect enrichment output.

The proposed validation is "replay the 57 delivered alerts" (`docs/plans/2026-03-16-alert-quality-redesign.md:204`). That only measures whether you removed known bad alerts. It does not measure what you newly suppress:
- alerts where enrichment was null/invalid
- macro/sector alerts
- important non-index names
- disagreements between classifier and enricher
- outages / degraded mode

**Fix**:
- dark-launch the gate in audit-only mode first
- compare pass/block deltas on both delivered and non-delivered populations
- build a gold set for recall, not just precision
- require kill-switch support for the new gate before enabling it

---

### Minor (nice to have)

**11. [Alert Card] The proposed "Confidence 0.9" label is misleading unless its source is explicit**

The current Discord formatter knows about enrichment action/tickers and historical context, but not a dedicated enrichment-confidence field (`packages/delivery/src/discord-webhook.ts:70-128`). If you surface "Confidence 0.9" in the card (`docs/plans/2026-03-16-alert-quality-redesign.md:161-172`) using classification confidence, users will read that as confidence in the bullish/bearish call, which is not what the classifier score means.

**Fix**: Either add a true gate/enrichment confidence score or label the field honestly.

---

**12. [Cost/Latency] Make sure the gate executes before downstream enrichment that it can invalidate**

The current pipeline does LLM enrichment, then historical enrichment, then regime lookup, then delivery (`packages/backend/src/app.ts:836-959`). If Delivery Gate is inserted carelessly after those steps instead of immediately after `llmEnricher.enrich()`, you will waste historical + regime work on alerts that are about to be blocked.

**Fix**: Put the gate immediately after LLM enrichment and before any downstream work that only matters for delivered alerts.

---

### Summary Verdict

| Category | Count |
|----------|-------|
| Critical | 5 |
| Major | 5 |
| Minor | 2 |

**Top production risks if implemented as written:**
1. OpenAI/enrichment instability silently suppresses real alerts.
2. The new prompt causes hallucinated tickers/directions, then the gate treats them as truth.
3. User-watchlist gating is architecturally incompatible with the current shared delivery path.

**Recommended action**: Do not implement this plan directly. First define the confidence contract, degraded-mode behavior, routing contract, and scope decision for macro/sector alerts. Then dark-launch the gate in audit-only mode before letting it suppress delivery.
