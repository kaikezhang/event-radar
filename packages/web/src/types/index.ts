export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface AlertSummary {
  id: string;
  severity: string;
  source: string;
  title: string;
  summary: string;
  tickers: string[];
  time: string;
  saved?: boolean;
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
}

export interface TickerProfileData {
  symbol: string;
  name: string;
  eventCount: number;
  recentAlerts: AlertSummary[];
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
