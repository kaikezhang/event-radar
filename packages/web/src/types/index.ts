export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type SourceName =
  | 'SEC Filing'
  | 'Breaking News'
  | 'Federal Register'
  | 'StockTwits'
  | 'Reddit'
  | 'Press Release';

export interface AlertSummary {
  id: string;
  severity: Severity;
  source: SourceName;
  title: string;
  summary: string;
  tickers: string[];
  publishedAt: string;
  sourceUrl: string;
  saved?: boolean;
}

export interface MarketContextEntry {
  symbol: string;
  direction: 'up' | 'down' | 'flat';
  context: string;
}

export interface HistoricalPattern {
  matchRate: number;
  matchCount: number;
  averageMoveT5: number;
  averageMoveT20: number;
  winRate: number;
}

export interface SimilarEvent {
  id: string;
  symbol: string;
  title: string;
  occurredOn: string;
  severity: Severity;
}

export interface EventDetailData extends AlertSummary {
  aiSummary: string;
  marketContext: MarketContextEntry[];
  historicalPattern?: HistoricalPattern;
  similarEvents: SimilarEvent[];
}

export interface TickerQuickStat {
  label: string;
  value: string;
}

export interface TickerProfileData {
  symbol: string;
  name: string;
  price?: number;
  priceChangePercent?: number;
  recentEvents: AlertSummary[];
  stats: TickerQuickStat[];
}
