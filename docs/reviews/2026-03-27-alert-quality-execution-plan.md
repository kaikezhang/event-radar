# Alert Quality — Execution Plan

**Date:** 2026-03-27
**Input:** `docs/reviews/2026-03-27-alert-quality-improvement-plan.md`
**Scope:** Code changes within current repo only. No new packages, no new infra.

---

## Track A: Quick Wins

Standalone changes, each shippable as one PR. No cross-track dependencies.

### A-1. Fix confidence aggregation (priority-ordered override)

**File:** `packages/backend/src/pipeline/rule-engine.ts` lines 72-75
**Change:** Replace `Math.min()` across all matched rules with: sort matched rules by `priority` ascending, take the first that sets `setConfidence`. Fallback to 0.8.
**Test:** `packages/backend/src/__tests__/rule-engine.test.ts` — add cases:
- High-priority rule (confidence 0.9) + low-priority rule (confidence 0.5) → expect 0.9
- Only low-priority rule fires → expect 0.5
- No rule sets confidence → expect 0.8
**Risk:** Rules that relied on min-of-all behavior get higher confidence. Audit existing rules to confirm no rule intentionally uses min semantics as a safety cap.
**PR:** `fix/confidence-priority-override`

### A-2. Severity-aware ticker cooldown

**File:** `packages/backend/src/pipeline/alert-filter.ts` lines 386-419 (`applyTickerCooldown()`)
**Change:** Replace flat 60-min cooldown with severity-keyed map: `{ CRITICAL: 0, HIGH: 15, MEDIUM: 60, LOW: 120 }`. The method needs the classification result's severity passed in.
**Dependency:** Caller in `event-pipeline.ts` must pass severity to `applyTickerCooldown()`. Check current call site — if severity is already available in the pipeline context at that point, this is a signature change only.
**Test:** `packages/backend/src/__tests__/alert-filter.test.ts` — add cases:
- CRITICAL event on ticker with 30-min-old alert → NOT suppressed
- LOW event on ticker with 90-min-old alert → suppressed (within 120-min window)
- MEDIUM event on ticker with 70-min-old alert → NOT suppressed (past 60-min window)
**Risk:** Low. CRITICAL events getting through faster is strictly desirable.
**PR:** `fix/severity-aware-cooldown`

### A-3. Enforce DeliveryGate

**File:** `packages/backend/src/event-pipeline.ts` (~line 564)
**Change:** Switch DeliveryGate from `shadow` to `enforce` mode. Archive-tier events get stored but not delivered.
**Test:** Integration test in `packages/backend/src/__tests__/integration/pipeline.test.ts` — verify archive-tier event reaches DB but not delivery.
**Risk:** MEDIUM. This is the highest-impact quick win but also the riskiest — it will immediately suppress events. Mitigation: deploy with a log line counting suppressed events for 24h before removing shadow fallback. Verify no CRITICAL/HIGH events are incorrectly assigned archive tier by running the gate against recent event history (check DeliveryGate logs).
**PR:** `feat/enforce-delivery-gate`

### A-4. Lower dedup threshold for same-source events

**File:** `packages/backend/src/pipeline/dedup-strategies.ts` lines 123-159
**Change:**
1. When `incoming.source === existing.source`, lower Jaccard threshold from 0.8 to 0.6.
2. Add fast-path: same ticker + same eventType + same source within 15 min → duplicate regardless of title similarity.
**Test:** `packages/backend/src/__tests__/deduplicator.test.ts` — add cases:
- Same source, Jaccard 0.65 → deduplicated (was not before)
- Different source, Jaccard 0.65 → NOT deduplicated (unchanged)
- Same source + same ticker + same eventType within 15 min, low Jaccard → deduplicated
**Risk:** Low. Same-source paraphrases are almost always the same story.
**PR:** `fix/dedup-same-source-threshold`

### A-5. Additional filter patterns (retrospective + clickbait + newswire negative)

**File:** `packages/backend/src/pipeline/alert-filter.ts`
- Lines 37-68: Add `RETROSPECTIVE_PATTERNS` (recap, roundup, weekly wrap, market close, after-hours, morning brief)
- Lines 37-68: Add `CLICKBAIT_PATTERNS` (massive move, one stock to buy, next amazon)
- Lines 270-321: Add `NEWSWIRE_BLOCK_PATTERNS` (partnership, expands into, launches new, appoints, celebrates, announces availability, now available). Block if matched UNLESS a pass pattern also matches.
**Test:** `packages/backend/src/__tests__/alert-filter.test.ts` — add cases for each new pattern.
**Risk:** Low. False positives are possible but patterns are conservative.
**PR:** `fix/filter-pattern-expansion`

### A-6. Source-aware staleness thresholds

**File:** `packages/backend/src/pipeline/alert-filter.ts` lines 138-144
**Change:** Replace uniform 2-hour max age with source-keyed map: `{ breaking_news: 30m, truth_social: 30m, sec_filing: 4h, econ_calendar: 6h, federal_register: 8h, default: 2h }`.
**Test:** `packages/backend/src/__tests__/alert-filter.test.ts` — add cases per source type.
**Risk:** Low. SEC filings getting a longer window is strictly correct.
**PR:** `fix/source-aware-staleness`

### A-7. Tiered LLM enrichment timeouts

**File:** `packages/backend/src/pipeline/llm-enricher.ts` line 112
**Change:** Replace flat `LLM_TIMEOUT_MS = 10000` with severity-keyed: `{ CRITICAL: 5000, HIGH: 8000, MEDIUM: 10000, LOW: 10000 }`. Requires severity to be passed to the enricher call.
**Test:** `packages/backend/src/__tests__/llm-enricher.test.ts` — verify timeout config is respected per severity.
**Risk:** Low. CRITICAL events with shorter timeouts may get unenriched if LLM is slow — but fast delivery of CRITICAL events is more important than enrichment completeness.
**PR:** `fix/tiered-llm-timeouts`

### A-8. Tighten LLM enrichment prompt

**File:** `packages/backend/src/pipeline/llm-enricher.ts` lines 39-67 (`SYSTEM_PROMPT`)
**Change:**
1. Add instruction: "If you cannot provide a specific, non-obvious insight for a field, return an empty string."
2. Cap `summary` to 1 sentence.
3. Make `currentSetup` conditional: "Omit entirely if no market setup data was provided."
**Test:** `packages/backend/src/__tests__/llm-enricher.test.ts` — verify prompt changes via snapshot or string assertion.
**Risk:** Low. LLM output may shift — monitor first few hours of alerts for regression.
**PR:** `fix/enrichment-prompt-tighten`

### A-9. Discord format improvements (3 changes, 1 PR)

**Files:** `packages/delivery/src/discord-webhook.ts`
**Changes:**
1. Lines 149-210 (`buildFields()`): Always show `Confidence` as dedicated inline field, always show `Risk` for all tiers, add `regimeContext` field when non-empty.
2. Lines 181-189: For events with >3 tickers, use compact inline format (`📈 AAPL MSFT GOOG  📉 BABA JD PDD`).
3. Lines 606-631 (`directionBadge()`): Add `confidenceLabel()` as standalone text, not buried in badge.
**Test:** `packages/delivery/src/__tests__/discord-webhook.test.ts` — add/update cases for:
- Alert with regimeContext → rendered
- Alert with >3 tickers → compact format
- Risk field present for feed-tier alert (was hidden before)
**Risk:** Low. Visual changes only. Review in Discord staging channel.
**PR:** `feat/discord-format-improvements`

---

## Track B: Historical Enricher

Single dependency chain. Must be done in order.

### B-1. Implement `HistoricalEnricher.doEnrich()`

**Files (in order):**
1. `packages/backend/src/pipeline/historical-enricher.ts` lines 78-84 — implement the stub
2. `packages/backend/src/services/event-similarity.ts` — already functional, no changes needed (verify)
3. `packages/backend/src/pipeline/event-type-mapper.ts` — already functional, no changes needed (verify)

**Implementation steps:**
1. Call `mapEventToSimilarityQuery(event, llmResult)` to get `MappedEventContext`.
2. Query `event_outcomes` table: `SELECT * FROM event_outcomes WHERE ticker = :ticker AND event_time > NOW() - INTERVAL '2 years'` (or sector for macro events).
3. Filter by matching `eventType` using the event-similarity service.
4. Compute aggregates: `avgAlphaT5`, `avgAlphaT20`, `winRateT20`, `matchCount`.
5. Build `topMatches` array (top 5 by relevance).
6. Return `HistoricalContext` with confidence: `matchCount < 5 → 'insufficient'`, `5-10 → 'low'`, `10-20 → 'medium'`, `20+ → 'high'`.

**Test:** NEW file `packages/backend/src/__tests__/historical-enricher.test.ts`:
- Stub `event_outcomes` query with known data → verify correct aggregates
- Zero matches → returns `{ confidence: 'insufficient', matchCount: 0 }`
- 25 matches → returns `{ confidence: 'high', matchCount: 25 }` with correct avgAlpha
- Macro event (no ticker) → falls back to sector-based query
**Risk:** MEDIUM. This is the largest single change. The downstream consumers (push-policy, Discord historical stats) are already written but untested in production.
Mitigation: Deploy with `historicalEnricherEnabled` feature flag in pipeline config. Log results without passing to consumers for 48h.
**PR:** `feat/historical-enricher-impl`

### B-2. Expand LLM classification gate to MEDIUM + notable ticker

**File:** `packages/backend/src/event-pipeline.ts` lines 75-84 (`shouldRunLlmClassification()`)
**Change:** Add condition: `severity === 'MEDIUM' && notableTickers.includes(event.ticker)`. Load notable tickers from `packages/backend/src/config/notable-tickers.json`.
**Dependency:** None on B-1, but logically follows because historical data makes MEDIUM events more actionable.
**Test:** `packages/backend/src/__tests__/event-pipeline-llm-gating.test.ts` — add cases:
- MEDIUM + NVDA → LLM classification runs
- MEDIUM + unknown ticker → LLM classification skipped
- HIGH + any ticker → LLM classification runs (unchanged)
**Risk:** Low. Increases LLM API calls. Monitor cost and latency.
**PR:** `feat/medium-notable-llm-gate`

### B-3. Post-enrichment ticker/direction validation

**File:** `packages/backend/src/event-pipeline.ts` (post-enrichment section)
**Change:**
1. Cross-check `enrichment.tickers[].symbol` against event's explicit ticker metadata. Flag LLM-inferred tickers with `inferred: true`.
2. If classifier says BEARISH and enricher says bullish → log conflict, default to classifier direction.
3. If enrichment returns only broad index tickers (SPY, QQQ) for a non-macro event → downgrade action from 🔴 to 🟡.
**Test:** `packages/backend/src/__tests__/event-pipeline-metadata-persistence.test.ts` or new test file:
- Event with ticker AAPL, enricher adds SPY → SPY flagged as inferred
- Classifier BEARISH + enricher bullish → final direction is BEARISH
- Non-macro event with only SPY ticker → downgraded to 🟡
**Risk:** Low-medium. Direction conflicts are real and the classifier should win as it has more structured input.
**PR:** `fix/post-enrichment-validation`

### B-4. CRITICAL slot reservation in pipeline limiter

**File:** `packages/backend/src/pipeline/pipeline-limiter.ts`
**Change:** Reserve 2 of 5 concurrent slots for CRITICAL events. When CRITICAL arrives and all slots are non-CRITICAL, preempt or jump queue.
**Test:** `packages/backend/src/__tests__/pipeline-limiter.test.ts` — add cases:
- 5 LOW events running, CRITICAL arrives → CRITICAL gets a reserved slot (or jumps queue)
- 3 LOW + 2 CRITICAL running, another CRITICAL arrives → queued (both reserved slots used)
**Risk:** Medium. Queue starvation for non-CRITICAL during bursts. Cap reserved slots at 2.
**PR:** `feat/critical-slot-reservation`

**Track B dependency order:** B-1 → (B-2, B-3, B-4 can be parallel after B-1)

---

## Track C: Prior Alert Neutralization / Theme Decay

The most complex track. Strict internal ordering.

### C-1. Build `ThemeDecayTracker` module

**New file:** `packages/backend/src/pipeline/theme-decay.ts`
**Design:**
```
class ThemeDecayTracker {
  // In-memory map + DB backing for persistence across restarts
  private deliveredThemes: Map<string, { count: number; timestamps: number[]; lastSeverity: Severity }>

  fingerprint(event: RawEvent, classification: ClassificationResult): string
    // Format: `{ticker}:{eventType}:{direction}`
    // Macro events: `MACRO:{eventType}:{top3keywords}`

  recordDelivery(fingerprint: string, severity: Severity): void
    // Add to map with timestamp

  getDecayFactor(fingerprint: string): { factor: number; priorCount: number; shouldReset: boolean }
    // factor = max(0.1, 1.0 - 0.3 * priorCount)
    // Reset conditions: severity escalation, multi-source confirmation

  cleanup(): void
    // Evict entries older than 48h
}
```

**DB backing:** Use existing `events` table with a query on `delivered_at` + `ticker` + `event_type`. No new table needed — the theme map is a cache of recent delivery history.
**Test:** NEW file `packages/backend/src/__tests__/theme-decay.test.ts`:
- 1st alert → factor 1.0
- 2nd alert same fingerprint → factor 0.7
- 3rd → 0.4, 4th+ → 0.1
- Severity escalation (LOW → CRITICAL) → reset to 1.0
- After 24h → fingerprint expired, factor 1.0
- Different eventType same ticker → no match, factor 1.0
**Risk:** Medium. The decay formula is the critical tuning parameter. Start conservative (0.3 step) and adjust based on production data.
**PR:** `feat/theme-decay-tracker`

### C-2. Wire theme decay into pipeline

**File:** `packages/backend/src/event-pipeline.ts`
**Change:**
1. Instantiate `ThemeDecayTracker` in pipeline constructor.
2. After L1 filter, before L2 Judge: compute `decayFactor` and apply to `effectiveConfidence`.
3. After delivery: call `recordDelivery()`.
4. Pass `priorAlertCount` through to `AlertEvent`.
**Dependency:** C-1 must be merged first.
**Test:** Integration test — pipeline processes 3 events with same fingerprint, verify confidence degrades per decay formula.
**Risk:** Medium. If decay is too aggressive, legitimate escalations get suppressed. The severity-escalation reset in C-1 mitigates this.
**PR:** `feat/wire-theme-decay`

### C-3. Inject prior-alert context into LLM enricher prompt

**Files:**
1. `packages/backend/src/event-pipeline.ts` — query recent delivered alerts (last 48h, same ticker or eventType) before calling enricher
2. `packages/backend/src/pipeline/llm-enricher.ts` lines 211-252 (`buildPrompt()`) — accept `priorAlerts` parameter, render "Prior Alerts" section in prompt

**Prompt addition:**
```
## Prior Alerts (already delivered to user)
- 6h ago: "Trump threatens 25% tariff on EU auto imports" (CRITICAL, Bearish, 🔴)
If prior alerts exist, assess whether THIS event adds new tradeable information.
Downgrade to 🟢 Background if no genuinely new information.
If escalation/de-escalation, explain the delta clearly.
Start summary with what changed, not what was already known.
```

**Dependency:** C-2 (needs `priorAlertCount` in pipeline context). Can start prompt engineering in parallel with C-2 integration work.
**Test:** `packages/backend/src/__tests__/llm-enricher.test.ts` — verify:
- `buildPrompt()` with priorAlerts → prompt contains "Prior Alerts" section
- `buildPrompt()` without priorAlerts → no "Prior Alerts" section
- Prior alerts summary is truncated at 5 most recent
**Risk:** Medium. LLM behavior changes based on prior context. May over-suppress. Monitor alert volume post-deploy.
**PR:** `feat/prior-alert-llm-context`

### C-4. Add `priorAlertCount` to AlertEvent + delivery format changes

**Files:**
1. `packages/delivery/src/types.ts` lines 51-74 — add `priorAlertCount?: number` to `AlertEvent`
2. `packages/delivery/src/discord-webhook.ts` lines 248-278 (`buildCompactTitle()`) — suffix title with occurrence info:
   - `priorAlertCount === 0` → no suffix
   - `priorAlertCount 1-2` → `(2nd alert)`
   - `priorAlertCount 3-4` → `(4th alert today)`
   - `priorAlertCount >= 5` → `(6th this week · diminishing)`
3. `packages/delivery/src/discord-webhook.ts` — for `priorAlertCount > 0`, lead description with `**What changed:**`

**Dependency:** C-2 (pipeline must populate `priorAlertCount`).
**Test:** `packages/delivery/src/__tests__/discord-webhook.test.ts` — verify title suffix and description prefix for each count bracket.
**Risk:** Low. Display-only changes.
**PR:** `feat/alert-occurrence-display`

### C-5. Direction badge with historical stats (depends on Track B)

**File:** `packages/delivery/src/discord-webhook.ts` lines 606-631
**Change:** When `historicalContext` is present and `matchCount >= 5`:
```
▼ BEARISH · High confidence · 12 similar events · 67% win rate
```
**Dependency:** Track B (B-1) must be merged — needs real `historicalContext` data.
**Test:** `packages/delivery/src/__tests__/discord-webhook.test.ts` — verify badge format with/without historical data.
**Risk:** Low.
**PR:** `feat/direction-badge-historical`

**Track C dependency order:** C-1 → C-2 → (C-3, C-4 parallel) → C-5 (also needs B-1)

---

## Recommended Execution Order

```
Week 1: Quick wins (Track A) — all parallelizable
├── A-1  fix/confidence-priority-override
├── A-2  fix/severity-aware-cooldown
├── A-3  feat/enforce-delivery-gate          ← deploy with 24h shadow monitoring
├── A-4  fix/dedup-same-source-threshold
├── A-5  fix/filter-pattern-expansion
├── A-6  fix/source-aware-staleness
├── A-7  fix/tiered-llm-timeouts
├── A-8  fix/enrichment-prompt-tighten
└── A-9  feat/discord-format-improvements

Week 2: Historical enricher (Track B start) + remaining Track A merges
├── B-1  feat/historical-enricher-impl       ← critical path, start early
├── B-2  feat/medium-notable-llm-gate        ← parallel with B-1
└── Merge remaining Track A PRs

Week 3: Theme decay (Track C) + Track B completion
├── C-1  feat/theme-decay-tracker            ← can start as soon as pipeline context is clear
├── C-2  feat/wire-theme-decay               ← after C-1
├── B-3  fix/post-enrichment-validation      ← after B-1
├── B-4  feat/critical-slot-reservation      ← parallel with C work
└── C-3  feat/prior-alert-llm-context        ← after C-2

Week 4: Display + polish
├── C-4  feat/alert-occurrence-display       ← after C-2
├── C-5  feat/direction-badge-historical     ← after B-1 + C-2
└── Integration testing across all tracks
```

### Parallelization Safety

**Safe to parallelize:**
- All Track A items (A-1 through A-9) — independent files, no shared state changes
- B-2, B-3, B-4 — independent after B-1 merges
- C-3 and C-4 — independent after C-2 merges
- Track A and B-1 — no file overlap

**Must be sequential:**
- B-1 before B-3, C-5
- C-1 → C-2 → C-3/C-4 (strict chain)
- A-3 (DeliveryGate enforce) should merge last among Track A — it's the one that actually suppresses events, so all accuracy improvements should land first

### Cross-Track Dependencies

```
B-1 (historical enricher) ──→ C-5 (direction badge with stats)
C-2 (wire theme decay)    ──→ C-3 (LLM prior-alert context)
C-2 (wire theme decay)    ──→ C-4 (occurrence count display)
```

### Rollout Order for Maximum Safety

1. **First:** A-1, A-4, A-5, A-6, A-7, A-8 — pure improvements, no suppression risk
2. **Second:** A-2, A-9 — behavior changes but low risk
3. **Third:** A-3 (DeliveryGate enforce) — this is the noise-reduction switch, deploy after accuracy improvements are live
4. **Fourth:** B-1 — unlocks historical data pipeline
5. **Fifth:** C-1 → C-2 — theme decay (the big noise reducer)
6. **Last:** C-3, C-4, C-5, B-2, B-3, B-4 — polish and edge cases

---

## Test Plan Summary

| PR | Test file | New tests needed |
|----|-----------|-----------------|
| A-1 | `rule-engine.test.ts` | 3 cases |
| A-2 | `alert-filter.test.ts` | 3 cases |
| A-3 | `integration/pipeline.test.ts` | 1-2 cases |
| A-4 | `deduplicator.test.ts` | 3 cases |
| A-5 | `alert-filter.test.ts` | ~8 cases (pattern coverage) |
| A-6 | `alert-filter.test.ts` | 4 cases |
| A-7 | `llm-enricher.test.ts` | 2 cases |
| A-8 | `llm-enricher.test.ts` | 1 snapshot |
| A-9 | `discord-webhook.test.ts` | 4 cases |
| B-1 | NEW `historical-enricher.test.ts` | 4 cases |
| B-2 | `event-pipeline-llm-gating.test.ts` | 3 cases |
| B-3 | `event-pipeline-metadata-persistence.test.ts` | 3 cases |
| B-4 | `pipeline-limiter.test.ts` | 2 cases |
| C-1 | NEW `theme-decay.test.ts` | 6 cases |
| C-2 | `integration/pipeline.test.ts` | 2 cases |
| C-3 | `llm-enricher.test.ts` | 3 cases |
| C-4 | `discord-webhook.test.ts` | 3 cases |
| C-5 | `discord-webhook.test.ts` | 2 cases |

**New test files:** 2 (`historical-enricher.test.ts`, `theme-decay.test.ts`)
**New module files:** 1 (`theme-decay.ts`)
**Total PRs:** 18
