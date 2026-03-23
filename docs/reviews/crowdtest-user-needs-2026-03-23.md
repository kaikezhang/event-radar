# CrowdTest: User-Needs & Product Strategy — 2026-03-23

**Test Type:** User-needs analysis (NOT bug-finding)
**Core Question:** What information and features would make each user type say "I NEED this app every day"?
**Test URL:** https://dod-that-francis-effects.trycloudflare.com
**Backend:** http://localhost:3001
**Date:** 2026-03-23

---

## Current State of the Product

### What Event Radar IS Today
- Real-time market event aggregator with 23 scanners (breaking news, SEC filings, Truth Social, StockTwits, trading halts, FDA, earnings, options activity, congressional trades, etc.)
- AI-powered classification pipeline (severity grading, enrichment with bull/bear thesis)
- Multi-channel delivery (Discord, Telegram, Bark push, web push, webhooks)
- Event outcome tracking with T+5min, T+20min, T+1h, T+1d, T+1w, T+1m price moves
- Scorecard system tracking 23,516 events across 17 sources over 30 days
- Watchlist with custom sections, color coding, drag-to-reorder
- Smart Feed with severity filtering, same-ticker grouping
- Historical pattern matching and similar-event discovery
- Market regime indicator (bull/bear/correction/neutral)
- Custom alert rules via DSL-based rule engine
- Daily briefing API

### Current Data Snapshot (Live at Time of Test)
- **Events in feed:** ~26 events over 5 days (March 18–23)
- **Active sources producing events:** Primarily breaking-news (23/26) and truth-social (1/26)
- **Dominant narrative:** Iran-U.S. geopolitical tension (5+ events), SMCI GPU smuggling (3 events)
- **Severity distribution:** 4 CRITICAL, 4 HIGH, 18 MEDIUM
- **Trending tickers:** CIK (25), SPY (14), QQQ (9) — CIK at #1 is a data quality issue (SEC filing noise)
- **Scorecard 30-day:** 11,262 alerts, 39.33% setup-worked rate, 0% directional accuracy
- **Story groups:** Empty (feature not populating)
- **Market regime:** Neutral (all indicators at zero — likely not connected to live data)

### Critical Observation
Most of the 23 scanners are NOT producing visible events in the feed. The breaking-news scanner dominates. This means the app's key differentiator — multi-source event detection — is largely invisible to users.

---

## Persona 1: Sarah — Active Day Trader

**Profile:** $500K portfolio, trades 20+ times/week
**Currently pays for:** Benzinga Pro ($117/mo), TradingView ($60/mo), StockTwits (free), Bloomberg Terminal at work
**Monthly spend on tools:** $400+

### 1. What does she currently get from Event Radar that she can't easily get elsewhere?

**Honestly? Very little that's unique — yet.** Benzinga Pro already gives her:
- Real-time breaking news with audio squawk
- Analyst ratings, earnings, FDA, SEC filings
- Customizable alerts with sound

What Event Radar does differently:
- **Truth Social scanner** — No other retail tool auto-scans Trump's Truth Social posts and maps them to tickers. The CRITICAL "Trump threatens Iran: obliterate their POWER PLANTS" event → XLE ticker is genuinely unique
- **Political event → market impact mapping** — The Iran escalation chain (5 events over 2 days with ticker assignments) is something she'd have to manually piece together on Benzinga
- **Outcome tracking baked in** — Benzinga doesn't track whether its alerts actually moved stocks. Event Radar's scorecard (39% setup-worked rate for all, 79% for trading halts) is a unique value prop

### 2. What does she NEED that Event Radar doesn't provide?

| Need | Priority | Current Gap |
|------|----------|-------------|
| **Pre-market summary by 6:30 AM ET** | CRITICAL | Daily Briefing API exists but doesn't surface well in the app |
| **Audio squawk for CRITICAL alerts** | CRITICAL | Audio alert setting exists but no real-time squawk feature |
| **Options flow data** | HIGH | Options scanner exists in codebase but producing no visible events |
| **Earnings surprise data** (beat/miss, guidance) | HIGH | Earnings scanner exists but no structured beat/miss data |
| **Level 2 / unusual volume indicators** | HIGH | Not available |
| **Direct broker integration** (one-click trade) | MEDIUM | Not available |
| **Price charts embedded in events** | MEDIUM | EventChart component exists but often shows no data |
| **Speed benchmark** (how fast vs. Bloomberg/Benzinga) | HIGH | No latency metrics exposed to users |

### 3. Competing tools and what would make her switch

| Tool | What It Does Better | What Event Radar Could Beat It On |
|------|-------------------|-----------------------------------|
| **Benzinga Pro** ($117/mo) | Speed, squawk, volume, depth | Political scanner, outcome tracking, AI analysis |
| **TradingView** ($60/mo) | Charts, screening, community | Event-to-price correlation, historical pattern matching |
| **StockTwits** (free) | Social sentiment, real-time chatter | Signal extraction (Event Radar already filters StockTwits noise) |
| **Bloomberg Terminal** ($24K/yr) | Everything | Price (obviously), accessibility, mobile-first UX |

**To make Sarah switch from Benzinga Pro:** Event Radar would need real-time speed parity + the political/Truth Social scanner + proven outcome tracking + audio squawk. She wouldn't switch entirely, but she'd ADD Event Radar if it fills the political-event gap.

### 4. ONE feature that would make it indispensable

**"Event Radar called this move before Benzinga."** Speed + unique sources. If Event Radar can demonstrably alert on Truth Social posts, congressional trades, or federal register filings 5-30 minutes before Benzinga catches the story, that's worth paying for. The proof would be a latency leaderboard: "Event Radar alerted 12 minutes before major outlets."

### 5. Would she pay $29/month?

**Yes, IF:**
- The political/Truth Social scanner reliably catches events before they hit mainstream financial news
- Audio alerts work for CRITICAL events
- Options scanner is live and producing data
- She can prove it adds alpha via the scorecard

**No, because today:**
- Only 2 of 23 scanners are visibly producing events
- No audio squawk
- No options flow data
- She can't verify speed advantage

**Satisfaction Score: 5/10** — Promising concept, insufficient execution for a trader spending $400/mo on tools.

---

## Persona 2: Marcus — Hedge Fund Analyst

**Profile:** CFA, manages $50M sector fund
**Currently pays for:** Bloomberg Terminal ($24K/yr), Refinitiv, FactSet, SEC EDGAR direct
**Monthly spend on tools:** $3,000+

### 1. What does he currently get from Event Radar that he can't easily get elsewhere?

**The AI enrichment layer on top of raw events.** Bloomberg gives him the raw filing, but Event Radar's pipeline adds:
- **Bull/bear thesis generation** — When it works (often shows "Analysis not available"), the AI-generated bull and bear cases save 10 minutes of initial analysis per event
- **Cross-source event correlation** — The Iran tension story threading (Truth Social → breaking news → oil prices → treasury moves) is something he'd have to manually track across Bloomberg terminals
- **Outcome tracking with historical pattern matching** — "Similar past events" and "What happened next" features are genuinely valuable for a sector analyst building pattern libraries
- **Setup-worked rates by source** — 79% for trading halts, 38% for StockTwits — this source-quality signal doesn't exist in Bloomberg

### 2. What does he NEED that Event Radar doesn't provide?

| Need | Priority | Current Gap |
|------|----------|-------------|
| **SEC filing deep analysis** (8-K material changes, insider form 4 patterns) | CRITICAL | SEC scanner exists but events not appearing in feed |
| **Insider trading pattern detection** (cluster buys, unusual timing) | CRITICAL | Not available |
| **Cross-sector correlation maps** (Iran → Oil → Airlines → Defense) | HIGH | Story groups feature exists but returns empty |
| **Regulatory change tracking** (Federal Register, FDA, DOJ) | HIGH | Scanners exist but not producing visible events |
| **Custom event scoring models** | HIGH | Rule engine exists but limited to filtering, not scoring |
| **API access for quantitative integration** | CRITICAL | REST API exists but no documented external API product |
| **Export to Excel/CSV** | MEDIUM | Not available |
| **Confidence intervals on predictions** | HIGH | Classification has confidence scores but not prominently displayed |
| **Multi-entity relationship mapping** | MEDIUM | Ticker extraction exists but no entity relationship graph |

### 3. Competing tools and what would make him switch

| Tool | What It Does Better | What Event Radar Could Beat It On |
|------|-------------------|-----------------------------------|
| **Bloomberg Terminal** | Everything: depth, breadth, speed, trust | AI analysis layer, outcome tracking, accessibility |
| **Refinitiv** | Data depth, historical archives | AI enrichment, modern UX |
| **FactSet** | Financial modeling, screening | Event-driven analysis, pattern matching |
| **SEC EDGAR** | Authoritative filings | AI summarization, cross-filing pattern detection |

**Marcus won't replace Bloomberg.** The question is: does Event Radar add $29/mo of value ON TOP of Bloomberg? The answer depends on the AI enrichment quality and the outcome tracking proving alpha.

### 4. ONE feature that would make it indispensable

**"Historical pattern matching with statistical confidence."** If Marcus could ask "Show me every time a company's co-founder was charged with fraud and what happened to the stock over 1/5/20 days" and get a statistically meaningful answer with confidence intervals, that's a feature Bloomberg doesn't offer. The SMCI GPU smuggling event → historical fraud charge patterns → expected price trajectory is exactly the kind of analysis a sector analyst dreams about.

### 5. Would he pay $29/month?

**Yes, easily — IF:**
- The API is available for programmatic access (he wants to pipe events into his models)
- Historical pattern matching works with real data and statistical rigor
- SEC filing scanner produces structured data (not just headlines)
- AI enrichment actually generates bull/bear cases on 90%+ of events

**No, because today:**
- Most scanners aren't producing visible data
- "Analysis not available" on critical events is a trust-breaker
- Market regime shows all zeros (clearly not connected to live data)
- No API documentation for integration
- Story groups (narrative clustering) returns empty — the most Marcus-relevant feature is broken

**Satisfaction Score: 4/10** — Architecture is right, but an institutional user needs data completeness and reliability. Half-working features are worse than no features.

---

## Persona 3: Jordan — College Student

**Profile:** $5K Robinhood account, learning to invest
**Currently pays for:** Nothing (Reddit, TikTok, Robinhood are free)
**Monthly spend on tools:** $0

### 1. What does Jordan currently get from Event Radar that they can't easily get elsewhere?

**Curated, severity-graded events instead of Reddit noise.** This is genuinely valuable for a beginner:
- **Severity labels** (CRITICAL/HIGH/MEDIUM) help Jordan learn what matters vs. what's noise
- **The event feed is a real-time "what's happening" board** — simpler than Bloomberg, more structured than Reddit
- **Event → ticker mapping** helps them learn which companies are affected by which news
- **The Iran → XLE → SPY chain** teaches macro-to-micro causation in a way r/wallstreetbets doesn't

### 2. What does Jordan NEED that Event Radar doesn't provide?

| Need | Priority | Current Gap |
|------|----------|-------------|
| **"Why does this matter?" explanations** | CRITICAL | Bull/bear thesis exists but often empty; no plain-English "ELI5" |
| **"What should I do?" guidance** | HIGH | No action suggestions (watch, consider, avoid) |
| **Trending events social proof** ("12K traders watching this") | HIGH | No social engagement metrics |
| **Beginner glossary / tooltips** | HIGH | No educational overlays for terms like "8-K filing" or "trading halt" |
| **Paper trading integration** | MEDIUM | No trade simulation |
| **Gamification** (streaks, learning badges) | MEDIUM | No engagement hooks |
| **TikTok-style event summaries** (30-sec video format) | LOW | Text-only |
| **"Explain this like I'm 5"** button on every event | HIGH | Not available |
| **Community features** (comments, reactions, polls) | MEDIUM | No social layer |
| **Portfolio tracking** ("How do events affect MY stocks?") | HIGH | Watchlist exists but no portfolio value tracking |

### 3. Competing tools and what would make them switch

| Tool | What It Does Better | What Event Radar Could Beat It On |
|------|-------------------|-----------------------------------|
| **Reddit r/wallstreetbets** | Community, memes, FOMO | Structured events, no noise, severity grading |
| **TikTok Finance** | Entertainment, accessibility | Real-time events (TikTok is delayed) |
| **Robinhood News Feed** | In-app, tied to holdings | Broader coverage, AI analysis, faster |
| **Yahoo Finance** | Free, comprehensive | Event-driven focus, mobile-first UX |

**Jordan won't pay for anything.** The path to Jordan is: free tier → build habit → convert to paid when they graduate and have real money.

### 4. ONE feature that would make it indispensable

**"Learn by watching real events unfold."** A "Student Mode" that adds educational annotations to every event: "This is an 8-K filing — here's what that means" / "Trading halts happen when..." / "This event moved XLE because oil companies are affected by Iran tensions." Transform every event into a mini-lesson. Reddit teaches through chaos; Event Radar could teach through structure.

### 5. Would they pay $29/month?

**No. Period.** Jordan is a college student with a $5K account. $29/mo is 7% of their annual portfolio.

**What would change their answer:**
- $5/mo student plan
- Free tier with limited events (5/day) + upgrade path
- "Share with friends" referral that extends free access
- $29/mo after they graduate and get a finance job (plant the seed now)

**Satisfaction Score: 6/10** — Clean UI, interesting events, mobile-friendly. But without educational features and free access, Jordan goes back to Reddit.

---

## Persona 4: David — Swing Trader

**Profile:** $100K portfolio, holds 3-10 days, options-focused
**Currently pays for:** Unusual Whales ($50/mo), Trading Terminal ($49/mo), finviz (free), Discord trading groups
**Monthly spend on tools:** $100+

### 1. What does he currently get from Event Radar that he can't easily get elsewhere?

**Event-driven catalyst identification with outcome tracking.** This is David's sweet spot:
- **The scorecard is David's language.** "Trading halts: 79% setup-worked rate" — this is exactly how swing traders think. Unusual Whales shows flow but doesn't track whether setups actually worked
- **T+5 day outcome data** (43.9% win rate, 3.31% avg gain) — perfectly aligned with David's 3-10 day holding period
- **Multi-source catalyst aggregation** — instead of checking 5 Discord channels, he gets breaking news + Truth Social + SEC + options in one feed
- **Similar past events** — "Last 3 times a co-founder was charged with fraud, stock dropped 15-30% over 5 days" is literally David's trade thesis generator

### 2. What does he NEED that Event Radar doesn't provide?

| Need | Priority | Current Gap |
|------|----------|-------------|
| **Options flow / unusual activity data** | CRITICAL | Scanner exists but producing no visible events |
| **Catalyst calendar** (upcoming earnings, FDA dates, lockup expirations) | CRITICAL | Not available |
| **Historical pattern backtesting** ("When X event happens, buy put spreads") | HIGH | Similar events exist but no backtesting framework |
| **Risk/reward calculator per event** | HIGH | Not available |
| **Alerts with specific entry/exit levels** | HIGH | Alerts exist but no price-level triggers |
| **Options chain data on event detail pages** | MEDIUM | Not available |
| **Sector heat map** | MEDIUM | Not available |
| **Dark pool activity** | MEDIUM | Not available (Unusual Whales has this) |
| **Custom watchlist alerts** ("Alert me on ANY event for my 15 tickers") | HIGH | Watchlist exists, push-non-watchlist toggle exists, but alert customization is basic |
| **Trade journal integration** | LOW | Not available |

### 3. Competing tools and what would make him switch

| Tool | What It Does Better | What Event Radar Could Beat It On |
|------|-------------------|-----------------------------------|
| **Unusual Whales** ($50/mo) | Options flow, dark pool, congressional trades | Outcome tracking, broader event coverage, AI analysis, pattern matching |
| **Trading Terminal** ($49/mo) | News speed, community, alerts | Multi-source aggregation, historical patterns |
| **finviz** (free) | Screening, heat maps, technicals | Event-driven analysis (finviz is technical, not event-driven) |
| **Discord groups** (various) | Community, real-time discussion | Structured events, outcome verification, no pump-and-dump risk |

**The path to David is replacing Unusual Whales.** If Event Radar adds options flow + proves better outcome tracking, David would switch because:
1. Unusual Whales doesn't track whether its alerts actually make money
2. Event Radar's pattern matching is unique
3. Consolidated view (events + options + outcomes) beats checking 3 tools

### 4. ONE feature that would make it indispensable

**"Catalyst Calendar + Historical Backtest."** A calendar view showing: "March 25: NVDA earnings. Last 8 earnings: stock moved avg 7.2% in first 5 days. Setup worked 75% of the time. Suggested strategy: long straddle." This combines Event Radar's unique strengths (historical patterns, outcome tracking) into David's exact workflow.

### 5. Would he pay $29/month?

**Yes — this is his exact price point.** He's already paying $50 for Unusual Whales and $49 for Trading Terminal. $29 for a tool that combines catalysts + outcome tracking + pattern matching is a no-brainer IF:
- Options flow data is live
- Catalyst calendar exists
- Pattern matching delivers actionable trade setups
- The scorecard proves Event Radar alerts generate positive expected value

**No, because today:**
- No options flow (his #1 need)
- No catalyst calendar
- Pattern matching ("similar events") is promising but needs more data depth
- Only 2 of 23 scanners producing events means incomplete coverage

**Satisfaction Score: 6/10** — Closest to product-market fit of all personas. The architecture is built for David; execution needs to catch up.

---

## Persona 5: Maria — Financial Advisor (RIA)

**Profile:** Manages $20M across 50 clients
**Currently pays for:** Morningstar ($600/yr), Bloomberg ($24K/yr), Orion portfolio management, Redtail CRM
**Monthly spend on tools:** $2,500+

### 1. What does she currently get from Event Radar that she can't easily get elsewhere?

**Honestly, almost nothing relevant to her workflow today.** But the potential is significant:
- **Client-relevant event alerting** — "Your client holds XLE and there's a CRITICAL geopolitical event affecting energy stocks" is exactly what Maria needs before her 9 AM client call. But Event Radar doesn't connect to client portfolios
- **AI-generated bull/bear thesis** — When it works, the bull/bear cases are perfect talking points for client calls. Maria doesn't have time to write her own analysis for 50 clients
- **Severity-graded news** — Bloomberg firehose is too much; Event Radar's filtering helps, but she needs client-specific filtering

### 2. What does she NEED that Event Radar doesn't provide?

| Need | Priority | Current Gap |
|------|----------|-------------|
| **Client portfolio overlay** ("Which of my clients hold SMCI?") | CRITICAL | Not available — needs CRM/portfolio integration |
| **Compliance-safe summaries** (no forward-looking statements, disclaimers) | CRITICAL | AI-generated content has no compliance guardrails |
| **Client-facing email/PDF reports** | CRITICAL | Daily briefing exists but not client-customizable |
| **Sector rotation signals** | HIGH | Market regime exists but shows all zeros |
| **"Talking points" format** (3 bullets for client calls) | HIGH | Bull/bear thesis is close but not formatted for client communication |
| **Multi-portfolio watchlist** ("Client A: tech heavy, Client B: energy exposure") | HIGH | Watchlist exists but single-user, no multi-portfolio view |
| **Regulatory compliance alerts** (new SEC rules affecting client holdings) | HIGH | Federal Register scanner exists but not producing events |
| **Audit trail for recommendations** | MEDIUM | Pipeline audit exists but for internal use |
| **White-label / custom branding** | LOW | Not available |
| **Orion/Redtail CRM integration** | HIGH | Not available |

### 3. Competing tools and what would make her switch

| Tool | What It Does Better | What Event Radar Could Beat It On |
|------|-------------------|-----------------------------------|
| **Morningstar** ($50/mo) | Fund analysis, risk metrics, client reports | Real-time events (Morningstar is delayed), AI analysis |
| **Bloomberg** ($2K/mo) | Everything | Price, simplicity, mobile |
| **Orion** | Portfolio management, rebalancing | Event-driven alerts tied to holdings |
| **Redtail CRM** | Client management, notes, scheduling | Nothing (different category) |

**Maria won't switch FROM anything.** She'd ADD Event Radar IF it becomes an advisor-specific tool with client portfolio integration and compliance-safe outputs.

### 4. ONE feature that would make it indispensable

**"Morning Client Alert Briefing."** Every morning at 7 AM, Maria gets an email: "3 events affecting your clients today: (1) SMCI -26% — affects Client A, Client B, Client C who hold $45K combined exposure. Talking points: [3 bullets]. (2) XLE geopolitical risk — affects 12 clients with energy exposure..." This doesn't exist anywhere at her price point. Bloomberg costs $24K/yr and still doesn't do this automatically.

### 5. Would she pay $29/month?

**$29/mo is nothing for an RIA.** She'd pay $99/mo or more IF it saves her 30 minutes per day on client communication prep.

**But she wouldn't pay $29/mo today because:**
- No client portfolio integration
- No compliance-safe outputs
- No client-facing reports
- The product isn't built for advisors at all

**What would change her answer:**
- "Advisor Mode" with multi-portfolio watchlists, client mapping, and compliance-safe talking points
- Integration with at least one of: Orion, Redtail, Wealthbox, Riskalyze
- Client-facing PDF/email reports with her firm's branding
- The $29/mo would need to be $99/mo "Advisor" plan (she'd trust it more at a higher price)

**Satisfaction Score: 3/10** — The product isn't built for Maria. But the advisor market is underserved by AI tools, and the bones are here.

---

## Comparative Analysis: Where Event Radar Wins and Loses

### Unique Strengths (No Competitor Has These)

1. **Truth Social → Ticker mapping** — No retail tool auto-parses presidential social media posts into tradeable signals
2. **Outcome tracking with source attribution** — "Trading halts: 79% setup-worked" is genuinely unique
3. **23-scanner architecture** — The breadth of sources (SEC, FDA, DOJ, Congress, Fed, White House, etc.) is unmatched at any price under Bloomberg
4. **AI enrichment pipeline** — Bull/bear thesis + historical pattern matching + severity grading in one flow
5. **Event-to-price outcome chain** — Track from event → classification → delivery → price move → verdict

### Critical Weaknesses

1. **21 of 23 scanners are invisible** — The breaking-news scanner produces 88% of visible events. The SEC, FDA, Congress, options, earnings, and other scanners are either not running or not producing events. This is the #1 product problem
2. **AI enrichment fails on critical events** — "Analysis not available" on a CRITICAL Trump/Iran event is unacceptable
3. **Market regime shows all zeros** — This feature is clearly not connected to live data
4. **Story groups return empty** — Narrative clustering is broken
5. **Trending tickers show data quality issues** — "CIK" (a SEC filing artifact) at #1 with 25 events is embarrassing
6. **No options flow data** — The options scanner exists but produces nothing
7. **0% directional accuracy** — The system cannot predict direction (acknowledged and removed from scorecard, but the underlying problem remains)

---

## Product Recommendations

### Top 5 Features to Build Next (Ranked by "Would Convert Paying Users")

| Rank | Feature | Target Personas | Revenue Impact | Effort |
|------|---------|-----------------|----------------|--------|
| **1** | **Activate all 23 scanners with visible output** — Options flow, SEC filings, earnings beat/miss, FDA, congressional trades, insider activity. The architecture exists; the data pipeline needs to produce results | Sarah, Marcus, David | CRITICAL — this IS the product. Without multi-source data, there's no differentiation | HIGH |
| **2** | **Catalyst Calendar** — Forward-looking calendar of known events (earnings dates, FDA PDUFA dates, lockup expirations, economic data releases) with historical pattern data for each | David, Sarah, Marcus | HIGH — #1 request from swing traders; this alone justifies $29/mo subscription | MEDIUM |
| **3** | **Historical Pattern Backtesting** — "When [event type] happens to [sector/ticker], what happened next? Show me stats with confidence intervals." Upgrade the "similar events" feature from display-only to queryable backtesting | Marcus, David | HIGH — unique feature no competitor offers at this price; builds institutional credibility | HIGH |
| **4** | **Audio Squawk for CRITICAL Alerts** — Real-time audio notification (text-to-speech or tone) for CRITICAL and HIGH severity events, similar to Benzinga Pro's squawk feature | Sarah | MEDIUM-HIGH — table-stakes for day traders; differentiator if paired with unique sources | LOW |
| **5** | **Advisor Mode / Client Portfolio Overlay** — Multi-portfolio watchlists, compliance-safe talking points, morning client briefing emails, CRM integration hooks | Maria | HIGH for advisor segment — $99/mo price point, underserved market, high LTV | HIGH |

### Top 3 Integrations to Add

| Rank | Integration | Rationale |
|------|-------------|-----------|
| **1** | **Broker API (Alpaca, Interactive Brokers, TD Ameritrade)** | Enable "one-click trade from alert" for Sarah and David. Even read-only portfolio sync creates sticky watchlists |
| **2** | **TradingView Widget Embed** | Embed TradingView charts in event detail pages. Sarah and David already use TradingView; this prevents context-switching |
| **3** | **Discord Bot (enhanced)** | Discord delivery exists, but a two-way Discord bot (query events, set alerts, get scorecards from Discord) captures the David/trading-group audience where they already live |

### Top 3 Content Improvements

| Rank | Improvement | Impact |
|------|-------------|--------|
| **1** | **Fix AI enrichment reliability** — Bull/bear thesis must generate on 95%+ of HIGH/CRITICAL events. "Analysis not available" on the week's biggest event destroys trust across all personas | Trust (all personas) |
| **2** | **Add "Why This Matters" plain-English summary** — Every event needs a 1-sentence explanation accessible to Jordan-level users. "Trump threatened Iran → Energy stocks (XLE) rose because Iran controls oil supply routes" | Jordan acquisition, Sarah/David speed |
| **3** | **Fix trending tickers data quality** — Remove SEC filing artifacts (CIK, INC, CORP) from trending. These are CIK numbers and company suffixes being misidentified as tickers | Credibility (all personas) |

### Pricing Strategy Recommendation

```
FREE TIER          $0/mo    → 5 events/day, 1 watchlist, no alerts, delayed feed
TRADER             $29/mo   → Full feed, alerts, watchlist, scorecard, basic API
PRO TRADER         $59/mo   → Options flow, catalyst calendar, pattern backtesting, audio squawk
ADVISOR            $99/mo   → Multi-portfolio, compliance-safe outputs, client briefings, CRM hooks
API / ENTERPRISE   Custom   → Full API access, bulk data, custom integrations
```

**Rationale:**
- **Free tier** captures Jordan and creates a funnel. Students discover Event Radar, graduate, and convert
- **$29 Trader tier** is the core product. Must compete with Unusual Whales ($50) on value while being cheaper
- **$59 Pro tier** targets Sarah and David who are already spending $100-200/mo on tools. Options flow and catalyst calendar justify the premium
- **$99 Advisor tier** is the high-LTV play. Maria's firm will pay $99/mo × 12 months without blinking if it saves advisor time. This market has almost no AI competition
- **Enterprise/API** targets Marcus's fund. Bloomberg Terminal costs $24K/yr; even $500/mo for API access is a rounding error

### Go-to-Market Strategy Recommendation

#### Phase 1: Fix the Engine (Now → 30 days)
- Activate all scanners with visible output
- Fix AI enrichment reliability to 95%+
- Fix data quality (trending tickers, market regime)
- Launch free tier to start building user base

#### Phase 2: Nail the Swing Trader (30-60 days)
- **Target persona: David.** Closest to product-market fit
- Launch catalyst calendar + options flow
- Partner with 3-5 trading Discord communities for distribution
- Content marketing: publish weekly "Event Radar Scorecard" reports showing which setups worked
- Goal: 500 paid subscribers at $29/mo = $14.5K MRR

#### Phase 3: Expand to Day Traders (60-90 days)
- **Target persona: Sarah.** Requires speed + audio squawk
- Launch audio alerts and latency benchmarking ("Event Radar alerted 8 min before Benzinga")
- Benzinga Pro comparison content ("Why we're faster for political events")
- TradingView integration for chart embedding
- Goal: 2,000 paid subscribers = $58K MRR

#### Phase 4: Advisor Play (90-180 days)
- **Target persona: Maria.** Requires dedicated product work
- Launch Advisor Mode as separate $99/mo tier
- Integrate with Orion or Wealthbox
- Compliance-safe output templates
- Market through RIA conferences and financial planning podcasts
- Goal: 200 advisor subscribers at $99/mo = $19.8K MRR

#### Phase 5: Institutional API (180+ days)
- **Target persona: Marcus.** Requires data completeness and trust
- Launch documented API with historical data access
- Statistical pattern matching with confidence intervals
- Publish methodology whitepapers for institutional credibility
- Goal: 20 institutional clients at $500/mo = $10K MRR

### Key Insight

**Event Radar's unique moat is the combination of source breadth + outcome tracking + AI enrichment.** No competitor at any price point offers "we monitor 23 sources, classify events with AI, and then tell you whether the alert actually made money." Bloomberg has the data but not the outcome tracking. Unusual Whales has options flow but not the source breadth. Reddit has the community but not the structure.

The problem today is execution: 21 of 23 scanners are silent, AI enrichment fails on critical events, and several features (story groups, market regime, catalyst calendar) are either broken or missing. The architecture is right. The data pipeline needs to deliver.

**Bottom line across all 5 personas:**

| Persona | Current Score | Would Pay $29/mo? | Score Needed to Convert | Key Blocker |
|---------|--------------|-------------------|------------------------|-------------|
| Sarah (Day Trader) | 5/10 | Maybe | 7/10 | Speed + audio + options flow |
| Marcus (Hedge Fund) | 4/10 | Yes (if API exists) | 7/10 | Data completeness + API |
| Jordan (Student) | 6/10 | No (needs free tier) | N/A | Free tier + education |
| David (Swing Trader) | 6/10 | Yes | 7/10 | Options flow + catalyst calendar |
| Maria (Advisor) | 3/10 | Yes ($99/mo) | 6/10 | Advisor mode + client overlay |
| **Average** | **4.8/10** | | | |

The product is at 4.8/10 for user needs — architecturally sound but data-incomplete. Activating the existing scanner infrastructure is the single highest-leverage action. Everything else is secondary.

---

*CrowdTest conducted 2026-03-23. Product strategy analysis — not QA testing.*
*Competitor data sourced from public pricing pages and feature lists as of March 2026.*
