# Event Radar — Evolution Strategy Review

**Reviewer:** Senior quant portfolio manager, event-driven strategy, ~$50M AUM  
**Date:** 2026-03-13  
**Docs reviewed:** `docs/EVOLUTION-STRATEGY.md`, `docs/VISION.md`, `docs/SOURCES.md`, `docs/FEED-STRATEGY.md`, `README.md`, `TASK.md`, `tasks.md`

## Executive Verdict

The direction is broadly right: focus on primary sources, faster delivery, outcome tracking, and tighter feedback loops. But the current plan still reads more like a product roadmap than an investable alpha roadmap.

If I were allocating real capital against this system today, I would treat it as a **research and monitoring platform**, not yet a **production alpha platform**.

The reason is simple:

1. The proposed source mix overweights noisy or delayed inputs and underweights truly tradeable ones.
2. The backtest framework is not yet specified tightly enough to avoid false confidence.
3. The post-market self-evolution loop is useful as analyst support, but not reliable enough to autonomously discover edge.
4. `yfinance` is acceptable for prototyping and QA, but not as production price truth for a live strategy or institutional audit trail.

My base case is that a disciplined implementation of the right subset of this roadmap can improve a diversified event-driven sleeve by roughly **+0.35 to +0.80 Sharpe** versus a rules-only baseline. A poorly controlled implementation can easily produce a **negative live Sharpe despite attractive backtests** because of latency leakage, selection bias, and over-alerting.

## 1. Alpha Assessment

### What is truly tradeable

For a $50M event-driven book, the high-value signals are concentrated in a narrow set of catalyst types:

| Strategy bucket | Typical gross opportunity | Alpha half-life | Capacity for $50M book | Incremental Sharpe if implemented well | Verdict |
|---|---:|---:|---:|---:|---|
| **SEC 8-K live** (`1.01`, `2.01`, `2.05`, `5.02`, select `8.01`) | 1% to 8% in single names, occasionally more | 10 to 60 min intraday; can persist overnight if filed after close | Good in liquid mid/large caps; poor in microcaps | **+0.25 to +0.45** | **Core alpha** |
| **Exchange halts / LULD / resumes** | 1% to 5% post-resumption, sometimes 10%+ | Seconds to 5 min | Moderate | **+0.10 to +0.20** | **Core alpha** |
| **Macro scheduled releases** (CPI, NFP, FOMC) | 30 to 150 bps in indices/rates/FX immediately | Seconds to 2 min | Excellent via liquid futures/ETFs | **+0.10 to +0.25** | **Only if machine-fast** |
| **PR Newswire / BusinessWire / GlobeNewswire** | 0.5% to 4% in SMID caps; less in megacaps | 5 to 20 min | Moderate; liquidity filter required | **+0.15 to +0.30** | **Important** |
| **Truth Social / key X accounts** | 0.5% to 3% sector/index move; fat tails larger | 1 to 10 min | Excellent in index/sector products | **+0.10 to +0.35** | **Selective core** |
| **FDA / DOJ / FTC / PACER / bankruptcy** | 3% to 30% single-name on valid hits | 5 min to multi-day | Limited by liquidity and gap risk | **+0.10 to +0.25** | **High value niche** |
| **Form 4 insider buys** | Best decile works over days/weeks, not minutes | Days to weeks | Good | **+0.05 to +0.10** | **Slow-burn research alpha** |
| **Analyst ratings** | Usually low after-cost alpha in liquid names | 1 to 15 min | Good | **0.00 to +0.05** | **Nice-to-have** |
| **Congress/STOCK Act trades** | Disclosure lag destroys immediacy | Days to weeks | Good | **~0.00** | **Research only** |
| **Reddit / StockTwits / social chatter** | Standalone alpha weak; often contrarian | Minutes to hours | Poor in crowded names | **0.00 to negative** standalone | **Use as confirmation, not driver** |
| **13F / WARN / generic policy notices** | Slow, thematic, often already priced | Days to months | Good | **~0.00 live** | **Batch intelligence only** |

### What is nice-to-have vs must-have

**Must-have before calling this an alpha engine:**

1. SEC 8-K live with item parsing and exhibit extraction
2. Nasdaq/NYSE halt and resumption feeds
3. Scheduled macro release parser with event-time awareness
4. PR/BusinessWire/GlobeNewswire with robust ticker resolution
5. One or two truly market-moving political accounts, not broad social scraping

**Nice-to-have later:**

1. Congress trades
2. Broad Reddit sentiment
3. Most analyst rating feeds
4. WARN Act
5. 13F as real-time alerting

### Where the current plan is too optimistic

The documents implicitly assume that any “important” event translates into tradeable alpha. That is false.

At $50M AUM, the relevant question is not “did the stock move 3%?” It is:

- Could I enter after detection with acceptable slippage?
- Could I size it without becoming the market?
- Was the move still available after the alert delay?
- Was the expected value positive net of fees, borrow, and gap risk?

I would rather have **2 to 4 high-conviction alerts/day** than **5 to 8 generic alerts/day** if the former are actually executable.

## 2. Data Quality and Signal-to-Noise

### Source quality is uneven

The proposed source list is directionally sensible, but the signal-to-noise ratio varies by an order of magnitude.

| Source family | Estimated % worth model review | Estimated % actually tradeable live | Comments |
|---|---:|---:|---|
| SEC 8-K selected items | 20% to 35% | 5% to 12% | Still high quality, but many filings are routine or already expected |
| SEC Form 4 | 10% to 20% | 1% to 3% | Most filings are noise unless open-market, large dollar value, CEO/founder, or clustered |
| PR/BusinessWire | 15% to 25% | 4% to 10% | Stronger in SMID caps and premarket announcements |
| Reuters/AP breaking | 20% to 30% | 5% to 15% | Good if timestamped correctly and not duplicated after the move |
| Truth Social / top political posts | 10% to 20% | 3% to 8% | Rare but high-impact; classification matters more than volume |
| FDA / DOJ / FTC / PACER | 10% to 25% | 3% to 10% | Sparse but highly valuable |
| Analyst ratings | 10% to 15% | 1% to 4% | Crowded and rapidly priced |
| Reddit / StockTwits | 1% to 5% | <1% standalone | Better as a contextual feature than a trigger |

### Data-source sufficiency

The current evolution plan correctly highlights missing scanners, but it is still missing several inputs that matter more than some of the listed lower-tier sources:

1. **Exchange halts / resumes / LULD states**
2. **Company IR press release pages and IR RSS**
3. **Earnings pre-announcements and guidance revisions**
4. **Bankruptcy / restructuring court docket signals**
5. **Live transcript surprise extraction on earnings calls**
6. **Corporate action dilution signals**: ATM launches, convert issuances, secondaries

If those are absent, the product will catch many stories that are interesting, but miss too many that are actually positionable.

### Data normalization gaps

To be useful for trading, every event needs:

1. `source_published_at`
2. `source_first_seen_at`
3. `normalized_event_at`
4. `alert_sent_at`
5. security identity at the **tradable instrument** level, not just issuer or ticker string

Without those fields, you cannot separate source delay from pipeline delay, and your backtests will overstate your speed.

## 3. Backtest Validity

This is the most important weak point in the plan.

### The proposed metric set is not enough

The suggested acceptance bar of `precision > 70%` and `recall > 80%` on `|move| > 3%` is not a robust institutional standard.

Problems:

1. **Absolute move thresholds are biased by market cap and volatility.**
   A 3% move in a biotech microcap is routine; a 3% move in a mega-cap is major.
2. **Precision without cost is misleading.**
   A signal can “work” in backtest and still be untradeable after slippage.
3. **Recall is undefined unless you define the eligible universe of catalysts and movers.**
4. **Alert-level metrics miss score calibration.**
   You need to know whether the model is ranking the best events highest.

### Minimum viable research standard

For each event, store and evaluate:

1. **Detection timestamp**: first moment your system could have acted
2. **Entry price basis**: first trade or 1-minute VWAP after detection plus operational buffer
3. **Exit windows**: T+5m, T+30m, T+1d, T+5d
4. **Benchmark-adjusted return**:
   - Single names: sector ETF + beta-adjusted SPY
   - Macro/index events: relevant futures or ETF benchmark
5. **Implementation shortfall**:
   - Large caps: assume 5 to 15 bps
   - Mid caps: 15 to 40 bps
   - Small caps: 40 to 150+ bps
6. **Liquidity eligibility**:
   - ADV
   - spread
   - halt state
   - borrow availability for shorts

### Biases that will otherwise invalidate results

**Look-ahead bias**

- Using filing acceptance time instead of actual scanner first-seen time
- Using revised macro data or corrected timestamps
- Using future events in “historical similar event” matching
- Evaluating on adjusted daily bars that hide real intraday path

**Selection bias**

- Backtesting only events already captured in DB
- Evaluating only “interesting” events and not the full noise set
- Measuring missed movers only among names that were easy to explain after the fact

**Survivorship bias**

- Ignoring delisted, acquired, halted, reverse-split, or bankrupt names
- Restricting the universe to current liquid tickers

**Outcome leakage**

- LLM explanation of why a stock moved after the fact can contaminate the source/catalyst label
- Reuters and secondary articles may be published after price discovery has already happened

### Recommended backtest design

I would require:

1. **Purged walk-forward testing** by month or quarter
2. **Point-in-time source snapshots**
3. **A negative control set**
   - events not alerted
   - movers with no captured catalyst
4. **Calibration by decile**
   - top 10% of model score vs bottom 10%
5. **Net alpha, not just hit rate**
6. **Ablation tests**
   - SEC only
   - SEC + PR wires
   - add political
   - add social

My expectation is that once costs and realistic timestamps are applied, backtest performance will drop by **25% to 50%** versus the naive version. That is normal. The point is to know the truth.

## 4. Self-Evolution / Post-Market Review Bot

### Useful, but not autonomous truth

The post-market review bot is realistic as an **analyst assistant**. It is not realistic as an autonomous source-discovery engine without human supervision.

### Main failure modes

1. **Post-hoc narrative invention**
   The bot will confidently explain a move that was actually flow-driven, short-covering, options-related, or part of a sector basket.
2. **Wrong catalyst attribution on macro days**
   A stock may move because rates, oil, or index flows moved, not because of an issuer-specific event.
3. **Secondary-source contamination**
   The earliest article found by web search is often not the original catalyst.
4. **False source-priority conclusions**
   Missing three movers tied to Reuters does not necessarily mean “build Reuters.” It may mean the real source was an 8-K, IR page, or exchange notice.
5. **Feedback overfitting**
   If the bot keeps tuning filters to explain yesterday’s misses, it will optimize for anecdote rather than stable signal.

### How to make it realistic

Use a three-bucket output:

1. **High-confidence missed source**
   Same source gap observed at least 3 times in 20 trading days, with human verification
2. **Possible filter false negative**
   We saw the event before the move, but blocked it
3. **Unknown / unexplainable**
   No reliable catalyst found; do not generate roadmap changes

Only auto-create GitHub issues for the first category.

### My quantitative expectation

If implemented conservatively, a review bot can improve research productivity by **30% to 50%** and improve medium-term recall by **5 to 10 points** over a few months.

If implemented aggressively and allowed to auto-tune production thresholds, it can easily **reduce live precision by 10 to 20 points** through overfitting.

## 5. Price Data: `yfinance` for Production

### Short answer

No. Not for production, not for audit, and not for any system you want to trust with real money.

### Why

1. It is an **unofficial Yahoo wrapper**, not an exchange-grade source of record.
2. There is **no SLA**.
3. Corporate-action handling and corrected historical values are not robust enough for institutional backtests.
4. Intraday timestamps and session handling are not reliable enough for event studies.
5. Commercial-use and operational-risk questions remain worse than with a direct market-data vendor.

### Acceptable use of `yfinance`

1. Prototype dashboards
2. Low-stakes enrichment
3. Sanity checks on daily bars
4. Development fallback when paid feeds are unavailable

### What I would use instead

**Production primary**

1. **Polygon** if you want a simple API and retail-to-pro spectrum
2. **Databento** if you care more about intraday fidelity, normalized schemas, and better alignment between research and production

**Practical split**

1. **Databento or Polygon** for intraday bars / trades / quotes / halts
2. **Official SEC / FRED / exchange sources** for primary event timestamps
3. Optional slower backup source for delayed EOD sanity checking

For a strategy managing $50M, spending **$5k to $20k/year** on proper market data is not expensive. One bad backtest caused by wrong timestamps or missing splits can cost more than that in a single trading month.

## 6. Latency: What Must Be Fast

The documents overgeneralize latency. Not everything needs sub-second delivery.

### Sub-second to <5 seconds

Only a narrow set of alerts justify this:

1. **CPI / NFP / FOMC statements**
2. **Exchange halts, resumptions, LULD**
3. **Trump / top political posts that move indices or sectors immediately**
4. **Top-tier breaking geopolitical headlines**

If you are slower than **5 seconds** here, much of the immediate edge is already gone.

### <15 seconds

1. **SEC 8-K in liquid names**
2. **PR/BusinessWire in SMID caps**
3. **Major FDA / DOJ / FTC / PACER headlines**

This is the sweet spot for most of the product’s practical value.

### <60 seconds

1. **Most corporate filings**
2. **Company IR releases**
3. **Secondary confirmations**

Still useful. Often sufficient for swing-style event books.

### Can wait minutes or longer

1. Form 4
2. 13F
3. Congress trades
4. Broad social sentiment
5. WARN Act
6. end-of-day review metrics

### Alpha decay estimates

Rough rule of thumb for a live event-driven book:

| Event type | Alpha decay per minute of delay |
|---|---:|
| Macro release / trading halt / top political post | **10% to 20% of same-day edge per minute** in the first 5 minutes |
| SEC 8-K / PR wire / FDA / DOJ | **3% to 8% of same-day edge per minute** in the first 10 minutes |
| Analyst rating / social spike | **5% to 15% per minute** because the edge is weak and crowded |
| Form 4 / 13F | negligible per minute; measured in days |

That means a signal with a 120 bps gross same-day opportunity may be worth only **70 to 80 bps** after a 5-minute delay, and **30 to 50 bps** after a 15-minute delay.

## 7. Missing Edge

Several high-value signals are absent or underemphasized.

### Most important missing signals

1. **Exchange operational signals**
   - halts
   - LULD
   - resumption notices
2. **Company IR site monitoring**
   - many catalysts appear there before broad media pickup
3. **Guidance pre-announcements**
   - arguably more tradeable than generic earnings summaries
4. **Earnings-call surprise extraction**
   - not full transcripts; real-time extraction of guidance, margin, capex, customer commentary
5. **Dilution and financing events**
   - ATM launches
   - convert issues
   - secondaries
   - debt restructurings
6. **Distress / bankruptcy docket monitoring**
7. **Index inclusion, deletion, and rebalance events**
8. **Borrow / short-sale constraint proxies**
   - hard-to-borrow names behave differently on bad news
9. **Liquidity and ADV filters**
   - a catalyst is not edge if the book cannot trade it

### Product implication

The system currently optimizes for “important news.” A portfolio manager needs it to optimize for **important and tradeable news**.

That requires every alert to carry:

1. expected holding horizon
2. liquidity bucket
3. crowdedness / spread proxy
4. whether the opportunity is more likely **momentum**, **mean reversion**, or **overnight drift**

## 8. Scaling from 1 User to 1000

### Infrastructure scaling

From a systems perspective, these will break first:

1. **LLM cost spikes from scanner bugs**
2. **Delivery fan-out and retries during event bursts**
3. **Stateful dedup across multiple sources arriving at once**
4. **Per-user watchlist matching and preference evaluation**
5. **Rate limits on third-party feeds**

Those are all solvable with queueing, caching, idempotency, and “enrich once, fan out many.”

### The more important problem: alpha scaling

The real issue is that **the alpha itself does not scale linearly with users**.

If 1,000 users receive the same thinly traded small-cap PR alert at once, the product can destroy its own edge. At that point:

1. the alert becomes self-referential flow
2. slippage widens
3. fills deteriorate
4. the best opportunities disappear fastest

This matters even if Event Radar never auto-trades.

### Recommendation

Segment alerts by liquidity tier:

1. **Mega/large-cap market-moving alerts**
   - safe for wide distribution
2. **Mid-cap single-name alerts**
   - still distributable, but with care
3. **Small-cap / microcap high-slippage alerts**
   - either deprioritize, delay on free tiers, or gate entirely

Without that, going from 1 user to 1000 can reduce realized edge by **20% to 50%** in the best small-cap setups.

## 9. Specific Technical Recommendations

### P0: What I would build first

1. **Production-grade price and market-state layer**
   - intraday bars, trades, quotes, halts, session calendar
2. **Event timestamp integrity**
   - `published_at`, `seen_at`, `processed_at`, `alerted_at`
3. **SEC live scanner with item-level parsing**
4. **Exchange halt/LULD scanner**
5. **PR wire ingestion with strong entity/ticker resolution**

### P1: What comes next

1. **Point-in-time backtest engine with transaction cost model**
2. **Conservative post-market review workflow**
3. **Liquidity-aware scoring**
4. **Deliver ranking score, not just binary pass/block**

### P2: Product improvements that actually matter

1. Replace “Action: buy/watch” style language with **historical context + confidence**
2. Display **since alert**, **since source publish**, and **liquidity bucket**
3. Add a **public delayed feed** for distribution, but keep the highest-edge low-liquidity signals controlled

## 10. Revised Performance Targets

I would replace the current targets with these:

| Metric | Current docs | My recommended target |
|---|---:|---:|
| Actionable alerts/day | 3 to 10 | **2 to 6** |
| Median event-to-alert latency, Tier 1 | <60s | **<15s** for core sources |
| Median event-to-alert latency, Tier 2 | not differentiated | **<60s** |
| High-severity precision | >70% on `|move| > 3%` | **35% to 50%** on net positive abnormal return after costs; **55% to 65%** for top decile score bucket |
| Duplicate rate | <5% | **<3%** |
| Missed major catalysts | not formalized | **<10%** of tradeable >2-sigma moves in covered universe |
| False-positive social alerts | not formalized | **<1/day** |

Those targets are harder to game and closer to what a real money manager would trust.

## 11. Governance / Process Concern

There is a documentation inconsistency that matters.

`docs/EVOLUTION-STRATEGY.md` says there is effectively no functioning backtest/price validation loop, while `tasks.md` says Phase 4 backtest and outcome infrastructure is already complete. That kind of mismatch is dangerous because it creates false certainty about what has been proven.

For a strategy platform, research governance matters as much as features. I would require a single source of truth for:

1. what data is live
2. what is backfilled
3. what is validated
4. what is still aspirational

## Bottom Line

This roadmap can absolutely produce a valuable product, and parts of it can produce real alpha. But the alpha is narrower than the docs imply.

If the team focuses on:

1. **SEC + halts + macro + PR wires**
2. **production-grade price data**
3. **point-in-time backtesting**
4. **liquidity-aware alerting**
5. **human-supervised self-evolution**

then I would view the platform as having a realistic path to a **useful event-driven research and alerting stack** with a live strategy uplift of roughly **+0.35 to +0.80 Sharpe**.

If instead the team treats all sources as equal, relies on `yfinance` in production, and lets the review bot “discover” the roadmap autonomously, the most likely outcome is a polished alerting product with **weak live tradability and overstated backtest performance**.

## External Data-Vendor Note

As of **2026-03-13**, the following external checks support the recommendations above:

1. **SEC EDGAR** documents real-time API updates and a **10 requests/second** fair-access limit.
2. **ALFRED/FRED** supports real-time vintage handling, which is required for point-in-time macro backtests.
3. **Polygon** publicly advertises free/basic limits far below what is needed for serious historical bootstrap or real-time production.
4. **Databento** offers direct-source historical/live equities data more suitable for intraday event studies.
5. **`yfinance`** explicitly states it is **not affiliated with Yahoo** and is intended for research/educational use.
