import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  decimal,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  bigint,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// Layer 1: Companies & Identifiers
// ============================================================================

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sector: text('sector'),
  industry: text('industry'),
  country: text('country').default('US'),
  cik: text('cik'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tickerHistory = pgTable(
  'ticker_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    ticker: text('ticker').notNull(),
    exchange: text('exchange'),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    changeReason: text('change_reason'),
  },
  (table) => [
    index('idx_th_ticker').on(table.ticker),
    index('idx_th_company').on(table.companyId),
  ],
);

export const stockSplits = pgTable(
  'stock_splits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    splitDate: date('split_date').notNull(),
    ratioFrom: integer('ratio_from').notNull(),
    ratioTo: integer('ratio_to').notNull(),
    splitType: text('split_type').notNull(),
    adjustmentFactor: decimal('adjustment_factor', { precision: 10, scale: 6 }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_ss_company_date').on(table.companyId, table.splitDate),
  ],
);

// ============================================================================
// Layer 2: Events + Sources
// ============================================================================

export const historicalEvents = pgTable(
  'historical_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

    // Timing
    eventTs: timestamp('event_ts', { withTimezone: true }).notNull(),
    marketSession: text('market_session'),

    // Timestamp quality
    eventTsPrecision: text('event_ts_precision').notNull().default('day_only'),
    eventTsSource: text('event_ts_source'),
    eventTsVerified: boolean('event_ts_verified').default(false),

    // Classification
    eventCategory: text('event_category').notNull(),
    eventType: text('event_type').notNull(),
    eventSubtype: text('event_subtype'),
    severity: text('severity').notNull().default('medium'),

    // Content
    headline: text('headline').notNull(),
    description: text('description'),

    // Primary company
    companyId: uuid('company_id').references(() => companies.id),
    tickerAtTime: text('ticker_at_time'),

    // Tags
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    // Collection metadata
    collectionTier: text('collection_tier').default('full'),
    bootstrapBatch: text('bootstrap_batch'),
  },
  (table) => [
    index('idx_he_company').on(table.companyId),
    index('idx_he_ticker').on(table.tickerAtTime),
    index('idx_he_type').on(table.eventCategory, table.eventType),
    index('idx_he_ts').on(table.eventTs),
    index('idx_he_severity').on(table.severity),
  ],
);

export const eventParticipants = pgTable(
  'event_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => historicalEvents.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').references(() => companies.id),
    entityName: text('entity_name').notNull(),
    entityType: text('entity_type').notNull(),
    role: text('role').notNull(),
    tickerAtTime: text('ticker_at_time'),
  },
  (table) => [
    index('idx_ep_event').on(table.eventId),
    index('idx_ep_company').on(table.companyId),
    uniqueIndex('idx_ep_unique').on(table.eventId, table.entityName, table.role),
  ],
);

export const eventSources = pgTable(
  'event_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => historicalEvents.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').notNull(),
    sourceName: text('source_name'),
    sourceUrl: text('source_url'),
    sourceNativeId: text('source_native_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow(),
    extractionMethod: text('extraction_method'),
    confidence: decimal('confidence', { precision: 3, scale: 2 }),
  },
  (table) => [
    index('idx_es_event').on(table.eventId),
  ],
);

// ============================================================================
// Layer 2b: Typed Event Metrics
// ============================================================================

export const metricsEarnings = pgTable('metrics_earnings', {
  eventId: uuid('event_id')
    .primaryKey()
    .references(() => historicalEvents.id, { onDelete: 'cascade' }),
  fiscalQuarter: text('fiscal_quarter'),
  epsActual: decimal('eps_actual', { precision: 8, scale: 3 }),
  epsEstimate: decimal('eps_estimate', { precision: 8, scale: 3 }),
  epsSurprisePct: decimal('eps_surprise_pct', { precision: 6, scale: 2 }),
  revenueActualM: decimal('revenue_actual_m', { precision: 12, scale: 2 }),
  revenueEstimateM: decimal('revenue_estimate_m', { precision: 12, scale: 2 }),
  revenueSurprisePct: decimal('revenue_surprise_pct', { precision: 6, scale: 2 }),
  guidanceDirection: text('guidance_direction'),
  guidanceDetail: text('guidance_detail'),
  consecutiveBeats: integer('consecutive_beats'),
  yoyRevenueGrowth: decimal('yoy_revenue_growth', { precision: 6, scale: 2 }),
  yoyEpsGrowth: decimal('yoy_eps_growth', { precision: 6, scale: 2 }),
});

export const metricsRestructuring = pgTable('metrics_restructuring', {
  eventId: uuid('event_id')
    .primaryKey()
    .references(() => historicalEvents.id, { onDelete: 'cascade' }),
  headcountReductionPct: decimal('headcount_reduction_pct', { precision: 5, scale: 2 }),
  headcountReductionAbs: integer('headcount_reduction_abs'),
  restructuringChargeM: decimal('restructuring_charge_m', { precision: 10, scale: 2 }),
  segmentsAffected: text('segments_affected').array(),
  guidanceMaintained: boolean('guidance_maintained'),
  buybackAnnounced: boolean('buyback_announced'),
});

export const metricsMna = pgTable('metrics_mna', {
  eventId: uuid('event_id')
    .primaryKey()
    .references(() => historicalEvents.id, { onDelete: 'cascade' }),
  dealValueM: decimal('deal_value_m', { precision: 12, scale: 2 }),
  premiumPct: decimal('premium_pct', { precision: 6, scale: 2 }),
  paymentType: text('payment_type'),
  expectedClose: date('expected_close'),
  competingBids: integer('competing_bids').default(0),
  regulatoryRisk: text('regulatory_risk'),
});

export const metricsFda = pgTable('metrics_fda', {
  eventId: uuid('event_id')
    .primaryKey()
    .references(() => historicalEvents.id, { onDelete: 'cascade' }),
  drugName: text('drug_name'),
  indication: text('indication'),
  actionType: text('action_type'),
  pdufaDate: date('pdufa_date'),
  adcomVoteFor: integer('adcom_vote_for'),
  adcomVoteAgainst: integer('adcom_vote_against'),
  marketSizeEstM: decimal('market_size_est_m', { precision: 10, scale: 2 }),
  competitionLevel: text('competition_level'),
});

export const metricsMacro = pgTable('metrics_macro', {
  eventId: uuid('event_id')
    .primaryKey()
    .references(() => historicalEvents.id, { onDelete: 'cascade' }),
  indicator: text('indicator').notNull(),
  actualValue: decimal('actual_value', { precision: 10, scale: 4 }),
  forecastValue: decimal('forecast_value', { precision: 10, scale: 4 }),
  previousValue: decimal('previous_value', { precision: 10, scale: 4 }),
  surpriseDirection: text('surprise_direction'),
  releaseTs: timestamp('release_ts', { withTimezone: true }),
  fredSeriesId: text('fred_series_id'),
});

export const metricsOther = pgTable('metrics_other', {
  eventId: uuid('event_id')
    .primaryKey()
    .references(() => historicalEvents.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').notNull().default({}),
});

// ============================================================================
// Layer 3: Context Snapshots
// ============================================================================

export const eventMarketContext = pgTable('event_market_context', {
  eventId: uuid('event_id')
    .primaryKey()
    .references(() => historicalEvents.id, { onDelete: 'cascade' }),

  // Broad market
  spyClose: decimal('spy_close', { precision: 10, scale: 2 }),
  spyChangePct: decimal('spy_change_pct', { precision: 6, scale: 3 }),
  qqqChangePct: decimal('qqq_change_pct', { precision: 6, scale: 3 }),
  iwmChangePct: decimal('iwm_change_pct', { precision: 6, scale: 3 }),

  // Volatility
  vixClose: decimal('vix_close', { precision: 6, scale: 2 }),
  vixPercentile1y: decimal('vix_percentile_1y', { precision: 5, scale: 2 }),

  // Rates
  treasury10y: decimal('treasury_10y', { precision: 5, scale: 3 }),
  treasury2y: decimal('treasury_2y', { precision: 5, scale: 3 }),
  yieldCurve2s10s: decimal('yield_curve_2s10s', { precision: 5, scale: 3 }),
  fedFundsRate: decimal('fed_funds_rate', { precision: 5, scale: 3 }),

  // Inflation
  latestCpiYoy: decimal('latest_cpi_yoy', { precision: 5, scale: 2 }),
  latestCoreCpi: decimal('latest_core_cpi', { precision: 5, scale: 2 }),

  // FOMC proximity
  daysToNextFomc: integer('days_to_next_fomc'),
  daysFromLastFomc: integer('days_from_last_fomc'),

  // Sector
  sectorEtfTicker: text('sector_etf_ticker'),
  sectorEtfChange: decimal('sector_etf_change', { precision: 6, scale: 3 }),
  sectorEtf30d: decimal('sector_etf_30d', { precision: 6, scale: 3 }),

  // Regime
  marketRegime: text('market_regime'),
  regimeMethod: text('regime_method').default('sma_cross'),
});

export const eventStockContext = pgTable('event_stock_context', {
  eventId: uuid('event_id')
    .primaryKey()
    .references(() => historicalEvents.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),

  // Prices
  priceAtEvent: decimal('price_at_event', { precision: 10, scale: 2 }).notNull(),
  rawPriceAtEvent: decimal('raw_price_at_event', { precision: 10, scale: 2 }),
  price30dAgo: decimal('price_30d_ago', { precision: 10, scale: 2 }),
  price90dAgo: decimal('price_90d_ago', { precision: 10, scale: 2 }),
  high52w: decimal('high_52w', { precision: 10, scale: 2 }),
  low52w: decimal('low_52w', { precision: 10, scale: 2 }),

  // Derived
  return30d: decimal('return_30d', { precision: 6, scale: 3 }),
  return90d: decimal('return_90d', { precision: 6, scale: 3 }),
  distanceFrom52wHigh: decimal('distance_from_52w_high', { precision: 6, scale: 3 }),
  distanceFrom52wLow: decimal('distance_from_52w_low', { precision: 6, scale: 3 }),

  // Market cap
  marketCapB: decimal('market_cap_b', { precision: 10, scale: 2 }),
  marketCapMethod: text('market_cap_method').default('price_x_shares'),
  marketCapTier: text('market_cap_tier'),

  // Technicals
  rsi14: decimal('rsi_14', { precision: 5, scale: 2 }),
  above50ma: boolean('above_50ma'),
  above200ma: boolean('above_200ma'),
  avgVolume20d: bigint('avg_volume_20d', { mode: 'number' }),

  // Earnings proximity
  daysSinceLastEarnings: integer('days_since_last_earnings'),
  daysToNextEarnings: integer('days_to_next_earnings'),
  lastEarningsSurprisePct: decimal('last_earnings_surprise_pct', { precision: 6, scale: 2 }),

  // Data quality
  pitCompleteness: text('pit_completeness').default('full'),
});

// ============================================================================
// Layer 4: Price Impact & Returns
// ============================================================================

export const eventReturns = pgTable(
  'event_returns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => historicalEvents.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    tickerAtTime: text('ticker_at_time').notNull(),

    // Reference price
    refPrice: decimal('ref_price', { precision: 10, scale: 2 }).notNull(),
    refPriceType: text('ref_price_type').notNull(),
    refPriceDate: date('ref_price_date').notNull(),

    // Raw returns
    returnT0: decimal('return_t0', { precision: 6, scale: 3 }),
    returnT1: decimal('return_t1', { precision: 6, scale: 3 }),
    returnT3: decimal('return_t3', { precision: 6, scale: 3 }),
    returnT5: decimal('return_t5', { precision: 6, scale: 3 }),
    returnT10: decimal('return_t10', { precision: 6, scale: 3 }),
    returnT20: decimal('return_t20', { precision: 6, scale: 3 }),
    returnT60: decimal('return_t60', { precision: 6, scale: 3 }),

    // SPY benchmark
    spyReturnT0: decimal('spy_return_t0', { precision: 6, scale: 3 }),
    spyReturnT1: decimal('spy_return_t1', { precision: 6, scale: 3 }),
    spyReturnT3: decimal('spy_return_t3', { precision: 6, scale: 3 }),
    spyReturnT5: decimal('spy_return_t5', { precision: 6, scale: 3 }),
    spyReturnT10: decimal('spy_return_t10', { precision: 6, scale: 3 }),
    spyReturnT20: decimal('spy_return_t20', { precision: 6, scale: 3 }),
    spyReturnT60: decimal('spy_return_t60', { precision: 6, scale: 3 }),

    // Alpha
    alphaT0: decimal('alpha_t0', { precision: 6, scale: 3 }),
    alphaT1: decimal('alpha_t1', { precision: 6, scale: 3 }),
    alphaT3: decimal('alpha_t3', { precision: 6, scale: 3 }),
    alphaT5: decimal('alpha_t5', { precision: 6, scale: 3 }),
    alphaT10: decimal('alpha_t10', { precision: 6, scale: 3 }),
    alphaT20: decimal('alpha_t20', { precision: 6, scale: 3 }),
    alphaT60: decimal('alpha_t60', { precision: 6, scale: 3 }),

    // Sector alpha
    sectorBenchmark: text('sector_benchmark'),
    sectorAlphaT5: decimal('sector_alpha_t5', { precision: 6, scale: 3 }),
    sectorAlphaT20: decimal('sector_alpha_t20', { precision: 6, scale: 3 }),

    // Gap & extremes
    overnightGapPct: decimal('overnight_gap_pct', { precision: 6, scale: 3 }),
    maxDrawdownPct: decimal('max_drawdown_pct', { precision: 6, scale: 3 }),
    maxDrawdownDay: integer('max_drawdown_day'),
    maxRunupPct: decimal('max_runup_pct', { precision: 6, scale: 3 }),
    maxRunupDay: integer('max_runup_day'),

    // Volume
    volumeEventDay: bigint('volume_event_day', { mode: 'number' }),
    volumeAvg20d: bigint('volume_avg_20d', { mode: 'number' }),
    volumeRatio: decimal('volume_ratio', { precision: 6, scale: 2 }),

    // Outcome
    outcomeT20: text('outcome_t20'),

    // Terminal status
    terminalStatus: text('terminal_status').default('normal'),
    terminalDate: date('terminal_date'),
    terminalPrice: decimal('terminal_price', { precision: 10, scale: 2 }),
    terminalNote: text('terminal_note'),

    // Return eligibility
    t0Eligible: boolean('t0_eligible').default(true),

    // Methodology
    calcVersion: integer('calc_version').default(1),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_er_event').on(table.eventId),
    index('idx_er_ticker').on(table.tickerAtTime),
    index('idx_er_outcome').on(table.outcomeT20),
    uniqueIndex('idx_er_unique').on(table.eventId, table.companyId, table.calcVersion),
  ],
);

// ============================================================================
// Layer 4b: Peer Impact
// ============================================================================

export const eventPeerImpact = pgTable(
  'event_peer_impact',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => historicalEvents.id, { onDelete: 'cascade' }),
    peerTicker: text('peer_ticker').notNull(),
    peerCompanyId: uuid('peer_company_id').references(() => companies.id),
    relationship: text('relationship'),

    returnT0: decimal('return_t0', { precision: 6, scale: 3 }),
    returnT5: decimal('return_t5', { precision: 6, scale: 3 }),
    returnT20: decimal('return_t20', { precision: 6, scale: 3 }),
    alphaT0: decimal('alpha_t0', { precision: 6, scale: 3 }),
    alphaT5: decimal('alpha_t5', { precision: 6, scale: 3 }),
    alphaT20: decimal('alpha_t20', { precision: 6, scale: 3 }),
  },
  (table) => [
    uniqueIndex('idx_epi_unique').on(table.eventId, table.peerTicker),
  ],
);

// ============================================================================
// Layer 5: AI Analysis
// ============================================================================

export const eventAnalysis = pgTable(
  'event_analysis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => historicalEvents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    modelUsed: text('model_used').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),

    // Causal narrative
    marketReactionWhy: text('market_reaction_why').notNull(),
    whatWasPricedIn: text('what_was_priced_in'),
    whatSurprised: text('what_surprised'),
    narrativeShift: text('narrative_shift'),

    // Pattern
    patternName: text('pattern_name'),
    counterIntuitive: boolean('counter_intuitive').default(false),
    counterIntuitiveWhy: text('counter_intuitive_why'),

    // Lessons
    keyVariables: text('key_variables').array(),
    lessonLearned: text('lesson_learned').notNull(),
    adviceForSimilar: text('advice_for_similar'),

    // Hindsight
    hindsightOptimalEntry: text('hindsight_optimal_entry'),
    hindsightOptimalExit: text('hindsight_optimal_exit'),
    hindsightCommonMistake: text('hindsight_common_mistake'),

    // Quality
    analysisConfidence: text('analysis_confidence').default('medium'),
    dataCompleteness: text('data_completeness').default('full'),
  },
  (table) => [
    index('idx_ea_event').on(table.eventId),
    index('idx_ea_pattern').on(table.patternName),
    uniqueIndex('idx_ea_unique').on(table.eventId, table.version),
  ],
);

// ============================================================================
// Layer 5b: Event Chains
// ============================================================================

export const eventChains = pgTable('event_chains', {
  id: uuid('id').primaryKey().defaultRandom(),
  chainName: text('chain_name').notNull(),
  chainType: text('chain_type'),
  status: text('status').default('active'),
  description: text('description'),
  outcomeSummary: text('outcome_summary'),
  totalReturn: decimal('total_return', { precision: 6, scale: 3 }),
  totalAlpha: decimal('total_alpha', { precision: 6, scale: 3 }),
  durationDays: integer('duration_days'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const eventChainMembers = pgTable(
  'event_chain_members',
  {
    chainId: uuid('chain_id')
      .notNull()
      .references(() => eventChains.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => historicalEvents.id, { onDelete: 'cascade' }),
    sequenceOrder: integer('sequence_order').notNull(),
    roleInChain: text('role_in_chain'),
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.eventId] }),
    uniqueIndex('idx_ecm_order').on(table.chainId, table.sequenceOrder),
  ],
);

// ============================================================================
// Layer 6: Patterns & Coverage
// ============================================================================

export const eventTypePatterns = pgTable(
  'event_type_patterns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type').notNull(),
    eventSubtype: text('event_subtype'),
    sector: text('sector'),
    marketCapTier: text('market_cap_tier'),

    sampleSize: integer('sample_size').notNull(),
    dateRangeStart: date('date_range_start'),
    dateRangeEnd: date('date_range_end'),

    // Stats
    avgAlphaT5: decimal('avg_alpha_t5', { precision: 6, scale: 3 }),
    avgAlphaT20: decimal('avg_alpha_t20', { precision: 6, scale: 3 }),
    avgAlphaT60: decimal('avg_alpha_t60', { precision: 6, scale: 3 }),
    medianAlphaT20: decimal('median_alpha_t20', { precision: 6, scale: 3 }),
    stdDevAlphaT20: decimal('std_dev_alpha_t20', { precision: 6, scale: 3 }),
    winRateT5: decimal('win_rate_t5', { precision: 5, scale: 3 }),
    winRateT20: decimal('win_rate_t20', { precision: 5, scale: 3 }),

    bestCaseEventId: uuid('best_case_event_id').references(() => historicalEvents.id),
    worstCaseEventId: uuid('worst_case_event_id').references(() => historicalEvents.id),

    typicalPattern: text('typical_pattern'),
    keyDifferentiators: text('key_differentiators'),

    calcVersion: integer('calc_version').default(1),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [],
);

export const backfillCoverage = pgTable(
  'backfill_coverage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id),
    ticker: text('ticker'),
    sourceType: text('source_type').notNull(),
    dateFrom: date('date_from').notNull(),
    dateTo: date('date_to').notNull(),
    scanCompleted: boolean('scan_completed').default(false),
    eventsFound: integer('events_found').default(0),
    scannedAt: timestamp('scanned_at', { withTimezone: true }).defaultNow(),
    notes: text('notes'),
  },
  (table) => [
    index('idx_bc_company').on(table.companyId),
    index('idx_bc_source').on(table.sourceType),
  ],
);
