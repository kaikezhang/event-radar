# Event Radar Data + AI Quality Research

Author: Codex
Date: 2026-03-24

## Scope

This review covered:

- backend pipeline wiring in `packages/backend/src/event-pipeline.ts`
- prompt and LLM pipeline code in `packages/backend/src/pipeline/`
- active scanner emit paths in `packages/backend/src/scanners/`
- outcome tracking and scorecard services in `packages/backend/src/services/`
- runtime env flags in `.env`

## Method And Runtime Limits

### Code-confirmed

- `.env` has `LLM_PROVIDER=openai`, `OPENAI_API_KEY` present, `LLM_ENRICHMENT_ENABLED=true`, and `LLM_GATEKEEPER_ENABLED=true`.
- Active scanners from `.env` plus `scanner-registry-setup.ts` are: `breaking-news`, `reddit`, `stocktwits`, `econ-calendar`, `truth-social`, `whitehouse`, `federal-register`, `sec-edgar`, `newswire`, `company-ir`, `trading-halt`, and `dilution-monitor`.
- `WARN_ENABLED=true` in `.env`, but `WarnScanner` is not registered in `packages/backend/src/scanner-registry-setup.ts`.

### Blocked Live-DB Access

I attempted the requested live queries three ways and all were blocked by the current execution environment:

1. `sudo docker exec ... psql ...`
   - blocked by `no new privileges`
2. `docker exec ... psql ...`
   - blocked by Docker socket permission denial
3. direct PostgreSQL TCP connect to `postgresql://radar:radar@localhost:5432/event_radar`
   - blocked with `connect EPERM 127.0.0.1:5432`

Because of that, I could not honestly provide fresh live counts, per-scanner real-event samples, or the requested 30-event manual review from the running database. Every section below is therefore split into:

- `Code-confirmed`
- `Blocked live query`
- `Inference`

Where useful, I included the exact SQL to run on the host outside this sandbox.

## Executive Summary

The biggest data-quality problem is not prompt wording. It is pipeline wiring.

1. Mainline LLM classification is effectively off in production boot.
2. LLM enrichment is on, but it runs only in the delivery path and is stored only in `events.metadata`.
3. Several active scanners emit low-context or no-ticker events, then rely on late heuristics or enrichment to recover quality.
4. Outcome tracking is wired on a timer now, but the code still allows silent no-ticker failures and penny-stock distortion.
5. Political and social sources are still overfit to keyword heuristics, while newswire and macro sources are too generic.

If I had to prioritize only three changes:

1. Wire `createLlmProvider()` into the main pipeline boot path.
2. Improve scanner-side ticker/entity extraction before events hit the pipeline.
3. Add outcome-quality guards: price floor, split/outlier handling, and explicit tracking-failure observability.

## 1. Scanner Data Quality

### Active Scanner Set

| Source | Enabled | Code-derived quality | Main issue |
| --- | --- | --- | --- |
| `sec-edgar` | yes | 8/10 | strong structure, but some 8-Ks are catch-all noise |
| `trading-halt` | yes | 9/10 | high quality, but resume events dilute signal stats |
| `company-ir` | yes | 7/10 | limited issuer list, short snippets |
| `dilution-monitor` | yes | 7/10 | good bearish signal, but ticker fallback can degrade precision |
| `whitehouse` | yes | 5/10 | weak ticker extraction, broad market policy often mapped to no ticker |
| `federal-register` | yes | 4/10 | many regulatory docs are too generic for single-ticker analytics |
| `truth-social` | yes | 4/10 | ticker extraction is regex-only; rhetoric and policy get mixed |
| `breaking-news` | yes | 3/10 | keyword bag only, no ticker extraction at scanner stage |
| `econ-calendar` | yes | 3/10 | body is template text; no actual release values |
| `reddit` | yes | 3/10 | many posts are commentary, not catalysts |
| `stocktwits` | yes | 3/10 | trend and volume spikes are mostly sentiment exhaust |
| `globenewswire` | yes | 4/10 | lots of PR noise; default feed list is GlobeNewswire-only |

### Code-confirmed Scanner Findings

#### `sec-edgar`

- Good:
  - `packages/backend/src/scanners/sec-edgar-scanner.ts:488-519` emits structured 8-K events with `item_types`, `item_descriptions`, accession number, and ticker list.
  - `packages/backend/src/scanners/sec-edgar-scanner.ts:522-553` emits Form 4 events with transaction value, shares, price per share, officer name, and ticker list.
- Bad:
  - `packages/backend/src/pipeline/default-rules.ts:216-228` treats 8-K `8.01` as `LOW`, but the scanner still emits all such filings; many are generic catch-all disclosures.
  - `packages/backend/src/scanners/sec-edgar-scanner.ts:494-518` stores `severity_hint` only in metadata; the main rule engine ignores it.

#### `trading-halt`

- Good:
  - `packages/backend/src/scanners/halt-scanner.ts:495-507` emits clean halt events with ticker, halt time, market, reason code, and bearish direction.
  - It is one of the few sources with near-perfect ticker coverage and concrete timestamps.
- Bad:
  - `packages/backend/src/scanners/halt-scanner.ts:522-534` also emits resume events, which are much less valuable than the halt itself but will still enter accuracy/outcome stats unless filtered downstream.

#### `company-ir`

- Good:
  - `packages/backend/src/scanners/ir-monitor-scanner.ts:260-277` and `:286-302` always attach a known ticker.
- Bad:
  - Body text is often only `trimSnippet(...)`, so downstream LLMs get shallow context.
  - Coverage is only the small configured issuer list from env/default config, not broad IR coverage.

#### `dilution-monitor`

- Good:
  - `packages/backend/src/scanners/dilution-scanner.ts:244-268` carries accession number, dilution type, estimated amount, direction, and ticker list.
- Bad:
  - `const ticker = entry.tickers[0] ?? entry.companyName` at `:241` contaminates titles with company-name fallback while `metadata.ticker` remains nullable. That produces mixed-quality entity identity.

#### `whitehouse`

- Good:
  - `packages/backend/src/scanners/whitehouse-scanner.ts:184-205` captures EO number, signing date, topics, and source URL.
- Bad:
  - Ticker extraction is only `extractTickers(fullText)`, which means most sector-wide orders end up with `NULL` ticker and weak downstream outcome tracking.

#### `federal-register`

- Good:
  - `packages/backend/src/scanners/federal-register-scanner.ts:136-157` preserves agency source and topics.
- Bad:
  - It emits as single `regulatory-action` events with sparse text and regex ticker extraction only; this is poor input for single-name scorecards.

#### `truth-social`

- Good:
  - `packages/backend/src/scanners/truth-social-scanner.ts:324-342` preserves author, post ID, keywords, and sentiment.
- Bad:
  - The title is just truncated post text, and ticker extraction is regex-only. Concrete policy posts with no cashtag fall through to late inference.

#### `breaking-news`

- Good:
  - `packages/backend/src/scanners/breaking-news-scanner.ts:232-253` at least records matched keywords and source feed.
- Bad:
  - No scanner-side ticker extraction at all.
  - The keyword list at `:15-43` is broad enough to admit generic market commentary.

#### `econ-calendar`

- Good:
  - It emits deterministic upcoming/released events with release times.
- Bad:
  - `packages/backend/src/scanners/econ-calendar-scanner.ts:154-189` emits template bodies without actual values, surprise magnitude, or historical context. That is weak input for both severity and outcome analytics.

#### `reddit`

- Good:
  - Engagement fields are preserved at `packages/backend/src/scanners/reddit-scanner.ts:160-170`.
- Bad:
  - Scanner ingests all hot posts from four subreddits; ticker extraction is regex-only and many posts are post-hoc commentary, not catalysts.

#### `stocktwits`

- Good:
  - It captures ticker-specific trend, sentiment-flip, and volume-spike events.
- Bad:
  - All emitted events are social reflexivity signals, not primary catalysts. This source should not be allowed to dominate `MEDIUM` severity without stronger downstream evidence.

#### `globenewswire`

- Good:
  - `packages/backend/src/scanners/newswire-scanner.ts:150-172` extracts category tickers and published time.
- Bad:
  - `DEFAULT_FEEDS` at `:23-45` contains only GlobeNewswire feeds. Despite the rest of the system knowing about `pr-newswire` and `businesswire`, the default live scanner does not actually fetch them.
  - Any event with a ticker passes the L1 newswire filter even without a relevance keyword.

### Blocked Live Query

Run this once per source on the host:

```sql
SELECT
  source,
  COUNT(*),
  COUNT(CASE WHEN ticker IS NOT NULL THEN 1 END) AS with_ticker,
  AVG(CASE WHEN length(summary) > 0 THEN length(summary) END) AS avg_body_len
FROM events
WHERE source = 'SCANNER_NAME'
GROUP BY source;
```

To pull 2 good + 2 bad real events per source, I would run:

```sql
-- likely good
SELECT id, source, ticker, severity, title, left(summary, 240) AS summary
FROM events
WHERE source = 'SCANNER_NAME'
  AND ticker IS NOT NULL
  AND summary IS NOT NULL
  AND length(summary) >= 120
ORDER BY created_at DESC
LIMIT 2;

-- likely bad
SELECT id, source, ticker, severity, title, left(summary, 240) AS summary
FROM events
WHERE source = 'SCANNER_NAME'
  AND (
    ticker IS NULL
    OR summary IS NULL
    OR length(coalesce(summary, '')) < 80
  )
ORDER BY created_at DESC
LIMIT 2;
```

## 2. LLM Pipeline Analysis

### Is LLM Classification Actually Running?

### Code-confirmed

- `.env` is configured for OpenAI and LLM enrichment.
- Main server boot in `packages/backend/src/index.ts:15-18` calls:

```ts
const { server, registry } = buildApp({
  db: dbCtx?.db,
  apiKey,
});
```

- `packages/backend/src/app.ts:113-115` only creates a pipeline `llmClassifier` when `options.llmProvider` exists.
- No `llmProvider` is passed from `index.ts`.
- Therefore the main ingestion pipeline runs with `llmClassifier === undefined` by default.

### Conclusion

Mainline event ingestion is not using LLM classification, even though `.env` suggests that it should be.

The only obvious place that always creates an LLM provider is the debug classify route in `packages/backend/src/route-registration.ts:128-133`.

### Classification Prompt Review

File: `packages/backend/src/pipeline/classification-prompt.ts`

#### What is good

- Tight JSON schema instruction.
- Political appendix for `truth-social` and `x`.
- Severity and confidence calibration bands exist.

#### What is missing

1. No few-shot examples for noisy sources like newswire, Reddit, StockTwits, Federal Register, White House.
2. No instruction to preserve structured source facts already available in metadata, such as SEC item types or halt reason codes.
3. No ticker/entity extraction output, so LLM classification cannot directly repair missing identity.
4. It hardcodes `direction = NEUTRAL` at `classification-prompt.ts:15,36`, which throws away useful directional signal.
5. It truncates body at 2,000 chars and provides no source-specific compression strategy for long filings.
6. It does not tell the model how to distinguish "market headline" from "retrospective article" or "social chatter" because that logic lives elsewhere in regex filters.

### Enrichment Prompt Review

File: `packages/backend/src/pipeline/llm-enricher.ts`

#### What is good

- Better than the classification prompt. It explicitly asks for summary, impact, why-now, risks, action, ticker list, and regime context.
- It can inject market regime, per-ticker setup, and historical pattern stats.

#### What is weak

1. The prompt is generic across scanners. SEC filings, halts, executive orders, and social posts all use the same enrichment template.
2. It does not tell the model which metadata keys matter by source.
3. It asks for ticker direction but gives no guidance on multi-ticker ordering or confidence.
4. It can only be as good as scanner-side entity extraction, which is still weak in several sources.
5. `LLMEnricher` uses `LLM_GATEKEEPER_API_KEY` before `OPENAI_API_KEY` at `llm-enricher.ts:144-148`, which is conceptually wrong config coupling.

### When Does Enrichment Run?

### Code-confirmed

- Enrichment only happens inside the alert-router branch in `packages/backend/src/event-pipeline.ts:267-521`.
- It runs when:
  - `llmEnricher.enabled === true`
  - and either `filterResult.enrichWithLLM === true` or severity is `HIGH/CRITICAL`
- So enrichment is downstream of:
  - rule classification
  - dedup
  - DB insert
  - L1 alert filter
  - optional L2 LLM gatekeeper

### Implication

If an event is filtered early, or if delivery is disabled, it never gets enriched. That means enrichment is not a general data-quality layer. It is a delivery-only layer.

### Does Enrichment Persist To DB?

### Yes, but only in JSONB

Code-confirmed in `packages/backend/src/event-pipeline.ts:431-489`:

- `event.metadata.llm_enrichment = llmEnrichResult`
- `UPDATE events SET metadata = ...`
- if enrichment provides a better ticker, it also updates `events.ticker`
- then it re-schedules outcome tracking

### What is not persisted cleanly

- no first-class columns for enrichment summary, impact, risks, or action label
- no normalized enrichment table
- no persisted raw LLM classification payload in `events`

Scorecard code reads enrichment back from `events.metadata`:

- `packages/backend/src/services/alert-scorecard.ts:156-199`
- `packages/backend/src/services/scorecard-semantics.ts:36-39`

## 3. Outcome Tracking Analysis

### Is `processOutcomes()` Called?

### Code-confirmed

Yes.

- `packages/backend/src/app.ts:405-423` starts `startOutcomeProcessingLoop(...)`
- startup delay: 2 minutes
- repeat interval: 15 minutes
- `packages/backend/src/outcome-loop.ts:19-67` runs `outcomeTracker.processOutcomes()`

### Is Outcome Tracking Scheduled For New Events?

Yes, twice:

- immediately after `storeEvent(...)` in `packages/backend/src/event-pipeline.ts:230-231`
- again after enrichment-derived ticker repair in `packages/backend/src/event-pipeline.ts:487-488`

### Risks

1. `scheduleOutcomeTrackingForEvent(...)` returns `Result<void, Error>`, but callers ignore it. Missing tickers silently fail.
2. `OutcomeTracker.extractTicker(...)` falls back to `llm_enrichment.tickers[0]` only after enrichment exists, which is late and inconsistent.
3. Percent moves are computed with no price floor at `packages/backend/src/services/outcome-tracker.ts:315-324` and `packages/backend/src/services/price-service.ts:274-278`.
4. There is no split/outlier guard before scorecard and win-rate aggregation.

### Penny-Stock / Outlier Distortion

### Code-confirmed

- I found no min-price or outlier filter in:
  - `packages/backend/src/services/outcome-tracker.ts`
  - `packages/backend/src/services/price-service.ts`
  - `packages/backend/src/services/win-rate-analysis.ts`

This means a move from `$0.20 -> $0.50` contributes `+150%` just like a clean catalyst on a liquid large-cap. That will corrupt source-level stats unless filtered.

### Blocked Live Query

Requested query:

```sql
SELECT COUNT(*), COUNT(CASE WHEN change_t5 IS NOT NULL THEN 1 END)
FROM event_outcomes;
```

Outlier query I would run on the host:

```sql
SELECT
  eo.event_id,
  eo.ticker,
  eo.event_price,
  eo.change_t5,
  eo.change_t20,
  eo.change_1d,
  e.source,
  e.title
FROM event_outcomes eo
JOIN events e ON e.id = eo.event_id
WHERE
  ABS(COALESCE(eo.change_t5, 0)) > 100
  OR ABS(COALESCE(eo.change_t20, 0)) > 100
  OR ABS(COALESCE(eo.change_1d, 0)) > 100
ORDER BY GREATEST(
  ABS(COALESCE(eo.change_t5, 0)),
  ABS(COALESCE(eo.change_t20, 0)),
  ABS(COALESCE(eo.change_1d, 0))
) DESC
LIMIT 50;
```

## 4. Classification Accuracy

### Blocked Live Review

I could not honestly pull:

- 30 `HIGH/CRITICAL` events
- 30 `MEDIUM` events
- manual ticker/severity review from the live DB

### Code-confirmed Misclassification Patterns

1. Political posts are over-promoted by keyword rules.
   - `packages/backend/src/pipeline/political-rules.ts:138-170`
   - simple keywords like `trade` or `tariff` can force `CRITICAL` before any semantic check
2. Main pipeline never reaches the LLM classifier by default.
   - so rule-engine biases dominate live severity
3. Newswire events are too often treated as passable if they merely have a ticker.
   - `packages/backend/src/pipeline/alert-filter.ts:295-316`
4. Breaking news has no scanner-side ticker extraction.
   - high-severity macro headlines become hard to track or attribute
5. `inferHighPriorityTicker(...)` can fall back to ETFs like `SPY`, `QQQ`, `XLE`, etc.
   - `packages/backend/src/pipeline/ticker-inference.ts:107-143`
   - that is useful for delivery context, but dangerous for outcome analytics
6. The prediction pipeline defaults missing directions to `neutral`.
   - `packages/backend/src/prediction-helpers.ts:57-60`
   - this suppresses meaningful direction evaluation
7. Social scanners emit a large volume of template sentiment events.
   - these look event-like but often do not correspond to tradeable catalysts

### Inference

The most common live misclassifications are likely:

- `MEDIUM` inflation on noisy social/newswire content
- `CRITICAL/HIGH` inflation on political keywords without concrete action
- false or missing tickers on macro/policy/regulatory events
- polluted scorecard outcomes from inferred ETF tickers and penny stocks

## 5. Top 10 Code Changes

| # | File + line | Current code | Proposed change | Expected improvement | Effort |
| --- | --- | --- | --- | --- | --- |
| 1 | `packages/backend/src/index.ts:15-18` | `buildApp({ db, apiKey })` never passes an LLM provider | Pass `llmProvider: createLlmProvider()` into `buildApp()` and add an explicit `LLM_CLASSIFIER_ENABLED` gate | Turns on actual LLM classification in the live pipeline | 1.5h |
| 2 | `packages/backend/src/app.ts:113-115` | pipeline classifier exists only when `options.llmProvider` is injected | Instantiate from env in app boot, not only from tests/custom callers | Removes the current config/code mismatch | 1h |
| 3 | `packages/backend/src/pipeline/classification-prompt.ts:11-38, 68-105` | generic classifier prompt, no few-shot examples, forced `NEUTRAL` direction | Add per-source few-shot examples, explicit "noisy article" negatives, and directional output for event types where direction is knowable | Better severity calibration and usable direction analytics | 4h |
| 4 | `packages/backend/src/pipeline/political-rules.ts:138-170` | tariff/trade keywords can force `CRITICAL` on Truth Social | Downgrade keyword rules to tags/priority boosts only, let semantic LLM or stricter action verbs decide final severity | Reduces false `CRITICAL` political alerts | 3h |
| 5 | `packages/backend/src/scanners/breaking-news-scanner.ts:232-253` | keyword match only, no ticker extraction | Run entity extraction here, add company-map support, and emit market-wide index/ETF intent explicitly instead of leaving ticker empty | Improves ticker coverage and outcome tracking for macro headlines | 3h |
| 6 | `packages/backend/src/scanners/newswire-scanner.ts:23-45, 150-172` | default feeds are GlobeNewswire-only; any tickered PR becomes viable input | Add real PR Newswire/BusinessWire feeds, stricter scanner-side relevance scoring, and richer metadata about release type | Less PR spam, better source mix | 4h |
| 7 | `packages/backend/src/scanners/ticker-extractor.ts:24-64` and `packages/backend/src/pipeline/ticker-inference.ts:119-143` | regex-only extraction plus late ETF fallback | Merge company-name mapping into extractor; ban ETF fallback for outcome tracking unless explicitly marked `market_proxy=true` | Fewer false tickers and less corrupted analytics | 4h |
| 8 | `packages/backend/src/event-pipeline.ts:162-177` | high-priority missing tickers get inferred before enrichment, including ETF fallback | Delay irreversible ticker writes until stronger entity evidence exists; write inferred market proxies to a separate metadata field | Prevents fake single-name tickers from entering `events.ticker` | 3h |
| 9 | `packages/backend/src/services/outcome-tracker.ts:104-127, 315-324` | no-ticker failures are silent to callers; no price floor/outlier guard | Add explicit metrics/audit for schedule failures, minimum-price threshold, and split/outlier rejection before aggregate stats | Cleaner scorecards and easier debugging | 5h |
| 10 | `packages/backend/src/scanner-registry-setup.ts:1-86` | `WARN_ENABLED` exists in env but `WarnScanner` is never registered | Register `WarnScanner` behind its env gate or remove the dead env var | Restores an expected bearish labor-signal source and removes config drift | 1h |

## 6. Additional Concrete Findings

### Delivery-only Enrichment Is A Structural Problem

`LLMEnricher` currently improves only events that survive delivery gating. If the product goal is better stored data, enrichment should have a storage mode separate from notification mode.

### Scorecard Direction Is Still Fragile

- `packages/backend/src/services/scorecard-semantics.ts:61-70` resolves direction from prediction, metadata, or enrichment ticker direction.
- But the main classification prompt forces `NEUTRAL`, and the live pipeline does not wire LLM classification at boot.
- That means direction quality is coming from ad hoc metadata and late enrichment, not from a coherent classification system.

### Prior Repo Docs Already Pointed At Some Of This

These are stale baselines, not fresh live queries:

- `docs/ai-observability-rfc.md` says `event_outcomes` had price rows but null change fields when the cron was not running.
- `docs/ROADMAP-DATA-QUALITY.md` says `MEDIUM` was heavily inflated and null tickers were a major issue.

The current code fixes some wiring, but the core source-quality and entity-resolution problems remain.

## 7. Exact Host Queries To Finish The Blocked Live Sections

### Per-source quality

```sql
SELECT
  source,
  COUNT(*) AS total,
  COUNT(CASE WHEN ticker IS NOT NULL THEN 1 END) AS with_ticker,
  ROUND(AVG(CASE WHEN length(summary) > 0 THEN length(summary) END)) AS avg_body_len
FROM events
GROUP BY source
ORDER BY total DESC;
```

### Enrichment persistence

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE metadata ? 'llm_enrichment') AS with_enrichment,
  COUNT(*) FILTER (WHERE metadata ? 'llm_judge') AS with_judge,
  COUNT(*) FILTER (WHERE metadata ? 'enrichment_failed') AS enrich_failed
FROM events;
```

### High/Critical manual review sample

```sql
SELECT
  id, source, severity, ticker, title, left(summary, 300) AS summary, metadata
FROM events
WHERE severity IN ('HIGH', 'CRITICAL')
ORDER BY created_at DESC
LIMIT 30;
```

### Medium manual review sample

```sql
SELECT
  id, source, severity, ticker, title, left(summary, 300) AS summary, metadata
FROM events
WHERE severity = 'MEDIUM'
ORDER BY created_at DESC
LIMIT 30;
```

### Outcome health

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE change_t5 IS NOT NULL) AS with_t5,
  COUNT(*) FILTER (WHERE change_t20 IS NOT NULL) AS with_t20,
  COUNT(*) FILTER (WHERE change_1d IS NOT NULL) AS with_1d,
  COUNT(*) FILTER (WHERE event_price IS NULL) AS missing_event_price
FROM event_outcomes;
```

### Outlier audit

```sql
SELECT
  eo.event_id,
  eo.ticker,
  eo.event_price,
  eo.change_t5,
  eo.change_t20,
  eo.change_1d,
  e.source,
  e.severity,
  e.title
FROM event_outcomes eo
JOIN events e ON e.id = eo.event_id
WHERE ABS(COALESCE(change_t5, 0)) > 100
   OR ABS(COALESCE(change_t20, 0)) > 100
   OR ABS(COALESCE(change_1d, 0)) > 100
ORDER BY e.created_at DESC;
```

## Final Assessment

The system already has the pieces needed for much better data quality, but they are not aligned:

- scanner outputs are inconsistent
- LLM classification is not actually in the default live path
- enrichment is too late and too loosely stored
- outcome analytics trust any ticker and any percent move too easily

This is fixable without major architecture changes. The next win is not "add more AI." It is "make the current signals structured, attributable, and measurable from scanner ingress all the way to outcome stats."
