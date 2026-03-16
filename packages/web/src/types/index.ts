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
  confirmationCount?: number;
  confirmedSources?: string[];
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
}

export interface EventMarketData {
  price: number;
  change1d: number;
  change5d: number;
  rsi14: number;
  volumeRatio: number;
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
  historical: HistoricalContext | null;
  historicalPattern: {
    matchCount: number;
    confidence: string;
    avgMoveT5: number | null;
    avgMoveT20: number | null;
    winRate: number | null;
    similarEvents: SimilarEvent[];
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

export interface WatchlistItem {
  id: string;
  ticker: string;
  addedAt: string;
  notes?: string | null;
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

export interface ScorecardSummary {
  days: number | null;
  totals: Omit<ScorecardBucketSummary, 'bucket'>;
  actionBuckets: ScorecardBucketSummary[];
  confidenceBuckets: ScorecardBucketSummary[];
  sourceBuckets: ScorecardBucketSummary[];
  eventTypeBuckets: ScorecardBucketSummary[];
}
