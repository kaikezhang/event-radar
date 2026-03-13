# Review: FEED-STRATEGY.md

## Executive Summary

The proposed direction is correct at a high level: optimize for **tradable market impact**, not source prestige. But the current proposal is too aggressive in one place and too optimistic in another:

1. It removes too much deterministic filtering too early.
2. It assumes one LLM judge can reduce the feed to **3-10 alerts/day** with little context and little latency cost.

My recommendation is **not** to replace the full filter stack with a universal LLM gate. Keep a fast deterministic L1, then use the LLM as an L2 judge on ambiguous events. That gets most of the quality benefit without paying unnecessary latency on the highest-value alerts.

The biggest product issue is that the prompt asks the model to judge **novelty** and whether the market has already priced something in, but the prompt only provides `source/title/body/timestamp`. That is not enough context. The model will guess.

## 1. Signal vs Noise: Can This Reach 3-10 Alerts/Day?

### Bottom line

**Maybe, but not with "LLM only" as the main selector.**

The target implies an extremely low acceptance rate:

- If the platform sees `~6,000` events over `30` days, that is about `200/day`.
- A target of `3-10 alerts/day` means an acceptance rate of only `1.5%-5.0%`.

Using the sample funnel in `docs/OBSERVABILITY.md`:

- `1,250` ingested/day
- `270` stored/day after earlier pipeline stages
- `75` delivered/day

To get from `270` candidate events/day to `3-10` alerts/day, the new judge must reject:

- `96.3%` of candidates to get to `10/day`
- `98.9%` of candidates to get to `3/day`

That is a very high bar for a single model prompt, especially when many titles are short, ambiguous, or missing surprise context.

### Why the math is hard

The proposal says:

> "Delete all hardcoded filter ... all events unify through one LLM Judge"

The problem is the LLM is being asked to separate:

- genuinely new high-impact catalysts
- routine filings
- scheduled events with no surprise
- commentary on earlier news
- duplicate reporting from multiple sources

That is possible only if the model sees more context than one event blob.

### A more realistic daily funnel

A plausible steady-state funnel for this product is:

- `800-1,500` raw events/day from all scanners
- `150-350` after scanner-level cleanup, staleness, exact dedup, and source heuristics
- `20-40` after a deterministic market-impact prefilter
- `5-12` final alerts after LLM judging plus cooldown/story dedup

That is realistic.

This funnel is **not** realistic:

- `150-350` LLM judgments/day
- prompt alone produces `3-10` perfect alerts/day

The model can help, but it should be deciding among an already narrowed candidate set.

The proposal's cost estimate of `30-50 calls/day` is also probably low. If the post-dedup/post-staleness candidate set is `150-350/day`, LLM usage is more likely `5x-10x` that estimate. The dollar cost is still small; the real issue is latency and burst-rate reliability.

### Product suggestion

Keep a 2-layer architecture:

- **L1 deterministic router**: fast source/type/session rules
- **L2 LLM judge**: only for ambiguous events and noisy secondary sources

Examples that should bypass the LLM during live trading:

- SEC 8-K item `1.01`, `2.01`, `2.05`, `5.01`, `5.02`
- FDA approval/rejection
- White House tariff/sanctions actions
- Fed/BLS scheduled releases with actual surprise values
- exchange halts / LULD / delisting notices

Examples that should go to the LLM:

- Reuters/AP/MarketWatch-style secondary headlines
- Reddit/StockTwits anomalies
- analyst headlines
- catch-all 8-K item `8.01`
- vague government notices

## 2. Latency: LLM on the Critical Path

### Current state

The current implementation already tells us the intended tradeoff:

- `llm-gatekeeper.ts` is synchronous and times out at `5s`
- it currently runs only on secondary sources
- failures are **fail-open**

That is a reasonable design for noisy sources.

The proposal moves the LLM into:

`Scanner -> Dedup -> Staleness -> LLM Judge -> Enrich -> Deliver`

for **everything**, including primary sources.

One implementation detail matters here: the system still has scanner-level hardcoded filters upstream, especially in `breaking-news-scanner.ts`. So deleting hardcoded logic only in `alert-filter.ts` does **not** actually produce a fully unified LLM-only feed unless scanner-level keyword gates are also removed.

### Why this is dangerous

For time-sensitive market alerts, even a small delay matters.

Reasonable operating assumptions:

- median LLM round trip: `~0.5-1.5s`
- p95 under load: `~2-5s`

That is acceptable for:

- post-market corporate filings
- weekend policy/geopolitics
- noisy social signals

That is not acceptable for:

- CPI/NFP/FOMC
- tariff headlines
- exchange halts
- sudden FDA decisions
- CEO departure 8-K filed during market hours

On those events, the market often moves materially before `1-2s` has passed.

### Hidden scalability problem

`InMemoryEventBus.publish()` emits immediately and does not provide backpressure. If a burst of 20-50 events arrives at once, the app can fire 20-50 concurrent LLM calls. That creates three risks:

- OpenAI rate limits
- queueing and latency spikes
- non-deterministic alert timing during bursts

So even if per-call cost is cheap, the **burst behavior** is not cheap operationally.

### Recommendation

Define latency classes:

- **Class A: sub-second path, no LLM on the critical path**
  - primary sources with known high impact
- **Class B: LLM allowed, target <2s**
  - secondary newswires, social anomalies, ambiguous official notices
- **Class C: asynchronous / queueable**
  - weekend digest, low-urgency posts, follow-up reporting

## 3. Market Hours: The Strategy Should Change by Session

The proposal's unified `2h` staleness rule is too blunt.

### During regular market hours: 09:30-16:00 ET

Goals:

- lowest latency
- highest selectivity
- very low tolerance for commentary

Recommended behavior:

- bypass LLM for Class A primary events
- reject secondary items older than `10-15m`
- reject social items unless they are both recent and anomalous
- apply stricter duplicate suppression

### Pre-market: 04:00-09:30 ET

This is where many high-value corporate events happen.

Recommended behavior:

- allow more corporate/fundamental alerts
- tolerate `30-90m` staleness for official filings and press releases
- still use LLM for ambiguous headlines

### Post-market: 16:00-20:00 ET

Also high value for:

- earnings pre-announcements
- 8-Ks
- leadership changes
- guidance

Recommended behavior:

- extend staleness for official filings until next liquid trading window
- keep social thresholds high

### Overnight / weekends / holidays

This is where the fixed `2h` rule breaks badly.

Examples:

- A Saturday White House tariff action is still actionable for Sunday futures and Monday cash open.
- A Friday 18:00 ET 8-K can still matter at Monday 04:00 ET pre-market.

Recommended behavior:

- for macro/geopolitics/regulatory: validity should extend to next tradable session
- for routine social/commentary: suppress or batch
- for weekend corporate filings: alert only if likely to gap at next open

In other words: use **"time until next tradable session"**, not only wall-clock age.

## 4. Failure Modes

### OpenAI API down

Current gatekeeper behavior is fail-open. If the new LLM Judge covers everything and stays fail-open, the system will degrade into a noise flood exactly when operator confidence is lowest.

If it fails closed instead, the system will miss the most important events.

The right behavior is **source-tiered degradation**:

- Tier A critical primary sources: deterministic fallback pass
- Tier B ambiguous official sources: retry, then fallback to conservative rules
- Tier C secondary/social sources: block or queue when the model is unavailable

### Rate limits / burst traffic

A CPI print, Trump post, or geopolitical shock can generate many near-duplicate secondary events in one minute. Without a circuit breaker:

- 30 duplicates can trigger 30 LLM calls
- p95 latency can blow out
- the system can spend tokens judging obvious rewrites of the same event

Recommendation:

- add per-minute LLM budgets
- add a circuit breaker on `429`, timeout, or p95 latency
- when the breaker is open, fall back to deterministic rules

### Hallucination / fabricated certainty

The proposed JSON output asks the model for:

- `expected_impact`
- `affected_tickers`
- `category`

These are useful, but dangerous if treated as truth.

Failure examples:

- model invents tickers not present in the text
- model labels routine 8-K `8.01` as high impact
- model claims novelty with no historical context

Recommendation:

- validate output with a strict schema
- never trust LLM-generated tickers unless they match extracted entities
- treat `reason` as explanation only, not a source of facts
- log all low-confidence accepts for manual review

### Prompt asks for impossible judgments

The prompt asks:

> "Is this NEW information that the market hasn't priced in yet?"

But the prompt does not provide:

- last related alerts
- prior headlines in the last `2-24h`
- whether this is a scheduled release
- market session
- whether the market is even open

So the model will infer novelty from writing style, not evidence.

That is the single biggest design flaw in the proposal.

## 5. Backtesting Plan Against 6,000+ Historical Events

This should be validated as an **offline replay**, not by taste.

### Step 1: Replay the historical stream chronologically

For each event in time order, simulate:

- dedup state
- story state
- session state
- staleness policy
- LLM decision or proxy label

Do not score events independently. This is a feed product, so the stateful parts matter.

### Step 2: Define a measurable target label

Use realized post-event returns as a starting point:

- single-stock event positive label:
  - `|abnormal_return_30m| >= 3%` or
  - `|abnormal_return_1h| >= 3%`
- sector / macro event positive label:
  - sector ETF or index move `>= 1%`

Better:

- use **abnormal return vs sector ETF / SPY**, not raw return
- use the first liquid trading window after the event

Examples:

- A biotech FDA rejection that leads to `-18%` in `30m` is a clear positive.
- A Reuters macro headline during a market-wide selloff should be measured against index movement, not just raw ticker drift.

### Step 3: Add manual labels

Returns alone are not enough. Some valid alerts may not hit the raw threshold, and some noisy events may coincide with moves caused by something else.

Label a stratified sample of `300-500` events across:

- source
- session
- asset type
- delivered vs filtered vs deduped

Mark each as:

- should alert
- should not alert
- duplicate/follow-up
- too stale

### Step 4: Score the strategy like a portfolio PM would

Track:

- alerts/day: mean, median, p90
- precision at alert
- recall on top-decile market-moving events
- duplicate rate
- median alert delay
- false positive rate by source
- share of alerts during RTH vs pre/post vs weekend

Minimum acceptance bar:

- `3-10` alerts/day average
- precision `>70%` on manually labeled set
- recall `>80%` on top-decile impact events from Tier A sources
- duplicate rate `<10%`

### Step 5: Compare against baselines

Backtest at least 3 strategies:

1. Current rules
2. Pure LLM Judge proposal
3. Hybrid L1 deterministic + L2 LLM

I would expect the hybrid to win on both latency and precision.

## 6. Social Signals: Proposed Thresholds Are Not Yet Defensible

### StockTwits: `watchers > 50,000` and growth `>200%`

This is likely the wrong metric.

Why:

- `watchlist_count` is a stock-level popularity measure, not an event-level excitement measure
- it heavily biases toward mega-cap and meme names
- it will miss small/mid-cap names where social chatter can matter most

Examples:

- `NVDA`, `TSLA`, `PLTR` easily clear a watcher threshold and will generate constant noise
- a small-cap biotech with a genuine catalyst may never have `50k` watchers

Also, the current StockTwits scanner emits:

- new trending symbols
- sentiment flips
- message-volume spikes
- `watchlist_count`

It does **not** provide a rich cross-sectional history that justifies `50k` as a principled cutoff.

### Reddit: `upvotes > 2,000` and `comments > 500`

This is probably too high for a real-time trading signal.

At those levels, the move is often already in flight.

More useful metrics:

- velocity: upvotes in first `10-30m`
- comment velocity
- cross-subreddit confirmation
- unique commenter count
- ticker mention z-score vs rolling baseline

Suggested starting rule:

- top `1%` of Reddit posts by age-adjusted engagement
- plus `ticker mention z-score > 4`
- plus post age `< 30m`

### What data should support the thresholds

Before fixing thresholds, build distributions from historical data:

- Reddit score by age bucket: `0-10m`, `10-30m`, `30-60m`, `60-120m`
- comments by age bucket
- StockTwits watchlist count by ticker decile
- StockTwits volume spike ratio by symbol and hour of day
- realized `30m` and `1h` returns after social events

Thresholds should come from percentiles, not intuition.

## 7. Dedup: Use Cheaper Story Heuristics Before Embeddings

The proposal is correct that ID dedup alone is not enough. But full semantic dedup via embeddings/LLM should be the **last** option, not the first.

The current dedup layer already has good cheap primitives:

- exact metadata ID match
- same ticker + same type + short time window
- token-overlap similarity on title/body

That should be extended first.

### Recommended cheaper heuristic

Create a `story_key` from:

- normalized actor: `trump`, `white_house`, `fed`, `nvda`, `aapl`
- normalized action: `tariff`, `approval`, `ceo_departure`, `acquisition`, `halt`, `bankruptcy`
- normalized object: `china`, `drug_name`, `target_company`
- ticker set
- `15m` or `30m` time bucket

Then hash:

`story_key = actor + action + object + tickers + time_bucket`

This catches most expensive duplicates:

- "Trump announces 50% tariffs on China"
- "White House unveils new China tariffs"

Both normalize to roughly the same story signature.

### Practical sequence

Use this order:

1. exact source/event ID
2. URL / filing accession / post ID
3. ticker + event type + short time window
4. normalized story key
5. token Jaccard / SimHash
6. embeddings only for unresolved expensive cases

This will remove most duplicate LLM calls at negligible cost.

## 8. Missing Sources

Several important market-moving sources are still absent from the actual scanner inventory and would improve the feed more than prompt tweaking.

### Highest-priority missing sources

- **SEC EDGAR live scanner**
  - The product strategy relies heavily on 8-K/Form 4 examples, but there is no live `sec-edgar` scanner in the current backend scanner set.
- **PR Newswire / BusinessWire / GlobeNewswire**
  - These are core for small/mid-cap catalysts, guidance, M&A, partnerships, and product announcements.
- **Nasdaq / NYSE halt feeds and LULD notices**
  - Extremely actionable during market hours.
- **Real macro release feeds with surprise values**
  - The strategy mentions CPI/Fed/NFP surprises, but a calendar alone is not enough. You need the actual released number and the market expectation.
- **Credit rating actions**
  - Moody's / S&P / Fitch downgrades and outlook changes move banks, sovereigns, and credit-sensitive equities.
- **Index provider actions**
  - S&P Dow Jones, MSCI, FTSE Russell rebalances and index inclusion/exclusion announcements.

### Useful next-tier additions

- OFAC sanctions / Treasury enforcement
- EIA petroleum inventory and SPR releases
- ECB / BoJ / PBOC decisions for overnight macro
- activist short reports and major research releases
- company IR newsroom pages for large caps that publish before wires propagate

### Important product point

One of the "worth alerting" examples in the strategy is:

> "S&P 500 跌破关键支撑位"

That is not a scanner/news problem. That requires a **market data / technical trigger engine**. If technical breaks are part of the product promise, that is a separate source class.

## 9. Prompt Improvements for the LLM Judge

### What the current proposed prompt gets right

- focuses on market impact
- explicitly rejects commentary and retrospective analysis
- encourages selectivity

### What it is missing

The prompt should include:

- current session: `RTH | PRE | POST | CLOSED`
- event age in minutes
- whether the event is from a primary or secondary source
- whether this is the first related event in the last `2-4h`
- whether this is scheduled vs unscheduled
- extracted tickers/entities from deterministic parsers

Without that context, novelty and actionability are under-specified.

### Suggested output schema

Use strict JSON with scores, not only a boolean:

```json
{
  "push": true,
  "novelty_score": 82,
  "impact_score": 91,
  "actionability_score": 88,
  "duplicate_risk": "low",
  "latency_class": "immediate|fast|digest",
  "reason": "Unscheduled White House tariff action with likely immediate broad market impact.",
  "affected_tickers": [],
  "category": "policy"
}
```

### Suggested prompt changes

Add instructions like:

> You may only use facts explicitly present in the event payload and supplied context.

> If novelty cannot be established from supplied context, lower `novelty_score`; do not assume novelty.

> Routine scheduled items with no surprise value should be rejected.

> For primary-source unscheduled events during market hours, favor false positives less than false delays only when impact is clearly high.

> Do not invent tickers, entities, or price impact.

### Suggested evaluation rubric inside the prompt

Ask the model to answer these in order:

1. Is this unscheduled or does it contain a true surprise?
2. Is this the first alert-worthy instance in the supplied recent context?
3. Would a trader plausibly change positioning within the next `5-60m`?
4. Is this likely to move a stock `>=3%` or sector/index `>=1%`?
5. Is the event fresh enough for the current session?

If `1` or `2` is unknown, the model should not confidently push.

## Final Recommendation

Do **not** ship the proposal exactly as written.

Ship this instead:

1. Keep deterministic L1 filters for source, session, staleness, and obvious retrospective/noise suppression.
2. Use the LLM as L2 for ambiguous or noisy events, not every event.
3. Add session-aware staleness and source-tiered failure behavior.
4. Improve dedup with cheap story heuristics before embeddings.
5. Backtest the hybrid strategy on the historical corpus before changing production routing.

If the goal is a feed a trader can actually trust, the core KPI is not "LLM-unified pipeline". The KPI is:

**high precision on truly tradable first-instance events with minimal delay during live sessions.**
