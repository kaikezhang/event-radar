# Historical Event Database — Specification v3

> v3 incorporates Codex review (166K token deep analysis), Wanwan's implementation review, and owner's direction on minimum-cost maximum-utility strategy. Key shift: pragmatic product database, not institutional research infrastructure.

## Philosophy

**We are building a product, not a quant research platform.**

Our users are everyday investors who want to understand "what happened last time something like this occurred." They don't need CUSIP mappings, intraday bars, or ALFRED vintage timestamps. They need reliable historical patterns explained in plain language.

**The 80/20 rule applies:** 80% of the value comes from getting event classification, price reaction, and causal analysis right for the most common scenarios. The remaining 20% (dual-class shares, SPAC warrants, halt mechanics) can be added later when the core proves its worth.

**Codex's review was excellent but aimed at a different product.** We accept the following tradeoffs:

| Codex wants | We do instead | Why |
|-------------|--------------|-----|
| Issuer/security/listing separation | Company + ticker_at_time | 99% of our events are single-class US equities |
| Intraday bars for event-day pricing | Daily OHLCV + session tag | We analyze T+1 to T+60 patterns, not millisecond reactions |
| ALFRED vintage macro data | FRED latest-available-at-date | Macro context is directional, not basis for trading |
| Full corporate actions table | adjustment_factor on stock context | We use adjusted prices from yfinance; factor stored for reference |
| Halt/resume/delist state machine | terminal_status enum on returns | Covers 95% of cases with one field |
| Raw document blob storage | source_url + source_native_id | We link to sources, not archive them |
| min_sample_required = 20+ | min 5 shown, uncertainty displayed | Small samples are still useful with proper disclaimers |

**What we absolutely DO accept from the review:**
- ✅ No selection bias: store non-moving events too
- ✅ Timestamp verification with precision tracking
- ✅ Benchmark-aware alpha (sector ETFs, not just SPY)
- ✅ Terminal status for delisted/acquired securities
- ✅ Coverage ledger to distinguish "no event" from "not scanned"
- ✅ Split/reverse-split adjustment handling
- ✅ Polygon free tier won't work for 6-year bootstrap
- ✅ AI analysis clearly versioned and labeled as opinion
- ✅ Event volume estimate was too low

---

## Tiered Collection Strategy

**Core insight from owner: not all events are worth the same effort. Optimize ROI.**

### Time Decay

| Period | Strategy | Threshold | Depth |
|--------|----------|-----------|-------|
| 2024-2026 (recent) | All classifiable events | Any event we can detect | Full context + AI analysis |
| 2022-2023 (mid) | Significant events only | severity ≥ high OR ±3% move | Full context + AI analysis |
| 2020-2021 (historical) | Landmark events only | severity = critical OR ±5% move OR first-of-kind | Price data + brief analysis |
| Pre-2020 | Iconic cases only | Manually curated ~50 events | Price data + detailed case study |

**Why:** Recent events are most useful (similar macro environment, same market participants). Older events mainly serve as "has this pattern ever happened before?" reference points.

### Ticker Priority

| Tier | Tickers | Events/ticker | Strategy |
|------|---------|---------------|----------|
| **Tier 1: Watchlist** | NVDA, TSLA, AAPL, MSFT, AMZN, GOOG, META, AMD, PLTR, SMCI, ARM, AVGO, TSM, MSTR, COIN (15) | ~50-80 | All events 2022+, landmarks 2020-21 |
| **Tier 2: Major names** | Top 35 S&P by event frequency (NFLX, JPM, BA, LLY, PFE, etc.) | ~20-40 | High-severity events 2022+ only |
| **Tier 3: Macro** | SPY, QQQ, sector ETFs | N/A | All macro events (CPI, Fed, tariffs) — not ticker-specific |

**Estimated total: ~2,500-4,000 events** (not 2,000 as v2 claimed, but also not 10,000+)

### Event Type Priority (by data availability & ROI)

| Priority | Type | Why prioritize | Data source | Effort |
|----------|------|---------------|-------------|--------|
| 🥇 1 | Earnings (beat/miss/guidance) | Most structured, highest frequency, strongest patterns | yfinance + SEC | Low |
| 🥇 2 | SEC 8-K filings | Free API, precise timestamps, legally required | SEC EDGAR | Low |
| 🥈 3 | M&A / restructuring | High impact, great narrative value | SEC + news | Medium |
| 🥈 4 | FDA decisions | Binary outcomes, clear cause-effect | FDA.gov + SEC | Medium |
| 🥉 5 | Macro data releases | Affects everything, well-structured | FRED | Low |
| 🥉 6 | Fed decisions | High impact, well-documented | FRED + Fed website | Low |
| 4 | Analyst upgrades/downgrades | Common, moderate impact | News API needed | Medium |
| 5 | Insider/congress trades | Interesting signal but lower per-event impact | SEC Form 4 / Capitol Trades | Medium |
| 6 | Breaking news / geopolitical | Important but hardest to get historically | News API needed ($) | High |

**Phase 1 bootstrap: priorities 🥇 and 🥈 only.** These cover ~70% of event-driven trading value using free data sources.

---

## Architecture

```
┌───────────────────────────────────────────────────┐
│  Layer 1: Companies & Identifiers                  │
│  Company records, ticker history, adjustments      │
├───────────────────────────────────────────────────┤
│  Layer 2: Events + Sources                         │
│  Core events, provenance, typed metrics            │
├───────────────────────────────────────────────────┤
│  Layer 3: Context Snapshots (Point-in-Time)       │
│  Market environment, stock state at event time     │
├───────────────────────────────────────────────────┤
│  Layer 4: Price Impact & Returns                   │
│  Quantified reactions, alpha, terminal status      │
├───────────────────────────────────────────────────┤
│  Layer 5: AI Analysis (Versioned, Derived)        │
│  Causal narrative, patterns, lessons               │
├───────────────────────────────────────────────────┤
│  Layer 6: Patterns & Coverage                      │
│  Aggregated stats, backfill tracking               │
└───────────────────────────────────────────────────┘
```

---

## Event Taxonomy

Same as v2 (proven stable after two reviews). Each event gets ONE primary type. Tags handle edge cases and cross-cutting concerns.

### Corporate Actions
| Type | Subtypes |
|------|----------|
| `mna_acquisition` | announced, completed, terminated, hostile, competing_bid |
| `mna_divestiture` | asset_sale, spinoff, carve_out |
| `mna_merger` | merger_of_equals, reverse_merger, going_private, tender_offer |
| `restructuring` | layoff, cost_reduction, segment_exit, strategic_pivot, bankruptcy_filing, bankruptcy_exit |
| `leadership` | ceo_change, cfo_change, founder_return, board_shakeup, key_hire, key_departure |
| `product` | major_launch, product_recall, breakthrough, platform_change |
| `partnership` | strategic_alliance, major_contract, contract_lost, joint_venture |
| `financial_action` | buyback, dividend_change, stock_split, reverse_split, secondary_offering, debt_issuance, credit_rating_change |
| `legal` | lawsuit_filed, lawsuit_settled, ip_litigation, class_action, sec_investigation |
| `operational` | cyber_incident, outage, supply_disruption, safety_incident |
| `index_change` | index_addition, index_deletion |
| `accounting` | restatement, auditor_change, material_weakness |

### Earnings & Guidance
| Type | Subtypes |
|------|----------|
| `earnings` | beat, miss, in_line |
| `guidance` | raised, lowered, initiated, withdrawn, pre_announcement |
| `analyst_action` | upgrade, downgrade, initiation, price_target_change |

### Regulatory & Government
| Type | Subtypes |
|------|----------|
| `fda` | approval, rejection, adcom_vote, warning_letter, clinical_hold, breakthrough_designation |
| `antitrust` | investigation, lawsuit, clearance, blocked, consent_decree |
| `government` | executive_order, regulation_proposed, regulation_finalized, sanction, export_control |
| `congress_trade` | buy, sell, exercise |

### Macro & Geopolitical
| Type | Subtypes |
|------|----------|
| `monetary_policy` | rate_decision, dot_plot, qe_qt_change, emergency_action, fed_speech |
| `economic_data` | inflation, employment, gdp, consumer, housing, manufacturing, trade_balance |
| `geopolitical` | conflict, ceasefire, election, trade_war, oil_shock, pandemic |
| `tariff` | imposed, removed, threatened, exemption |

### Smart Money
| Type | Subtypes |
|------|----------|
| `insider_trade` | cluster_buy, cluster_sell, large_buy, large_sell, 10b5_1_termination |
| `institutional` | 13f_new_position, 13f_exit, activist_stake, activist_settlement, short_report |
| `options_flow` | unusual_calls, unusual_puts, large_block, sweep |

---

## Database Schema

### Layer 1: Companies & Identifiers

```sql
CREATE TABLE companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  sector          TEXT,                              -- GICS sector: 'Technology', 'Healthcare'
  industry        TEXT,                              -- Sub-industry: 'Semiconductors', 'Biotech'
  country         TEXT DEFAULT 'US',
  cik             TEXT,                              -- SEC Central Index Key
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ticker_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  ticker          TEXT NOT NULL,                     -- 'FB', 'META', 'GOOG'
  exchange        TEXT,                              -- 'NASDAQ', 'NYSE'
  effective_from  DATE NOT NULL,
  effective_to    DATE,                              -- NULL = current
  change_reason   TEXT,                              -- 'rebrand', 'merger', 'spin_off', NULL for original

  CONSTRAINT no_overlap EXCLUDE USING gist (
    company_id WITH =,
    daterange(effective_from, COALESCE(effective_to, '9999-12-31'), '[]') WITH &&
  )
);

CREATE INDEX idx_th_ticker ON ticker_history(ticker);
CREATE INDEX idx_th_company ON ticker_history(company_id);

-- Split/reverse-split history for price adjustment
CREATE TABLE stock_splits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  split_date      DATE NOT NULL,
  ratio_from      INT NOT NULL,                     -- e.g., 1 (1:3 split means 1 old share)
  ratio_to        INT NOT NULL,                     -- e.g., 3 (becomes 3 new shares)
  split_type      TEXT NOT NULL,                    -- 'forward', 'reverse'
  -- Cumulative adjustment factor: multiply all pre-split prices by (ratio_from/ratio_to) 
  -- to make them comparable to post-split prices
  adjustment_factor DECIMAL(10,6) NOT NULL,          -- e.g., 0.333333 for 3:1 split

  UNIQUE(company_id, split_date)
);
```

**Split handling explained:**

yfinance returns **adjusted prices** by default — all historical prices are retroactively adjusted for splits. This is correct for return calculations (the ratios are preserved).

But we also need to know splits happened because:
1. A split itself is a market event (often bullish signal for forward splits)
2. Users expect to see "TSLA was at $900" not "$300" when discussing pre-split events
3. Reverse splits are bearish signals (company trying to avoid delisting)

**Our approach:**
- All prices in `event_stock_context` and `event_returns` use **adjusted prices** from yfinance
- `stock_splits` table records when splits happened and the factor
- `event_stock_context.raw_price_at_event` stores the unadjusted price for display
- AI analysis references the raw price in narrative text

### Layer 2: Events + Sources

```sql
CREATE TABLE historical_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Timing (THE FOUNDATION)
  event_ts          TIMESTAMPTZ NOT NULL,            -- First public disclosure (UTC)
  market_session    TEXT,                            -- 'pre_market' | 'regular' | 'after_hours' | 'overnight' | 'weekend'

  -- Timestamp quality
  event_ts_precision TEXT NOT NULL DEFAULT 'day_only',
  event_ts_source   TEXT,                            -- 'sec_edgar' | 'news_api' | 'earnings_calendar' | 'fred_release' | 'llm_verified' | 'llm_estimated'
  event_ts_verified BOOLEAN DEFAULT FALSE,

  -- Classification
  event_category    TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  event_subtype     TEXT,
  severity          TEXT NOT NULL DEFAULT 'medium',

  -- Content
  headline          TEXT NOT NULL,                   -- Factual one-liner
  description       TEXT,                            -- Factual description (not AI opinion)

  -- Primary company (denormalized for fast queries — 99% of events have one primary)
  company_id        UUID REFERENCES companies(id),
  ticker_at_time    TEXT,                            -- Ticker as of event date

  -- Tags
  tags              TEXT[] NOT NULL DEFAULT '{}',

  -- Collection metadata
  collection_tier   TEXT DEFAULT 'full',             -- 'full' | 'significant' | 'landmark' | 'iconic'
  bootstrap_batch   TEXT,                            -- Which bootstrap run created this

  CONSTRAINT valid_severity CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT valid_session CHECK (market_session IN ('pre_market', 'regular', 'after_hours', 'overnight', 'weekend')),
  CONSTRAINT valid_precision CHECK (event_ts_precision IN ('second', 'minute', 'hour', 'day_session', 'day_only'))
);

CREATE INDEX idx_he_company ON historical_events(company_id);
CREATE INDEX idx_he_ticker ON historical_events(ticker_at_time);
CREATE INDEX idx_he_type ON historical_events(event_category, event_type);
CREATE INDEX idx_he_ts ON historical_events(event_ts);
CREATE INDEX idx_he_severity ON historical_events(severity);
CREATE INDEX idx_he_tags ON historical_events USING GIN(tags);

-- Additional entities for multi-company events (M&A, contagion)
-- Only populated when an event involves multiple companies
CREATE TABLE event_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES companies(id),     -- NULL for non-company entities (regulators, people)
  entity_name     TEXT NOT NULL,                     -- 'Skydance Media', 'Nancy Pelosi', 'FDA', etc.
  entity_type     TEXT NOT NULL,                     -- 'company', 'person', 'regulator', 'fund'
  role            TEXT NOT NULL,                     -- 'acquirer', 'target', 'competitor', 'regulator', 'insider', 'politician'
  ticker_at_time  TEXT,                              -- If applicable

  UNIQUE(event_id, entity_name, role)
);

CREATE INDEX idx_ep_event ON event_participants(event_id);
CREATE INDEX idx_ep_company ON event_participants(company_id);

-- Data sources (one event can have multiple sources)
CREATE TABLE event_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  source_type     TEXT NOT NULL,                    -- 'sec_filing', 'press_release', 'news_article', 'earnings_calendar', 'fred_release'
  source_name     TEXT,                             -- 'SEC EDGAR', 'Reuters', 'yfinance'
  source_url      TEXT,
  source_native_id TEXT,                            -- SEC accession number, Polygon news ID, FRED release ID
  published_at    TIMESTAMPTZ,
  ingested_at     TIMESTAMPTZ DEFAULT now(),
  extraction_method TEXT,                            -- 'api_structured', 'llm_extract', 'manual'
  confidence      DECIMAL(3,2)                      -- 0.0-1.0
);

CREATE INDEX idx_es_event ON event_sources(event_id);
CREATE UNIQUE INDEX idx_es_dedup ON event_sources(event_id, source_native_id) WHERE source_native_id IS NOT NULL;
```

### Layer 2b: Typed Event Metrics

```sql
CREATE TABLE metrics_earnings (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
  fiscal_quarter    TEXT,                            -- 'Q4 2024'
  eps_actual        DECIMAL(8,3),
  eps_estimate      DECIMAL(8,3),
  eps_surprise_pct  DECIMAL(6,2),
  revenue_actual_m  DECIMAL(12,2),
  revenue_estimate_m DECIMAL(12,2),
  revenue_surprise_pct DECIMAL(6,2),
  guidance_direction TEXT,                           -- 'raised', 'lowered', 'maintained', 'withdrawn'
  guidance_detail   TEXT,
  consecutive_beats INT,                             -- Computed after all earnings loaded
  yoy_revenue_growth DECIMAL(6,2),
  yoy_eps_growth    DECIMAL(6,2)
);

CREATE TABLE metrics_restructuring (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
  headcount_reduction_pct  DECIMAL(5,2),
  headcount_reduction_abs  INT,
  restructuring_charge_m   DECIMAL(10,2),
  segments_affected        TEXT[],
  guidance_maintained      BOOLEAN,
  buyback_announced        BOOLEAN
);

CREATE TABLE metrics_mna (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
  deal_value_m      DECIMAL(12,2),
  premium_pct       DECIMAL(6,2),
  payment_type      TEXT,                            -- 'cash', 'stock', 'mixed'
  expected_close    DATE,
  competing_bids    INT DEFAULT 0,
  regulatory_risk   TEXT                             -- 'low', 'medium', 'high'
);

CREATE TABLE metrics_fda (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
  drug_name         TEXT,
  indication        TEXT,
  action_type       TEXT,                            -- 'NDA', 'BLA', 'sNDA', '510k'
  pdufa_date        DATE,
  adcom_vote_for    INT,
  adcom_vote_against INT,
  market_size_est_m DECIMAL(10,2),
  competition_level TEXT                             -- 'first_in_class', 'best_in_class', 'me_too'
);

CREATE TABLE metrics_macro (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
  indicator         TEXT NOT NULL,                   -- 'CPI_YOY', 'NFP', 'FED_RATE', 'GDP_QOQ'
  actual_value      DECIMAL(10,4),
  forecast_value    DECIMAL(10,4),                   -- From consensus (may be NULL for bootstrap)
  previous_value    DECIMAL(10,4),
  surprise_direction TEXT,                           -- 'hot', 'cool', 'in_line'
  release_ts        TIMESTAMPTZ,                    -- Exact release time (FRED release calendar)
  fred_series_id    TEXT                             -- e.g., 'CPIAUCSL'
);

-- Catch-all for event types without dedicated tables
CREATE TABLE metrics_other (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
  metrics           JSONB NOT NULL DEFAULT '{}'
);
```

### Layer 3: Context Snapshots

```sql
CREATE TABLE event_market_context (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,

  -- Broad market (yfinance historical — PIT safe)
  spy_close         DECIMAL(10,2),
  spy_change_pct    DECIMAL(6,3),
  qqq_change_pct    DECIMAL(6,3),
  iwm_change_pct    DECIMAL(6,3),

  -- Volatility
  vix_close         DECIMAL(6,2),
  vix_percentile_1y DECIMAL(5,2),                   -- Computed from pre-downloaded VIX history

  -- Rates (FRED — PIT safe for daily observations)
  treasury_10y      DECIMAL(5,3),
  treasury_2y       DECIMAL(5,3),
  yield_curve_2s10s DECIMAL(5,3),                   -- Computed: 10y - 2y
  fed_funds_rate    DECIMAL(5,3),

  -- Inflation context (FRED — latest available as of event date)
  latest_cpi_yoy    DECIMAL(5,2),
  latest_core_cpi   DECIMAL(5,2),

  -- FOMC proximity (from static FOMC calendar JSON)
  days_to_next_fomc INT,
  days_from_last_fomc INT,

  -- Sector
  sector_etf_ticker TEXT,
  sector_etf_change DECIMAL(6,3),
  sector_etf_30d    DECIMAL(6,3),

  -- AI-derived regime labels (flagged as derived)
  market_regime     TEXT,                           -- 'bull', 'bear', 'correction', 'recovery', 'sideways'
  regime_method     TEXT DEFAULT 'sma_cross'        -- How regime was determined (not LLM hindsight)
);

CREATE TABLE event_stock_context (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES companies(id),

  -- Prices (yfinance adjusted — PIT safe)
  price_at_event    DECIMAL(10,2) NOT NULL,         -- Adjusted close on event date
  raw_price_at_event DECIMAL(10,2),                 -- Unadjusted price (for display in narrative)
  price_30d_ago     DECIMAL(10,2),
  price_90d_ago     DECIMAL(10,2),
  high_52w          DECIMAL(10,2),
  low_52w           DECIMAL(10,2),

  -- Derived from prices (PIT safe)
  return_30d        DECIMAL(6,3),
  return_90d        DECIMAL(6,3),
  distance_from_52w_high DECIMAL(6,3),
  distance_from_52w_low  DECIMAL(6,3),

  -- Market cap (price × shares outstanding from latest quarterly filing)
  market_cap_b      DECIMAL(10,2),
  market_cap_method TEXT DEFAULT 'price_x_shares',   -- How it was calculated
  market_cap_tier   TEXT,                            -- 'mega' >200B, 'large' 10-200B, 'mid' 2-10B, 'small' <2B

  -- Technicals (computed from price history — PIT safe)
  rsi_14            DECIMAL(5,2),
  above_50ma        BOOLEAN,
  above_200ma       BOOLEAN,
  avg_volume_20d    BIGINT,

  -- Earnings proximity
  days_since_last_earnings INT,
  days_to_next_earnings    INT,
  last_earnings_surprise_pct DECIMAL(6,2),

  -- Data quality
  pit_completeness  TEXT DEFAULT 'full'              -- 'full', 'partial' (some fields estimated), 'price_only'
);
```

### Layer 4: Price Impact & Returns

```sql
CREATE TABLE event_returns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES companies(id),
  ticker_at_time    TEXT NOT NULL,

  -- Reference price (EXPLICIT — no ambiguity)
  ref_price         DECIMAL(10,2) NOT NULL,
  ref_price_type    TEXT NOT NULL,                   -- 'prev_close' | 'event_day_close'
  ref_price_date    DATE NOT NULL,

  -- Reference price rules:
  -- pre_market / overnight / weekend event → ref_price = previous trading day close
  -- regular hours event → ref_price = previous trading day close (conservative, always unambiguous)
  -- after_hours event → ref_price = event day close
  -- This means return_t0 for pre-market events INCLUDES the gap. That's intentional.

  -- Raw returns (adjusted prices, cumulative from ref_price)
  return_t0         DECIMAL(6,3),                   -- Event day close / ref_price - 1
  return_t1         DECIMAL(6,3),                   -- T+1 close / ref_price - 1
  return_t3         DECIMAL(6,3),
  return_t5         DECIMAL(6,3),
  return_t10        DECIMAL(6,3),
  return_t20        DECIMAL(6,3),
  return_t60        DECIMAL(6,3),

  -- Primary benchmark (SPY)
  spy_return_t0     DECIMAL(6,3),
  spy_return_t1     DECIMAL(6,3),
  spy_return_t3     DECIMAL(6,3),
  spy_return_t5     DECIMAL(6,3),
  spy_return_t10    DECIMAL(6,3),
  spy_return_t20    DECIMAL(6,3),
  spy_return_t60    DECIMAL(6,3),

  -- Alpha = stock return - SPY return
  alpha_t0          DECIMAL(6,3),
  alpha_t1          DECIMAL(6,3),
  alpha_t3          DECIMAL(6,3),
  alpha_t5          DECIMAL(6,3),
  alpha_t10         DECIMAL(6,3),
  alpha_t20         DECIMAL(6,3),
  alpha_t60         DECIMAL(6,3),

  -- Sector alpha (more precise for within-sector comparison)
  sector_benchmark  TEXT,                           -- 'XLK', 'XBI', 'SOXX', 'XLF'...
  sector_alpha_t5   DECIMAL(6,3),
  sector_alpha_t20  DECIMAL(6,3),

  -- Gap & extremes
  overnight_gap_pct DECIMAL(6,3),                   -- Next open / ref_price - 1
  max_drawdown_pct  DECIMAL(6,3),                   -- Worst point in 60-day window
  max_drawdown_day  INT,
  max_runup_pct     DECIMAL(6,3),                   -- Best point in 60-day window
  max_runup_day     INT,

  -- Volume
  volume_event_day  BIGINT,
  volume_avg_20d    BIGINT,
  volume_ratio      DECIMAL(6,2),

  -- Outcome classification (based on T+20 alpha)
  outcome_t20       TEXT,                           -- 'strong_bull' >10%, 'bull' 3-10%, 'neutral' -3 to 3%, 'bear' -10 to -3%, 'strong_bear' <-10%

  -- Terminal status (handles delistings, acquisitions, halts)
  terminal_status   TEXT DEFAULT 'normal',           -- 'normal' | 'delisted' | 'acquired_cash' | 'acquired_stock' | 'bankrupt' | 'halted_extended'
  terminal_date     DATE,                            -- When trading stopped (if applicable)
  terminal_price    DECIMAL(10,2),                   -- Last available price or cash consideration
  terminal_note     TEXT,                            -- "Acquired by X at $Y/share", "Delisted on date"
  -- If terminal: return calculations stop at terminal_date. Remaining T+N fields are NULL.
  -- Outcome is computed from last available return.

  -- Return eligibility (from timestamp precision)
  t0_eligible       BOOLEAN DEFAULT TRUE,            -- FALSE if event_ts_precision = 'day_only'

  -- Methodology
  calc_version      INT DEFAULT 1,
  computed_at       TIMESTAMPTZ DEFAULT now(),

  UNIQUE(event_id, company_id, calc_version)
);

CREATE INDEX idx_er_event ON event_returns(event_id);
CREATE INDEX idx_er_ticker ON event_returns(ticker_at_time);
CREATE INDEX idx_er_outcome ON event_returns(outcome_t20);
CREATE INDEX idx_er_terminal ON event_returns(terminal_status) WHERE terminal_status != 'normal';
```

### Layer 4b: Peer Impact

```sql
CREATE TABLE event_peer_impact (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  peer_ticker     TEXT NOT NULL,
  peer_company_id UUID REFERENCES companies(id),
  relationship    TEXT,                             -- 'direct_competitor', 'same_sector', 'supply_chain', 'customer', 'etf'
  
  return_t0       DECIMAL(6,3),
  return_t5       DECIMAL(6,3),
  return_t20      DECIMAL(6,3),
  alpha_t0        DECIMAL(6,3),
  alpha_t5        DECIMAL(6,3),
  alpha_t20       DECIMAL(6,3),

  UNIQUE(event_id, peer_ticker)
);
```

### Layer 5: AI Analysis

```sql
CREATE TABLE event_analysis (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  version           INT NOT NULL DEFAULT 1,
  model_used        TEXT NOT NULL,                   -- 'claude-sonnet-4-6'
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Causal narrative
  market_reaction_why    TEXT NOT NULL,
  what_was_priced_in     TEXT,
  what_surprised         TEXT,
  narrative_shift        TEXT,

  -- Pattern
  pattern_name           TEXT,                       -- 'buy_the_dip', 'sell_the_news', 'gap_and_go', 'dead_cat_bounce', 'slow_grind'
  counter_intuitive      BOOLEAN DEFAULT FALSE,
  counter_intuitive_why  TEXT,

  -- Lessons
  key_variables          TEXT[],                     -- What determined outcome
  lesson_learned         TEXT NOT NULL,
  advice_for_similar     TEXT,

  -- Hindsight (CLEARLY LABELED)
  hindsight_optimal_entry TEXT,
  hindsight_optimal_exit  TEXT,
  hindsight_common_mistake TEXT,

  -- Quality
  analysis_confidence    TEXT DEFAULT 'medium',      -- 'high', 'medium', 'low'
  data_completeness      TEXT DEFAULT 'full',        -- 'full', 'partial', 'minimal'

  UNIQUE(event_id, version)
);

CREATE INDEX idx_ea_event ON event_analysis(event_id);
CREATE INDEX idx_ea_pattern ON event_analysis(pattern_name);
```

### Layer 5b: Event Chains

```sql
CREATE TABLE event_chains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_name      TEXT NOT NULL,
  chain_type      TEXT,                             -- 'mna_lifecycle', 'regulatory_process', 'earnings_trend', 'crisis_recovery'
  status          TEXT DEFAULT 'active',
  description     TEXT,
  outcome_summary TEXT,
  total_return    DECIMAL(6,3),
  total_alpha     DECIMAL(6,3),
  duration_days   INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_chain_members (
  chain_id        UUID NOT NULL REFERENCES event_chains(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  sequence_order  INT NOT NULL,
  role_in_chain   TEXT,                             -- 'trigger', 'escalation', 'pivot', 'resolution'
  
  PRIMARY KEY (chain_id, event_id),
  UNIQUE(chain_id, sequence_order)
);
```

### Layer 6: Patterns & Coverage

```sql
CREATE TABLE event_type_patterns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT NOT NULL,
  event_subtype   TEXT,
  sector          TEXT,
  market_cap_tier TEXT,

  sample_size     INT NOT NULL,
  date_range_start DATE,
  date_range_end  DATE,

  -- Stats (SPY-adjusted alpha)
  avg_alpha_t5    DECIMAL(6,3),
  avg_alpha_t20   DECIMAL(6,3),
  avg_alpha_t60   DECIMAL(6,3),
  median_alpha_t20 DECIMAL(6,3),
  std_dev_alpha_t20 DECIMAL(6,3),
  win_rate_t5     DECIMAL(5,3),
  win_rate_t20    DECIMAL(5,3),

  best_case_event_id  UUID REFERENCES historical_events(id),
  worst_case_event_id UUID REFERENCES historical_events(id),

  typical_pattern     TEXT,
  key_differentiators TEXT,
  
  calc_version    INT DEFAULT 1,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Functional unique index to handle NULLs correctly
CREATE UNIQUE INDEX idx_etp_unique ON event_type_patterns(
  event_type,
  COALESCE(event_subtype, ''),
  COALESCE(sector, ''),
  COALESCE(market_cap_tier, ''),
  calc_version
);

-- Coverage ledger: tracks what we've scanned vs what we haven't
-- Absence of event = no event, NOT = not scanned
CREATE TABLE backfill_coverage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id),     -- NULL for macro events
  ticker          TEXT,
  source_type     TEXT NOT NULL,                     -- 'sec_8k', 'earnings', 'sec_form4', 'news_polygon', etc.
  date_from       DATE NOT NULL,
  date_to         DATE NOT NULL,
  scan_completed  BOOLEAN DEFAULT FALSE,
  events_found    INT DEFAULT 0,
  scanned_at      TIMESTAMPTZ DEFAULT now(),
  notes           TEXT
);

CREATE INDEX idx_bc_company ON backfill_coverage(company_id);
CREATE INDEX idx_bc_source ON backfill_coverage(source_type);
```

---

## Split & Corporate Action Handling

### Forward Splits (e.g., TSLA 3:1, NVDA 10:1)

```
Before split: TSLA = $900
Split: 3:1 on 2022-08-25
After split: TSLA = $300

yfinance adjusted history: shows $300 equivalent for all pre-split dates
Our storage: price_at_event = $300 (adjusted), raw_price_at_event = $900
Return calculations: use adjusted prices → ratios are correct
Narrative: "TSLA was trading at $900 ($300 split-adjusted)"
```

### Reverse Splits (e.g., struggling company doing 1:10 reverse split)

```
Before: stock at $0.50
Reverse split: 1:10
After: stock at $5.00

yfinance adjusted: shows $5 equivalent for all pre-split dates
Our treatment: same as forward split in terms of data
BUT: reverse splits are tagged as bearish signals in analysis
```

### Why We Don't Need a Full Corporate Actions Table (Yet)

yfinance handles split adjustments automatically. We store the split events in `stock_splits` for reference and the `raw_price_at_event` for narrative context. For dividends, yfinance's adjusted prices already account for them.

If we later need unadjusted analysis or precise arbitrage calculations, we add a `corporate_actions` table. But for "what happened when NVDA did a 10:1 split" pattern matching, the current approach works.

---

## Benchmark Selection

```
Technology / Semiconductors  → SOXX
Technology / Software        → IGV
Technology / General         → XLK
Biotech / Pharma             → XBI
Healthcare                   → XLV
Financials / Banks           → XLF
Energy                       → XLE
Consumer Discretionary       → XLY
Consumer Staples             → XLP
Industrials                  → XLI
Crypto-related               → BITO
Small-cap                    → IWM
Default                      → SPY
```

Every event gets SPY alpha (for cross-sector comparison) + sector alpha (for within-sector accuracy).

---

## Reference Price Rules

**Simplified to TWO cases** (eliminates the "pre_announcement_close" ambiguity that Codex flagged):

| Event Timing | ref_price | Why |
|-------------|-----------|-----|
| Pre-market / overnight / weekend | Previous trading day close | Gap IS part of the reaction |
| Regular hours / after hours | Previous trading day close | Consistent baseline; after-hours events react next open |

**We ALWAYS use previous close as reference.** This means:
- `return_t0` = event day close / prev close - 1 → includes gap + intraday
- `overnight_gap_pct` = event day open / prev close - 1 → just the gap
- Intraday reaction = return_t0 - overnight_gap_pct → the trading session part

**Exception for after-hours events:** If event happens after close, the reaction starts next trading day. In this case:
- `return_t0` = next trading day close / event day close - 1
- `ref_price_type` = 'event_day_close'

This handles 99% of scenarios unambiguously.

---

## Timestamp Verification

Priority hierarchy (unchanged from v2):

| Priority | Source | Precision | Use For |
|----------|--------|-----------|---------|
| 1 | SEC EDGAR filing timestamp | second | SEC filings |
| 2 | FDA.gov announcement | second | FDA events |
| 3 | FRED release calendar | minute | Macro data |
| 4 | News wire published_utc | second | Breaking news |
| 5 | Earnings calendar + session | day_session | Earnings |
| 6 | Claude + search verification | day_only | Fallback |

**Precision-dependent analysis:**
- `second`/`minute`: all analysis valid
- `day_session`: all daily analysis valid
- `day_only`: T+1 through T+60 only, T+0 skipped (`t0_eligible = FALSE`)

---

## Bootstrap Plan

### Phase 1: Earnings Database (~2 weeks, ~$0)

**Why start here:** Most structured, highest frequency, strongest patterns, free data.

```
1. For each of 50 tickers:
   a. yfinance.Ticker(t).get_earnings_dates() → all earnings dates
   b. yfinance earnings history → EPS actual/estimate/surprise
   c. yfinance historical prices → compute all returns
   d. Classify: beat/miss/in_line + guidance direction

2. Compute consecutive_beats (requires chronological ordering)

3. Pull market context for each date (VIX, rates from FRED, SPY/sector)

4. Claude batch analysis for events with |alpha_t5| > 3%
   (Skip boring in-line earnings to save cost)
```

**Estimated: ~1,200 events, ~$15 Claude cost, 100% PIT safe**

### Phase 2: SEC 8-K Filings (~2 weeks, ~$20)

```
1. For each of 50 tickers:
   a. Query EDGAR EFTS for 8-K filings (2022-2026 for Tier 1, 2024-2026 for Tier 2)
   b. Parse Item numbers to classify event type
   c. Claude extracts key metrics from filing text
   d. Pull prices and compute returns

2. Register in backfill_coverage
```

**Estimated: ~800 events, ~$20 Claude cost**

### Phase 3: Major News Events (~1 week, ~$30-60)

```
1. For high-priority event types not covered by SEC:
   - M&A announcements (not always 8-K first)
   - Product launches/recalls
   - Leadership changes
   
2. Sources:
   - Polygon.io Starter ($29/month, 5-year history) for 1-2 months
   - OR: Claude recall + yfinance price anomaly detection as verification
   
3. Price anomaly approach (free, clever):
   a. Scan yfinance daily returns for |daily_return| > 5%
   b. For each anomaly, ask Claude: "What happened to {TICKER} on {DATE}?"
   c. Verify with web search
   d. This naturally captures all high-impact events without needing a news API!
```

**Estimated: ~500 events, ~$30-60 Claude cost**

### Phase 4: Macro Events (~3 days, ~$5)

```
1. FRED release calendar for major indicators (CPI, NFP, GDP, FOMC)
2. Pull actual/previous values
3. yfinance SPY/QQQ/sector returns on release dates
4. Claude analysis for surprise releases only
```

**Estimated: ~200 events, ~$5 Claude cost**

### Phase 5: Iconic Historical Cases (~2 days, ~$10)

```
Manually curated ~50 landmark events:
- COVID crash March 2020
- GME short squeeze Jan 2021
- META layoffs Nov 2022
- SVB bank run March 2023
- AI rally 2023-2024
- Major tariff announcements
- Major Fed pivots

Full analysis with detailed case study narratives.
```

### Total Bootstrap Cost

| Phase | Events | API Cost | Time |
|-------|--------|----------|------|
| Earnings | ~1,200 | ~$15 | 2 weeks |
| SEC 8-K | ~800 | ~$20 | 2 weeks |
| News events | ~500 | ~$30-60 | 1 week |
| Macro | ~200 | ~$5 | 3 days |
| Iconic cases | ~50 | ~$10 | 2 days |
| **Total** | **~2,750** | **~$80-110** | **~6 weeks** |

Plus optionally: Polygon Starter for 1 month = $29.

**Total estimated cost: $110-140.** Mostly Claude API for analysis.

---

## Similarity Matching

```python
def find_similar_events(new_event, limit=10):
    # Step 1: Retrieve candidates (same event_type, must have returns)
    candidates = query("""
        WHERE event_type = :type AND event_returns.alpha_t20 IS NOT NULL
    """)
    
    # Step 2: Score similarity
    for c in candidates:
        score = 0
        if c.event_subtype == new.subtype: score += 4    # Subtype match
        if c.sector == new.sector: score += 3             # Same sector
        if c.market_cap_tier == new.market_cap_tier: score += 2  # Similar size
        if same_regime(c, new): score += 2                 # Similar market
        if abs(c.vix - new.vix) < 5: score += 1           # Similar volatility
        if same_sign(c.return_30d, new.return_30d): score += 1  # Similar momentum
        if c.event_ts > two_years_ago: score += 1          # Recency bonus
        # Typed metrics bonus (if applicable)
        if has_metrics(c, new): score += metric_similarity(c, new)  # e.g., similar layoff %
    
    results = top_n(candidates, score, limit)
    
    # Step 3: Confidence assessment
    if len(results) < 3:
        confidence = 'insufficient'  # "Not enough historical data"
    elif len(results) < 5:
        confidence = 'low'           # "Limited sample — treat with caution"
    elif std_dev(results.alpha_t20) > 0.15:
        confidence = 'medium'        # "Mixed outcomes historically"
    else:
        confidence = 'high'          # "Strong historical pattern"
    
    return results, confidence, aggregate_stats(results)
```

**Key improvement from Codex feedback:** Explicit confidence levels with disclaimers for small samples.

---

## User-Facing Message Format

```
🔴 NVDA — Restructuring: 12% Workforce Reduction

NVIDIA announced a $2.1B restructuring charge with 12% layoff.
Forward guidance maintained. $15B buyback authorized.

📊 Similar Events (23 cases, HIGH confidence):
• Tech mega-cap layoffs with maintained guidance: 
  +18% avg alpha over 20 days, 72% win rate
• Most similar: META Nov 2022 (+89% in 6 months)
• Worst case: INTC Oct 2022 (-15% in 20 days, guidance was cut)

⚡ Pattern: Market usually sells off Day 0 (-3%), then reverses 
by Day 3 as "efficiency" narrative takes hold.

💡 Key variable: Watch next earnings for guidance confirmation.
If guidance is cut, the pattern breaks.

⚠️ Confidence: HIGH — 23 similar cases, consistent pattern
```

vs. low-confidence:

```
🟡 XYZ — Unusual Product Recall

XYZ Corp recalled its flagship product due to safety concerns.

📊 Similar Events (3 cases, INSUFFICIENT data):
• Too few historical parallels to establish a reliable pattern.
• Closest analog: ABC Corp recall 2023 (-22% in 20 days)
• This is a single data point, not a pattern.

💡 Monitor: FDA response, replacement timeline, insurance exposure.
```

---

## Open Questions (Reduced)

1. **Polygon Starter worth $29/month?** Gives 5-year history. Could be useful for Phase 3 news verification. Cancel after 1 month of bootstrap.

2. **Earnings transcripts?** Key quotes from calls are incredibly valuable but add complexity. Store as text in `metrics_earnings.guidance_detail` for now, consider `event_sources` entry with transcript URL later.

3. **Options IV?** Skip for bootstrap. Add for real-time events when we have them flowing.

4. **International markets?** Not in scope for v1. All events relate to US-listed securities.
