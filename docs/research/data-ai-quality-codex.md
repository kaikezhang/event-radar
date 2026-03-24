# Deep Research: Data Quality and AI Analysis Quality

**Date:** 2026-03-24  
**Author:** Codex  
**Scope:** `packages/backend/src/pipeline/`, `packages/backend/src/scanners/`, `packages/backend/src/services/`, live Postgres data, and current backend container logs

---

## Executive Summary

As of **2026-03-24 02:47 UTC**, the live database contains **25,701 events**. The main quality problems are not evenly distributed:

1. **Live "LLM classification" is effectively off.** `classification_predictions` contains **24,712** rows and **24,712/24,712** are `classified_by = 'rule-engine'`. The classifier prompt exists in code, but the ingest pipeline only constructs `llmClassifier` when `options.llmProvider` is passed in `packages/backend/src/app.ts:113-115`.
2. **Ticker resolution is the biggest data-quality bottleneck.** Recent coverage is extremely weak for the sources that need it most: `sec-edgar` **15.5%**, `breaking-news` **3.7%**, `truth-social` **5.5%**, `newswire` **12.6%**, `whitehouse` **0%**, `federal-register` **0%**.
3. **Outcome tracking is running, but most of the dataset is stuck in partially evaluated state.** `event_outcomes` has **12,591** rows, but **12,063** rows are overdue for `1h`, **11,493** overdue for `1d`, and **8,208** overdue for `1w`. Only **324** events have `classification_outcomes`.
4. **The current 1-hour outcome metric is fundamentally wrong.** `PriceService` fetches Yahoo data with `interval=1d` only (`packages/backend/src/services/price-service.ts:201-237`), yet `OutcomeTracker` uses it for `T+1h`. Among non-null `change_1h` values, **89.9% are exactly `0.0000`**.
5. **Enrichment coverage exists but quality is mixed and usually generic.** `events.metadata.llm_enrichment` exists for **3,464 / 25,701 events (13.5%)**, but **1,685** enriched events have no ticker, **3,023** have empty `currentSetup`, and **2,859** have empty `historicalContext`. `sec-edgar` enrichments are mostly boilerplate restatements.
6. **Scanner value is highly uneven.** Only **6 sources** produced events in the last 48 hours (`sec-edgar`, `stocktwits`, `breaking-news`, `truth-social`, `trading-halt`, `globenewswire`). Three enabled scanners (`reddit`, `company-ir`, `dilution-monitor`) produced **zero** audited rows.
7. **Breaking-news source health is degraded right now.** Current backend logs show repeated `Reuters returned HTTP 404`, `AP News returned HTTP 403`, and `0 matched keywords` for MarketWatch/CNBC/Yahoo Finance on every poll in the last 30 minutes.

---

## Methodology

- Code review:
  - `packages/backend/src/pipeline/`
  - `packages/backend/src/scanners/`
  - `packages/backend/src/services/`
- Live DB tables queried:
  - `events`
  - `pipeline_audit`
  - `classification_predictions`
  - `classification_outcomes`
  - `event_outcomes`
- Runtime verification:
  - `event-radar-backend-1` logs
  - `event-radar-postgres-1` live SQL via `psql`

Important caveat:

- "LLM classification quality" in the live system is mostly a deployment/wiring question, because the production backend is storing only `rule-engine` predictions. The prompt exists; the live ingest path is not using it.

---

## 1. Scanner Output Quality

### 1.1 Active scanner summary

These are the **12 scanners enabled by env/config in the live backend**. Counts below are scanner-group aggregates over their DB source names.

| Scanner | Stored events | Ticker coverage | Severity mix | Pipeline audits | Delivered | Main issue | Quality |
|---|---:|---:|---|---:|---:|---|---:|
| `sec-edgar` | 10,727 | 15.5% | 57 C / 762 H / 9,642 M / 266 L | 11,456 | 91 | Missing tickers and generic Form 4 noise | 5/10 |
| `stocktwits` | 9,387 | 100.0% | 0 C / 21 H / 7 M / 9,359 L | 8,216 | 0 | Almost all low-information trend spam | 4/10 |
| `breaking-news` | 3,683 | 3.7% | 610 C / 309 H / 2,764 M / 0 L | 2,081 | 84 | Keyword precision and ticker extraction are poor | 5/10 |
| `trading-halt` | 394 | 100.0% | 0 C / 316 H / 78 M / 0 L | 614 | 16 | Useful structure, but many unknown microcaps and resume spam | 7/10 |
| `newswire` | 199 | 12.6% | 0 C / 10 H / 189 M / 0 L | 208 | 12 | Mostly promotional PR with no ticker | 3/10 |
| `truth-social` | 181 | 5.5% | 5 C / 6 H / 170 M / 0 L | 200 | 1 | Mostly political chatter, very weak ticker mapping | 3/10 |
| `federal-register` | 72 | 0.0% | 0 C / 1 H / 71 M / 0 L | 83 | 0 | Source pollution + stale notices + no tickers | 2/10 |
| `whitehouse` | 61 | 0.0% | 0 C / 20 H / 41 M / 0 L | 1 | 0 | Potentially valuable source, but current rows are stale and untickered | 3/10 |
| `econ-calendar` | 8 | 0.0% | 0 C / 0 H / 8 M / 0 L | 4 | 0 | Clean structure, but no surprise/actual-vs-consensus data | 4/10 |
| `reddit` | 0 | n/a | none | 0 | 0 | Enabled but no live output | 1/10 |
| `company-ir` | 0 | n/a | none | 0 | 0 | Enabled but no live output | 1/10 |
| `dilution-monitor` | 0 | n/a | none | 0 | 0 | Enabled but no live output | 1/10 |

### 1.2 Scanner examples

Each scanner below includes **3 live examples** when available. "Good" means structured and plausibly useful. "Bad" means noisy, stale, mis-tickered, or operationally low-value.

#### `sec-edgar`

- Good: `SEC 8-K: CBRE GROUP, INC. — Item 5.02 ...` (`pipeline_audit` delivered, ticker `CBRE`, HIGH)
- Bad: `SEC Form 4: Dickman Thomas J filed insider trade disclosure for Fold Holdings, Inc.` (`events` stored with no ticker)
- Bad: `SEC 8-K: INTERGROUP CORP — Item 4.01 ...` (`events` stored with inferred fallback ticker `SPY`)

Assessment:

- Scanner emits rich metadata (`issuer_name`, `transaction_value`, `item_types`, `severity_hint`) in `packages/backend/src/scanners/sec-edgar-scanner.ts:488-553`.
- The data quality problem is not lack of structure; it is **weak live ticker resolution** and **too much routine Form 4 volume**.
- Recent filtered reasons show `sec-edgar` is paying LLM-gate cost to rediscover "routine filing" thousands of times.

#### `stocktwits`

- Bad: `STEM entered StockTwits trending` (`LOW`, filtered as `social noise: 0 upvotes, 0 comments`)
- Bad: `SMMT entered StockTwits trending` (`LOW`, filtered as `social noise`)
- Bad: `SLB entered StockTwits trending` (`LOW`, filtered as `social noise`)

Assessment:

- Ticker coverage is perfect because the scanner writes it directly.
- Product value is poor: the dominant event text is one repeated template, and `pipeline_audit` shows **5,764** filtered for `social_noise`.
- It still floods `events` and `classification_predictions`, which drowns the recent sample and pollutes analytics.

#### `breaking-news`

- Good: `Apollo gives investors only 45% of requested withdrawals from $15 billion private credit fund` (delivered, enriched, macro/credit relevance)
- Bad: `Oil rises with Brent crossing $100 a barrel again as Middle East tensions keep traders on edge` (stored as `MEDIUM`, no ticker, then filtered by LLM as retrospective commentary)
- Bad: `Jim Cramer says Monday's market rally may be short-lived` (stored as `HIGH`, ticker `CNBC`, opinion content)

Assessment:

- The scanner is too dependent on broad keywords in `packages/backend/src/scanners/breaking-news-scanner.ts:14-43`.
- Live logs show feed health issues and weak recall right now:
  - `Reuters returned HTTP 404`
  - `AP News returned HTTP 403`
  - `Fetched 10 items from MarketWatch, 0 matched keywords`
  - `Fetched 30 items from CNBC, 0 matched keywords`
  - `Fetched 44 items from Yahoo Finance, 0 matched keywords`
- Ticker coverage is only **3.7%**, so even useful macro events are rarely tracked or evaluated correctly downstream.

#### `trading-halt`

- Good: `WNW trading HALTED — Other / Unknown` (delivered, HIGH)
- Good: `PTHS trading HALTED — Volatility Trading Pause (MWCB)` (enriched, structured)
- Bad: `HDLB trading RESUMED` (stored as event, then filtered by cooldown)

Assessment:

- This is one of the best-structured scanners in the system.
- The main problem is downstream prioritization: many halts are on obscure or microcap symbols, and resumes add noise.
- Enrichment quality is middling because the model can only say "trading halt implies volatility."

#### `newswire`

- Good: `Unixell Biotech receives IND clearance by FDA for its Allogeneic iPSC-Derived cell therapy ...` (delivered, HIGH)
- Bad: `Hydrogen Fuel Cell Recycling Market to More Than Double ...` (filtered: `newswire noise: no US ticker and no relevance keyword`)
- Bad: `Lipton Hard Iced Tea Drops a Zero Sugar Game-Changer` (filtered as newswire noise)

Assessment:

- The scanner correctly normalizes sources into `pr-newswire`, `globenewswire`, and `businesswire` in `packages/backend/src/scanners/newswire-scanner.ts`.
- In practice, most live rows are generic PR copy with no reliable US equity ticker.
- Only **12/208** newswire audit rows were delivered.

#### `truth-social`

- Good: `If Iran does not FULLY OPEN the Strait of Hormuz within 48 HOURS ...` (delivered as CRITICAL, ticker `XLE`)
- Bad: `There is a very important Special Election tomorrow ...` (filtered by LLM as political endorsement, no market impact)
- Bad: `[No Title] - Post from March 23, 2026` (deduped copies of parse-degraded posts)

Assessment:

- This source can produce genuinely important geopolitical alerts.
- Most recent live rows are campaign or rhetoric content with no ticker and no actionable market mapping.
- The scanner is fragile because it parses a third-party mirror with regex-heavy extraction.

#### `federal-register`

- Bad: `[Notice] Foreign-Trade Zone 27; Application for Subzone ...` (filtered as stale)
- Bad: `[Notice] Notice of OFAC Sanctions Action` (filtered as stale)
- Bad: `[Rule] Schedules of Controlled Substances ...` (written under source `fda`, even though it arrived through the federal-register path)

Assessment:

- `packages/backend/src/scanners/federal-register-scanner.ts:130-185` assigns `source` by title/abstract heuristics rather than authoritative agency IDs.
- This pollutes source-level analytics and can make the same scanner look like multiple independent sources.
- Current live rows are untickered and stale.

#### `whitehouse`

- Good-ish: `Presidential Document: Ending Certain Tariff Actions` (policy-relevant title)
- Bad: `Presidential Document: Adjusting Certain Delegations Under the Defense Production Act` (stored, no ticker, stale)
- Bad: `Presidential Document: Presidential Waiver of Statutory Requirements ...` (stored, no ticker)

Assessment:

- This scanner can be important, but current live rows are sparse and untickered.
- `pipeline_audit` shows almost no current live throughput and no deliveries.

#### `econ-calendar`

- Good-ish: `Initial Jobless Claims — Data Released`
- Bad: `Initial Jobless Claims releasing in 15 min`
- Bad: `Retail Sales releasing in 14 min`

Assessment:

- The scanner is clean and structured.
- The current problem is that it emits generic scheduling events without surprise data or market delta, so the downstream system treats them as routine.

#### `reddit`

- No live events in `events`
- No live rows in `pipeline_audit`
- Enabled, but operationally absent

Assessment: no usable output right now.

#### `company-ir`

- No live events in `events`
- No live rows in `pipeline_audit`
- Enabled, but operationally absent

Assessment: no usable output right now.

#### `dilution-monitor`

- No live events in `events`
- No live rows in `pipeline_audit`
- Enabled, but operationally absent

Assessment: no usable output right now.

### 1.3 Scanner-quality conclusions

- Best live scanners: `trading-halt`, then `sec-edgar` once ticker quality is fixed.
- Highest wasted volume: `stocktwits` and routine `sec-edgar` Form 4s.
- Highest structural opportunity: `breaking-news` and `whitehouse`.
- Highest operational concern: enabled scanners with **zero** live rows (`reddit`, `company-ir`, `dilution-monitor`).

---

## 2. Classification Quality

### 2.1 Primary finding: the live ingest path is not using the LLM classifier

This is the most important fact in this section.

- `classification_predictions`: **24,712**
- `classified_by = 'rule-engine'`: **24,712**
- `classified_by = 'hybrid'`: **0**

Code path:

- `packages/backend/src/app.ts:113-115` only creates `llmClassifier` when `options.llmProvider` is passed.
- The prompt in `packages/backend/src/pipeline/classification-prompt.ts` is real, but it is not driving live ingest in the current deployment.

So the live "LLM classification quality" answer is:

- **Prompt quality matters for future work**
- **Current production classification quality is rule-engine quality**

### 2.2 Recent 50 classified events

The **50 most recent predictions** break down like this:

| Source | Count |
|---|---:|
| `stocktwits` | 37 |
| `sec-edgar` | 12 |
| `breaking-news` | 1 |

Manual assessment of that recent-50 sample:

- **Severity**
  - `stocktwits`: the current `LOW` severity is reasonable for the repeated "`X entered StockTwits trending`" template.
  - `sec-edgar`: the current `MEDIUM` default is too blunt. It ignores transaction size, issuer importance, and whether the filing is actually notable.
  - `breaking-news`: the one sampled oil headline being `MEDIUM` is arguable, but the missing ticker and weak keyword signal make the classification less useful than it looks.
- **Ticker**
  - `stocktwits`: mostly correct, because the scanner writes it directly.
  - `sec-edgar`: **12/12 recent rows** in the sample were missing a top-level ticker even though the issuer/company was obvious from title/metadata.
  - `breaking-news`: missing ticker on a clearly market-relevant oil story.
- **Direction**
  - **0/50 useful**
  - Every recent sampled prediction had `predicted_direction = neutral`

Broader live metrics:

- `predicted_direction = neutral`: **24,490 / 24,712 (99.1%)**
- `bearish`: **222**
- `bullish`: **0**
- `confidence = 0.8000`: **23,149 / 24,712 (93.7%)**

Interpretation:

- The classifier output is almost entirely default-confidence, default-direction, rule-based labeling.
- Even when the labels are superficially "reasonable", they are not informative enough for trading decisions.

### 2.3 Precision / recall for `CRITICAL` and `HIGH`

I computed actual severity from the same thresholds used by `ClassificationAccuracyService`:

- `CRITICAL` = max absolute move across 1h/1d/1w >= 5%
- `HIGH` = >= 3%
- `MEDIUM` = >= 1%
- `LOW` = < 1%

But there is a major caveat:

- Only **324 / 24,712 predictions (1.3%)** have `classification_outcomes`
- All **324** evaluated rows come from **older `stocktwits` rows**
- In that evaluated slice, **all predictions were `MEDIUM`**

That means the live precision/recall numbers are currently:

| Metric | TP | FP | FN | Precision | Recall |
|---|---:|---:|---:|---:|---:|
| `CRITICAL` exact | 0 | 0 | 166 | n/a | 0.0000 |
| `HIGH` exact | 0 | 0 | 62 | n/a | 0.0000 |
| `HIGH + CRITICAL` combined | 0 | 0 | 228 | n/a | 0.0000 |

These numbers are bad, but more importantly they show the evaluation system is not sampling the important event classes at all.

Additional severity metric:

- Evaluated rows: **324**
- Exact severity match: **80 / 324**
- Severity accuracy: **24.7%**

### 2.4 Why the classification quality is weak

Code-level reasons:

1. `packages/backend/src/pipeline/classification-prompt.ts:13-38` explicitly tells the model to set `direction` to `NEUTRAL`.
2. `packages/backend/src/pipeline/classification-prompt.ts:68-72` accepts `ruleResult` but discards it, so the prompt never sees structured rule context.
3. `packages/backend/src/pipeline/default-rules.ts:323-620` contains many title-only heuristics (`acquire`, `merge`, `EPS`, `Phase 1`, `appoint`, `resign`) that are too broad.
4. `packages/backend/src/pipeline/macro-rules.ts:138-200` uses broad breaking-news keyword triggers like `war`, `tariff`, `sanction`.
5. `packages/backend/src/pipeline/ticker-inference.ts:107-143` falls back to sector ETFs like `QQQ`, `SPY`, `XLE`, which creates proxy tickers that look cleaner than the underlying data really is.

Live evidence for the fallback issue:

- `events` rows with `metadata.ticker_inference_strategy = 'fallback'`: **65**
- Recent examples:
  - `breaking-news` -> `QQQ` for `Stock futures are little changed ... Iran`
  - `sec-edgar` -> `SPY` for `INTERGROUP CORP — Item 4.01`
  - `sec-edgar` -> `QQQ` for `GLOBUS MEDICAL INC — Item 5.02`

### 2.5 Full classification prompt for a real event

This is the prompt generated from the real `breaking-news` event:

Title:

`Oil rises with Brent crossing $100 a barrel again as Middle East tensions keep traders on edge`

Prompt:

```text
You are a financial event classifier for a real-time trading intelligence platform.

Given an event from a financial data source, classify it by:
1. **severity**: CRITICAL | HIGH | MEDIUM | LOW — how market-moving is this event?
2. **direction**: always set to NEUTRAL
3. **eventType**: choose exactly one of these labels: earnings_beat, earnings_miss, earnings_guidance, earnings, earnings_preannouncement, guidance_update, sec_form_8k, sec_form_4, sec_form_10q, sec_form_10k, sec_investigation, regulation_fd, fda_approval, fda_rejection, fda_orphan_drug, drug_trial, ftc_antitrust, doj_settlement, executive_order, congress_bill, federal_register, antitrust_action, regulatory_enforcement, sanctions, export_control, tax_policy, trade_policy, economic_data, fed_announcement, macro_policy, unusual_options, insider_large_trade, short_interest, options_flow, insider_purchase, insider_sale, trading_halt, social_volume_spike, reddit_trending, rumor, opinion, acquisition_disposition, bankruptcy, buyback, conference_appearance, contract_material, credit_downgrade, cybersecurity_incident, delisting, dividend_change, financing, labor_disruption, leadership_change, legal_ruling, licensing, plant_shutdown, rating_upgrade, restructuring, service_outage, share_offering, shareholder_vote, stock_split, strategic_review, supply_chain, news_breaking
4. **confidence**: 0 to 1 — how confident are you in this classification?
5. **reasoning**: 1-3 sentence explanation of your classification
6. **tags**: array of relevant string tags
7. **priority**: 0-100 — lower number = higher priority

SEVERITY CALIBRATION:
- CRITICAL: Trading halts, FDA drug approvals/rejections, major M&A (>$1B), presidential executive orders affecting specific sectors, earnings surprises >20%. These events move prices 5%+ immediately.
- HIGH: SEC insider trading (Form 4 large transactions >$1M), analyst upgrades/downgrades from major firms, earnings surprises 5-20%, significant regulatory actions. These events move prices 2-5%.
- MEDIUM: Routine SEC filings (10-Q, 10-K), earnings in-line with estimates, industry reports, moderate news. Prices may move 0.5-2%.
- LOW: Social media trending without news catalyst, routine corporate updates, conference presentations, minor regulatory filings. Minimal price impact expected.

CONFIDENCE CALIBRATION:
- Use the FULL range 0.3 to 0.95
- 0.9+ = unambiguous event with clear market impact (e.g., trading halt, FDA decision)
- 0.7-0.9 = likely classification but some ambiguity
- 0.5-0.7 = uncertain, could go either way
- 0.3-0.5 = best guess, limited information
- NEVER output 1.0 or 0.0

Set direction to NEUTRAL. Direction prediction is not used in the current version.

Respond ONLY with valid JSON. No markdown, no code fences, no extra text.

--- EVENT ---
Source: breaking-news
Type: news_breaking
Title: Oil rises with Brent crossing $100 a barrel again as Middle East tensions keep traders on edge
Body: Trump's statement sent oil lower, while equities jumped. Still, the recovery on Tuesday suggests lingering skepticism over Trump signaling a de-escalation.
URL: https://www.cnbc.com/2026/03/24/oil-prices-today-wti-brent-middle-east-iran-war.html
Metadata: {"url":"https://www.cnbc.com/2026/03/24/oil-prices-today-wti-brent-middle-east-iran-war.html","headline":"Oil rises with Brent crossing $100 a barrel again as Middle East tensions keep traders on edge","source_feed":"CNBC","matched_keywords":["trade"]}
Timestamp: 2026-03-24T01:51:32.000Z

--- OUTPUT FORMAT ---
Respond with JSON: { "severity", "direction", "eventType", "confidence", "reasoning", "tags", "priority" }
```

Bottom line:

- The prompt is coherent, but it is currently **not powering live ingest**
- Even if enabled, it would still be hamstrung by `direction = NEUTRAL` and missing rule context

---

## 3. LLM Enrichment Quality

### 3.1 Coverage

`events.metadata.llm_enrichment` coverage:

- Enriched events: **3,464 / 25,701 (13.5%)**

By source:

| Source | Enriched | Source total | Coverage |
|---|---:|---:|---:|
| `sec-edgar` | 3,244 | 10,727 | 30.2% |
| `trading-halt` | 113 | 394 | 28.7% |
| `breaking-news` | 105 | 3,683 | 2.9% |
| `truth-social` | 2 | 181 | 1.1% |
| all other live sources | 0 | varies | 0.0% |

Field-level completeness:

| Metric | Count |
|---|---:|
| Enriched events | 3,464 |
| No tickers in enrichment | 1,685 |
| Empty `currentSetup` | 3,023 |
| Empty `historicalContext` | 2,859 |
| Empty `regimeContext` | 105 |

Action label distribution:

| Action | Count |
|---|---:|
| `🟡 Monitor` | 3,138 |
| `🟢 Background` | 277 |
| `🔴 High-Quality Setup` | 20 |
| legacy / inconsistent labels (`🔴 立即关注`, `🟡 持续观察`, empty) | 29 |

Interpretation:

- The enricher is heavily biased toward `🟡 Monitor`
- It rarely produces a strong setup call
- It often omits the exact fields that were meant to add differentiated value

### 3.2 Sampled enrichment quality

I reviewed 10 live enrichments manually:

| Event | Assessment | Value add |
|---|---|---|
| `Apollo gives investors only 45% of requested withdrawals ...` | Good | Adds real market framing beyond the title |
| `Brent oil prices claw back losses to top $100 again after hours` | Good | Useful macro takeaway and ticker direction |
| `Iran targets UAE energy infrastructure ...` | Strong | One of the few real `🔴 High-Quality Setup` outputs |
| `SEC Form 4: Zakrzewski Joseph S ... AN2 Therapeutics` | Weak | Mostly rewrites the title |
| `SEC Form 4: Wong Stephanie ... AN2 Therapeutics` | Weak | Generic "insider trades can indicate confidence" boilerplate |
| `SEC Form 4: Gray Bradley G ... Diversified Energy Co` | Weak | No specific trade context, no actual signal |
| `SEC 8-K: CEA Industries Inc. — Item 5.02 ...` | Fair | Some leadership-change framing, still generic |
| `SEC 8-K: HARMONIC INC. — Item 1.01 ...` | Fair | Slightly useful, but still abstract |
| `HDLB trading HALTED — Volatility Trading Pause (MWCB)` | Fair | Correct but repetitive |
| `RDACU trading HALTED — Other / Unknown` | Weak | Generic uncertainty language, no real edge |

Overall rating:

- `breaking-news`: 6-7/10
- `trading-halt`: 4-5/10
- `sec-edgar`: 2-4/10

The most common `sec-edgar` impact strings are near-duplicates, for example:

- `Insider trades can indicate management's confidence in the company's future, potentially influencing investor sentiment.`
- `Insider trading disclosures can indicate management's confidence in the company's future, potentially influencing investor sentiment.`

That repetition is consistent with low-information enrichment that restates a generic pattern instead of the actual filing details.

### 3.3 Is enrichment adding value?

Short answer:

- **Sometimes** for macro / breaking news
- **Rarely** for `sec-edgar` Form 4
- **Marginally** for trading halts

Practical verdict:

- Value-add is real on the small subset of geopolitical / macro / urgent news.
- For the majority of enriched volume, the system is spending tokens to produce polished paraphrase, not differentiated analysis.

### 3.4 Full enrichment prompt

System prompt from `packages/backend/src/pipeline/llm-enricher.ts`:

```text
You are a stock market event analyst. Produce concise, trader-usable intelligence in English and respond ONLY with valid JSON (no markdown, no code fences).

Rules:
- Reason from the event catalyst first, then current market setup, then historical analog stats.
- Keep each field specific and compact. No generic AI filler.
- Do not use BUY, SELL, HOLD, or any personal financial advice language.
- Never state what a trader should do. State what the data shows and what historically followed.
- Frame as intelligence, not recommendations.
- If market setup or historical analog data is unavailable, omit that field or return an empty string.
- For tickers: identify directly impacted US-listed tickers when they are explicit or strongly implied in the event. Do NOT guess proxies, ETFs, or loosely related names. Return tickers: [] if no clear directly impacted ticker exists.
- For direction: prefer bullish or bearish. Use neutral only when the impact is genuinely ambiguous (this should be rare — most events lean one way).

Classify signal quality:
- 🔴 High-Quality Setup: Strong catalyst + favorable current context + historical support
- 🟡 Monitor: Notable catalyst, needs monitoring or confirmation
- 🟢 Background: Routine event, low immediate trading relevance

Use this exact schema:
{
  "summary": "1-2 sentence English summary of what happened",
  "impact": "1-2 sentence English trader takeaway on why the event matters",
  "whyNow": "1 concise sentence on why the setup matters right now",
  "currentSetup": "1 concise sentence on the current per-ticker market setup (omit if unavailable)",
  "historicalContext": "1 concise sentence on relevant historical pattern stats (omit if unavailable)",
  "risks": "1 concise sentence on the main invalidation or risk to this read",
  "action": "one of: 🔴 High-Quality Setup, 🟡 Monitor, 🟢 Background",
  "tickers": [{"symbol": "TICKER", "direction": "bullish|bearish|neutral"}],
  "regimeContext": "1 sentence in English on how the current market regime amplifies or dampens this event's impact (omit if no market context provided)"
}
```

Real user prompt example (for the Apollo private-credit event):

```text
Event: Apollo gives investors only 45% of requested withdrawals from $15 billion private credit fund
Details: The withdrawals show that Apollo didn't avoid the rush of investor redemptions plaguing rivals, driven by concern over private credit loans to software firms.
Source: breaking-news
Metadata: {"url":"https://www.cnbc.com/2026/03/23/apollo-private-credit-fund-gives-investors-only-45percent-of-requested-withdrawals.html","headline":"Apollo gives investors only 45% of requested withdrawals from $15 billion private credit fund","source_feed":"CNBC","matched_keywords":["war"]}
```

Two important prompt-quality issues:

1. `packages/backend/src/pipeline/llm-enricher.ts:167-177` does not put classifier severity/event-type/reasoning into the prompt text.
2. `packages/backend/src/pipeline/llm-enricher.ts:197-205` does raw `JSON.parse(text)` only, unlike the classifier which strips code fences first.

---

## 4. Outcome Tracking Quality

### 4.1 Coverage by source

| Source | Events | Outcome rows | Coverage | 1h done | 1d done | 1w done | T+5 done | T+20 done |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `stocktwits` | 9,387 | 9,375 | 99.9% | 512 | 472 | 372 | 6,308 | 0 |
| `sec-edgar` | 10,727 | 1,663 | 15.5% | 1 | 1 | 0 | 1 | 0 |
| `breaking-news` | 3,683 | 135 | 3.7% | 0 | 0 | 0 | 5 | 0 |
| `trading-halt` | 394 | 394 | 100.0% | 0 | 0 | 17 | 213 | 17 |
| `newswire` (`pr-newswire` + `globenewswire`) | 199 | 25 | 12.6% | 0 | 0 | 0 | 24 | 0 |
| `truth-social` | 181 | 10 | 5.5% | 0 | 0 | 0 | 2 | 0 |
| `whitehouse`, `federal-register`, `econ-calendar` | 141 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 |

Key numbers:

- `event_outcomes` rows: **12,591**
- `event_price IS NULL`: **4,308**
- `change_1h IS NULL`: **12,078**
- `change_1d IS NULL`: **12,117**
- `change_1w IS NULL`: **12,202**
- `change_t20 IS NULL`: **12,574**

### 4.2 Is `processOutcomes()` running?

Yes, but only partially effectively.

Evidence:

- Current container logs show:
  - `2026-03-24T02:33:29.251001220Z [outcome-tracker] Starting periodic outcome backfill`
- `event_outcomes.updated_at` shows fresh writes:
  - **23 rows updated in the last 30 minutes**
  - latest update at **2026-03-24 02:48:31 UTC**

So the loop is alive.

But the backlog is large:

- Overdue `1h` rows: **12,063**
- Overdue `1d` rows: **11,493**
- Overdue `1w` rows: **8,208**
- `T+5` rows already evaluated-but-still-null: **3,613**
- `T+20` rows already evaluated-but-still-null: **987**

### 4.3 Why outcome quality is poor

1. **1-hour outcomes are not real intraday outcomes**
   - `packages/backend/src/services/price-service.ts:201-237` always queries Yahoo with `interval=1d`
   - `packages/backend/src/services/price-service.ts:149-163` then reuses that daily-close data for `getPriceAt()`
   - Result: `change_1h` is mostly fake flatness
   - Live proof: among non-null `change_1h`, **461 / 513 (89.9%)** are exactly `0.0000`

2. **Missing event prices permanently poison later intervals**
   - `packages/backend/src/services/outcome-tracker.ts:109-121` stores `eventPrice = null` when the initial lookup fails
   - `packages/backend/src/services/outcome-tracker.ts:315-323` cannot compute percent change when `eventPrice` is null
   - That blocks both `event_outcomes.change_*` and `classification_outcomes`

3. **Retry behavior is inconsistent**
   - `packages/backend/src/services/outcome-tracker.ts:302-311`
   - For `1h`, `1d`, `1w`, `1m`: failed lookups just return, so rows stay pending forever
   - For `T+5`, `T+20`: the code stamps `evaluated_*_at` even when price lookup failed, so they stop retrying forever

4. **The worker is too small and unordered**
   - `packages/backend/src/services/outcome-tracker.ts:137-155`
   - It pulls only `50` rows per interval, without `ORDER BY`, and processes them serially

5. **Classification-outcome coverage is almost nonexistent**
   - `classification_predictions`: **24,712**
   - `classification_outcomes`: **324**
   - Coverage: **1.3%**

### 4.4 Are price fetches working? What do logs show?

What I could verify directly:

- I did **not** find current backend log lines like `Yahoo Finance API returned ...` or `No price data found ...`
- But this is not strong evidence of health, because `packages/backend/src/services/outcome-tracker.ts:302-305` silently returns on failed 1h/1d/1w/1m fetches without logging

So the correct conclusion is:

- **Price fetches are working often enough to update some rows**
- **The logging is insufficient to tell which rows fail and why**

---

## 5. Concrete Code Changes

Prioritized by **impact / effort**.

| Priority | File / lines | What to change | Expected improvement |
|---|---|---|---|
| P0 | `packages/backend/src/services/price-service.ts:149-163,201-237` | Add intraday Yahoo fetches (`interval=5m` or `1m`) for sub-day windows and keep `1d` only for daily/weekly horizons. Split cache keys by interval. | Makes `1h` outcomes real instead of daily-close artifacts; fixes the foundation of accuracy tracking. |
| P0 | `packages/backend/src/services/outcome-tracker.ts:134-155,282-340` | Add ordered batching (`ORDER BY event_time ASC`), parallel fetch with bounded concurrency, explicit `last_error` / retry counters, and consistent retry semantics for all intervals. | Reduces the huge overdue backlog and makes failures observable. |
| P0 | `packages/backend/src/app.ts:113-115` | Wire a real `llmProvider` from env/config in production instead of leaving `llmClassifier` undefined. | Turns on actual LLM classification for live ingest instead of rule-engine-only output. |
| P1 | `packages/backend/src/pipeline/classification-prompt.ts:13-38,68-103` | Stop forcing `direction = NEUTRAL`. Include rule-engine context in the prompt: matched rules, rule severity, rule priority, known ticker, known source reliability. | Makes the prompt capable of producing useful direction/confidence and less generic classification. |
| P1 | `packages/backend/src/pipeline/ticker-inference.ts:107-143` and `packages/backend/src/event-pipeline.ts:162-177` | Remove ETF fallback (`SPY`, `QQQ`, `XLE`, etc.) from canonical event ticker persistence. Store proxy/market-context symbols in a separate metadata field instead. | Prevents fake precision, bad outcome tracking, and misleading analytics. |
| P1 | `packages/backend/src/scanners/sec-edgar-scanner.ts:522-553` | Improve Form 4 ticker resolution using CIK->ticker mapping and issuer-name normalization before emitting rows. Backfill `events.ticker` from `issuer_name`/`company_name` where possible. | Would materially improve the current **15.5%** ticker coverage for the largest source. |
| P1 | `packages/backend/src/pipeline/llm-enricher.ts:167-177,197-205` | Put classifier result into the user prompt (`eventType`, `severity`, `reasoning`) and harden parsing the same way classification does (strip code fences / JSON wrapper recovery). | Enrichment becomes more context-aware and less brittle; fewer silent null enrichments. |
| P2 | `packages/backend/src/pipeline/default-rules.ts:323-620` and `packages/backend/src/pipeline/macro-rules.ts:138-200` | Replace broad title-only rules with source-aware rules. Require stronger evidence for `HIGH`/`CRITICAL` on `breaking-news`, executive changes, and generic M&A/earnings phrases. | Improves precision and reduces false `HIGH`/`CRITICAL` labels. |
| P2 | `packages/backend/src/scanners/breaking-news-scanner.ts:14-43,50-71,197-260` | Fix or replace dead feeds (Reuters/AP), use source-specific parsers or safer feeds, and replace substring keywords with topic patterns / allowlists. | Improves both recall and precision for the macro/news scanner. |
| P3 | `packages/backend/src/scanners/federal-register-scanner.ts:130-185` | Derive source from authoritative agency fields instead of title/abstract keyword guesses. | Stops source pollution (`fda`, `fed`, `sec-regulatory` rows all coming from one scanner) and makes scorecards trustworthy. |
| P3 | `packages/backend/src/db/event-store.ts:89-97` | Store upstream IDs in `events.source_event_id` when available (`source_event_id`, `sourceEventId`, accession number) instead of always using internal UUIDs. | Makes debugging, dedup, and scanner traceability much easier. |

### Recommended implementation order

1. Fix `price-service` + `outcome-tracker`
2. Turn on and improve the LLM classifier
3. Fix ticker quality (`sec-edgar` + no ETF fallback)
4. Tighten rule precision
5. Repair `breaking-news` source health

---

## Final Assessment

The current live system has **good raw ingestion breadth** but **weak conversion from raw events into trustworthy tradable intelligence**.

The biggest gap is not "the model is bad." The biggest gap is:

- the live classifier prompt is not actually in the production ingest path,
- ticker quality is poor on the most important sources,
- outcome tracking is built on daily data for intraday horizons,
- and enrichment often burns tokens on boilerplate.

If only three things are fixed first, they should be:

1. Real intraday outcome pricing
2. Live LLM classifier wiring plus prompt/context fixes
3. Ticker-quality repair for `sec-edgar` and `breaking-news`

Those three changes would improve both **data quality** and **measurable AI quality** more than any other work in the current backend.
