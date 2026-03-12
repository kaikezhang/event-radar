import { randomUUID } from 'node:crypto';
import {
  BaseScanner,
  ok,
  err,
  type EventBus,
  type RawEvent,
  type Result,
} from '@event-radar/shared';
import { SeenIdBuffer } from './scraping/scrape-utils.js';

const POLL_INTERVAL_MS = 300_000; // 5 minutes
const MIN_PREMIUM = 100_000;
const UNUSUAL_VOL_OI_RATIO = 5;

export interface UnusualOption {
  id: string;
  ticker: string;
  strike: number;
  expiry: string;
  type: 'call' | 'put';
  premium: number;
  volume: number;
  openInterest: number;
  volOiRatio: number;
  tradeType: 'sweep' | 'block' | 'split';
}

export interface UnusualOptionsApiResponse {
  data: Array<{
    id: string;
    ticker: string;
    strike: number;
    expiry: string;
    option_type: string;
    premium: number;
    volume: number;
    open_interest: number;
    trade_type: string;
  }>;
}

/**
 * Parse unusual options API response into normalized UnusualOption objects.
 */
export function parseUnusualOptions(
  json: UnusualOptionsApiResponse,
): UnusualOption[] {
  if (!json?.data) return [];

  return json.data.map((item) => ({
    id: item.id,
    ticker: item.ticker.toUpperCase(),
    strike: item.strike,
    expiry: item.expiry,
    type: (item.option_type === 'put' ? 'put' : 'call') as 'call' | 'put',
    premium: item.premium,
    volume: item.volume,
    openInterest: item.open_interest,
    volOiRatio:
      item.open_interest > 0
        ? Math.round((item.volume / item.open_interest) * 100) / 100
        : 0,
    tradeType: (['sweep', 'block', 'split'].includes(item.trade_type)
      ? item.trade_type
      : 'block') as 'sweep' | 'block' | 'split',
  }));
}

/**
 * Determine if an option trade is significant based on premium and volume/OI ratio.
 */
export function isSignificantActivity(option: UnusualOption): boolean {
  return (
    option.premium >= MIN_PREMIUM || option.volOiRatio >= UNUSUAL_VOL_OI_RATIO
  );
}

/**
 * Infer bullish/bearish signal from an unusual options trade.
 */
export function inferSignal(
  option: UnusualOption,
): 'bullish' | 'bearish' | 'neutral' {
  if (option.type === 'call' && option.tradeType === 'sweep') return 'bullish';
  if (option.type === 'put' && option.tradeType === 'sweep') return 'bearish';
  if (option.type === 'call') return 'bullish';
  if (option.type === 'put') return 'bearish';
  return 'neutral';
}

export class UnusualOptionsScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500, 'options');
  /** Override for testing */
  public fetchFn: typeof fetch = (...args) => globalThis.fetch(...args);

  constructor(eventBus: EventBus) {
    super({
      name: 'unusual-options',
      source: 'unusual-options',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const response = await this.fetchFn(
        'https://phx.unusualwhales.com/api/option_activity?limit=25',
        {
          headers: {
            'User-Agent': 'event-radar/1.0',
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        return err(
          new Error(`Unusual options API returned ${response.status}`),
        );
      }

      const json = (await response.json()) as UnusualOptionsApiResponse;
      const options = parseUnusualOptions(json);
      const events: RawEvent[] = [];

      for (const option of options) {
        if (this.seenIds.has(option.id)) continue;
        if (!isSignificantActivity(option)) continue;
        this.seenIds.add(option.id);

        const signal = inferSignal(option);
        const premiumFormatted = `$${(option.premium / 1000).toFixed(0)}K`;

        events.push({
          id: randomUUID(),
          source: 'unusual-options',
          type: 'unusual-options',
          title: `${option.ticker} ${option.type.toUpperCase()} $${option.strike} ${option.expiry} — ${option.tradeType} ${premiumFormatted} (${signal})`,
          body: `Unusual ${option.type} activity on ${option.ticker}: ${option.tradeType} of $${option.strike} ${option.expiry} for ${premiumFormatted} premium. Volume: ${option.volume}, OI: ${option.openInterest}, Vol/OI: ${option.volOiRatio}x. Signal: ${signal}.`,
          timestamp: new Date(),
          metadata: {
            ticker: option.ticker,
            tickers: [option.ticker],
            strike: option.strike,
            expiry: option.expiry,
            type: option.type,
            premium: option.premium,
            volume: option.volume,
            open_interest: option.openInterest,
            vol_oi_ratio: option.volOiRatio,
            trade_type: option.tradeType,
            signal,
          },
        });
      }

      return ok(events);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return err(error);
    }
  }
}
