import {
  MarketDataError,
  type MarketDataProvider,
  type MarketQuote,
} from '../market-data-provider.js';

interface AlphaVantageDailyRecord {
  '4. close'?: string;
  '5. adjusted close'?: string;
  '6. volume'?: string;
}

interface AlphaVantageDailyResponse {
  Note?: string;
  Information?: string;
  'Error Message'?: string;
  'Meta Data'?: {
    '2. Symbol'?: string;
  };
  'Time Series (Daily)'?: Record<string, AlphaVantageDailyRecord>;
}

interface DailyBar {
  date: Date;
  close: number;
  volume: number;
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 1_000;
const RSI_PERIOD = 14;
const DAYS_IN_52_WEEKS = 252;
const VOLUME_LOOKBACK = 20;

export class AlphaVantageMarketDataProvider implements MarketDataProvider {
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;
  private readonly maxRetries: number;
  private readonly backoffMs: number;

  constructor(options: {
    apiKey: string;
    fetchFn?: typeof fetch;
    maxRetries?: number;
    backoffMs?: number;
  }) {
    if (!options.apiKey) {
      throw new MarketDataError('Alpha Vantage API key is required', 'api_error');
    }

    this.apiKey = options.apiKey;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const bars = await this.fetchDailySeries(symbol);
    return buildQuote(symbol, bars);
  }

  async getIndicators(symbol: string): Promise<Partial<MarketQuote>> {
    return this.getQuote(symbol);
  }

  private async fetchDailySeries(symbol: string): Promise<DailyBar[]> {
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      const response = await this.requestDailySeries(symbol);

      if (isRateLimitedResponse(response)) {
        if (attempt === this.maxRetries) {
          throw new MarketDataError('Alpha Vantage rate limit exceeded', 'rate_limit');
        }

        attempt += 1;
        await sleep(this.backoffMs * attempt);
        continue;
      }

      if (response['Error Message']) {
        throw new MarketDataError(response['Error Message'], 'api_error');
      }

      return parseDailySeries(response);
    }

    throw new MarketDataError('Alpha Vantage rate limit exceeded', 'rate_limit');
  }

  private async requestDailySeries(symbol: string): Promise<AlphaVantageDailyResponse> {
    const url = new URL('https://www.alphavantage.co/query');
    url.searchParams.set('function', 'TIME_SERIES_DAILY_ADJUSTED');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('outputsize', 'full');
    url.searchParams.set('apikey', this.apiKey);

    const response = await this.fetchFn(url.toString(), {
      headers: {
        'User-Agent': 'event-radar/1.0',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new MarketDataError(
        `Alpha Vantage API returned ${response.status}`,
        response.status === 429 ? 'rate_limit' : 'api_error',
      );
    }

    const json = (await response.json()) as unknown;
    if (!isObject(json)) {
      throw new MarketDataError('Malformed Alpha Vantage response: expected object', 'parse_error');
    }

    return json as AlphaVantageDailyResponse;
  }
}

function parseDailySeries(response: AlphaVantageDailyResponse): DailyBar[] {
  const series = response['Time Series (Daily)'];
  if (!series || !isObject(series)) {
    throw new MarketDataError('Malformed Alpha Vantage response: missing daily time series', 'parse_error');
  }

  const bars = Object.entries(series).map(([date, record]) => {
    if (!record || !isObject(record)) {
      throw new MarketDataError('Malformed Alpha Vantage response: invalid daily record', 'parse_error');
    }

    const close = parseFiniteNumber(
      record['5. adjusted close'] ?? record['4. close'],
      'close',
    );
    const volume = parseFiniteNumber(record['6. volume'], 'volume');
    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new MarketDataError('Malformed Alpha Vantage response: invalid date', 'parse_error');
    }

    return {
      date: parsedDate,
      close,
      volume,
    };
  });

  if (bars.length === 0) {
    throw new MarketDataError('Malformed Alpha Vantage response: empty daily time series', 'parse_error');
  }

  return bars.sort((left, right) => left.date.getTime() - right.date.getTime());
}

function parseFiniteNumber(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new MarketDataError(
      `Malformed Alpha Vantage response: invalid ${fieldName}`,
      'parse_error',
    );
  }

  return parsed;
}

function buildQuote(symbol: string, bars: DailyBar[]): MarketQuote {
  const latest = bars.at(-1);
  if (!latest) {
    throw new MarketDataError('Malformed Alpha Vantage response: empty daily time series', 'parse_error');
  }

  const trailing52Weeks = bars.slice(-Math.min(DAYS_IN_52_WEEKS, bars.length));
  const closes = bars.map((bar) => bar.close);

  return {
    symbol,
    price: roundMetric(latest.close),
    change1d: computePercentChange(bars, 1),
    change5d: computePercentChange(bars, 5),
    change20d: computePercentChange(bars, 20),
    volumeRatio: computeVolumeRatio(bars),
    rsi14: computeRsi14(bars),
    high52w: roundMetric(Math.max(...trailing52Weeks.map((bar) => bar.close))),
    low52w: roundMetric(Math.min(...trailing52Weeks.map((bar) => bar.close))),
    support: roundMetric(Math.min(...closes)),
    resistance: roundMetric(Math.max(...closes)),
  };
}

function computePercentChange(bars: DailyBar[], lookback: number): number {
  const latestIndex = bars.length - 1;
  const baseIndex = Math.max(0, latestIndex - lookback);
  const latest = bars[latestIndex];
  const base = bars[baseIndex];

  if (!latest || !base || base.close === 0) {
    return 0;
  }

  return roundMetric(((latest.close - base.close) / base.close) * 100);
}

function computeVolumeRatio(bars: DailyBar[]): number {
  const latest = bars.at(-1);
  if (!latest || bars.length === 1) {
    return 1;
  }

  const startIndex = Math.max(0, bars.length - 1 - VOLUME_LOOKBACK);
  const baseline = bars.slice(startIndex, -1);
  const averageVolume = baseline.reduce((sum, bar) => sum + bar.volume, 0) / baseline.length;

  if (!Number.isFinite(averageVolume) || averageVolume === 0) {
    return 1;
  }

  return roundMetric(latest.volume / averageVolume);
}

function computeRsi14(bars: DailyBar[]): number {
  if (bars.length < 2) {
    return 50;
  }

  const startIndex = Math.max(1, bars.length - RSI_PERIOD);
  let gains = 0;
  let losses = 0;
  let periods = 0;

  for (let index = startIndex; index < bars.length; index++) {
    const current = bars[index];
    const previous = bars[index - 1];
    if (!current || !previous) {
      continue;
    }

    const delta = current.close - previous.close;
    if (delta > 0) {
      gains += delta;
    } else if (delta < 0) {
      losses += Math.abs(delta);
    }
    periods += 1;
  }

  if (periods === 0) {
    return 50;
  }

  const averageGain = gains / periods;
  const averageLoss = losses / periods;

  if (averageLoss === 0 && averageGain === 0) {
    return 50;
  }

  if (averageLoss === 0) {
    return 100;
  }

  if (averageGain === 0) {
    return 0;
  }

  const relativeStrength = averageGain / averageLoss;
  return roundMetric(100 - (100 / (1 + relativeStrength)));
}

function isRateLimitedResponse(response: AlphaVantageDailyResponse): boolean {
  return typeof response.Note === 'string' || typeof response.Information === 'string';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
