# Alert Quality Improvement Plan

**Date:** 2026-03-27
**Scope:** Internal pipeline quality — no new features, scanners, or channels
**Goal:** Make existing alerts more accurate, timely, relevant, and useful for decision support

---

## Executive Summary

Event Radar's pipeline is architecturally sound: a two-stage filter (L1 deterministic + L2 LLM Judge), LLM enrichment, deduplication with story tracking, multi-source confirmation, and tiered delivery. However, several critical gaps undermine alert quality:

1. **Historical enrichment is a no-op stub** — `historical-enricher.ts:78-84` returns `null`, so Discord alerts never show historical stats, and push policy never gates on historical support (`matchCount` is always 0). The entire push-policy → loud-push chain is dead code in production.

2. **No "already priced in" detection** — repeated events on the same theme (e.g., successive tariff escalations on the same country) get full severity treatment every time, even when the marginal information is near zero. The deduplicator's 30-minute Jaccard window and 24-hour DB ID lookup catch literal duplicates but not thematic repetition.

3. **Confidence scores are blunt** — `rule-engine.ts:72-75` uses `Math.min()` across all matched rule confidences, which can produce artificially low confidence when a high-confidence rule fires alongside a boilerplate low-confidence one.

4. **Ticker cooldown is flat** — `alert-filter.ts:386-419` applies a uniform 60-minute cooldown per ticker regardless of severity. A CRITICAL trading halt at T+30min after a Form 4 filing on the same ticker is suppressed.

5. **Alert formatting wastes space on metadata while omitting decision-critical context** — `enrichment.regimeContext` is never rendered, `enrichment.risks` is only shown for critical/high tier, and there's no occurrence count to indicate diminishing marginal value.

6. **DeliveryGate runs in shadow mode** — it logs tier assignments but does not block archive-tier events from delivery, meaning every event that passes L1+L2 gets delivered regardless of tier.

Addressing these in the recommended order would yield measurably better signal-to-noise without any new user-facing features.

---

## Top Problems Ranked by Impact

| Rank | Problem | Impact | Effort |
|------|---------|--------|--------|
| 1 | Historical enricher stub — no outcome data flows to alerts | Push policy never fires loud pushes (`matchCount` always 0); Discord never shows `📊 Similar events` stats | Medium |
| 2 | No prior-alert neutralization — repeated themes get full severity | Users see 3-5 alerts for one story arc; tariff round N looks identical to round 1 | Medium |
| 3 | Confidence scoring is fragile (`Math.min` of all rules) | Events matching both a high-confidence and low-confidence rule get artificially low scores | Quick |
| 4 | LLM enrichment prompt lacks prior-alert context | Enricher cannot say "this is the 4th tariff escalation this week" — it has no memory | Medium |
| 5 | Ticker cooldown is flat 60 min regardless of severity | CRITICAL events on the same ticker within 60 min are suppressed | Quick |
| 6 | Dedup Jaccard threshold (0.8) is too strict for paraphrased stories | Wire services rewriting the same story with different wording pass dedup | Quick |
| 7 | DeliveryGate is shadow-only — not enforcing tier routing | Archive-tier events still get delivered, diluting signal | Quick |
| 8 | Alert format doesn't surface occurrence count or decay | User has no way to know this is the 5th similar alert this week | Quick |

---

## Recommendations

### A. Accuracy

#### A1. Fix confidence aggregation in RuleEngine

**File:** `packages/backend/src/pipeline/rule-engine.ts:72-75`

**Problem:** `Math.min()` across all matched rule confidences means a rule setting confidence 0.9 gets overridden by a boilerplate rule setting 0.5. This punishes precision.

**Current code:**
```typescript
confidence: rules.reduce((min, r) =>
  r.action.setConfidence != null ? Math.min(min, r.action.setConfidence) : min,
  0.8),
```

**Fix:** Use priority-ordered override instead of min. The highest-priority (lowest priority number) matched rule's confidence should dominate. Sort matched rules by priority ascending, take the first rule that sets confidence. Fallback to 0.8 if none do.

**Effort:** Quick win (30 min)

---

#### A2. Add LLM classification for MEDIUM severity events with notable tickers

**File:** `packages/backend/src/event-pipeline.ts:75-84` (`shouldRunLlmClassification()`)

**Problem:** LLM classification only runs for HIGH/CRITICAL. MEDIUM events on notable tickers (NVDA, TSLA, etc.) skip LLM classification entirely, meaning their severity is never refined and direction is never assessed.

**Fix:** Expand the gate: run LLM classification when severity is MEDIUM AND the event has a ticker on the `notable-tickers.json` list. This catches events that rule-based classification under-weights but that matter for watchlist tickers.

**Effort:** Quick win (1 hour)

---

#### A3. Lower dedup content-similarity threshold for same-source events

**File:** `packages/backend/src/pipeline/dedup-strategies.ts:123-159`

**Problem:** Jaccard threshold of 0.8 is too strict for wire-service paraphrases. "AAPL announces Q2 earnings beat" vs "Apple reports Q2 revenue above expectations" produces Jaccard ~0.3 and passes dedup.

**Fix:** When `incoming.source === existing.source` (same wire service rewriting its own story), lower the threshold to 0.6. Also add a ticker+eventType fast-path: same ticker + same eventType within 15 minutes from the same source → treat as duplicate regardless of title similarity.

**Effort:** Quick win (1 hour)

---

#### A4. Enforce DeliveryGate

**File:** `packages/backend/src/event-pipeline.ts` (line ~564, where DeliveryGate is called)

**Problem:** DeliveryGate runs in `shadow` mode by default — it logs tier assignments but does not block archive-tier events from delivery. Every event that passes L1+L2 gets delivered regardless of tier.

**Fix:** Switch DeliveryGate to `enforce` mode. Archive-tier events should be stored but not delivered. This alone would significantly reduce noise by filtering out events without tickers, without direction, without notable-ticker relevance, and all `🟢 Background` events.

**Effort:** Quick win (config change)

---

#### A5. Reduce LLM enrichment hallucination risk

**File:** `packages/backend/src/event-pipeline.ts` (post-enrichment), `packages/backend/src/pipeline/llm-enricher.ts`

**Problem:** The enricher prompt says "Do NOT guess proxies" but there's no post-hoc validation. If the LLM outputs SPY for a company-specific event, it passes through.

**Fix:**
1. After enrichment, cross-check `enrichment.tickers[].symbol` against the event's explicit ticker metadata. Flag LLM-inferred tickers.
2. If classifier says BEARISH and enricher says bullish for the same ticker, log a conflict and default to classifier.
3. If enrichment returns only broad index tickers (SPY, QQQ) for a non-macro event, downgrade action from 🔴 to 🟡.

**Effort:** Quick-Medium (1 day)

---

### B. Timeliness

#### B1. Make ticker cooldown severity-aware

**File:** `packages/backend/src/pipeline/alert-filter.ts:386-419` (`applyTickerCooldown()`)

**Problem:** Flat 60-minute cooldown per ticker suppresses CRITICAL events. If TSLA has a Form 4 filing at 10:00 and a trading halt at 10:30, the halt is suppressed by cooldown.

**Fix:** Implement severity-based cooldown tiers:
- CRITICAL: 0 min cooldown (never suppress)
- HIGH: 15 min cooldown
- MEDIUM: 60 min cooldown (current default)
- LOW: 120 min cooldown

The `applyTickerCooldown()` method needs the event's classification result to determine severity and adjust the cooldown window accordingly.

**Effort:** Quick win (1 hour)

---

#### B2. Reserve CRITICAL slots in pipeline limiter

**File:** `packages/backend/src/pipeline/pipeline-limiter.ts`

**Problem:** CRITICAL events compete in the same queue (depth 100, max 5 concurrent) as LOW events. During a news burst, a critical event could be queued behind many low-priority events.

**Fix:** Reserve 1-2 of the 5 concurrent slots for CRITICAL events exclusively. When a CRITICAL event arrives and all slots are used by non-CRITICAL work, it should preempt or at minimum jump the queue.

**Effort:** Medium (half day)

---

#### B3. Source-aware staleness thresholds

**File:** `packages/backend/src/pipeline/alert-filter.ts:138-144`

**Problem:** 2-hour max age is applied uniformly. An SEC 8-K filing (relevant for hours) gets the same staleness treatment as a breaking news headline (stale in minutes).

**Fix:** Source-aware staleness windows:
- Breaking news, Truth Social: 30 min
- SEC filings: 4 hours
- Economic calendar: 6 hours
- Federal Register: 8 hours

**Effort:** Quick win (30 min)

---

#### B4. Reduce LLM enrichment latency for CRITICAL events

**File:** `packages/backend/src/pipeline/llm-enricher.ts:112` (timeout config)

**Problem:** LLM enrichment timeout is 10s (`LLM_TIMEOUT_MS`). For CRITICAL events during market hours, 10s is significant.

**Fix:** Tiered timeouts: CRITICAL 5s, HIGH 8s, MEDIUM 10s. Also consider running LLM enrichment and historical enrichment concurrently (currently sequential in the pipeline).

**Effort:** Quick win (30 min)

---

### C. Relevance

#### C1. Wire up the historical enricher — HIGH PRIORITY

**Files:**
- `packages/backend/src/pipeline/historical-enricher.ts:78-84` — the stub (`void event; void llmResult; return null;`)
- `packages/backend/src/services/event-similarity.ts` — functional similarity engine, unused in pipeline
- `packages/backend/src/pipeline/event-type-mapper.ts` — maps events to normalized similarity queries
- `packages/backend/src/db/schema.ts` — `event_outcomes` table with T+1h, T+1d, T+5d, T+20d, T+1w, T+1m columns
- `packages/delivery/src/push-policy.ts:14-15` — gates loud push on `matchCount >= 15`
- `packages/delivery/src/discord-webhook.ts:637-649` — renders `📊 Similar events: N cases | +X% avg 5d | Y% win rate`

**Problem:** `HistoricalEnricher.doEnrich()` returns `null`. All downstream consumers are dead code:
- Push policy's `matchCount >= 15` threshold for loud push → never met
- Push policy's `matchCount >= 10` threshold for silent push → never met
- Discord's historical stats line → never rendered
- `hasRealHistoricalData()` check → always false

**Fix:** Implement `doEnrich()`:
1. Call `mapEventToSimilarityQuery()` to get `MappedEventContext` (eventType, ticker, sector, severity).
2. Query `event_outcomes` table for events with matching `eventType` + `ticker` (or `sector` for macro events) that have non-null outcome data.
3. Compute `avgAlphaT5`, `avgAlphaT20`, `winRateT20`, `matchCount`, populate `topMatches` and `similarEvents`.
4. Return `HistoricalContext` with `confidence` based on match count (< 5 = `insufficient`, 5-10 = `low`, 10-20 = `medium`, 20+ = `high`).

This single change unblocks the entire push-policy decision tree, historical stats in Discord, and provides the data foundation for prior-alert neutralization.

**Effort:** Medium (2-3 days). The consumer code already exists and is correct.

---

#### C2. Inject prior-alert context into LLM enricher prompt — HIGH PRIORITY

**File:** `packages/backend/src/pipeline/llm-enricher.ts:211-252` (`buildPrompt()`)

**Problem:** The enricher prompt contains only the current event (title, body, source, metadata, market context). The LLM cannot assess marginal information value because it doesn't know what was already alerted.

**Fix:** Before calling `enrich()`, query recent delivered alerts (last 24-48h) with the same ticker or same eventType. Pass a summary to `buildPrompt()`:

```
## Prior Alerts (already delivered to user)
- 6h ago: "Trump threatens 25% tariff on EU auto imports" (CRITICAL, Bearish, 🔴)
- 18h ago: "Trump announces 10% tariff on all EU goods" (HIGH, Bearish, 🟡)

If prior alerts exist, assess whether THIS event adds new tradeable information.
Downgrade to 🟢 Background if no genuinely new information.
If this is an escalation/de-escalation, explain the delta clearly.
Start your summary with what changed, not what was already known.
```

**Effort:** Medium (1-2 days). The DB query is straightforward; the prompt engineering is the core work.

---

#### C3. Improve newswire noise filter with negative patterns

**File:** `packages/backend/src/pipeline/alert-filter.ts:270-321` (`checkNewswire()`)

**Problem:** The newswire filter uses positive keywords (`NEWSWIRE_PASS_PATTERNS` at line 274-283) but lacks negative patterns. Press releases about product launches, partnerships, and marketing campaigns pass through when they have a ticker.

**Fix:** Add `NEWSWIRE_BLOCK_PATTERNS`: `'partnership', 'expands into', 'launches new', 'appoints', 'celebrates', 'announces availability', 'now available'`. Block events matching these unless they also match a pass pattern.

**Effort:** Quick win (30 min)

---

#### C4. Strengthen retrospective/analysis filtering

**File:** `packages/backend/src/pipeline/alert-filter.ts:37-68` (`RETROSPECTIVE_PATTERNS`, `CLICKBAIT_PATTERNS`)

**Problem:** Current patterns miss common financial news formats:

**Add to `RETROSPECTIVE_PATTERNS`:**
```typescript
/\brecap\b/i,
/\bround-?up\b/i,
/\bweekly (?:wrap|review|update)\b/i,
/\bmarket (?:close|wrap|recap)\b/i,
/\bafter[- ]hours (?:move|action)\b/i,
/\b(?:morning|midday|afternoon) (?:brief|digest|update)\b/i,
```

**Add to `CLICKBAIT_PATTERNS`:**
```typescript
/\b(?:massive|huge|insane|crazy)\b.+\b(?:move|opportunity|trade)\b/i,
/\b(?:one|1) stock\b.+\b(?:buy|own|watch)\b/i,
/\b(?:next|new) (?:amazon|tesla|nvidia)\b/i,
```

**Effort:** Quick win (30 min)

---

### D. Alert Format & Decision Support

#### D1. Add occurrence count and decay indicator to alert title

**Files:**
- `packages/delivery/src/discord-webhook.ts:248-278` (`buildCompactTitle()`)
- `packages/backend/src/event-pipeline.ts` (where `AlertEvent` is assembled)
- `packages/delivery/src/types.ts:51-74` (`AlertEvent` interface — add `priorAlertCount`)

**Problem:** Users cannot tell if this is the 1st or 5th alert on the same theme. A "Trump tariff" alert looks identical whether it's a genuine escalation or the 5th rehash.

**Fix:** Query recent delivered alerts (same ticker + same eventType, last 48h) and inject count into the alert title:

```
📈 TSLA — Bullish Setup (1st alert)
📈 TSLA — Bullish Setup (3rd alert today)
📈 TSLA — Bullish Setup (5th this week · diminishing)
```

The occurrence count suffix immediately signals marginal value.

**Effort:** Quick win (half day)

---

#### D2. Always show confidence bucket, risk, and regime context in Discord embeds

**File:** `packages/delivery/src/discord-webhook.ts:149-210` (`buildFields()`)

**Problem:**
- `enrichment.risks` is only shown for critical tier in the default template (line 596-599) and critical/high in breaking-news (line 329-332). It's the most decision-critical sentence.
- `enrichment.regimeContext` is generated by the LLM enricher (see `llm-enricher.ts:66`) but never rendered in any Discord template.
- Confidence bucket is buried inside the direction badge text (line 606-631), not a standalone field.

**Fix:**
- Add `Confidence` as a dedicated inline field.
- Always show `Risk` field for all tiers.
- Add `regimeContext` as a field after the direction badge when present and non-empty.
- Replace the `Analysis` field (which shows `enrichment.summary` truncated to 256 chars, often duplicating the description) with `Why Now` (`enrichment.whyNow`) — more actionable.

**Effort:** Quick win (1 hour)

---

#### D3. Compact multi-ticker display for macro events

**File:** `packages/delivery/src/discord-webhook.ts:181-189`

**Problem:** Macro events (tariffs, Fed announcements) can have 5-10 affected tickers. Each gets its own line with direction emoji, which bloats the embed.

**Fix:** For events with > 3 tickers, switch to a compact inline format:
```
📈 AAPL MSFT GOOG  📉 BABA JD PDD
```
instead of individual lines per ticker.

**Effort:** Quick win (30 min)

---

#### D4. Add confidence provenance to direction badge

**File:** `packages/delivery/src/discord-webhook.ts:606-631` (`directionBadge()`, `confidenceLabel()`)

**Problem:** Alerts show "High confidence" / "Moderate confidence" but don't explain why. Users can't calibrate trust.

**Fix:** When historical data is available (after C1), expand the badge:
```
▼ BEARISH · High confidence · 12 similar events · 67% win rate
```
instead of just `▼ BEARISH · High confidence`. Show historical stats inline in the direction badge, not only in the conditional footer section that only appears for critical/high tier.

**Effort:** Quick win (30 min, but depends on C1 for the data)

---

#### D5. Tighten LLM enrichment prompt for compactness

**File:** `packages/backend/src/pipeline/llm-enricher.ts:39-67` (`SYSTEM_PROMPT`)

**Problem:** Several enrichment fields produce generic filler. `historicalContext` often says "Similar events have historically moved the stock" (zero information). `regimeContext` often restates the obvious when no market data is provided.

**Fix:**
1. Add to system prompt: "If you cannot provide a specific, non-obvious insight for a field, return an empty string. Generic statements like 'this could impact the stock' are worse than no statement."
2. Cap `summary` at 1 sentence (not 1-2).
3. Make `currentSetup` explicitly conditional: "Omit entirely if no market setup data was provided above."

**Effort:** Quick win (30 min)

---

## Prior Similar Alert Neutralization

This is the most impactful medium-effort improvement. The goal: when the system has already alerted on a theme, subsequent alerts on the same theme should be automatically discounted unless they contain genuinely new information.

### Current State

The system has **no awareness of previously delivered alerts when processing a new event.** Each event is scored, enriched, and delivered in isolation. Specifically:

- **Dedup** (`deduplicator.ts`): 30-min in-memory Jaccard window + 24h DB ID lookup. Catches literal duplicates (same story, same ID, same title) but not thematic repetition (same theme, new headline, different source).
- **Ticker cooldown** (`alert-filter.ts:386-419`): 60 min per `${ticker}:${eventType}`. A political post (type: `political`) and a news article (type: `breaking_news`) about the same tariff both pass because different event types.
- **Story tracker** (`story-tracker.ts`): Groups duplicates that ARE caught by dedup into stories, adds "Developing:" prefix. But does not affect scoring, tier, or delivery of the 2nd/3rd/4th alert on the same theme.
- **LLM enricher** (`llm-enricher.ts`): Sees each event in isolation. Cannot compare to prior alerts.

### Proposed Mechanism: Three-Layer Theme Decay

#### Layer 1: Theme Decay Score (deterministic, pipeline-level)

**Core idea:** Maintain a `deliveredThemes` map that tracks recently delivered alert fingerprints. Each delivered alert registers a theme fingerprint. Subsequent alerts matching the same fingerprint get a confidence penalty.

**Implementation:**

1. **Theme fingerprint** = `{ticker}:{eventType}:{direction}` (e.g., `TSLA:insider_large_trade:bearish`). For ticker-less macro events, use `MACRO:{eventType}:{top3keywords}`.

2. **On delivery**, record the fingerprint with timestamp.

3. **On new event processing** (between L1 filter and L2 Judge), look up the fingerprint:
   ```
   decayFactor = 1.0 - (0.3 * priorAlertCount)  // floor at 0.1
   effectiveConfidence = rawConfidence * decayFactor
   ```
   - 1st alert: full confidence
   - 2nd alert (same theme): 70% confidence
   - 3rd alert: 40% confidence
   - 4th+: 10% confidence (effectively suppressed by confidence-based routing)

4. **Decay window:** 24 hours for same ticker+eventType, 48 hours for broader theme (same eventType, any ticker in same sector).

5. **Exceptions that reset decay:**
   - Multi-source confirmation (new primary source confirms a rumor)
   - Severity escalation (new event has HIGHER severity than previous alert)
   - Reversal/correction (detected by LLM in Layer 2)

#### Layer 2: LLM Delta Analysis (semantic, enrichment-level)

Pass `priorAlerts` summaries to the LLM enricher prompt (see recommendation C2). The LLM is explicitly instructed to:
- Focus on NEW information only
- Downgrade to 🟢 Background if no new tradeable info
- Frame `summary` as "what changed" not "what happened"
- Identify escalations vs. rehashes

#### Layer 3: Format-Level Delta Framing (display-level)

For alerts where `priorAlertCount > 0`:
- Title changes from `📈 TSLA — Bullish Setup` to `🔄 TSLA — Update #3 · diminishing`
- Description leads with `**What changed:**` instead of full summary
- Direction badge adds prior-alert count

#### Edge Cases

| Scenario | Desired Behavior | How It's Handled |
|----------|-----------------|-----------------|
| Same story, new source confirms | Deliver at reduced tier, note confirmation | L1: decay at 0.7, L2: LLM notes confirmation source, L3: "Confirmed by Reuters" |
| Same ticker, genuinely different event | Deliver at full tier | L1: different eventType+keywords → no fingerprint match, full confidence |
| Escalation (tariff → retaliation) | Full or boosted tier | L1: same fingerprint → decayed, BUT severity escalation exception resets decay. L2: LLM identifies escalation |
| Same event, 25+ hours later | Deliver normally | L1: 24h decay window expired |
| Correction/reversal | CRITICAL delivery | L1: fingerprint match → decayed, BUT L2: LLM identifies reversal, overrides to 🔴. L3: "⚠️ REVERSAL" label |

#### Files to modify

| File | Change |
|------|--------|
| New: `packages/backend/src/pipeline/theme-decay.ts` | `ThemeDecayTracker` class |
| `packages/backend/src/event-pipeline.ts` | Wire theme decay between L1 filter and L2 Judge; pass `priorAlerts` to enricher |
| `packages/backend/src/pipeline/llm-enricher.ts` | Accept and render `priorAlerts` in prompt |
| `packages/delivery/src/discord-webhook.ts` | Delta framing in templates |
| `packages/delivery/src/types.ts` | Add `priorAlertCount` to `AlertEvent` |

---

## Quick Wins vs Medium Effort

### Quick Wins (< 1 day each, can ship individually)

| ID | Change | File(s) | Category |
|----|--------|---------|----------|
| A1 | Fix confidence aggregation (priority-ordered, not min) | `rule-engine.ts` | Accuracy |
| A3 | Lower dedup threshold for same-source events (0.8 → 0.6) | `dedup-strategies.ts` | Accuracy |
| A4 | Enforce DeliveryGate (shadow → enforce) | `event-pipeline.ts` | Relevance |
| B1 | Severity-aware ticker cooldown (0/15/60/120 min) | `alert-filter.ts` | Timeliness |
| B3 | Source-aware staleness thresholds | `alert-filter.ts` | Timeliness |
| B4 | Tiered LLM enrichment timeouts | `llm-enricher.ts` | Timeliness |
| C3 | Newswire negative-keyword block patterns | `alert-filter.ts` | Relevance |
| C4 | Additional retrospective/clickbait patterns | `alert-filter.ts` | Relevance |
| D1 | Add occurrence count suffix to Discord title | `discord-webhook.ts` + pipeline | Format |
| D2 | Always show confidence + risk + regimeContext | `discord-webhook.ts` | Format |
| D3 | Compact multi-ticker display for > 3 tickers | `discord-webhook.ts` | Format |
| D5 | Tighten LLM enrichment prompt for compactness | `llm-enricher.ts` | Format |

### Medium Effort (1-3 days each)

| ID | Change | File(s) | Category |
|----|--------|---------|----------|
| C1 | Wire up historical enricher (implement `doEnrich()`) | `historical-enricher.ts`, `event-similarity.ts`, `event-type-mapper.ts` | Relevance |
| C2 | Prior-alert context in LLM enricher prompt | `llm-enricher.ts`, `event-pipeline.ts` | Relevance |
| A2 | LLM classification for MEDIUM + notable ticker | `event-pipeline.ts` | Accuracy |
| A5 | LLM enrichment hallucination guardrails | `event-pipeline.ts`, `llm-enricher.ts` | Accuracy |
| B2 | CRITICAL slot reservation in pipeline limiter | `pipeline-limiter.ts` | Timeliness |
| — | Theme decay tracker (3-layer neutralization) | New module + `event-pipeline.ts` + `discord-webhook.ts` | Neutralization |

---

## Prioritized Implementation Order

### Phase 1: Stop the Bleeding (Quick wins, highest impact)

1. **A4** — Enforce DeliveryGate → immediately cuts noise from archive-tier events
2. **B1** — Severity-aware cooldown → stops CRITICAL events from being suppressed by ticker cooldown
3. **A1** — Fix confidence aggregation → more accurate scoring across the board
4. **A3** — Lower dedup threshold for same-source → fewer duplicate alerts from wire services
5. **C4** — Additional filter patterns → incremental noise reduction

### Phase 2: Decision Support (Format improvements)

6. **D2** — Always show confidence + risk + regimeContext → every alert becomes more actionable
7. **D5** — Tighten enrichment prompt → less AI filler, more signal per token
8. **D1** — Occurrence count in title → instant marginal-value signal to user
9. **D3** — Compact multi-ticker display → cleaner macro event alerts

### Phase 3: Intelligence Layer (Medium effort, highest ceiling)

10. **C1** — Wire up historical enricher → unlocks push policy + historical stats in Discord
11. **C2** — Prior-alert context in LLM prompt → LLM can assess marginal value
12. **Theme Decay Tracker** → automated 3-layer prior-alert neutralization
13. **A2** — LLM classification for MEDIUM + notable → better coverage of watchlist tickers

### Phase 4: Polish

14. **A5** — LLM hallucination guardrails → fewer false tickers/directions
15. **B3** — Source-aware staleness → fine-tuned freshness per source type
16. **B4** — Tiered LLM timeouts → faster CRITICAL event processing
17. **B2** — CRITICAL slot reservation → better latency under load
18. **C3** — Newswire negative patterns → incremental noise reduction

---

## Final Action List

| # | Action | Primary File | Type |
|---|--------|-------------|------|
| 1 | Switch DeliveryGate from shadow to enforce mode | `event-pipeline.ts` | Config |
| 2 | Make ticker cooldown severity-aware (0/15/60/120 min) | `alert-filter.ts:386-419` | Logic |
| 3 | Replace `Math.min` confidence with priority-ordered override | `rule-engine.ts:72-75` | Logic |
| 4 | Lower dedup Jaccard to 0.6 for same-source events | `dedup-strategies.ts:123-159` | Threshold |
| 5 | Add missing retrospective/clickbait patterns | `alert-filter.ts:37-68` | Data |
| 6 | Always render confidence + risk + regimeContext in Discord | `discord-webhook.ts:149-210` | Template |
| 7 | Tighten enrichment prompt (1-sentence summary, no filler) | `llm-enricher.ts:39-67` | Prompt |
| 8 | Add occurrence count suffix to Discord title | `discord-webhook.ts:248-278` + pipeline | Template + query |
| 9 | Compact multi-ticker display for > 3 tickers | `discord-webhook.ts:181-189` | Template |
| 10 | Implement `HistoricalEnricher.doEnrich()` using event_outcomes + event-similarity | `historical-enricher.ts:78-84` | Implementation |
| 11 | Inject recent same-theme alerts into LLM enricher prompt | `llm-enricher.ts:211-252` | Prompt |
| 12 | Build `ThemeDecayTracker` for 3-layer prior-alert neutralization | New module + `event-pipeline.ts` | New module |
| 13 | Expand LLM classification gate to MEDIUM + notable ticker | `event-pipeline.ts:75-84` | Logic |
| 14 | Post-enrichment ticker/direction validation | `event-pipeline.ts` (post-enrichment) | Validation |
| 15 | Source-aware staleness thresholds | `alert-filter.ts:138-144` | Logic |
| 16 | Tiered LLM enrichment timeouts (5s/8s/10s) | `llm-enricher.ts:112` | Config |
| 17 | Reserve CRITICAL slots in pipeline limiter | `pipeline-limiter.ts` | Logic |
| 18 | Add newswire negative-keyword block patterns | `alert-filter.ts:270-321` | Data |

**Total estimated effort:** ~12-15 days of focused work
**Expected outcome:** 50-70% reduction in thematic alert repetition, activation of the entire push-policy chain, and materially better decision-support per alert delivered.
