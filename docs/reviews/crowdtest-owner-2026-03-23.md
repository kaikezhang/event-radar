# Owner-Perspective Product Evaluation — Event Radar
**Date:** 2026-03-23
**Reviewer:** Kaike (technical founder / product owner)
**Context:** $29/month beta pricing. Evaluating whether I'd pay for this myself.
**App URL:** https://dod-that-francis-effects.trycloudflare.com
**Backend:** http://localhost:3001

---

## Part 1: "Would I Pay $29/month for This?"

### What VALUE does this product deliver right now?

Event Radar delivers a **multi-source event detection pipeline** that monitors 13+ real-time sources (StockTwits, SEC EDGAR, Reddit, breaking news, trading halts, economic calendar, FDA, Congress, DOJ, White House, Federal Register, short interest, unusual options) and pushes classified events through Discord, Telegram, Bark, and web push.

The architecture is genuinely differentiated:
- **AI classification pipeline** (GPT-4 severity scoring + golden judge)
- **Historical pattern matching** (similar past events with T+20 outcomes)
- **Calibration scorecard** (transparent accuracy tracking — rare in this space)
- **Multi-channel delivery** with severity-based routing
- **WebSocket live feed** with real-time event streaming

The engineering quality is professional-grade. Dark theme, mobile-first responsive design, keyboard shortcuts, swipe gestures, WCAG accessibility, proper error handling. This is not a weekend project.

### What's the #1 reason someone would subscribe?

**The promise of AI-powered event detection across 13+ sources with historical pattern matching and transparent accuracy tracking.** No competitor at any price point combines event detection + AI analysis + calibration scorecard + multi-channel delivery in one product. The scorecard alone — showing real T+20 outcomes — is something Benzinga Pro ($117/mo) doesn't even attempt.

### What's the #1 reason someone would NOT subscribe?

**The signal-to-noise ratio is catastrophic.**

Out of ~23,750 total events in the database:
- **~99.9% are MEDIUM severity.** Zero HIGH or CRITICAL in the default feed view.
- **~76% of all events are StockTwits "entered trending" noise** — e.g., "BIDU entered StockTwits trending." This is free information available on StockTwits itself.
- SEC EDGAR events (~9,400) are almost entirely routine Form 4 insider disclosures, all MEDIUM.
- The handful of genuinely useful events (Elliott activist stake in Synopsys, oil price escalation, trading halts) are **buried under thousands of noise events.**

A paying user opens the feed and sees an infinite scroll of "X entered StockTwits trending" cards. They would close the tab in under 60 seconds.

### What features are table-stakes for a $29/month financial product that we're missing?

1. **Real-time price data integration** — Events without current price context are abstract. Every competitor shows live prices alongside alerts.
2. **"Why Is It Moving" explanations** — Benzinga's WIIM is their killer feature. We detect events but don't connect them to price moves users see in real-time.
3. **Options flow / unusual activity display** — Unusual Whales charges $48/mo just for this. We have an UnusualOptionsScanner but it's opt-in and the data isn't prominently displayed.
4. **Earnings calendar integration** — Every financial product has this. Our EarningsScanner exists but is opt-in/disabled.
5. **Analyst ratings changes** — AnalystScanner exists but is disabled. Analyst upgrades/downgrades move stocks. This is free alpha we're not surfacing.
6. **Price alerts** — Basic "alert me when AAPL hits $200" functionality. Every competitor has this.
7. **Charting** — Even basic candlestick charts on event detail pages. We have EventChart.tsx but no actual chart data rendering.
8. **Track record / public performance page** — Competitors publish win rates. Our scorecard is honest but shows 36.79% directional accuracy, which is below coin-flip. We need to either fix accuracy or frame the scorecard differently.

---

## Part 2: "What Would Make ME Come Back Every Morning?"

### Is the feed actually useful for making trading decisions?

**No.** In its current state, the feed is noise. The Smart Feed filters by watchlist tickers, but if your ticker trends on StockTwits, you just see "[TICKER] entered StockTwits trending" over and over. There is no actionable intelligence in the default view.

The feed *architecture* is right — severity color coding, direction badges, source labels, filter presets. But the data flowing through it is 76%+ garbage. **A beautiful pipe carrying dirty water.**

### Does the scorecard give me confidence in the product's accuracy?

**No — it actively undermines confidence.**

- **Directional hit rate: 36.79%** — worse than a coin flip. Prominently displayed.
- **11,998 events detected but only 106 have usable verdicts** (0.88%). 99.1% of events have no outcome tracking.
- **All 106 verdicts come from a single source: Trading Halts.** No other source has any usable verdicts.
- **StockTwits: 9,133 events, 0 usable verdicts.** The dominant source contributes nothing to accuracy.
- "High-Quality Setup" bucket shows 0 verdicts. The label with zero data is embarrassing.

The scorecard's radical transparency is philosophically admirable. But a prospective paying customer seeing 36.79% accuracy would never convert. **We're being transparently bad instead of quietly bad — which is honest but commercially suicidal.**

### Is the event detail page informative enough to act on?

**Mixed.**

- **Breaking news events** with AI enrichment (bull/bear cases, direction prediction, similar past events) are genuinely useful. This is the product's best content.
- **SEC filings** with EDGAR links and form type metadata are solid.
- **Trading halt details** with halt codes and resume times are useful.
- **StockTwits trending events** are nearly empty — title, volume ratio, nothing else. No sentiment analysis, no "why is it trending," no context. This is a $0 feature.
- **Many CRITICAL events show as "BLOCKED"** by the LLM judge but still appear in the feed. Users see CRITICAL labels with no analysis. Worse than no classification.
- **Ticker extraction fails on important events** — CRITICAL breaking news often has `ticker: null`, meaning it can't match watchlists.

### What kind of alerts/events would make this indispensable?

1. **Earnings surprises** (actual vs. estimate, with magnitude and historical reaction patterns)
2. **Analyst upgrades/downgrades with price target changes** (especially multi-analyst consensus shifts)
3. **Insider buying clusters** (multiple insiders buying in the same week = strong signal)
4. **FDA approval/rejection decisions** (binary events with massive price impact)
5. **Activist investor stakes** (13D filings — these move stocks 10-30%)
6. **M&A rumors with credibility scoring** (source reliability + historical accuracy)
7. **Short squeeze setups** (high short interest + rising volume + catalyst)
8. **Congressional trades** (Unusual Whales charges $48/mo for this alone)
9. **Dark pool large block trades** (institutional positioning)
10. **Macro regime changes** with portfolio impact analysis (rate decisions, CPI surprises)

### What's the killer feature we don't have yet?

**"Why Is It Moving" (WIIM) — real-time connection between price moves and detected events.**

When a user sees NVDA drop 5% in their brokerage, they should be able to open Event Radar and instantly see: "NVDA -5.2% | Cause: Export restriction expansion announced (Federal Register scanner) | Historical: Similar restrictions led to -8% avg T+5, recovery to +2% by T+20 | Confidence: HIGH based on 4 similar events."

This connects our event detection pipeline to the question every trader asks 50 times a day: "Why is this moving?" Benzinga charges $117/mo for their version. Ours could be better because we have historical pattern matching they don't.

---

## Part 3: Gap Analysis — What's Missing vs. Competitors

### Benzinga Pro ($117/mo)
| Feature | Benzinga | Event Radar | Gap |
|---------|----------|-------------|-----|
| Real-time news speed | 5-15 min before mainstream | Depends on source polling interval | We need to measure and advertise our latency |
| Audio Squawk | Live human narration 6am-6pm | Audio squawk feature exists (Settings) | Need to verify it works and is useful |
| WIIM | Core feature, very popular | Not implemented | **Critical gap** |
| Custom scanners | Price, volume, float, market cap | Event-type filtering only | Missing quantitative scanning |
| News sources | 1,000+ curated sources | 13 scanners (some disabled) | Fewer but more diverse source types |
| Historical analysis | Weak/none | AI pattern matching + T+20 outcomes | **Our advantage** |
| Accuracy transparency | None (no scorecard) | Full calibration scorecard | **Our advantage** (if accuracy improves) |

### Trade Ideas ($118/mo)
| Feature | Trade Ideas | Event Radar | Gap |
|---------|-------------|-------------|-----|
| AI stock scanning | Holly AI — nightly backtests, 70+ strategies, 8K stocks | Event classification + severity scoring | Different approach but less sophisticated |
| Auto-trading | Broker integration, automated execution | Not applicable | Different product category |
| Backtesting | Full strategy backtesting engine | Historical pattern matching only | Narrower but more accessible |
| Mobile app | None (Windows desktop only) | Mobile-first responsive web | **Our advantage** |
| Paper trading | Yes | No | Not our category |
| Learning curve | Steep, professional tool | Low, clean UX | **Our advantage** |

### Unusual Whales ($48/mo)
| Feature | Unusual Whales | Event Radar | Gap |
|---------|---------------|-------------|-----|
| Options flow | Real-time every trade, filtering | UnusualOptionsScanner (disabled/opt-in) | **Critical gap** — our scanner exists but isn't live |
| Dark pool data | Full tracking | Not implemented | **Gap** |
| Congressional trades | Unique killer feature, full reports | CongressScanner exists but underutilized | Scanner exists — needs promotion and better UI |
| Net flow monitoring | Call vs put premium tracking | Not implemented | Gap |
| 0DTE tracking | Yes | No | Gap |
| Enterprise API | Yes | WebSocket + REST API exist | We have this |

### Where Can We Beat Them?

1. **Multi-source event fusion** — No competitor combines SEC + StockTwits + Reddit + Congress + FDA + DOJ + Federal Register + economic calendar + options flow + news in one pipeline. They each cover 1-2 categories.
2. **AI historical pattern matching** — "This event is similar to 4 past events, here's what happened" is unique to us.
3. **Calibration scorecard** — Radical transparency on accuracy. No competitor does this.
4. **Mobile-first** — Trade Ideas has no mobile app. Benzinga's mobile is an afterthought.
5. **Price point** — $29/mo vs $48-178/mo. Significant undercut if quality matches.
6. **Multi-channel delivery** — Discord + Telegram + Bark + webhooks + web push. Most competitors are web-only or email-only.

### Our Unique Value Proposition

**"The only market intelligence platform that detects events across 13+ sources, enriches them with AI historical analysis, and transparently tracks its own accuracy — at 1/4 the price of Benzinga Pro."**

But this UVP only works if:
1. The feed isn't 76% StockTwits noise
2. The accuracy is above coin-flip
3. The AI enrichment isn't BLOCKED on half the events

---

## Part 4: Concrete Next Steps — TOP 10

Ranked by (impact on user retention) × (1 / effort to build):

### 1. Fix Signal-to-Noise Ratio (CRITICAL — Week 1)
**Impact: 10/10 | Effort: Low**
- Demote ALL StockTwits "entered trending" to LOW severity
- Hide LOW events from default feed view (show count badge instead)
- Only promote StockTwits to MEDIUM+ if confirmed by another source or unusual volume
- **This single change transforms the feed from noise to signal**

### 2. Enable Disabled Scanners: Earnings, Analyst, SEC Edgar (Week 1-2)
**Impact: 9/10 | Effort: Medium**
- EarningsScanner, AnalystScanner, SecEdgarScanner are BUILT but disabled
- Earnings surprises and analyst upgrades are the #1 and #2 most-traded event types
- Turn them on, tune severity classification, verify output quality
- This immediately doubles our content value

### 3. Build "Why Is It Moving" (WIIM) Feature (Week 2-3)
**Impact: 10/10 | Effort: High**
- Monitor top 500 stocks for unusual price/volume moves
- Cross-reference with detected events in last 24 hours
- Surface "NVDA -5.2% → likely caused by: [event link]" cards
- This is the killer feature that Benzinga charges $117/mo for

### 4. Fix Severity Classification / AI Pipeline (Week 1-2)
**Impact: 9/10 | Effort: Medium**
- Trading halts should be HIGH/CRITICAL, not MEDIUM
- Fix keyword-matching false positives (e.g., "war" matching "warrants")
- Fix ticker extraction for breaking news (many CRITICAL events have null tickers)
- Stop surfacing BLOCKED events in the feed — either enrich or don't show
- Improve confidence calibration (currently all verdicts are "High" confidence)

### 5. Add Real-Time Price Context to Events (Week 2)
**Impact: 8/10 | Effort: Medium**
- Show current price, daily change, and mini-chart on every event card
- Price endpoint exists (`GET /api/price/:ticker`) — wire it to the UI
- Events without price context feel academic, not actionable

### 6. Build Congressional Trading Dashboard (Week 3-4)
**Impact: 8/10 | Effort: Medium**
- CongressScanner already exists
- Build a dedicated page showing recent congressional trades
- Filter by politician, party, sector, trade size
- Unusual Whales charges $48/mo for essentially this one feature
- This could be our viral marketing hook

### 7. Improve Scorecard Framing and Data (Week 2-3)
**Impact: 7/10 | Effort: Medium**
- Don't lead with 36.79% directional hit rate — lead with "events detected" and "sources monitored"
- Show accuracy ONLY for sources with 50+ verdicts (statistical significance)
- Add confidence intervals to all metrics
- Implement the "Rolling accuracy trend" (currently "Coming soon")
- Frame as "calibration in progress" with transparent methodology, not as a finished report card

### 8. Add Price Alerts (Week 3)
**Impact: 7/10 | Effort: Medium**
- "Alert me when AAPL crosses $200" — basic but expected at $29/mo
- Leverage existing delivery infrastructure (Discord, Telegram, push)
- This is table-stakes for any paid financial product

### 9. Build Daily Market Briefing (Week 2)
**Impact: 8/10 | Effort: Medium**
- AI-generated morning summary: "3 HIGH events overnight, top sectors affected, key earnings today"
- Push to all channels at 7am user-local-time
- This is the "reason to come back every morning" feature
- Daily briefing component exists in Feed header — expand it into a standalone feature

### 10. Add Options Flow Display (Week 4+)
**Impact: 7/10 | Effort: High**
- UnusualOptionsScanner exists but is disabled
- Enable it, build a dedicated options flow page
- Show large trades, unusual volume, sweeps
- Even a basic version differentiates us from Benzinga/Trade Ideas

---

## Part 5: Scores (1-10, Brutally Honest)

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Current product value** | 3/10 | Beautiful architecture delivering noisy data. The feed is 76% StockTwits noise. Would not pay $29/mo today. |
| **Content/data quality** | 2/10 | 99.9% MEDIUM severity, 0.88% events have outcomes, 36.79% accuracy (below coin flip). The few good events are buried. |
| **UX/design polish** | 8/10 | Genuinely impressive. Dark theme, mobile-first, WCAG compliant, keyboard shortcuts, swipe gestures. Professional-grade shell. |
| **Trust/credibility** | 4/10 | Scorecard transparency is good philosophy but bad marketing. BLOCKED events in feed, null tickers on CRITICAL events, and sub-coin-flip accuracy destroy trust. |
| **"Would I recommend this?"** | 3/10 | Not yet. I'd be embarrassed to recommend it to a trader friend with the current feed quality. After fixing signal-to-noise: 7/10. |
| **Production readiness** | 5/10 | Infrastructure is solid (WebSocket, delivery channels, API). Data quality is not production-ready for a paid product. |

### Overall: 4.2/10

### The Brutal Truth

**Event Radar is a $29/month product trapped inside a $0/month data quality problem.**

The engineering is legitimately impressive — 23 scanners, AI pipeline, golden judge, calibration scorecard, 5 delivery channels, WebSocket live feed, mobile-first responsive design. This is 10x the architecture of most indie financial tools.

But architecture doesn't matter if the water flowing through the pipes is dirty. Right now:
- 76% of events are StockTwits noise that's free everywhere
- The best scanners (Earnings, Analyst, SEC Edgar) are disabled
- AI classification produces false positives (micro-cap Australian warrants classified as CRITICAL)
- Ticker extraction fails on the most important events
- The scorecard honestly reports below-coin-flip accuracy

**The fix is not more engineering. It's curation.** Turn on the good scanners, turn down the noise, fix the severity classification, and this product goes from 4/10 to 7/10 in two weeks. The pipes are built. Clean the water.

### Path to $29/month Viability

| Milestone | Timeline | Score Target |
|-----------|----------|-------------|
| Fix signal-to-noise (StockTwits LOW, hide LOW default) | Week 1 | 5.5/10 |
| Enable Earnings + Analyst scanners | Week 2 | 6.5/10 |
| Add price context + fix severity classification | Week 3 | 7.0/10 |
| Build WIIM feature | Week 4 | 7.5/10 |
| Congressional trading page | Week 5 | 8.0/10 |
| Options flow + daily briefing | Week 6 | 8.5/10 |

At 8.0/10, this product justifies $29/month. At 8.5/10, it justifies $49/month and competes with Unusual Whales.

---

*Generated by owner-perspective evaluation. No sugar-coating. The goal is a product worth paying for.*
