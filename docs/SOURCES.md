# Data Sources

Event Radar monitors 30+ data sources organized into 6 tiers by signal quality and reliability.

## Source Tiers

```
Tier 1: Official / Regulatory     — Highest signal quality, lowest noise
Tier 2: Political Figures          — Massive market impact, unpredictable
Tier 3: Corporate Announcements    — Traditional event-driven core
Tier 4: Social Media & Sentiment   — Early signals, high noise
Tier 5: Macro & Geopolitical       — Broad market moves
Tier 6: Smart Money Signals        — Institutional footprint
```

---

## Tier 1: Official / Regulatory

The most reliable sources. Legally mandated disclosures with structured formats.

| Source | What We Monitor | Interface | Polling | Priority |
|--------|----------------|-----------|---------|----------|
| **SEC EDGAR** | 8-K (material events), Form 4 (insider trades), 13F (institutional holdings), S-1 (IPOs), SC 13D (activist stakes) | REST API + RSS (free, <1s delay) | 30s | 🔴 Critical |
| **Federal Reserve** | FOMC statements, meeting minutes, speeches, rate decisions | RSS + website | 60s | 🔴 Critical |
| **White House** | Executive orders, presidential memoranda, proclamations | Federal Register API (free) | 5min | 🟡 High |
| **Congress (STOCK Act)** | Politician stock trades (House + Senate disclosures) | House.gov/Senate.gov scrape, QuiverQuant | 1hr | 🟡 High |
| **FDA** | PDUFA drug approvals/rejections, AdComm votes, warning letters | FDA.gov RSS + calendar | 5min | 🟡 High |
| **WARN Act** | Mass layoff notices (50+ employees, 60-day advance) | State labor department sites (scrape) | 6hr | 🟢 Medium |
| **DOJ / FTC** | Antitrust lawsuits, merger approvals/blocks, consent decrees | RSS + press releases | 15min | 🟡 High |
| **FDIC** | Bank closures, enforcement actions (SVB-style events) | FDIC RSS + API | 1hr | 🟡 High |
| **USPTO** | Major patent grants, patent litigation filings | Patent API | 1hr | 🟢 Medium |
| **PACER** | Bankruptcy filings (Chapter 11, major corporate bankruptcies) | PACER API | 1hr | 🟡 High |
| **Crypto Reg** | SEC crypto enforcement, executive orders on digital assets | Federal Register API + RSS | 15min | 🟡 High |
| **CFTC** | Commitments of Traders (COT) reports | Weekly data release | Weekly | 🟢 Medium |

### Key 8-K Items (SEC)

Not all 8-Ks are equal. We prioritize by historical market impact:

| Item | Description | Avg. Impact | Direction |
|------|-------------|-------------|-----------|
| 1.01 | Entry into Material Agreement (M&A, partnerships) | High | Varies |
| 1.02 | Termination of Material Agreement | Medium | Usually bearish |
| 2.01 | Completion of Acquisition/Disposition | High | Varies |
| 2.05 | Costs for Exit/Disposal (restructuring, layoffs) | High | Usually bullish |
| 2.06 | Material Impairments | Medium | Bearish |
| 5.02 | Departure/Appointment of Officers | Medium-High | Varies |
| 7.01 | Regulation FD Disclosure | Medium | Varies |
| 8.01 | Other Events (catch-all, often guidance updates) | Medium | Varies |

---

## Tier 2: Political Figures

Individual posts/statements that routinely move markets 2-5% in minutes.

| Source | What We Monitor | Interface | Polling | Priority |
|--------|----------------|-----------|---------|----------|
| **Trump — Truth Social** | Tariff threats, trade deals, company call-outs, policy | Web scrape / 3rd-party API | 15s ⚡ | 🔴 Critical |
| **Elon Musk — X** | DOGE policy, Tesla/SpaceX news, crypto mentions | X API or scrape | 30s | 🔴 Critical |
| **Key Politicians — X** | Pelosi, Tuberville, etc. (track trades + statements) | X API | 60s | 🟡 High |
| **Fed Officials** | Doves vs hawks, forward guidance hints | X + speech transcripts | 60s | 🟡 High |
| **Foreign Leaders** | Xi Jinping, EU officials (trade/tariff responses) | News wire monitoring | 5min | 🟡 High |

### Trump Post Classification

Trump posts are the single highest-impact social media source for US markets. Key categories:

- **Tariff threats** → Bearish tech/consumer, bullish domestic manufacturing
- **Trade deal signals** → Bullish broad market
- **Company call-outs** (positive) → Individual stock pump
- **Company attacks** → Individual stock dump
- **Military/foreign policy** → Defense stocks, oil, gold
- **Fed criticism** → Rate expectations shift

---

## Tier 3: Corporate Announcements

Traditional newswire sources for official company announcements.

| Source | What We Monitor | Interface | Polling | Priority |
|--------|----------------|-----------|---------|----------|
| **PR Newswire** | Earnings, M&A, partnerships, product launches | RSS | 60s | 🟡 High |
| **BusinessWire** | Same as above | RSS | 60s | 🟡 High |
| **GlobeNewswire** | Same (more mid/small-cap) | RSS | 60s | 🟡 High |
| **Analyst Ratings** | Upgrades, downgrades, PT changes, initiations | Scrape (TipRanks, MarketBeat) | 15min | 🟡 High |
| **Earnings Calendar** | Earnings dates, whisper numbers, pre-announcements | Earnings Whispers, Yahoo Finance | 1hr | 🟢 Medium |
| **Earnings Transcripts** | Real-time call transcription, Q&A surprises | Rev.com, AssemblyAI | Real-time | 🟡 High |

---

## Tier 4: Social Media & Sentiment

Early signals from the crowd. High noise, but volume spikes are meaningful.

| Source | What We Monitor | Interface | Polling | Priority |
|--------|----------------|-----------|---------|----------|
| **X/Twitter — $TICKER** | Mention volume spikes, sentiment shifts, viral threads | X API v2 / scrape | 60s | 🟡 High |
| **Reddit — WSB + investing** | Hot posts, unusual ticker mentions, DD posts | Reddit API | 5min | 🟢 Medium |
| **StockTwits** | Bull/bear sentiment ratio changes | API | 5min | 🟢 Medium |
| **YouTube Finance** | Major creator videos (Meet Kevin, etc.) on specific stocks | RSS + scrape | 30min | ⚪ Low |

### Social Signal Detection

We don't just count mentions. We detect **anomalies**:
- Ticker mentioned 10x more than its 7-day average → flag
- Sentiment flips from 60% bullish to 60% bearish in 1 hour → flag
- Multiple finance influencers post about same ticker within 30 min → flag

---

## Tier 5: Macro & Geopolitical

Broad market movers that affect sectors or the entire market.

| Source | What We Monitor | Interface | Polling | Priority |
|--------|----------------|-----------|---------|----------|
| **BLS (Bureau of Labor Statistics)** | CPI, PPI, Non-Farm Payrolls, unemployment | Calendar-based + scrape | Calendar | 🔴 Critical |
| **CME FedWatch** | Fed funds futures implied rate probabilities | CME scrape | 15min | 🟡 High |
| **OPEC** | Production quotas, emergency meetings, output decisions | RSS + news wires | 1hr | 🟡 High |
| **Reuters / AP** | Breaking news: wars, sanctions, natural disasters | RSS | 60s | 🟡 High |
| **US Treasury** | Auction results, yield curve data | Treasury.gov API | 1hr | 🟢 Medium |
| **Economic Calendar** | GDP, PMI, trade balance, housing starts | Investing.com/ForexFactory | Daily | 🟢 Medium |

---

## Tier 6: Smart Money Signals

Detect institutional activity before it becomes public knowledge.

| Source | What We Monitor | Interface | Polling | Priority |
|--------|----------------|-----------|---------|----------|
| **Unusual Options Activity** | Large block trades, unusual volume, big premium bets | CBOE / Unusual Whales (scrape) | 5min | 🟡 High |
| **Dark Pool Prints** | Large block trades on ATS/dark pools | FINRA ADF data | 15min | 🟡 High |
| **13F Filings** | Quarterly institutional holdings (Buffett, Soros, ARK, etc.) | SEC EDGAR (in Tier 1) | Quarterly | 🟢 Medium |
| **Short Interest** | Bi-monthly short interest changes, squeeze candidates | FINRA/ORTEX | 2x/month | 🟢 Medium |
| **ETF Flows** | Large inflows/outflows from sector ETFs | ETF.com / scrape | Daily | 🟢 Medium |

---

## Source Priority Matrix

```
                    High Impact
                        │
        ┌───────────────┼───────────────┐
        │  Trump Posts   │  SEC 8-K      │
        │  Fed Decisions │  Insider Buys │
        │               │               │
  Fast ─┤───────────────┼───────────────├─ Slow
        │               │               │
        │  X Mentions   │  13F Holdings │
        │  Options Flow │  WARN Act     │
        │               │               │
        └───────────────┼───────────────┘
                        │
                    Low Impact
```

**Top-left quadrant** (fast + high impact) = highest priority for real-time alerting.
**Bottom-right quadrant** (slow + low impact) = batch processing, background enrichment.

---

## Scraping Risk Assessment

Some sources (Truth Social, WARN Act, analyst ratings) require web scraping. This carries risks:

| Source | Risk | Mitigation |
|--------|------|------------|
| **Truth Social** | No API, ToS may prohibit scraping | Primary: 3rd-party aggregator. Fallback: Crawlee-based scraping with rate limiting |
| **WARN Act** | State sites vary, no standard format | Normalize across ~50 state sites, cache locally |
| **Analyst ratings** | TipRanks/MarketBeat may block | Proxy rotation, user-agent rotation |

All scraped sources are flagged with a **reliability indicator** in the UI: 🟢 API / 🟡 Scraped / 🔴 Unstable.

---

*See [Architecture](ARCHITECTURE.md) for how these sources feed into the processing pipeline.*
