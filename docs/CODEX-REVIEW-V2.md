# Codex Review — `HISTORICAL-DB-SPEC.md` v2

*Date: 2026-03-12*  
*Verdict: do not implement as-is for real-money decisions*

This spec is materially better than v1, but I would not trust it yet with real capital. The main remaining risks are silent, not obvious: point-in-time leakage, incorrect security identity handling, and return calculations that look precise while resting on data the schema does not actually preserve.

The highest-confidence conclusion is simple: **proceed only after redesigning the security master, raw market-data layer, macro point-in-time model, and return methodology.** Everything else is secondary.

## Findings

### Critical

**1. The schema does not store the raw point-in-time facts needed to audit or recompute returns.**  
Refs: `docs/HISTORICAL-DB-SPEC.md:310-409`, `docs/HISTORICAL-DB-SPEC.md:415-490`, `docs/HISTORICAL-DB-SPEC.md:745-756`

- Layer 3 stores event snapshots (`event_market_context`, `event_stock_context`), not raw daily/minute bars, benchmark price history, or corporate-action adjustment factors.
- Layer 4 stores derived returns and a `calc_version`, but without raw prices there is nothing authoritative to recalculate from when methodology changes.
- This becomes fatal for splits, special dividends, delistings, halts, multi-session gaps, and any later bug fix in return logic.
- A real-money database needs at least:
  - `security_prices_daily`
  - `security_prices_intraday` or a separate event-day bar store
  - `benchmark_prices_daily`
  - `corporate_actions` / adjustment factors
  - `macro_releases` with release timestamps and vintages

**2. The data model is company-centric, but trading happens at the security/share-class level.**  
Refs: `docs/HISTORICAL-DB-SPEC.md:121-149`, `docs/HISTORICAL-DB-SPEC.md:193-206`, `docs/HISTORICAL-DB-SPEC.md:355-405`, `docs/HISTORICAL-DB-SPEC.md:416-490`

- `companies` plus `security_identifiers` is not enough for:
  - dual-class shares (`GOOG`/`GOOGL`, `PARA`/`PARAA`)
  - ADRs vs local listings
  - SPAC units/warrants/common stock
  - OTC successor tickers after distress
  - delisted securities
  - exchange migrations
- `event_returns` and `event_stock_context` key off `company_id` plus a copied `ticker_at_time` string. That is not a stable traded-instrument key.
- Paramount is the cleanest example: the Skydance saga affected `PARA` and `PARAA` differently because governance and economics differed by class. This schema collapses both into one company and loses tradable reality.
- Redesign around:
  - `entities` (issuer/legal entity)
  - `securities` (tradable instrument)
  - `security_listings`
  - `security_identifier_history`
  - `corporate_actions`
  - `security_status_history` (`active`, `halted`, `delisted`, `acquired`, `bankrupt`)

**3. The “multi-entity” design only supports companies, so many event types in the taxonomy are not actually representable.**  
Refs: `docs/HISTORICAL-DB-SPEC.md:26`, `docs/HISTORICAL-DB-SPEC.md:91-112`, `docs/HISTORICAL-DB-SPEC.md:193-206`

- `event_entities` only references `companies(id)`.
- That fails for:
  - Congress members in `congress_trade`
  - CEOs/CFOs in `leadership`
  - regulators (`FTC`, `DOJ`, `FDIC`, `FDA`)
  - private acquirers/holding companies (`Skydance`, `National Amusements`)
  - activist funds
  - ETFs/indexes as impact objects
- The schema claims to model multiple actors explicitly, but it cannot model the actor types the taxonomy itself introduces.
- Replace `event_entities` with a generalized `event_participants` table keyed to a broader `entities` master with `entity_type`.

**4. The reference-price and return rules are internally inconsistent and not implementable from the data sources named in the spec.**  
Refs: `docs/HISTORICAL-DB-SPEC.md:416-490`, `docs/HISTORICAL-DB-SPEC.md:731-756`, `docs/HISTORICAL-DB-SPEC.md:801-808`

- The schema comment for `ref_price_type` lists `'prev_close', 'event_day_open', 'pre_announcement_close'`, but the rules section uses `event_day_close`.
- The rules say intraday events use `pre_announcement_close`, then parenthetically redefine that as “same day open if intraday.” Those are not the same thing.
- With daily `yfinance` OHLCV alone, you cannot know the last tradable price before a 10:37 ET announcement. You need minute bars or tick/trade data.
- For after-hours events, `ref_price = event_day_close` makes `return_t0` mechanically zero if `return_t0` is still “event day close / ref_price - 1.” That erases the actual first reaction in extended hours.
- For `day_only` events the spec says `T+0` cannot be calculated, but the schema has no eligibility/status fields to prevent accidental aggregation with valid `T+0` rows.
- Add:
  - `return_eligibility` flags per horizon
  - `price_basis` (`adjusted`, `unadjusted`, `total_return`)
  - `session_basis` (`regular_only`, `extended_hours`)
  - `terminal_status` for horizons not reached due to halt/delisting/cash-out

**5. The “point-in-time safe” macro claim is false unless this uses ALFRED vintages and release timestamps, which the schema does not store.**  
Refs: `docs/HISTORICAL-DB-SPEC.md:290-351`, `docs/HISTORICAL-DB-SPEC.md:797-799`

- FRED series are revised. Point-in-time macro research requires ALFRED-style vintage dates and release timestamps, not just the latest observed value before an event.
- `latest_cpi_yoy`, `latest_core_cpi`, `treasury_10y`, `fed_funds_rate`, `days_to_next_fomc` are stored as snapshot numbers with no `release_ts`, `realtime_start`, `realtime_end`, `release_id`, or revision provenance.
- `metrics_macro.forecast_value` also has no source. FRED provides releases and observations; it does not provide market consensus forecasts. That requires another vendor.
- Without release timestamps, a 08:30 ET CPI surprise and a 14:00 ET Fed event on the same day can be mishandled.
- This is still look-ahead bias.

### High

**6. Selection bias and survivorship bias are reduced, but not fixed.**  
Refs: `docs/HISTORICAL-DB-SPEC.md:20-22`, `docs/HISTORICAL-DB-SPEC.md:32`, `docs/HISTORICAL-DB-SPEC.md:706-729`, `docs/HISTORICAL-DB-SPEC.md:930-933`

- The design principle says “LLMs analyze, not discover,” but the bootstrap flow starts with “For each event discovered by Claude.” That is a direct contradiction.
- If Claude is the first-stage discovery engine, the corpus is not reproducible and will miss low-salience “nothing happened” cases.
- Later “+S&P 500 coverage” also risks classic survivorship bias because there is no index-membership history or coverage-completeness table. A backfill of current constituents is not historical S&P 500 coverage.
- The schema also has no `source_coverage` / `backfill_runs` table to prove a ticker-date-source range was fully scanned. Without that, absence of an event is ambiguous: no event, or not scanned.

**7. The free-tier bootstrap plan is not feasible for the claimed coverage window.**  
Refs: `docs/HISTORICAL-DB-SPEC.md:787-808`, `docs/HISTORICAL-DB-SPEC.md:926-935`

- Polygon’s current free/basic plan is advertised at **5 API calls/minute** and **2 years of historical access** for stocks. The spec wants 2020-2026 bootstrap coverage, which is more than 6 years as of 2026-03-12.
- Even Polygon Starter is listed at **5 years history for $29/month**. To cover 2020-2026 from today, you likely need a higher tier.
- Rough math:
  - 50 tickers × 72 months = 3,600 ticker-month windows before pagination.
  - At 5 calls/minute, that is a bare minimum of 12 hours for one request per window.
  - Real news queries will paginate heavily for liquid names, so the true runtime is likely measured in days, not hours.
- `yfinance` is fine for prototyping price backfills, but it is not a production source of record for a real-money database.

**8. The similarity and aggregated-pattern logic is not decision-grade yet.**  
Refs: `docs/HISTORICAL-DB-SPEC.md:596-645`, `docs/HISTORICAL-DB-SPEC.md:851-893`

- `min_sample_required = 5` is far too low for user-facing statistical claims tied to money.
- The similarity score ignores the typed metrics that actually matter:
  - layoff magnitude
  - guidance change
  - buyback presence
  - deal premium / consideration mix
  - FDA asset importance
- The algorithm adds a recency bonus but no penalty for sparse cohorts, no confidence intervals, and no fallback hierarchy when only 3 similar events exist.
- `market_regime` is AI-labeled and then reused for matching. If that label is generated with hindsight, this becomes another look-ahead leak.
- The product should refuse to make strong comparative claims when sample size is thin or dispersion is wide.

**9. Distress, cash-out, and terminal outcomes are not modeled well enough, so the worst cases will be mismeasured or silently dropped.**  
Refs: `docs/HISTORICAL-DB-SPEC.md:74`, `docs/HISTORICAL-DB-SPEC.md:416-490`, `docs/HISTORICAL-DB-SPEC.md:493-511`

- Bankruptcies, FDIC receiverships, cash mergers, trading halts, and delistings all break naive `T+20` / `T+60` return logic.
- The schema has no way to say:
  - `T+20 not reached because security delisted on T+4`
  - `final return based on cash consideration`
  - `security halted for 3 sessions`
  - `successor OTC ticker`
- In a real event-driven dataset, these are not edge cases. They are some of the most important outcomes.

**10. Several schema constraints are not strong enough for a critical database.**  
Refs: `docs/HISTORICAL-DB-SPEC.md:133-149`, `docs/HISTORICAL-DB-SPEC.md:155-225`, `docs/HISTORICAL-DB-SPEC.md:563-645`

- `security_identifiers` has no no-overlap constraint on effective-date ranges.
- `historical_events` has no enforced taxonomy FK/check for `event_category`, `event_type`, `event_subtype`.
- `event_sources` has no dedup constraint on `source_url`, `document_hash`, or source-native ID.
- `event_chain_members` needs `UNIQUE(chain_id, sequence_order)`.
- `event_chains` claims AI summaries are versioned, but there is no version column.
- `event_type_patterns` uses a multi-column `UNIQUE` with nullable columns. In PostgreSQL, multiple rows with the same null combination are still allowed unless you use `NULLS NOT DISTINCT` or a functional index. That will create duplicate “unique” pattern rows.

### Medium

**11. Several trader-relevant fields are still missing.**  
Refs: `docs/HISTORICAL-DB-SPEC.md:233-307`, `docs/HISTORICAL-DB-SPEC.md:355-405`, `docs/HISTORICAL-DB-SPEC.md:416-490`

- Effective-date shares outstanding / free float
- Adjustment factors for splits and special dividends
- Dollar volume / ATR / realized volatility
- Offer price per share, exchange ratio, collar terms, breakup fee
- Filing accession number, SEC item numbers, source-native IDs
- Stored raw text snapshot or blob pointer for audit
- Halt/resume timestamps
- Successor security mapping after reorg/delist
- Benchmark-selection provenance and version

**12. The event-volume, timeline, and cost expectations are understated.**  
Refs: `docs/HISTORICAL-DB-SPEC.md:926-935`

- 50 tickers across 2020-2026 with “ALL classifiable events” is not ~2,000 events unless the scope is much narrower than the taxonomy implies.
- Earnings alone can contribute ~1,200 events for 50 tickers over 6 years.
- Add 8-Ks, guidance, insider trades, FDA, M&A, macro-linked names, and chain members, and the true volume is likely several multiples higher.
- That affects rate-limit feasibility, QA workload, LLM cost, and pattern-sample assumptions.

## Requested Deep Review

### 1. Data Integrity

The spec improves on v1, but the three big bias classes are still not truly solved.

**Look-ahead bias**

- Macro data is still vulnerable because FRED revisions and release timestamps are not modeled.
- `market_regime` and `sentiment_label` are AI-derived and can easily become hindsight labels unless they are generated from a deterministic as-of rule set.
- `market_cap_b` is described as “approximately PIT” but the schema does not store the shares-outstanding history needed to make that statement defensible.
- `days_to_next_earnings` is risky unless you have a timestamped archive of what the market knew about the scheduled date at that time.

**Survivorship bias**

- The security master does not preserve full tradable-instrument lifecycle history.
- There is no table for index/universe membership history.
- There is no explicit support for bankrupt, acquired, or delisted names that disappear before longer return horizons.

**Selection bias**

- The bootstrap flow still begins from Claude-discovered events.
- The schema has no coverage ledger to distinguish “no event” from “not backfilled.”
- The scale estimate itself suggests undercounting. If the database undercaptures boring/no-reaction events, the patterns will look much stronger than reality.

### 2. Missing Fields A Trader Would Actually Want

If I were making a real swing-trading decision, the minimum missing fields I would want are:

- `security_id` and share class
- `shares_outstanding`, `float_shares`, `free_float_pct`, each with an effective date
- `dollar_volume_20d`, `atr_14`, `realized_vol_20d`
- `adjustment_factor` / split ratio / special-dividend metadata
- halt/resume times and halt reason
- offer price, exchange ratio, consideration mix detail for M&A
- raw source text pointer plus source-native IDs (`accession_number`, `polygon_news_id`, `fred_release_id`)
- outcome status fields for `cash_merged`, `delisted`, `halted`, `bankrupt`, `symbol_changed`
- benchmark mapping version and rationale
- for congress/leadership events: person identity, role, filing date vs trade date, amount range

Without those, this becomes a good product demo, not a trustworthy research database.

### 3. Bootstrap Feasibility

I checked the current source assumptions against official docs/current product pages.

| Source | What current docs say | Verdict |
|---|---|---|
| SEC EDGAR | SEC documents public APIs/data endpoints and says automated access should stay under 10 requests/second regardless of tool. | Feasible for filings. Good source for 8-K, Form 4, 13F. Not enough for all non-SEC event types. |
| FRED / ALFRED | FRED provides releases, release dates, observations, and real-time period parameters; point-in-time research requires ALFRED/vintage handling. | Feasible for macro actuals if redesigned. Not enough for consensus forecasts. |
| Polygon.io | Current stock pricing page shows free/basic at 5 calls/min and 2 years history; Starter at 5 years for $29/month; paid plans advertise unlimited API calls. | Free tier is not feasible for 2020-2026 historical news bootstrap. Paid tier likely required. |
| yfinance | Project docs expose price and earnings helpers, but this is still an unofficial Yahoo wrapper with no SLA and limited guarantees around point-in-time fundamentals/earnings history. | Acceptable as prototype price backfill only. Not acceptable as sole production source of record. |

**Bottom line**

- SEC: yes
- FRED: yes, but only with ALFRED-style redesign
- Polygon free: no
- yfinance as production truth: no

### 4. Schema Correctness / Normalization

Most important normalization issue: the spec mixes issuer-level facts, security-level facts, event-level facts, and derived analytics too early.

Recommended structural split:

1. `entities`
   - company, person, fund, government body, index, ETF, asset
2. `securities`
   - one row per tradable instrument
3. `security_identifier_history`
   - ticker/CUSIP/ISIN effective-date history with no-overlap constraints
4. `security_status_history`
   - active, halted, delisted, acquired, OTC successor
5. `source_documents`
   - raw text/blob pointer, source-native IDs, checksums, timestamps
6. `event_participants`
   - event ↔ entity/security roles
7. `macro_releases`
   - release timestamp, effective period, vintage window, actual, prior, revised, consensus source
8. `price_facts`
   - raw daily/minute bars, adjustment metadata
9. `event_returns`
   - pure derived outputs plus eligibility/terminal status

The current schema compresses too many of those layers together.

### 5. Cost Estimation Reality Check

The spec does not actually include a cost estimate, which is itself a problem for a “critical” system.

Reasonable rough order-of-magnitude numbers:

- **Polygon**
  - Free/basic: not viable for the stated bootstrap.
  - If you need 2020-2026 history today, the current published plan ladder strongly suggests a paid tier above Starter.
- **SEC + FRED**
  - API cost: effectively free.
  - Engineering/QA cost: non-trivial.
- **Claude analysis**
  - Anthropic’s published Sonnet pricing is currently $3 / million input tokens and $15 / million output tokens.
  - If one event averages 8k input + 700 output tokens, 2,000 events cost about:
    - input: 16M tokens ≈ $48
    - output: 1.4M tokens ≈ $21
    - total single-pass: ≈ $69
  - If average source text is larger, or you do separate classification + analysis + retry passes, it can easily move into the low hundreds for 2,000 events and the mid hundreds or low thousands for 10,000+ events.
- **Hidden cost that matters most**
  - Historical news archive quality, validation/retries, and manual QA will likely cost more than the LLM itself.

The storage estimate is fine. The acquisition/validation estimate is not.

### 6. Edge Cases

The current schema does not robustly handle these:

**Ticker changes**

- `FB` → `META` can be tracked at an identifier level, but returns still attach to `company_id` and copied ticker text instead of a stable security key.

**Delistings / bankruptcies**

- No terminal-state model for post-event horizons.
- Distress names are exactly where a research database most needs explicit terminal handling.

**Splits**

- Stock splits are in taxonomy, but there is no corporate-action table or price-adjustment policy.
- Using adjusted prices hides the split event; using unadjusted prices distorts subsequent returns.

**SPACs**

- Units, warrants, and post-merger common stock are different securities.
- Sponsor, target, and surviving issuer often all matter.

**Dual-class shares**

- Current company-centric design collapses them incorrectly.

**Cash mergers**

- Target returns after announcement should often be measured vs cash consideration / spread dynamics, not generic T+20 stock returns.

**Extended-hours events**

- Many important events are pre-market or after-hours. Daily bars alone do not solve this.

### 7. Return Calculation Reality

The current reference-price section is directionally right but not operationally complete.

What is needed:

- explicit session model
- intraday bars for event day
- adjusted vs unadjusted price basis
- horizon eligibility status
- terminal outcome handling
- separate treatment for:
  - after-hours events
  - events during halts
  - weekend events followed by Monday gap
  - multi-day closures / repeated halts

If a stock gaps through multiple sessions or never meaningfully reopens, a single `overnight_gap_pct` plus `gap_filled` flag is not enough.

### 8. Similarity Matching

The current algorithm will find something, but not necessarily something useful.

Problems:

- same `event_type` is too broad
- scoring ignores typed metrics
- no regime-break handling
- no uncertainty reporting
- no minimum-quality threshold before surfacing a comparison

If there are only 3 similar events, that is not a historical pattern. That is anecdotal evidence. The product should say so explicitly and degrade to broader cohorts or abstain.

### 9. Three Real-World Walkthroughs

#### a) META layoffs, November 2022

What should happen:

- `entities` / `securities`
  - Meta Platforms issuer
  - common stock security with prior ticker history `FB` and current `META`
- `historical_events`
  - `event_type = restructuring`
  - `event_subtype = layoff`
  - `event_ts = 2022-11-09` with pre-market precision if verified
  - factual headline/description
- `event_sources`
  - company announcement / memo / authoritative media source
  - raw text snapshot and source-native IDs
- `metrics_restructuring`
  - `headcount_reduction_abs = 11000`
  - `headcount_reduction_pct ≈ 13.0`
  - restructuring-charge and cost-savings fields if disclosed
- `event_stock_context`
  - pre-event momentum, volume, float/liquidity, prior earnings surprise
- `event_returns`
  - pre-market methodology using prior close plus event-day intraday/open/close handling

What the current spec still cannot do well:

- store the raw announcement in auditable form
- distinguish regular-session vs pre-market first tradable reaction without intraday bars
- store related “efficiency” program details cleanly
- attach effective-date shares outstanding / float for a true PIT market-cap tier

#### b) PARA / Skydance merger saga, 2024

This is exactly the kind of chain that breaks the current model.

What should exist:

- a chain covering rumor, committee activity, bidder changes, break in talks, revised proposal, formal agreement, closing/termination
- participants:
  - Paramount issuer
  - `PARA` security
  - `PARAA` security
  - Skydance (private)
  - National Amusements (private control holder)
  - competing bidders where relevant

Why the current spec is insufficient:

- `companies` cannot cleanly represent the traded security distinction between `PARA` and `PARAA`
- `event_entities` cannot cleanly model private control holders and bidder roles at security level
- there is no place for offer price per share, exchange ratio, collar economics, or governance rights
- one “primary” flag is too blunt for a dual-class control transaction

#### c) SVB bank run and contagion, March 2023

Minimum event chain:

1. 2023-03-08 capital raise / liquidity announcement
2. 2023-03-09 bank-run escalation / failed rescue attempts
3. 2023-03-10 FDIC receivership
4. 2023-03-12 federal backstop / BTFP response

What should be stored:

- primary security status changes from active to halted/delisted/receivership
- peer impacts on `FRC`, `SBNY`, `WAL`, `PACW`, `KRE`
- contagion relationship typing
- terminal outcome flags for the failed name itself

What breaks today:

- `return_t20` / `return_t60` for the failed bank are not well-defined once the security is halted or delisted
- `event_peer_impact` has no explicit baseline universe snapshot or primary-security linkage
- no generalized participant table for FDIC / Treasury / Fed actors

### 10. What Worries Me Most

If I had to bet my own money on an implementation built directly from this spec, the thing that would worry me most is **false precision**.

The database would look rigorous:

- exact timestamps
- precise return columns
- benchmark-adjusted alpha
- “point-in-time safe” labels

But underneath, several of those numbers would still be produced from incomplete raw facts:

- no true security-level instrument model
- no raw intraday bars for event-day reference prices
- no macro vintage storage
- no terminal-outcome handling for distress names
- no audit trail proving that an absent event was truly absent

That is the dangerous failure mode: not obvious garbage, but plausible-looking analytics with hidden structural bias.

## Recommendation

I would **not** proceed straight to implementation.

I would redesign these four pieces first:

1. Security master: issuer vs security vs listing vs identifier history
2. Raw facts layer: prices, corporate actions, macro releases, source documents
3. Return engine: session-aware reference prices, eligibility flags, terminal outcomes
4. Coverage/provenance: backfill completeness ledger and deterministic event-universe rules

If those four are fixed, the rest of the spec is salvageable. If they are not, the system will produce convincing but untrustworthy historical analogs.

## External Sources Checked

- SEC EDGAR API / fair-access guidance: https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data
- FRED API docs: https://fred.stlouisfed.org/docs/api/fred/
- ALFRED / real-time periods docs: https://fred.stlouisfed.org/docs/api/fred/realtime_period.html
- FRED release dates docs: https://fred.stlouisfed.org/docs/api/fred/release_dates.html
- FRED terms of use: https://fred.stlouisfed.org/docs/api/terms_of_use.html
- Polygon stocks pricing: https://polygon.io/pricing
- Polygon API limit FAQ: https://polygon.io/knowledge-base/article/what-is-the-request-limit-for-polygons-restful-apis
- yfinance docs: https://ranaroussi.github.io/yfinance/
- yfinance earnings-dates API docs: https://ranaroussi.github.io/yfinance/reference/api/yfinance.Ticker.get_earnings_dates.html
- Anthropic pricing / model overview: https://www.anthropic.com/pricing and https://docs.anthropic.com/en/docs/about-claude/models/overview
