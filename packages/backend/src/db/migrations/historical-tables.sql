-- Historical Event Database — Phase 0 Migration
-- Run against existing event_radar database (additive, no conflicts with existing tables)
-- Requires: PostgreSQL 14+ (for gen_random_uuid, EXCLUDE USING gist with btree_gist)

-- Required extension for EXCLUDE constraint on ticker_history
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================================
-- Layer 1: Companies & Identifiers
-- ============================================================================

CREATE TABLE IF NOT EXISTS companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  sector          TEXT,
  industry        TEXT,
  country         TEXT DEFAULT 'US',
  cik             TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticker_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  ticker          TEXT NOT NULL,
  exchange        TEXT,
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  change_reason   TEXT,

  CONSTRAINT no_overlap EXCLUDE USING gist (
    company_id WITH =,
    daterange(effective_from, COALESCE(effective_to, '9999-12-31'), '[]') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS idx_th_ticker ON ticker_history(ticker);
CREATE INDEX IF NOT EXISTS idx_th_company ON ticker_history(company_id);

CREATE TABLE IF NOT EXISTS stock_splits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  split_date      DATE NOT NULL,
  ratio_from      INT NOT NULL,
  ratio_to        INT NOT NULL,
  split_type      TEXT NOT NULL,
  adjustment_factor DECIMAL(10,6) NOT NULL,

  UNIQUE(company_id, split_date)
);

-- ============================================================================
-- Layer 2: Events + Sources
-- ============================================================================

CREATE TABLE IF NOT EXISTS historical_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Timing
  event_ts          TIMESTAMPTZ NOT NULL,
  market_session    TEXT,

  -- Timestamp quality
  event_ts_precision TEXT NOT NULL DEFAULT 'day_only',
  event_ts_source   TEXT,
  event_ts_verified BOOLEAN DEFAULT FALSE,

  -- Classification
  event_category    TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  event_subtype     TEXT,
  severity          TEXT NOT NULL DEFAULT 'medium',

  -- Content
  headline          TEXT NOT NULL,
  description       TEXT,

  -- Primary company
  company_id        UUID REFERENCES companies(id),
  ticker_at_time    TEXT,

  -- Tags
  tags              TEXT[] NOT NULL DEFAULT '{}',

  -- Collection metadata
  collection_tier   TEXT DEFAULT 'full',
  bootstrap_batch   TEXT,

  CONSTRAINT valid_severity CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT valid_session CHECK (market_session IN ('pre_market', 'regular', 'after_hours', 'overnight', 'weekend')),
  CONSTRAINT valid_precision CHECK (event_ts_precision IN ('second', 'minute', 'hour', 'day_session', 'day_only'))
);

CREATE INDEX IF NOT EXISTS idx_he_company ON historical_events(company_id);
CREATE INDEX IF NOT EXISTS idx_he_ticker ON historical_events(ticker_at_time);
CREATE INDEX IF NOT EXISTS idx_he_type ON historical_events(event_category, event_type);
CREATE INDEX IF NOT EXISTS idx_he_ts ON historical_events(event_ts);
CREATE INDEX IF NOT EXISTS idx_he_severity ON historical_events(severity);
CREATE INDEX IF NOT EXISTS idx_he_tags ON historical_events USING GIN(tags);

CREATE TABLE IF NOT EXISTS event_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES companies(id),
  entity_name     TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  role            TEXT NOT NULL,
  ticker_at_time  TEXT,

  UNIQUE(event_id, entity_name, role)
);

CREATE INDEX IF NOT EXISTS idx_ep_event ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_ep_company ON event_participants(company_id);

CREATE TABLE IF NOT EXISTS event_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  source_type     TEXT NOT NULL,
  source_name     TEXT,
  source_url      TEXT,
  source_native_id TEXT,
  published_at    TIMESTAMPTZ,
  ingested_at     TIMESTAMPTZ DEFAULT now(),
  extraction_method TEXT,
  confidence      DECIMAL(3,2)
);

CREATE INDEX IF NOT EXISTS idx_es_event ON event_sources(event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_es_dedup ON event_sources(event_id, source_native_id) WHERE source_native_id IS NOT NULL;

-- ============================================================================
-- Layer 2b: Typed Event Metrics
-- ============================================================================

CREATE TABLE IF NOT EXISTS metrics_earnings (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
  fiscal_quarter    TEXT,
  eps_actual        DECIMAL(8,3),
  eps_estimate      DECIMAL(8,3),
  eps_surprise_pct  DECIMAL(10,2),
  revenue_actual_m  DECIMAL(12,2),
  revenue_estimate_m DECIMAL(12,2),
  revenue_surprise_pct DECIMAL(10,2),
  guidance_direction TEXT,
  guidance_detail   TEXT,
  consecutive_beats INT,
  yoy_revenue_growth DECIMAL(10,2),
  yoy_eps_growth    DECIMAL(10,2)
);

CREATE TABLE IF NOT EXISTS metrics_restructuring (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
  headcount_reduction_pct  DECIMAL(5,2),
  headcount_reduction_abs  INT,
  restructuring_charge_m   DECIMAL(10,2),
  segments_affected        TEXT[],
  guidance_maintained      BOOLEAN,
  buyback_announced        BOOLEAN
);

CREATE TABLE IF NOT EXISTS metrics_mna (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
  deal_value_m      DECIMAL(12,2),
  premium_pct       DECIMAL(6,2),
  payment_type      TEXT,
  expected_close    DATE,
  competing_bids    INT DEFAULT 0,
  regulatory_risk   TEXT
);

CREATE TABLE IF NOT EXISTS metrics_fda (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
  drug_name         TEXT,
  indication        TEXT,
  action_type       TEXT,
  pdufa_date        DATE,
  adcom_vote_for    INT,
  adcom_vote_against INT,
  market_size_est_m DECIMAL(10,2),
  competition_level TEXT
);

CREATE TABLE IF NOT EXISTS metrics_macro (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
  indicator         TEXT NOT NULL,
  actual_value      DECIMAL(10,4),
  forecast_value    DECIMAL(10,4),
  previous_value    DECIMAL(10,4),
  surprise_direction TEXT,
  release_ts        TIMESTAMPTZ,
  fred_series_id    TEXT
);

CREATE TABLE IF NOT EXISTS metrics_other (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
  metrics           JSONB NOT NULL DEFAULT '{}'
);

-- ============================================================================
-- Layer 3: Context Snapshots
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_market_context (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,

  spy_close         DECIMAL(10,2),
  spy_change_pct    DECIMAL(6,3),
  qqq_change_pct    DECIMAL(6,3),
  iwm_change_pct    DECIMAL(6,3),

  vix_close         DECIMAL(6,2),
  vix_percentile_1y DECIMAL(5,2),

  treasury_10y      DECIMAL(5,3),
  treasury_2y       DECIMAL(5,3),
  yield_curve_2s10s DECIMAL(5,3),
  fed_funds_rate    DECIMAL(5,3),

  latest_cpi_yoy    DECIMAL(5,2),
  latest_core_cpi   DECIMAL(5,2),

  days_to_next_fomc INT,
  days_from_last_fomc INT,

  sector_etf_ticker TEXT,
  sector_etf_change DECIMAL(6,3),
  sector_etf_30d    DECIMAL(6,3),

  market_regime     TEXT,
  regime_method     TEXT DEFAULT 'sma_cross'
);

CREATE TABLE IF NOT EXISTS event_stock_context (
  event_id          UUID PRIMARY KEY REFERENCES historical_events(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES companies(id),

  price_at_event    DECIMAL(10,2) NOT NULL,
  raw_price_at_event DECIMAL(10,2),
  price_30d_ago     DECIMAL(10,2),
  price_90d_ago     DECIMAL(10,2),
  high_52w          DECIMAL(10,2),
  low_52w           DECIMAL(10,2),

  return_30d        DECIMAL(6,3),
  return_90d        DECIMAL(6,3),
  distance_from_52w_high DECIMAL(6,3),
  distance_from_52w_low  DECIMAL(6,3),

  market_cap_b      DECIMAL(10,2),
  market_cap_method TEXT DEFAULT 'price_x_shares',
  market_cap_tier   TEXT,

  rsi_14            DECIMAL(5,2),
  above_50ma        BOOLEAN,
  above_200ma       BOOLEAN,
  avg_volume_20d    BIGINT,

  days_since_last_earnings INT,
  days_to_next_earnings    INT,
  last_earnings_surprise_pct DECIMAL(6,2),

  pit_completeness  TEXT DEFAULT 'full'
);

-- ============================================================================
-- Layer 4: Price Impact & Returns
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_returns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES companies(id),
  ticker_at_time    TEXT NOT NULL,

  ref_price         DECIMAL(10,2) NOT NULL,
  ref_price_type    TEXT NOT NULL,
  ref_price_date    DATE NOT NULL,

  return_t0         DECIMAL(6,3),
  return_t1         DECIMAL(6,3),
  return_t3         DECIMAL(6,3),
  return_t5         DECIMAL(6,3),
  return_t10        DECIMAL(6,3),
  return_t20        DECIMAL(6,3),
  return_t60        DECIMAL(6,3),

  spy_return_t0     DECIMAL(6,3),
  spy_return_t1     DECIMAL(6,3),
  spy_return_t3     DECIMAL(6,3),
  spy_return_t5     DECIMAL(6,3),
  spy_return_t10    DECIMAL(6,3),
  spy_return_t20    DECIMAL(6,3),
  spy_return_t60    DECIMAL(6,3),

  alpha_t0          DECIMAL(6,3),
  alpha_t1          DECIMAL(6,3),
  alpha_t3          DECIMAL(6,3),
  alpha_t5          DECIMAL(6,3),
  alpha_t10         DECIMAL(6,3),
  alpha_t20         DECIMAL(6,3),
  alpha_t60         DECIMAL(6,3),

  sector_benchmark  TEXT,
  sector_alpha_t5   DECIMAL(6,3),
  sector_alpha_t20  DECIMAL(6,3),

  overnight_gap_pct DECIMAL(6,3),
  max_drawdown_pct  DECIMAL(6,3),
  max_drawdown_day  INT,
  max_runup_pct     DECIMAL(6,3),
  max_runup_day     INT,

  volume_event_day  BIGINT,
  volume_avg_20d    BIGINT,
  volume_ratio      DECIMAL(6,2),

  outcome_t20       TEXT,

  terminal_status   TEXT DEFAULT 'normal',
  terminal_date     DATE,
  terminal_price    DECIMAL(10,2),
  terminal_note     TEXT,

  t0_eligible       BOOLEAN DEFAULT TRUE,

  calc_version      INT DEFAULT 1,
  computed_at       TIMESTAMPTZ DEFAULT now(),

  UNIQUE(event_id, company_id, calc_version)
);

CREATE INDEX IF NOT EXISTS idx_er_event ON event_returns(event_id);
CREATE INDEX IF NOT EXISTS idx_er_ticker ON event_returns(ticker_at_time);
CREATE INDEX IF NOT EXISTS idx_er_outcome ON event_returns(outcome_t20);
CREATE INDEX IF NOT EXISTS idx_er_terminal ON event_returns(terminal_status) WHERE terminal_status != 'normal';

-- ============================================================================
-- Layer 4b: Peer Impact
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_peer_impact (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  peer_ticker     TEXT NOT NULL,
  peer_company_id UUID REFERENCES companies(id),
  relationship    TEXT,

  return_t0       DECIMAL(6,3),
  return_t5       DECIMAL(6,3),
  return_t20      DECIMAL(6,3),
  alpha_t0        DECIMAL(6,3),
  alpha_t5        DECIMAL(6,3),
  alpha_t20       DECIMAL(6,3),

  UNIQUE(event_id, peer_ticker)
);

-- ============================================================================
-- Layer 5: AI Analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_analysis (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  version           INT NOT NULL DEFAULT 1,
  model_used        TEXT NOT NULL,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  market_reaction_why    TEXT NOT NULL,
  what_was_priced_in     TEXT,
  what_surprised         TEXT,
  narrative_shift        TEXT,

  pattern_name           TEXT,
  counter_intuitive      BOOLEAN DEFAULT FALSE,
  counter_intuitive_why  TEXT,

  key_variables          TEXT[],
  lesson_learned         TEXT NOT NULL,
  advice_for_similar     TEXT,

  hindsight_optimal_entry TEXT,
  hindsight_optimal_exit  TEXT,
  hindsight_common_mistake TEXT,

  analysis_confidence    TEXT DEFAULT 'medium',
  data_completeness      TEXT DEFAULT 'full',

  UNIQUE(event_id, version)
);

CREATE INDEX IF NOT EXISTS idx_ea_event ON event_analysis(event_id);
CREATE INDEX IF NOT EXISTS idx_ea_pattern ON event_analysis(pattern_name);

-- ============================================================================
-- Layer 5b: Event Chains
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_chains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_name      TEXT NOT NULL,
  chain_type      TEXT,
  status          TEXT DEFAULT 'active',
  description     TEXT,
  outcome_summary TEXT,
  total_return    DECIMAL(6,3),
  total_alpha     DECIMAL(6,3),
  duration_days   INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_chain_members (
  chain_id        UUID NOT NULL REFERENCES event_chains(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES historical_events(id) ON DELETE CASCADE,
  sequence_order  INT NOT NULL,
  role_in_chain   TEXT,

  PRIMARY KEY (chain_id, event_id),
  UNIQUE(chain_id, sequence_order)
);

-- ============================================================================
-- Layer 6: Patterns & Coverage
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_type_patterns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT NOT NULL,
  event_subtype   TEXT,
  sector          TEXT,
  market_cap_tier TEXT,

  sample_size     INT NOT NULL,
  date_range_start DATE,
  date_range_end  DATE,

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_etp_unique ON event_type_patterns(
  event_type,
  COALESCE(event_subtype, ''),
  COALESCE(sector, ''),
  COALESCE(market_cap_tier, ''),
  calc_version
);

CREATE TABLE IF NOT EXISTS backfill_coverage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id),
  ticker          TEXT,
  source_type     TEXT NOT NULL,
  date_from       DATE NOT NULL,
  date_to         DATE NOT NULL,
  scan_completed  BOOLEAN DEFAULT FALSE,
  events_found    INT DEFAULT 0,
  scanned_at      TIMESTAMPTZ DEFAULT now(),
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_bc_company ON backfill_coverage(company_id);
CREATE INDEX IF NOT EXISTS idx_bc_source ON backfill_coverage(source_type);
