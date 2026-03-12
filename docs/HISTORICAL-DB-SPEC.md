# Historical Event Database Specification

## Purpose

Build a comprehensive historical event database that enables Event Radar to answer: **"When this type of event happened before, what happened to the stock, and why?"**

This database is the core competitive advantage of the product. It powers:
1. Historical pattern matching for new events
2. AI-generated analysis grounded in real data
3. Prediction accuracy tracking over time
4. User-facing "similar events" comparisons

---

## Design Principles

1. **Data > Model** — The quality of AI analysis depends on the quality of data we feed it. Get the data structure right first.
2. **Quantify everything** — Every claim must be backed by a number. "Restructurings are usually bullish" is useless. "Tech restructurings with >10% headcount reduction averaged +18% T+20 alpha with 72% win rate across 47 cases" is actionable.
3. **Alpha over raw returns** — Always store market-adjusted returns (alpha). A stock dropping 2% when SPY drops 5% is actually outperforming.
4. **Context is king** — The same event type can have opposite outcomes depending on macro environment, valuation, and market sentiment. Store the full context.
5. **Events form chains** — M&A attempts lead to bidding wars, regulatory approvals, or withdrawals. Track the full lifecycle.
6. **Automatically enrichable** — Most fields can be populated via free APIs (yfinance, FRED). Minimize manual work.

---

## Event Taxonomy

### Tier 1: Single-Stock ±10% Events

| Category | Types | Examples |
|----------|-------|---------|
| **M&A** | acquisition_announced, acquisition_completed, acquisition_rejected, bidding_war, hostile_takeover, merger_terminated, divestiture | Netflix acquires Roku, Paramount bidding war |
| **Restructuring** | layoff, cost_restructuring, segment_exit, strategic_pivot, bankruptcy_filing, bankruptcy_exit | META 2022 layoffs, WeWork Chapter 11 |
| **Leadership** | ceo_departure, ceo_appointment, cfo_departure, founder_return, board_shakeup | Disney CEO change, Apple Tim Cook succession |
| **Product** | major_launch, product_failure, product_recall, breakthrough_tech, patent_win, patent_loss | iPhone launch, Boeing 737 MAX grounding |
| **Partnerships** | major_contract, partnership_announced, contract_lost, government_contract | NVDA + cloud providers, MSFT + OpenAI |
| **Earnings** | earnings_beat, earnings_miss, guidance_raise, guidance_cut, pre_announcement, revenue_surprise | NVDA Q4 2024 massive beat |
| **Regulatory** | fda_approval, fda_rejection, antitrust_suit, antitrust_clearance, sec_investigation, fine_settlement | GOOGL antitrust ruling, biotech FDA decisions |
| **Financial** | dividend_cut, dividend_initiate, buyback_announced, secondary_offering, stock_split, debt_downgrade | AAPL buyback, TSLA stock split |

### Tier 2: Sector/Market ±3-5% Events

| Category | Types | Examples |
|----------|-------|---------|
| **Monetary Policy** | rate_hike, rate_cut, rate_hold_hawkish, rate_hold_dovish, qe_start, qt_start, dot_plot_shift | Fed pivot Dec 2023 |
| **Macro Data** | cpi_hot, cpi_cool, nfp_strong, nfp_weak, gdp_beat, gdp_miss, retail_sales, jobless_claims | CPI prints 2022-2024 |
| **Trade Policy** | tariff_imposed, tariff_removed, trade_deal, export_ban, sanctions | China tariffs, chip export controls |
| **Geopolitical** | war_outbreak, ceasefire, election_result, regime_change, oil_shock | Russia-Ukraine, OPEC cuts |
| **Executive Action** | executive_order, regulatory_proposal, industry_crackdown | AI executive order, crypto regulation |

### Tier 3: Smart Money Signals

| Category | Types | Examples |
|----------|-------|---------|
| **Insider** | insider_buy_large, insider_sell_large, cluster_buy, cluster_sell | Zuckerberg selling META shares |
| **Congress** | congress_buy, congress_sell | Pelosi NVDA calls |
| **Institutional** | 13f_new_position, 13f_exit, activist_stake, short_report | Hindenburg short reports |
| **Options** | unusual_calls, unusual_puts, large_block_trade | Pre-earnings unusual activity |

---

## Database Schema

### Table: `historical_events`

The core event record.

```sql
CREATE TABLE historical_events (
  -- Identity
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Event basics
  event_date        DATE NOT NULL,                    -- Date event became public
  event_time        TEXT,                             -- 'pre_market' | 'market_hours' | 'after_hours' | 'overnight'
  ticker            TEXT NOT NULL,                    -- Primary affected ticker
  company_name      TEXT NOT NULL,
  sector            TEXT,                             -- 'Technology' | 'Healthcare' | ...
  industry          TEXT,                             -- More specific: 'Semiconductors'

  -- Classification
  event_category    TEXT NOT NULL,                    -- From taxonomy: 'restructuring', 'earnings', 'mna', ...
  event_type        TEXT NOT NULL,                    -- Specific: 'layoff', 'earnings_beat', 'acquisition_announced'
  severity          TEXT NOT NULL,                    -- 'critical' | 'high' | 'medium' | 'low'

  -- Content
  headline          TEXT NOT NULL,                    -- One-line summary
  description       TEXT NOT NULL,                    -- 2-3 paragraph AI-generated analysis
  key_metrics       JSONB,                           -- Structured: {"headcount_reduction": "12%", "charge_amount": "$2.1B", ...}
  source            TEXT,                             -- 'sec_8k' | 'news' | 'press_release' | 'social' | ...
  source_url        TEXT,                             -- Link to original

  -- Tags for matching
  tags              TEXT[] NOT NULL DEFAULT '{}',     -- Freeform: ['mega_cap', 'first_time', 'repeat_event', 'ceo_driven']

  CONSTRAINT valid_severity CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT valid_event_time CHECK (event_time IN ('pre_market', 'market_hours', 'after_hours', 'overnight'))
);

CREATE INDEX idx_he_ticker ON historical_events(ticker);
CREATE INDEX idx_he_event_type ON historical_events(event_type);
CREATE INDEX idx_he_event_category ON historical_events(event_category);
CREATE INDEX idx_he_event_date ON historical_events(event_date);
CREATE INDEX idx_he_sector ON historical_events(sector);
CREATE INDEX idx_he_tags ON historical_events USING GIN(tags);
```

### Table: `event_market_context`

Macro environment snapshot at time of event. Critical for "why did the market react this way?"

```sql
CREATE TABLE event_market_context (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,

  -- Broad market
  spy_close         DECIMAL(10,2),                   -- S&P 500 close on event date
  spy_change_pct    DECIMAL(6,3),                    -- SPY daily return %
  qqq_change_pct    DECIMAL(6,3),                    -- Nasdaq daily return %
  iwm_change_pct    DECIMAL(6,3),                    -- Russell 2000 daily return %

  -- Volatility & fear
  vix_close         DECIMAL(6,2),                    -- VIX level
  vix_percentile    DECIMAL(5,2),                    -- VIX percentile vs trailing 1Y

  -- Rates & monetary
  treasury_10y      DECIMAL(5,3),                    -- 10Y yield
  treasury_2y       DECIMAL(5,3),                    -- 2Y yield
  yield_curve_2s10s DECIMAL(5,3),                    -- 2s10s spread (inversion indicator)
  fed_funds_rate    DECIMAL(5,3),                    -- Current fed funds rate
  days_to_next_fomc INT,                             -- Trading days until next FOMC
  days_from_last_fomc INT,                           -- Trading days since last FOMC

  -- Inflation context
  latest_cpi_yoy    DECIMAL(5,2),                    -- Most recent CPI YoY %
  latest_core_cpi   DECIMAL(5,2),                    -- Core CPI YoY %

  -- Sector context
  sector_etf_ticker TEXT,                            -- e.g., 'XLK' for tech
  sector_etf_change DECIMAL(6,3),                    -- Sector ETF daily return %
  sector_etf_30d    DECIMAL(6,3),                    -- Sector 30-day return %

  -- Market regime (AI-labeled)
  market_regime     TEXT,                             -- 'bull' | 'bear' | 'correction' | 'recovery' | 'range_bound'
  sentiment_label   TEXT,                             -- 'risk_on' | 'risk_off' | 'mixed' | 'euphoric' | 'panic'

  UNIQUE(event_id)
);
```

### Table: `event_stock_context`

Company-specific state at time of event.

```sql
CREATE TABLE event_stock_context (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,

  -- Price context
  price_at_event    DECIMAL(10,2) NOT NULL,          -- Close price on event date (or pre-market ref)
  market_cap_b      DECIMAL(10,2),                   -- Market cap in billions
  price_30d_change  DECIMAL(6,3),                    -- 30-day return before event
  price_90d_change  DECIMAL(6,3),                    -- 90-day return before event
  price_ytd_change  DECIMAL(6,3),                    -- YTD return before event
  distance_from_52w_high DECIMAL(6,3),               -- % below 52-week high
  distance_from_52w_low  DECIMAL(6,3),               -- % above 52-week low

  -- Valuation
  pe_ratio          DECIMAL(8,2),                    -- Trailing P/E
  forward_pe        DECIMAL(8,2),                    -- Forward P/E
  ps_ratio          DECIMAL(8,2),                    -- Price/Sales
  pb_ratio          DECIMAL(8,2),                    -- Price/Book

  -- Technicals
  rsi_14            DECIMAL(5,2),                    -- 14-day RSI
  above_50ma        BOOLEAN,                         -- Price above 50-day MA?
  above_200ma       BOOLEAN,                         -- Price above 200-day MA?
  pct_from_50ma     DECIMAL(6,3),                    -- % distance from 50MA
  pct_from_200ma    DECIMAL(6,3),                    -- % distance from 200MA

  -- Earnings context
  days_since_last_earnings INT,                      -- Days since last earnings report
  days_to_next_earnings    INT,                      -- Days until next earnings
  last_earnings_surprise   DECIMAL(6,3),             -- Last EPS surprise %
  consecutive_beats        INT,                      -- Streak of earnings beats

  -- Analyst sentiment
  analyst_buy       INT,                             -- Number of buy ratings
  analyst_hold      INT,                             -- Number of hold ratings
  analyst_sell      INT,                             -- Number of sell ratings
  avg_price_target  DECIMAL(10,2),                   -- Consensus price target
  target_upside_pct DECIMAL(6,3),                    -- Price target upside %

  -- Ownership signals
  short_interest_pct DECIMAL(6,3),                   -- Short interest % of float
  insider_net_30d    DECIMAL(15,2),                  -- Net insider buying $ in prior 30 days

  UNIQUE(event_id)
);
```

### Table: `event_price_impact`

Quantitative price reaction measurement. The most important table for pattern matching.

```sql
CREATE TABLE event_price_impact (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,

  -- Raw returns at key intervals (vs event date close)
  return_t0         DECIMAL(6,3),                    -- Event day return (open to close, or gap)
  return_t1         DECIMAL(6,3),                    -- T+1 cumulative
  return_t3         DECIMAL(6,3),                    -- T+3 cumulative
  return_t5         DECIMAL(6,3),                    -- T+5 (1 week)
  return_t10        DECIMAL(6,3),                    -- T+10 (2 weeks)
  return_t20        DECIMAL(6,3),                    -- T+20 (1 month)
  return_t60        DECIMAL(6,3),                    -- T+60 (3 months)

  -- Alpha (market-adjusted) at same intervals
  alpha_t0          DECIMAL(6,3),
  alpha_t1          DECIMAL(6,3),
  alpha_t3          DECIMAL(6,3),
  alpha_t5          DECIMAL(6,3),
  alpha_t10         DECIMAL(6,3),
  alpha_t20         DECIMAL(6,3),
  alpha_t60         DECIMAL(6,3),

  -- Extremes within 60-day window
  max_drawdown      DECIMAL(6,3),                    -- Worst peak-to-trough
  max_drawdown_day  INT,                             -- Day of max drawdown (T+?)
  max_runup         DECIMAL(6,3),                    -- Best trough-to-peak
  max_runup_day     INT,                             -- Day of max runup (T+?)

  -- Gap analysis (important for event timing)
  overnight_gap_pct DECIMAL(6,3),                    -- Gap from prev close to next open
  gap_fill_days     INT,                             -- Days to fill the gap (NULL if never)

  -- Volume
  volume_event_day  BIGINT,                          -- Shares traded on event day
  volume_avg_20d    BIGINT,                          -- 20-day average volume before event
  volume_ratio      DECIMAL(6,2),                    -- event_day / avg_20d

  -- Outcome classification (AI-labeled based on T+20 alpha)
  outcome_label     TEXT,                            -- 'strong_bull' | 'mild_bull' | 'neutral' | 'mild_bear' | 'strong_bear'
  outcome_notes     TEXT,                            -- Brief note on the price action pattern

  UNIQUE(event_id)
);
```

### Table: `event_peer_impact`

How peers/sector reacted. Essential for contagion analysis.

```sql
CREATE TABLE event_peer_impact (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  peer_ticker       TEXT NOT NULL,
  peer_relationship TEXT,                            -- 'direct_competitor' | 'same_sector' | 'supply_chain' | 'customer'

  -- Peer returns
  return_t0         DECIMAL(6,3),
  return_t5         DECIMAL(6,3),
  return_t20        DECIMAL(6,3),
  alpha_t0          DECIMAL(6,3),
  alpha_t5          DECIMAL(6,3),
  alpha_t20         DECIMAL(6,3),

  UNIQUE(event_id, peer_ticker)
);
```

### Table: `event_chains`

Link related events into a narrative arc.

```sql
CREATE TABLE event_chains (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_name        TEXT NOT NULL,                   -- "Paramount Acquisition Saga 2024"
  chain_type        TEXT,                            -- 'mna_lifecycle' | 'regulatory_process' | 'earnings_trend' | 'crisis_recovery'
  description       TEXT,                            -- AI summary of the full chain
  outcome_summary   TEXT,                            -- How it ended
  total_return      DECIMAL(6,3),                    -- Start-to-end return
  total_alpha       DECIMAL(6,3),                    -- Start-to-end alpha
  duration_days     INT,                             -- Total days from first to last event
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_chain_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id          UUID NOT NULL REFERENCES event_chains(id) ON DELETE CASCADE,
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  sequence_order    INT NOT NULL,                    -- 1, 2, 3... order in chain
  role_in_chain     TEXT,                            -- 'trigger' | 'escalation' | 'pivot' | 'resolution'

  UNIQUE(chain_id, event_id)
);
```

### Table: `event_causal_analysis`

The AI-generated "why" — the most valuable content in the database.

```sql
CREATE TABLE event_causal_analysis (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,

  -- Causal narrative
  why_market_reacted   TEXT NOT NULL,                -- 2-3 paragraphs: why did the price move this way?
  what_was_priced_in   TEXT,                         -- What the market already expected
  what_was_surprise    TEXT,                         -- What caught the market off guard
  narrative_shift      TEXT,                         -- How did this change the stock's "story"?

  -- Actionable hindsight
  optimal_entry        TEXT,                         -- "Buy at T+2 after initial panic selling"
  optimal_exit         TEXT,                         -- "Sell at T+15 when momentum faded"
  key_mistake          TEXT,                         -- "Buying the gap up was wrong because..."
  lesson_learned       TEXT NOT NULL,                -- One-liner takeaway

  -- Pattern classification
  pattern_name         TEXT,                         -- 'buy_the_dip' | 'sell_the_news' | 'dead_cat_bounce' | 'gap_and_go' | 'slow_grind'
  counter_intuitive    BOOLEAN DEFAULT FALSE,        -- Was the reaction opposite to naive expectation?
  counter_intuitive_why TEXT,                        -- Why it went against intuition

  -- Forward-looking (for matching new events)
  key_variables        TEXT[],                       -- What factors determined the outcome: ['headcount_pct', 'guidance_maintained', 'buyback_announced']
  similar_events_note  TEXT,                         -- "Compare to MSFT 2023 layoff, META 2022 layoff"

  -- Quality
  confidence           TEXT,                         -- 'high' | 'medium' | 'low'
  analysis_model       TEXT,                         -- 'claude-sonnet-4-6' | 'claude-opus-4-6'
  analysis_date        DATE,                         -- When this analysis was generated

  UNIQUE(event_id)
);
```

### Table: `event_type_patterns`

Aggregated statistics per event type. Pre-computed for fast matching.

```sql
CREATE TABLE event_type_patterns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        TEXT NOT NULL,                   -- 'layoff', 'earnings_beat', etc.
  filter_criteria   JSONB NOT NULL DEFAULT '{}',     -- {"sector": "Technology", "market_cap": ">100B"}
  
  -- Sample info
  sample_size       INT NOT NULL,
  date_range_start  DATE,
  date_range_end    DATE,

  -- Statistical summary
  avg_return_t1     DECIMAL(6,3),
  avg_return_t5     DECIMAL(6,3),
  avg_return_t20    DECIMAL(6,3),
  avg_return_t60    DECIMAL(6,3),
  avg_alpha_t1      DECIMAL(6,3),
  avg_alpha_t5      DECIMAL(6,3),
  avg_alpha_t20     DECIMAL(6,3),
  avg_alpha_t60     DECIMAL(6,3),
  median_alpha_t20  DECIMAL(6,3),
  win_rate_t5       DECIMAL(5,3),                    -- % of cases with positive alpha at T+5
  win_rate_t20      DECIMAL(5,3),                    -- % of cases with positive alpha at T+20
  std_dev_t20       DECIMAL(6,3),                    -- Standard deviation of T+20 alpha

  -- Best/worst cases
  best_case_event_id  UUID REFERENCES historical_events(id),
  worst_case_event_id UUID REFERENCES historical_events(id),

  -- Narrative
  typical_pattern     TEXT,                          -- "Initial gap up, consolidation T+3-7, continuation to T+20"
  key_differentiators TEXT,                          -- "Outcome depends on: guidance maintained, buyback size, market regime"
  common_mistakes     TEXT,                          -- "Most common mistake: chasing the gap"

  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(event_type, filter_criteria)
);
```

---

## Data Population Strategy

### Phase 1: Bootstrap (AI + Free APIs)

**Goal:** Populate 1500-2000 high-quality events for the top 50 tickers.

#### Step 1: Event Discovery via Claude

For each ticker, prompt Claude:
```
List all significant market-moving events for {TICKER} ({COMPANY}) 
from January 2020 to March 2026. Include:
- Earnings surprises (beat/miss with specific EPS numbers)
- M&A activity (acquisitions, divestitures, takeover attempts)
- Restructuring (layoffs, cost cuts, strategic pivots)
- Product launches/failures
- Regulatory events (FDA, antitrust, SEC)
- Leadership changes
- Major partnerships/contract wins
- Financial events (buybacks, splits, dividend changes)
- Any event that moved the stock >3% in a day

For each event, provide:
1. Exact date
2. Event type (from our taxonomy)
3. One-line headline
4. Key metrics (dollar amounts, percentages, headcounts)
5. Source type (SEC filing, press release, news report)

Return as JSON array.
```

**Estimated cost:** 50 tickers × ~2000 tokens × $3/M = ~$0.30

#### Step 2: Price Data via yfinance

For each event date:
```python
# Pull price data: T-30 to T+60
ticker_data = yf.download(ticker, start=event_date - 30d, end=event_date + 60d)
spy_data = yf.download('SPY', start=event_date - 30d, end=event_date + 60d)

# Calculate all return/alpha fields
# Calculate technicals (RSI, MA distances)
# Calculate volume ratios
```

**Cost:** Free (yfinance)

#### Step 3: Macro Context via FRED

For each event date:
```python
# Pull from FRED API (free, requires key)
fred.get_series('VIXCLS', event_date)          # VIX
fred.get_series('DGS10', event_date)           # 10Y Treasury
fred.get_series('DGS2', event_date)            # 2Y Treasury
fred.get_series('FEDFUNDS', event_date)        # Fed funds rate
fred.get_series('CPIAUCSL', event_date)        # CPI
```

**Cost:** Free (FRED API key is free)

#### Step 4: Company Context via yfinance

```python
info = yf.Ticker(ticker).info
# Market cap, P/E, P/S, P/B, analyst ratings, short interest
# Some fields may not have historical values — use current as best estimate for recent events
```

#### Step 5: AI Causal Analysis via Claude

For each event, with all the data assembled:
```
Given this event and the surrounding data:
[event details, price action, macro context, peer performance]

Provide:
1. Why the market reacted this way (2-3 paragraphs)
2. What was already priced in vs. what surprised
3. How this changed the stock's narrative
4. Optimal entry/exit in hindsight
5. Key lesson for future similar events
6. Pattern classification
7. Was this counter-intuitive? Why?
8. What key variables determined the outcome?
```

**Estimated cost:** 2000 events × ~3000 tokens × $3/M = ~$18

#### Total Bootstrap Cost Estimate

| Component | Cost |
|-----------|------|
| Event discovery (Claude) | ~$0.30 |
| Price data (yfinance) | $0 |
| Macro data (FRED) | $0 |
| Causal analysis (Claude) | ~$18 |
| Peer impact (yfinance) | $0 |
| **Total** | **~$20** |

### Phase 2: Continuous Enrichment

Once Event Radar's scanners are running:
1. New event detected → auto-populate market context + stock context (real-time)
2. T+1: populate overnight gap + initial reaction
3. T+5: populate 1-week returns
4. T+20: populate 1-month returns + generate causal analysis
5. T+60: populate 3-month returns + update outcome label + compute final analysis

### Phase 3: Pattern Aggregation

Weekly cron job:
1. Recalculate `event_type_patterns` for all types with sufficient sample size (≥5)
2. Flag any new counter-intuitive patterns
3. Update best/worst case references

---

## Query Examples

### "What happens when mega-cap tech companies do layoffs?"

```sql
SELECT 
  he.ticker, he.company_name, he.event_date, he.headline,
  epi.alpha_t5, epi.alpha_t20, epi.alpha_t60,
  epi.outcome_label, epi.volume_ratio,
  eca.lesson_learned, eca.pattern_name
FROM historical_events he
JOIN event_price_impact epi ON epi.event_id = he.id
JOIN event_causal_analysis eca ON eca.event_id = he.id
JOIN event_stock_context esc ON esc.event_id = he.id
WHERE he.event_type = 'layoff'
  AND he.sector = 'Technology'
  AND esc.market_cap_b > 100
ORDER BY he.event_date DESC;
```

### "When a new event comes in, find the top 10 most similar historical events"

```sql
SELECT he.*, epi.alpha_t20, eca.lesson_learned,
  -- Similarity scoring: same type + same sector + similar market cap + similar macro
  (CASE WHEN he.event_type = $event_type THEN 3 ELSE 0 END) +
  (CASE WHEN he.sector = $sector THEN 2 ELSE 0 END) +
  (CASE WHEN esc.market_cap_b BETWEEN $mcap * 0.3 AND $mcap * 3 THEN 1 ELSE 0 END) +
  (CASE WHEN emc.market_regime = $current_regime THEN 1 ELSE 0 END) +
  (CASE WHEN ABS(emc.vix_close - $current_vix) < 5 THEN 1 ELSE 0 END)
  AS similarity_score
FROM historical_events he
JOIN event_price_impact epi ON epi.event_id = he.id
JOIN event_causal_analysis eca ON eca.event_id = he.id
JOIN event_stock_context esc ON esc.event_id = he.id
JOIN event_market_context emc ON emc.event_id = he.id
WHERE he.event_category = $event_category
ORDER BY similarity_score DESC, he.event_date DESC
LIMIT 10;
```

### "Generate aggregate stats for this event type"

```sql
SELECT 
  COUNT(*) as sample_size,
  ROUND(AVG(epi.alpha_t5), 3) as avg_alpha_t5,
  ROUND(AVG(epi.alpha_t20), 3) as avg_alpha_t20,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY epi.alpha_t20), 3) as median_alpha_t20,
  ROUND(COUNT(*) FILTER (WHERE epi.alpha_t20 > 0)::DECIMAL / COUNT(*), 3) as win_rate_t20,
  ROUND(STDDEV(epi.alpha_t20), 3) as std_dev_t20,
  MIN(epi.alpha_t20) as worst_case,
  MAX(epi.alpha_t20) as best_case
FROM historical_events he
JOIN event_price_impact epi ON epi.event_id = he.id
WHERE he.event_type = $event_type
  AND he.sector = $sector;
```

---

## Target Tickers for Bootstrap

### Phase 1: Watchlist (15 tickers)
NVDA, TSLA, AAPL, MSFT, AMZN, GOOG, META, AMD, PLTR, SMCI, ARM, AVGO, TSM, MSTR, COIN

### Phase 2: Expand to S&P 500 top 50
Add: JPM, V, MA, UNH, JNJ, PG, HD, BAC, WMT, KO, PEP, MRK, PFE, ABBV, LLY, CRM, NFLX, DIS, BA, CAT, GS, GE, INTC, QCOM, MU, AMAT, LRCX, PANW, SNOW, NET, SQ, SHOP, UBER, ABNB, RIVN

### Phase 3: Full coverage
All S&P 500 + top 100 mid-caps with high event frequency

---

## Estimated Database Size

| Phase | Events | Price Impact Records | Size |
|-------|--------|---------------------|------|
| Bootstrap (50 tickers) | ~2,000 | ~2,000 | ~50 MB |
| 1 year running | ~5,000+ | ~5,000+ | ~150 MB |
| 3 years running | ~15,000+ | ~15,000+ | ~500 MB |

Very small by database standards. No scaling concerns.

---

## Open Questions

1. **Historical options IV data** — Would be valuable for `event_stock_context` but expensive. Skip for now?
2. **Intraday price data** — Should we store 5-min bars for event day? Useful for gap analysis but much more data.
3. **Sentiment data** — Social media sentiment at time of event. Hard to get historically. Build forward only?
4. **International events** — Geopolitical events often happen outside US market hours. How to handle timing?
5. **Earnings transcript analysis** — Store key quotes from earnings calls? Very valuable but adds complexity.
6. **Multiple tickers per event** — Some events affect multiple stocks (tariff announcement). Primary ticker + `event_peer_impact` sufficient?
