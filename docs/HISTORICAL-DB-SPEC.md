# Historical Event Database — Specification v2

> Revised after Codex review. Addresses: selection bias, look-ahead bias, point-in-time rigor, multi-entity events, precise timestamps, abnormal-return methodology, provenance, and taxonomy overlaps. Balances research-grade correctness with product-level pragmatism.

## Purpose

Build a comprehensive historical event database that powers one question:  
**"Something like this happened before — here's what usually happens next, and why."**

This database enables:
1. Pattern matching — find historically similar events with quantified outcomes
2. AI analysis grounded in real data, not vibes
3. Prediction tracking with automatic accuracy measurement
4. User-facing "here's what happened last time" comparisons

---

## Design Principles

1. **No selection bias.** Store ALL classifiable events, including ones where the stock didn't move. "The market shrugged off this FDA warning letter" is as valuable as "FDA rejection crashed the stock 40%."

2. **Point-in-time or nothing.** Every data field must reflect what was knowable AT THE TIME of the event. If we can't get historical P/E, leave it NULL — don't use today's value. "Better missing than wrong."

3. **Alpha needs a benchmark.** Raw return - SPY is a start, but a semiconductor stock should be measured against SOXX, not SPY. Store the benchmark alongside every return calculation.

4. **Events have multiple actors.** An acquisition involves acquirer, target, and sometimes a competing bidder. A supply chain disruption hits the company and its customers. Model this explicitly.

5. **Separate fact from opinion.** Raw data (prices, dates, filings) is immutable. AI analysis (causal narrative, predicted patterns) is versioned and labeled as derived.

6. **Events form chains.** M&A sagas, earnings trends, regulatory processes — track the full lifecycle, not just isolated snapshots.

7. **LLMs analyze, not discover.** Use deterministic sources (SEC EDGAR, news APIs, FRED) as ground truth. Use Claude for classification, summarization, and causal analysis — not as the event source itself.

---

## Architecture Layers

Professional event databases separate concerns into layers. We do the same, adapted for our scale:

```
┌─────────────────────────────────────────────┐
│  Layer 1: Security Master                    │
│  Companies, tickers, identifier mappings     │
├─────────────────────────────────────────────┤
│  Layer 2: Raw Events + Provenance           │
│  Events, sources, documents, entities        │
├─────────────────────────────────────────────┤
│  Layer 3: Market Data (Point-in-Time)       │
│  Prices, macro snapshots, stock context      │
├─────────────────────────────────────────────┤
│  Layer 4: Computed Returns                   │
│  Raw returns, alpha (benchmark-adjusted)     │
├─────────────────────────────────────────────┤
│  Layer 5: AI Analysis (Derived, Versioned)  │
│  Causal narratives, pattern labels, lessons  │
├─────────────────────────────────────────────┤
│  Layer 6: Aggregated Patterns               │
│  Pre-computed stats per event type           │
└─────────────────────────────────────────────┘
```

---

## Event Taxonomy v2

Reorganized to eliminate overlaps. Each event gets ONE primary type. Tags handle edge cases.

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
| `financial_action` | buyback, dividend_change, stock_split, secondary_offering, debt_issuance, credit_rating_change |
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

### Layer 1: Security Master

```sql
-- Companies (the legal entity, survives ticker changes)
CREATE TABLE companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  sector          TEXT,                              -- 'Technology', 'Healthcare', ...
  industry        TEXT,                              -- 'Semiconductors', 'Biotech', ...
  country         TEXT DEFAULT 'US',
  cik             TEXT,                              -- SEC Central Index Key
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tickers (can change over time: META was FB, GOOGL parent is Alphabet)
CREATE TABLE security_identifiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  identifier_type TEXT NOT NULL,                     -- 'ticker', 'cusip', 'isin', 'cik'
  identifier      TEXT NOT NULL,                     -- 'NVDA', '67066G104', ...
  exchange        TEXT,                              -- 'NASDAQ', 'NYSE'
  effective_from  DATE NOT NULL,
  effective_to    DATE,                              -- NULL = current
  is_primary      BOOLEAN DEFAULT TRUE,

  CONSTRAINT valid_id_type CHECK (identifier_type IN ('ticker', 'cusip', 'isin', 'cik'))
);

CREATE INDEX idx_si_identifier ON security_identifiers(identifier_type, identifier);
CREATE INDEX idx_si_company ON security_identifiers(company_id);
```

### Layer 2: Events + Provenance

```sql
-- Core event record
CREATE TABLE historical_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Precise timing (THE FOUNDATION — get this wrong, everything else is wrong)
  event_ts          TIMESTAMPTZ NOT NULL,            -- When event FIRST became public (UTC)
  market_session    TEXT,                            -- 'pre_market' | 'regular' | 'after_hours' | 'overnight' | 'weekend'
  exchange_tz       TEXT DEFAULT 'America/New_York', -- For trading-day alignment

  -- Timestamp provenance (critical for data integrity)
  event_ts_precision TEXT NOT NULL DEFAULT 'day_only', -- 'second' | 'minute' | 'hour' | 'day_session' | 'day_only'
  event_ts_source   TEXT,                            -- 'sec_edgar_filing_ts' | 'news_api_published_utc' | 'earnings_calendar' | 'llm_estimated'
  event_ts_verified BOOLEAN DEFAULT FALSE,           -- Cross-verified against ≥2 independent sources?

  -- Classification
  event_category    TEXT NOT NULL,                   -- Top level: 'corporate', 'earnings', 'regulatory', 'macro', 'smart_money'
  event_type        TEXT NOT NULL,                   -- From taxonomy: 'restructuring', 'earnings', 'mna_acquisition'
  event_subtype     TEXT,                            -- Specific: 'layoff', 'beat', 'announced'
  severity          TEXT NOT NULL DEFAULT 'medium',

  -- Content
  headline          TEXT NOT NULL,                   -- Factual one-liner
  description       TEXT,                            -- Factual multi-paragraph description (not AI opinion)
  
  -- Tags for flexible querying
  tags              TEXT[] NOT NULL DEFAULT '{}',     -- ['mega_cap', 'first_time', 'repeat_offender', 'after_hours_surprise']

  CONSTRAINT valid_severity CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT valid_session CHECK (market_session IN ('pre_market', 'regular', 'after_hours', 'overnight', 'weekend')),
  CONSTRAINT valid_ts_precision CHECK (event_ts_precision IN ('second', 'minute', 'hour', 'day_session', 'day_only'))
);

CREATE INDEX idx_he_type ON historical_events(event_category, event_type);
CREATE INDEX idx_he_ts ON historical_events(event_ts);
CREATE INDEX idx_he_tags ON historical_events USING GIN(tags);

-- Multi-entity relationship (event ↔ companies)
CREATE TABLE event_entities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id),
  ticker_at_time  TEXT NOT NULL,                    -- Ticker as of event date (point-in-time)
  role            TEXT NOT NULL,                    -- 'primary', 'acquirer', 'target', 'competitor', 'peer', 'customer', 'supplier'
  is_primary      BOOLEAN DEFAULT FALSE,            -- The main stock this event is "about"

  UNIQUE(event_id, company_id, role)
);

CREATE INDEX idx_ee_event ON event_entities(event_id);
CREATE INDEX idx_ee_company ON event_entities(company_id);
CREATE INDEX idx_ee_ticker ON event_entities(ticker_at_time);

-- Data provenance (where did we learn about this event?)
CREATE TABLE event_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  source_type     TEXT NOT NULL,                    -- 'sec_filing', 'press_release', 'news_article', 'social_media', 'api', 'transcript'
  source_name     TEXT,                             -- 'SEC EDGAR', 'Reuters', 'CNBC', ...
  source_url      TEXT,
  published_at    TIMESTAMPTZ,                      -- When source was published
  ingested_at     TIMESTAMPTZ DEFAULT now(),         -- When we captured it
  document_hash   TEXT,                              -- For dedup / change detection
  
  -- Extraction metadata
  extraction_method TEXT,                            -- 'api_structured', 'scrape_html', 'llm_extract', 'manual'
  extraction_model  TEXT,                            -- 'claude-sonnet-4-6' if LLM extracted
  confidence        DECIMAL(3,2)                     -- 0.0-1.0 confidence in extraction
);

CREATE INDEX idx_es_event ON event_sources(event_id);
```

### Layer 2b: Typed Event Metrics

Instead of dumping everything into `JSONB`, common event families get typed columns.

```sql
-- Metrics specific to restructuring/layoff events
CREATE TABLE metrics_restructuring (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE UNIQUE,
  headcount_reduction_pct  DECIMAL(5,2),             -- e.g., 12.0 = 12%
  headcount_reduction_abs  INT,                      -- Absolute number
  restructuring_charge_m   DECIMAL(10,2),            -- Charge in $millions
  segments_affected        TEXT[],                    -- ['Cloud', 'Devices']
  guidance_maintained      BOOLEAN,                  -- Did they maintain forward guidance?
  buyback_announced        BOOLEAN                   -- Paired with buyback?
);

-- Metrics specific to M&A events
CREATE TABLE metrics_mna (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE UNIQUE,
  deal_value_m    DECIMAL(12,2),                    -- Deal value in $millions
  premium_pct     DECIMAL(6,2),                     -- Premium over pre-deal price
  payment_type    TEXT,                              -- 'cash', 'stock', 'mixed'
  expected_close  DATE,                              -- Expected closing date
  synergies_m     DECIMAL(10,2),                    -- Projected synergies
  competing_bids  INT DEFAULT 0,                     -- Number of competing bidders
  regulatory_risk TEXT                               -- 'low', 'medium', 'high'
);

-- Metrics specific to earnings events
CREATE TABLE metrics_earnings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE UNIQUE,
  fiscal_quarter  TEXT,                              -- 'Q4 2024'
  eps_actual       DECIMAL(8,3),
  eps_estimate     DECIMAL(8,3),
  eps_surprise_pct DECIMAL(6,2),
  revenue_actual_m DECIMAL(12,2),
  revenue_estimate_m DECIMAL(12,2),
  revenue_surprise_pct DECIMAL(6,2),
  guidance_direction TEXT,                           -- 'raised', 'lowered', 'maintained', 'withdrawn'
  guidance_detail    TEXT,                           -- Key guidance quote/number
  consecutive_beats  INT,                            -- Streak count
  yoy_revenue_growth DECIMAL(6,2),
  yoy_eps_growth     DECIMAL(6,2)
);

-- Metrics specific to FDA events
CREATE TABLE metrics_fda (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE UNIQUE,
  drug_name       TEXT,
  indication      TEXT,                              -- Disease/condition
  action_type     TEXT,                              -- 'NDA', 'BLA', 'sNDA', '510k', 'EUA'
  pdufa_date      DATE,
  adcom_vote_for  INT,
  adcom_vote_against INT,
  market_size_est_m DECIMAL(10,2),                   -- Estimated addressable market
  competition_level TEXT                              -- 'first_in_class', 'best_in_class', 'me_too'
);

-- Metrics specific to macro/economic data events
CREATE TABLE metrics_macro (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE UNIQUE,
  indicator       TEXT NOT NULL,                     -- 'CPI_YOY', 'NFP', 'FED_RATE', 'GDP_QOQ'
  actual_value    DECIMAL(10,4),
  forecast_value  DECIMAL(10,4),
  previous_value  DECIMAL(10,4),
  surprise_direction TEXT,                           -- 'hot', 'cool', 'in_line'
  surprise_magnitude DECIMAL(6,3)                    -- Standard deviations from consensus
);

-- Flexible JSONB fallback for everything else
CREATE TABLE metrics_other (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE UNIQUE,
  metrics         JSONB NOT NULL DEFAULT '{}'
);
```

### Layer 3: Market Data (Point-in-Time)

```sql
-- Macro environment snapshot at time of event
CREATE TABLE event_market_context (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE UNIQUE,

  -- Broad market (from yfinance — point-in-time safe, these are historical prices)
  spy_close         DECIMAL(10,2),
  spy_change_pct    DECIMAL(6,3),                    -- SPY return on event date
  qqq_change_pct    DECIMAL(6,3),
  iwm_change_pct    DECIMAL(6,3),

  -- Volatility (from CBOE historical — point-in-time safe)
  vix_close         DECIMAL(6,2),
  vix_percentile_1y DECIMAL(5,2),                    -- VIX rank vs trailing 1Y

  -- Rates (from FRED — point-in-time safe)
  treasury_10y      DECIMAL(5,3),
  treasury_2y       DECIMAL(5,3),
  yield_curve_2s10s DECIMAL(5,3),
  fed_funds_rate    DECIMAL(5,3),
  days_to_next_fomc INT,
  days_from_last_fomc INT,

  -- Inflation (from FRED — point-in-time safe, uses latest available at event date)
  latest_cpi_yoy    DECIMAL(5,2),
  latest_core_cpi   DECIMAL(5,2),

  -- Sector (from sector ETF prices — point-in-time safe)
  sector_etf_ticker TEXT,                            -- 'XLK', 'XLF', 'XBI', ...
  sector_etf_change DECIMAL(6,3),
  sector_etf_30d    DECIMAL(6,3),

  -- Market regime (AI-labeled, stored as derived)
  market_regime     TEXT,                            -- 'bull', 'bear', 'correction', 'recovery', 'sideways'
  sentiment_label   TEXT,                            -- 'risk_on', 'risk_off', 'mixed', 'euphoric', 'panic'
  regime_confidence DECIMAL(3,2),                    -- How confident is the label

  -- Data quality
  pit_verified      BOOLEAN DEFAULT TRUE             -- All fields confirmed point-in-time
);

-- Stock-specific context at time of event
CREATE TABLE event_stock_context (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES companies(id),

  -- Price context (from yfinance historical — PIT safe)
  price_at_event    DECIMAL(10,2) NOT NULL,
  price_30d_ago     DECIMAL(10,2),                   -- For calculating 30d change
  price_90d_ago     DECIMAL(10,2),
  price_ytd_start   DECIMAL(10,2),
  high_52w          DECIMAL(10,2),
  low_52w           DECIMAL(10,2),

  -- Derived from prices (PIT safe — computed from historical prices)
  return_30d        DECIMAL(6,3),
  return_90d        DECIMAL(6,3),
  return_ytd        DECIMAL(6,3),
  distance_from_52w_high DECIMAL(6,3),
  distance_from_52w_low  DECIMAL(6,3),

  -- Market cap (from historical prices × shares outstanding — approximately PIT)
  market_cap_b      DECIMAL(10,2),
  market_cap_tier   TEXT,                            -- 'mega' (>200B), 'large' (10-200B), 'mid' (2-10B), 'small' (<2B)

  -- Technicals (computed from price history — PIT safe)
  rsi_14            DECIMAL(5,2),
  above_50ma        BOOLEAN,
  above_200ma       BOOLEAN,
  pct_from_50ma     DECIMAL(6,3),
  pct_from_200ma    DECIMAL(6,3),
  avg_volume_20d    BIGINT,

  -- Earnings context (from historical earnings calendar — PIT safe)
  days_since_last_earnings INT,
  days_to_next_earnings    INT,
  last_earnings_surprise_pct DECIMAL(6,2),
  consecutive_beats  INT,

  -- Fields we CAN'T reliably get historically (flagged as non-PIT)
  -- These are populated for NEW events (real-time) but NULL for bootstrap
  pe_ratio          DECIMAL(8,2),                    -- ⚠️ Only reliable for recent events
  forward_pe        DECIMAL(8,2),                    -- ⚠️ Requires consensus estimates
  short_interest_pct DECIMAL(6,3),                   -- ⚠️ Historical SI hard to get
  analyst_consensus  TEXT,                            -- ⚠️ 'strong_buy', 'buy', 'hold', 'sell'
  
  -- Data quality flag
  pit_tier          TEXT DEFAULT 'full',              -- 'full' = all PIT, 'partial' = some non-PIT, 'estimated' = approximated
  non_pit_fields    TEXT[],                           -- Which fields are non-PIT: ['pe_ratio', 'short_interest_pct']

  UNIQUE(event_id, company_id)
);

CREATE INDEX idx_esc_event ON event_stock_context(event_id);
CREATE INDEX idx_esc_company ON event_stock_context(company_id);
```

### Layer 4: Computed Returns

Separate from raw prices. Each return calculation is explicit about methodology.

```sql
CREATE TABLE event_returns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES companies(id),
  ticker_at_time    TEXT NOT NULL,

  -- Reference price (explicit, not ambiguous)
  ref_price         DECIMAL(10,2) NOT NULL,          -- The baseline price
  ref_price_type    TEXT NOT NULL,                   -- 'prev_close', 'event_day_open', 'pre_announcement_close'
  ref_price_date    DATE NOT NULL,

  -- Raw returns at key intervals
  return_t0         DECIMAL(6,3),                    -- Event day (ref_price → event day close)
  return_t1         DECIMAL(6,3),
  return_t3         DECIMAL(6,3),
  return_t5         DECIMAL(6,3),
  return_t10        DECIMAL(6,3),
  return_t20        DECIMAL(6,3),
  return_t60        DECIMAL(6,3),

  -- Benchmark returns (same intervals)
  benchmark_ticker  TEXT NOT NULL DEFAULT 'SPY',     -- Primary benchmark
  benchmark_return_t0  DECIMAL(6,3),
  benchmark_return_t1  DECIMAL(6,3),
  benchmark_return_t3  DECIMAL(6,3),
  benchmark_return_t5  DECIMAL(6,3),
  benchmark_return_t10 DECIMAL(6,3),
  benchmark_return_t20 DECIMAL(6,3),
  benchmark_return_t60 DECIMAL(6,3),

  -- Alpha (stock return - benchmark return at each interval)
  alpha_t0          DECIMAL(6,3),
  alpha_t1          DECIMAL(6,3),
  alpha_t3          DECIMAL(6,3),
  alpha_t5          DECIMAL(6,3),
  alpha_t10         DECIMAL(6,3),
  alpha_t20         DECIMAL(6,3),
  alpha_t60         DECIMAL(6,3),

  -- Sector-adjusted alpha (optional, more precise)
  sector_benchmark  TEXT,                            -- 'XLK', 'XBI', 'SOXX', ...
  sector_alpha_t5   DECIMAL(6,3),
  sector_alpha_t20  DECIMAL(6,3),

  -- Extremes within 60-day post-event window
  max_drawdown_pct  DECIMAL(6,3),
  max_drawdown_day  INT,                             -- Trading day of max drawdown
  max_runup_pct     DECIMAL(6,3),
  max_runup_day     INT,

  -- Gap analysis
  overnight_gap_pct DECIMAL(6,3),                    -- Gap from ref_price to next open
  gap_filled        BOOLEAN,
  gap_fill_days     INT,

  -- Volume
  volume_event_day  BIGINT,
  volume_avg_20d    BIGINT,
  volume_ratio      DECIMAL(6,2),

  -- Outcome classification
  outcome_t20       TEXT,                            -- 'strong_bull' (>10%), 'bull' (3-10%), 'neutral' (-3 to 3%), 'bear' (-10 to -3%), 'strong_bear' (<-10%)
  outcome_t60       TEXT,

  -- Methodology metadata
  return_method     TEXT DEFAULT 'simple',           -- 'simple' (price ratio), 'log' (log return), 'bhar' (buy-and-hold abnormal return)
  calc_version      INT DEFAULT 1,                   -- Bump when methodology changes
  computed_at       TIMESTAMPTZ DEFAULT now(),

  UNIQUE(event_id, company_id, benchmark_ticker, calc_version)
);

CREATE INDEX idx_er_event ON event_returns(event_id);
CREATE INDEX idx_er_ticker ON event_returns(ticker_at_time);
CREATE INDEX idx_er_outcome ON event_returns(outcome_t20);
```

### Layer 4b: Peer/Contagion Impact

```sql
CREATE TABLE event_peer_impact (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  peer_company_id   UUID REFERENCES companies(id),
  peer_ticker       TEXT NOT NULL,
  relationship      TEXT,                            -- 'direct_competitor', 'same_sector', 'supply_chain', 'customer', 'etf'

  return_t0         DECIMAL(6,3),
  return_t5         DECIMAL(6,3),
  return_t20        DECIMAL(6,3),
  alpha_t0          DECIMAL(6,3),
  alpha_t5          DECIMAL(6,3),
  alpha_t20         DECIMAL(6,3),

  UNIQUE(event_id, peer_ticker)
);
```

### Layer 5: AI Analysis (Derived, Versioned)

Everything in this layer is **explicitly labeled as AI-generated opinion**, not fact.

```sql
CREATE TABLE event_analysis (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,

  -- Versioning (re-generate analysis as models improve)
  version           INT NOT NULL DEFAULT 1,
  model_used        TEXT NOT NULL,                   -- 'claude-sonnet-4-6'
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Causal narrative (the core value)
  market_reaction_why    TEXT NOT NULL,               -- Why did the market react this way?
  what_was_priced_in     TEXT,                        -- What was the market already expecting?
  what_surprised         TEXT,                        -- What caught the market off guard?
  narrative_shift        TEXT,                        -- How did this change the stock's "story"?

  -- Pattern classification
  pattern_name           TEXT,                        -- 'buy_the_dip', 'sell_the_news', 'gap_and_go', 'slow_grind', 'dead_cat_bounce'
  counter_intuitive      BOOLEAN DEFAULT FALSE,
  counter_intuitive_why  TEXT,

  -- Forward-looking lesson
  key_variables          TEXT[],                      -- What determined the outcome: ['guidance_maintained', 'buyback_size', 'macro_regime']
  lesson_learned         TEXT NOT NULL,               -- One-liner takeaway
  advice_for_similar     TEXT,                        -- "If this happens again, watch for X before acting"

  -- Hindsight analysis (CLEARLY LABELED as hindsight, not prediction)
  hindsight_optimal_entry TEXT,                       -- "T+2 after panic selling subsided"
  hindsight_optimal_exit  TEXT,                       -- "T+15 when momentum faded"
  hindsight_common_mistake TEXT,                      -- "Chasing the gap was wrong because..."

  -- Quality / confidence
  analysis_confidence    TEXT,                        -- 'high', 'medium', 'low'
  data_completeness      TEXT,                        -- 'full' (all context available), 'partial', 'minimal'

  UNIQUE(event_id, version)
);

CREATE INDEX idx_ea_event ON event_analysis(event_id);
CREATE INDEX idx_ea_pattern ON event_analysis(pattern_name);
```

### Layer 5b: Event Chains

```sql
CREATE TABLE event_chains (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_name        TEXT NOT NULL,                   -- "Paramount Acquisition Saga 2024"
  chain_type        TEXT,                            -- 'mna_lifecycle', 'regulatory_process', 'earnings_trend', 'crisis_recovery'
  status            TEXT DEFAULT 'active',           -- 'active', 'resolved'
  
  -- AI-generated summary (versioned)
  description       TEXT,
  outcome_summary   TEXT,                            -- How it ended (filled when resolved)
  
  -- Aggregate metrics
  total_return      DECIMAL(6,3),
  total_alpha       DECIMAL(6,3),
  duration_days     INT,
  
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_chain_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id        UUID NOT NULL REFERENCES event_chains(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  sequence_order  INT NOT NULL,
  role_in_chain   TEXT,                              -- 'trigger', 'escalation', 'pivot', 'resolution', 'aftermath'

  UNIQUE(chain_id, event_id)
);

CREATE INDEX idx_ecm_chain ON event_chain_members(chain_id);
CREATE INDEX idx_ecm_event ON event_chain_members(event_id);
```

### Layer 6: Aggregated Patterns

Pre-computed for fast matching. Rebuilt periodically.

```sql
CREATE TABLE event_type_patterns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What this pattern covers
  event_type        TEXT NOT NULL,
  event_subtype     TEXT,                            -- NULL = all subtypes
  sector            TEXT,                            -- NULL = all sectors
  market_cap_tier   TEXT,                            -- NULL = all sizes
  market_regime     TEXT,                            -- NULL = all regimes

  -- Sample
  sample_size       INT NOT NULL,
  date_range_start  DATE,
  date_range_end    DATE,
  min_sample_required INT DEFAULT 5,                 -- Don't show stats with <5 events

  -- Statistical summary (using SPY-adjusted alpha)
  avg_alpha_t1      DECIMAL(6,3),
  avg_alpha_t5      DECIMAL(6,3),
  avg_alpha_t20     DECIMAL(6,3),
  avg_alpha_t60     DECIMAL(6,3),
  median_alpha_t20  DECIMAL(6,3),
  std_dev_alpha_t20 DECIMAL(6,3),
  win_rate_t5       DECIMAL(5,3),                    -- % with positive alpha at T+5
  win_rate_t20      DECIMAL(5,3),
  win_rate_t60      DECIMAL(5,3),

  -- Benchmark info
  benchmark_used    TEXT DEFAULT 'SPY',
  return_method     TEXT DEFAULT 'simple',

  -- Best/worst for reference
  best_case_event_id  UUID REFERENCES historical_events(id),
  worst_case_event_id UUID REFERENCES historical_events(id),

  -- Narrative (AI-generated, versioned)
  typical_pattern     TEXT,                          -- "Initial gap, 3-day consolidation, continuation"
  key_differentiators TEXT,                          -- "Outcome depends on: guidance, buyback, regime"
  common_mistakes     TEXT,
  
  -- Metadata
  calc_version      INT DEFAULT 1,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(event_type, event_subtype, sector, market_cap_tier, market_regime, calc_version)
);
```

---

## Benchmark Selection Logic

Don't always use SPY. Match the benchmark to the stock:

```
Technology / Semiconductors  → SOXX (or SMH)
Technology / Software        → IGV
Technology / General         → XLK
Biotech / Pharma             → XBI
Healthcare                   → XLV
Financials / Banks           → XLF (or KBE for regional banks)
Energy                       → XLE
Consumer Discretionary       → XLY
Consumer Staples             → XLP
Industrials                  → XLI
REITs                        → VNQ
Crypto-related               → BITO
Broad market (default)       → SPY
Small-cap                    → IWM
```

Store BOTH SPY alpha and sector alpha when available. SPY for cross-sector comparison, sector for within-sector accuracy.

---

## Timestamp Verification (Critical Path)

**The event timestamp is the single most important field in the database.** Every return calculation, every gap analysis, every reference price selection depends on it. A wrong timestamp by even a few hours can flip a +5% event into a -3% event.

### Why This Is Hard

The same event appears at different times across sources:
```
SEC 8-K filing:     2024-01-08 16:05:32 UTC  ← Authoritative
Reuters wire:       2024-01-08 16:12:00 UTC
CNBC article:       2024-01-08 17:30:00 UTC
Twitter discussion: 2024-01-08 18:00:00 UTC
```

We want the **earliest public disclosure**, not the latest media report.

### Timestamp Authority Hierarchy

Use the most authoritative source available:

| Priority | Source | Precision | Use For |
|----------|--------|-----------|---------|
| 1 | SEC EDGAR filing timestamp | second | All SEC filings (8-K, Form 4, 13F) |
| 2 | FDA.gov announcement timestamp | second | FDA approvals/rejections |
| 3 | Federal Register publication | day | Executive orders, regulations |
| 4 | News wire (Reuters/AP) `published_utc` | second | Breaking news, corporate announcements |
| 5 | Financial news API (Polygon/Benzinga) | second | General corporate events |
| 6 | Earnings calendar + session tag | day_session | Earnings (know date + before/after market) |
| 7 | Claude recall + search verification | day_only | Fallback when no API source available |

### Verification Process During Bootstrap

```
For each event discovered by Claude:
1. Claude provides: ticker, approximate date, event description
2. VERIFY against authoritative source:
   a. If SEC-related → query EDGAR for filing around that date
   b. If news-related → query Polygon.io news API for ticker + date
   c. If earnings → check yfinance earnings calendar
   d. If macro → check FRED release calendar
3. IF verified:
   → event_ts = source timestamp
   → event_ts_precision = 'second' or 'minute'
   → event_ts_source = 'sec_edgar_filing_ts' / 'news_api_published_utc'
   → event_ts_verified = TRUE
4. IF date confirmed but time unknown:
   → event_ts = date + estimated session time (16:00 for after-hours, 09:00 for pre-market)
   → event_ts_precision = 'day_session'
   → event_ts_verified = FALSE
5. IF date cannot be verified:
   → SKIP EVENT or mark as low-confidence
   → event_ts_precision = 'day_only'
   → event_ts_source = 'llm_estimated'
```

### Precision-Dependent Analysis Rules

Not all events are usable for all analyses:

| Precision | Can Calculate | Cannot Calculate |
|-----------|--------------|-----------------|
| `second` | Everything: gap, intraday reaction, T+0, T+1...T+60 | — |
| `minute` | Everything (gap may be ±minutes off) | — |
| `hour` | Daily returns T+0 through T+60, gap (approximate) | Precise intraday reaction |
| `day_session` | Daily returns T+0 through T+60 | Precise gap timing |
| `day_only` | T+1 through T+60 only | T+0 return, gap analysis |

Events with `day_only` precision are still valuable for 1-week/1-month pattern analysis. They just can't be used for same-day reaction studies.

## Reference Price Rules

The `ref_price` in `event_returns` depends on when the event was published:

| Event Timing | ref_price_type | ref_price |
|-------------|----------------|-----------|
| Before market open (pre-market news) | `prev_close` | Previous trading day close |
| During market hours | `pre_announcement_close` | Last close before announcement (same day open if intraday) |
| After market close | `event_day_close` | That day's closing price |
| Weekend/holiday | `prev_close` | Friday close (or last trading day) |

`return_t0` is ALWAYS: event day close ÷ ref_price - 1. No ambiguity.

---

## Data Population Strategy v2

### Principle: Deterministic sources first, AI second

```
Step 1: Collect raw event data from structured sources
Step 2: Validate dates and key facts
Step 3: Pull price/macro data (all PIT-safe)
Step 4: AI classifies, summarizes, and analyzes
```

### Phase 1: Bootstrap Historical Data

#### 1a. SEC EDGAR (free, structured, 10+ years)

```python
# 8-K filings — the most important single source
# EDGAR full-text search API: efts.sec.gov/LATEST/search-index
# Filter by form type, date range, company
# Parse Item numbers from 8-K body to classify event type

# Form 4 (insider trades) — high volume, structured XML
# 13F filings — quarterly institutional holdings
```

**Coverage:** All SEC-required disclosures for US public companies.

#### 1b. Financial News API (for non-SEC events)

Options (ranked by value):
1. **Polygon.io** — Free tier: 5 API calls/min, has ticker news endpoint with historical data
2. **Alpha Vantage News** — Free tier: 25 requests/day, news by ticker
3. **NewsAPI.org** — Free tier: 100 requests/day, 1-month lookback (limited history)
4. **Benzinga** — Paid ($99/mo), best financial news API, 5+ year history

**Bootstrap recommendation:** Start with Polygon.io free tier for news events. SEC EDGAR for regulatory events. FRED for macro. Supplement gaps with Claude extraction from known financial journalism archives.

#### 1c. FRED (free, macro data, 30+ years)

All macro indicators with exact historical values. Perfectly PIT-safe.

#### 1d. yfinance (free, price data)

Historical daily OHLCV for all tickers. PIT-safe for prices.
**NOT PIT-safe for:** `.info` fields (P/E, market cap, analyst ratings). Use only for prices and computed metrics.

#### 1e. Earnings Data

yfinance has historical earnings dates + actual/estimate EPS. Reasonably PIT-safe for basic beat/miss classification.

### Phase 2: AI Processing (after raw data collected)

For each event with raw data assembled:

```
Claude prompt:
"Here is an SEC 8-K filing / news article / earnings report:
[raw source text]

And here is the market data around this event:
[prices, macro context, volume]

Please provide:
1. Classification (event_type, event_subtype, severity)
2. Factual headline (one sentence)
3. Factual description (2-3 paragraphs, no opinion)
4. Key metrics (structured: {headcount_reduction: 12, charge_amount_m: 2100, ...})
5. Causal analysis: why did the market react this way?
6. Pattern classification
7. Lesson learned
8. Key variables that determined the outcome
"
```

### Phase 3: Continuous Real-Time Enrichment

Once scanners are running:
```
T+0:    Event detected → classify → store → pull market context
T+1:    Compute overnight gap + T+0 return
T+5:    Compute 1-week returns + volume
T+20:   Compute 1-month returns + generate AI causal analysis
T+60:   Compute 3-month returns + final outcome label + update pattern stats
```

### Phase 4: Pattern Aggregation (weekly cron)

Recompute `event_type_patterns` for all types with sample_size ≥ 5.

---

## Similarity Matching Algorithm

When a new event arrives, find the most relevant historical comparisons:

```python
def find_similar_events(new_event, limit=10):
    """
    Scoring: weighted combination of feature similarity.
    Higher score = more similar.
    """
    candidates = db.query("""
        SELECT he.*, er.alpha_t20, ea.lesson_learned
        FROM historical_events he
        JOIN event_returns er ON er.event_id = he.id AND er.calc_version = (latest)
        JOIN event_analysis ea ON ea.event_id = he.id AND ea.version = (latest)
        JOIN event_stock_context esc ON esc.event_id = he.id
        JOIN event_market_context emc ON emc.event_id = he.id
        WHERE he.event_type = :event_type          -- Must match type
    """)
    
    for c in candidates:
        score = 0
        # Exact type match (required, already filtered)
        score += 5
        # Subtype match
        if c.event_subtype == new_event.subtype: score += 3
        # Same sector
        if c.sector == new_event.sector: score += 3
        # Similar market cap tier
        if c.market_cap_tier == new_event.market_cap_tier: score += 2
        # Similar macro regime
        if c.market_regime == new_event.market_regime: score += 2
        # Similar VIX environment (within 5 points)
        if abs(c.vix - new_event.vix) < 5: score += 1
        # Similar rate environment (within 0.5%)
        if abs(c.treasury_10y - new_event.treasury_10y) < 0.5: score += 1
        # Similar pre-event momentum (both up or both down in last 30d)
        if same_sign(c.return_30d, new_event.return_30d): score += 1
        # Recency bonus (more recent events slightly preferred)
        if c.event_date > 2_years_ago: score += 1
    
    return sorted(candidates, key=lambda c: c.score, reverse=True)[:limit]
```

---

## What Users See (Message Format)

After the analysis pipeline runs, the user receives something like:

```
🔴 NVDA — Restructuring: 12% Workforce Reduction

NVIDIA announced a $2.1B restructuring charge with 12% layoff.
Forward guidance maintained. $15B buyback authorized.

📊 Historical Pattern (47 similar events):
• Tech mega-cap restructurings: +18% avg alpha over 20 days (72% win rate)
• With maintained guidance + buyback: +24% avg (83% win rate)
• Current setup closest to: META Nov 2022 (+89% in 6 months)

⚡ Key insight: Market typically sells off T+0 (-3%), then reverses 
as "efficiency narrative" takes hold. Best entry: T+2 to T+3 after 
initial panic.

⚠️ Watch for: Next earnings guidance confirmation. If guidance is 
cut at next report, pattern breaks.

Confidence: HIGH (based on 47 cases, strong sector match)
```

This is what separates us from "SEC 8-K filed" alerts.

---

## Estimated Scale

| Phase | Events | Tables Size | Timeline |
|-------|--------|-------------|----------|
| Bootstrap (50 tickers, 2020-2026) | ~2,000 | ~100 MB | 1-2 weeks |
| +S&P 500 coverage | ~10,000 | ~500 MB | 1 month |
| +1 year real-time | ~15,000 | ~750 MB | Ongoing |
| +3 years real-time | ~30,000 | ~1.5 GB | Ongoing |

Tiny by database standards. A single PostgreSQL instance handles this trivially.

---

## Open Questions

1. **Intraday data** — Store 5-min bars for event day? Useful for precise gap/reaction analysis but 10x more data. Defer to Phase 2?

2. **Earnings transcripts** — Key quotes from earnings calls are incredibly valuable for "what guidance said" context. Store as `event_sources` or separate `transcript_excerpts` table?

3. **Sentiment data** — Twitter/Reddit/StockTwits sentiment around event time. Hard to get historically. Build forward-only from our scanners?

4. **Options IV** — Historical implied volatility is expensive (CBOE/IVolatility). Skip for bootstrap, add for real-time events?

5. **Non-US events** — Geopolitical events happen outside US market hours. How to handle reference price when multiple sessions are involved?

6. **Event dedup across sources** — Same event reported by SEC, Reuters, and CNBC. How aggressively do we deduplicate? Keep as separate sources linked to one event?
