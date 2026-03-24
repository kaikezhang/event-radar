export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface AlertSummary {
  id: string;
  severity: string;
  source: string;
  sourceKey?: string;
  title: string;
  summary: string;
  tickers: string[];
  time: string;
  saved?: boolean;
  direction?: string;
  confidence?: number | null;
  confidenceBucket?: string | null;
  confirmationCount?: number;
  confirmedSources?: string[];
  sourceMetadata?: Record<string, unknown>;
  pushed?: boolean;
  deliveryChannels?: string[];
  /** Number of similar events deduplicated into this one (frontend-only) */
  dedupCount?: number;
  /** Additional source labels folded into this alert (frontend-only) */
  relatedSources?: string[];
  // Outcome/price data (from feed JOIN)
  eventPrice?: number | null;
  change1d?: number | null;
  change5d?: number | null;
  change20d?: number | null;
  price1d?: number | null;
  price5d?: number | null;
  price20d?: number | null;
}

export interface TickerDirection {
  symbol: string;
  direction: string;
  context: string;
}

export interface SimilarEvent {
  title: string;
  date: string;
  move: string;
  eventId?: string;
  ticker?: string | null;
  changeT5?: number | null;
}

export interface SimilarEventOutcomeStats {
  totalWithOutcomes: number;
  avgMoveT5: number | null;
  setupWorkedPct: number | null;
  bestOutcome: {
    ticker: string;
    changeT5: number;
    date: string | null;
  } | null;
  worstOutcome: {
    ticker: string;
    changeT5: number;
    date: string | null;
  } | null;
}

export interface EventMarketData {
  price: number;
  change1d: number;
  change5d: number;
  rsi14: number;
  volumeRatio: number;
  high52w?: number;
  low52w?: number;
}

export interface LlmEnrichment {
  summary: string | null;
  impact: string | null;
  whyNow: string | null;
  currentSetup: string | null;
  historicalContext: string | null;
  risks: string | null;
  action: string | null;
  tickers: EnrichmentTicker[];
  regimeContext: string | null;
  filingItems?: string[];
}

export interface EnrichmentTicker {
  symbol: string;
  direction: string;
  context?: string;
}

export interface HistoricalContext {
  patternLabel: string | null;
  confidence: string | null;
  matchCount: number;
  avgAlphaT5: number | null;
  avgAlphaT20: number | null;
  winRateT20: number | null;
  bestCase: { ticker: string; move: number } | null;
  worstCase: { ticker: string; move: number } | null;
  similarEvents: SimilarEvent[];
}

export interface EventDetailData {
  id: string;
  severity: string;
  source: string;
  sourceKey?: string;
  title: string;
  tickers: string[];
  time: string;
  url: string | null;
  rawExcerpt: string | null;
  sourceMetadata?: Record<string, unknown>;
  confirmationCount: number;
  confirmedSources: string[];
  provenance: Array<{
    id: string;
    source: string;
    title: string;
    receivedAt: string;
    url: string | null;
  }>;
  aiAnalysis: {
    summary: string;
    impact: string | null;
    tickerDirections: TickerDirection[];
  };
  marketData: EventMarketData | null;
  enrichment: LlmEnrichment | null;
  enrichmentFailed: boolean;
  historicalPattern: {
    matchCount: number;
    confidence: string;
    avgMoveT5: number | null;
    avgMoveT20: number | null;
    winRate: number | null;
    similarEvents: SimilarEvent[];
    patternSummary?: string;
    bestCase: { ticker: string; move: number } | null;
    worstCase: { ticker: string; move: number } | null;
    outcomeStats: SimilarEventOutcomeStats | null;
  };
  audit?: {
    outcome: string;
    stoppedAt: string;
    reason: string | null;
    confidence: number | null;
    historicalMatch: boolean | null;
    historicalConfidence: string | null;
    deliveryChannels: unknown;
    enrichedAt: string | null;
  } | null;
  scorecard?: EventScorecard | null;
  outcome?: EventOutcome | null;
}

export interface EventScorecardWindow {
  price: number | null;
  movePercent: number | null;
  evaluatedAt: string | null;
}

export interface EventScorecard {
  eventId: string;
  title: string;
  ticker: string | null;
  source: string;
  eventTimestamp: string;
  originalAlert: {
    actionLabel: string | null;
    signalLabel: string | null;
    direction: string | null;
    confidence: number | null;
    confidenceBucket: string | null;
    classifiedBy: string | null;
    classifiedAt: string | null;
    summary: string | null;
    thesis: {
      impact: string | null;
      whyNow: string | null;
      currentSetup: string | null;
      historicalContext: string | null;
      risks: string | null;
    };
  };
  outcome: {
    entryPrice: number | null;
    tPlus5: EventScorecardWindow;
    tPlus20: EventScorecardWindow;
    directionVerdict: string;
    setupVerdict: string;
  };
  notes: {
    summary: string;
    items: string[];
    verdictWindow: string | null;
  };
}

export interface EventOutcome {
  eventId: string;
  ticker: string;
  eventTime: string;
  eventPrice: number | null;
  price1d: number | null;
  priceT5: number | null;
  priceT20: number | null;
  change1d: number | null;
  changeT5: number | null;
  changeT20: number | null;
}

export interface TickerProfileData {
  symbol: string;
  name: string;
  eventCount: number;
  recentAlerts: AlertSummary[];
}

export type ChartRange = '1w' | '1m' | '3m' | '6m' | '1y';

export interface PriceCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceChartData {
  ticker: string;
  range: ChartRange;
  candles: PriceCandle[];
}

export interface PriceBatchQuote {
  price: number;
  change: number;
  changePercent: number;
}

export interface DailyBriefingData {
  date: string;
  totalEvents: number;
  bySeverity: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  topEvents: Array<{
    title: string;
    ticker: string | null;
    severity: string;
  }>;
  bySource: Record<string, number>;
  watchlistEvents: number;
}

export interface WatchlistItem {
  id: string;
  ticker: string;
  addedAt: string;
  notes?: string | null;
  name?: string | null;
  sectionId?: string | null;
  sortOrder?: number;
}

export interface WatchlistSection {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface CalendarEventItem {
  eventId: string;
  ticker: string | null;
  source: string;
  severity: string | null;
  title: string;
  reportDate: string;
  timeLabel: string | null;
  outcomeT5: number | null;
  historicalAvgMove: number | null;
}

export interface CalendarDateGroup {
  date: string;
  events: CalendarEventItem[];
}

export interface UpcomingCalendarResponse {
  earningsDataLimited: boolean;
  coverageNote?: string | null;
  dates: CalendarDateGroup[];
}

export interface FilterPreset {
  name: string;
  severities: string[];
  sources: string[];
  ticker?: string;
}

export interface ScorecardBucketSummary {
  bucket: string;
  totalAlerts: number;
  alertsWithUsableVerdicts: number;
  directionalCorrectCount: number;
  directionalHitRate: number | null;
  setupWorkedCount: number;
  setupWorkedRate: number | null;
  avgT5Move: number | null;
  avgT20Move: number | null;
  medianT20Move: number | null;
}

export interface ScorecardOverview {
  totalEvents: number;
  sourcesMonitored: number;
  eventsWithTickers: number;
  eventsWithPriceOutcomes: number;
}

export interface ScorecardSummary {
  days: number | null;
  overview: ScorecardOverview;
  totals: Omit<ScorecardBucketSummary, 'bucket'>;
  actionBuckets: ScorecardBucketSummary[];
  confidenceBuckets: ScorecardBucketSummary[];
  sourceBuckets: ScorecardBucketSummary[];
  eventTypeBuckets: ScorecardBucketSummary[];
}

export interface ScorecardSeverityBreakdownItem {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  count: number;
}
