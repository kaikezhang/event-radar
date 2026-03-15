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

export interface EventDetailData {
  id: string;
  severity: string;
  source: string;
  sourceKey?: string;
  title: string;
  tickers: string[];
  time: string;
  url: string | null;
  aiAnalysis: {
    summary: string;
    impact: string | null;
    tickerDirections: TickerDirection[];
  };
  historicalPattern: {
    matchCount: number;
    confidence: string;
    avgMoveT5: number | null;
    avgMoveT20: number | null;
    winRate: number | null;
    similarEvents: SimilarEvent[];
  };
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

export interface ScorecardSummaryMetrics {
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

export interface ScorecardSummaryBucket extends ScorecardSummaryMetrics {
  bucket: string;
}

export interface ScorecardSummary {
  days: number | null;
  totals: ScorecardSummaryMetrics;
  actionBuckets: ScorecardSummaryBucket[];
  confidenceBuckets: ScorecardSummaryBucket[];
  sourceBuckets: ScorecardSummaryBucket[];
  eventTypeBuckets: ScorecardSummaryBucket[];
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
