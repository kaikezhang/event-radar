export interface MarketQuote {
  symbol: string;
  price: number;
  change1d: number;
  change5d: number;
  change20d: number;
  volumeRatio: number;
  rsi14: number;
  high52w: number;
  low52w: number;
  support: number;
  resistance: number;
}

export interface MarketDataProvider {
  getQuote(symbol: string): Promise<MarketQuote>;
  getIndicators(symbol: string): Promise<Partial<MarketQuote>>;
}

export class MarketDataError extends Error {
  constructor(
    message: string,
    public readonly code: 'api_error' | 'rate_limit' | 'parse_error' = 'api_error',
  ) {
    super(message);
    this.name = 'MarketDataError';
  }
}
