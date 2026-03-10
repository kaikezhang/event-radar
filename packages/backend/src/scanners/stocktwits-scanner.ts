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

const POLL_INTERVAL_MS = 60_000;
const VOLUME_SPIKE_MULTIPLIER = 2;

export interface StockTwitsTrendingResponse {
  response: { status: number };
  symbols: Array<{
    id: number;
    symbol: string;
    title: string;
    watchlist_count: number;
  }>;
}

export interface StockTwitsMessage {
  id: number;
  body: string;
  created_at: string;
  user: {
    id: number;
    username: string;
  };
  entities: {
    sentiment: { basic: string } | null;
  };
  likes: {
    total: number;
  };
}

export interface StockTwitsStreamResponse {
  response: { status: number };
  symbol: {
    id: number;
    symbol: string;
    title: string;
  };
  messages: StockTwitsMessage[];
}

/**
 * Parse trending symbols from StockTwits API response.
 */
export function parseTrendingResponse(
  json: StockTwitsTrendingResponse,
): Array<{ symbol: string; title: string; watchlistCount: number }> {
  if (!json?.symbols) return [];
  return json.symbols.map((s) => ({
    symbol: s.symbol,
    title: s.title,
    watchlistCount: s.watchlist_count,
  }));
}

/**
 * Analyze sentiment from a StockTwits symbol stream.
 * Returns bullish/bearish counts and ratio.
 */
export function analyzeSentiment(messages: StockTwitsMessage[]): {
  bullish: number;
  bearish: number;
  neutral: number;
  total: number;
  ratio: number; // bullish / total with sentiment, 0-1
} {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;

  for (const msg of messages) {
    const sentiment = msg.entities?.sentiment?.basic;
    if (sentiment === 'Bullish') bullish++;
    else if (sentiment === 'Bearish') bearish++;
    else neutral++;
  }

  const withSentiment = bullish + bearish;
  const ratio = withSentiment > 0 ? bullish / withSentiment : 0.5;

  return { bullish, bearish, neutral, total: messages.length, ratio };
}

export class StockTwitsScanner extends BaseScanner {
  private readonly seenTrending = new SeenIdBuffer(200);
  private readonly seenMessages = new SeenIdBuffer(500);
  private previousTrending: Set<string> = new Set();
  private previousVolumes: Map<string, number> = new Map();
  private previousSentiments: Map<string, number> = new Map();
  /** Symbols to track stream for (populated from trending) */
  private trackedSymbols: string[] = [];

  constructor(eventBus: EventBus) {
    super({
      name: 'stocktwits',
      source: 'stocktwits',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const events: RawEvent[] = [];

      // 1. Fetch trending symbols
      const trendingEvents = await this.pollTrending();
      events.push(...trendingEvents);

      // 2. Fetch symbol streams for tracked symbols
      for (const symbol of this.trackedSymbols.slice(0, 5)) {
        const streamEvents = await this.pollSymbolStream(symbol);
        events.push(...streamEvents);
      }

      return ok(events);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return err(error);
    }
  }

  private async pollTrending(): Promise<RawEvent[]> {
    const events: RawEvent[] = [];

    const response = await fetch(
      'https://api.stocktwits.com/api/2/trending/symbols.json',
      { headers: { 'User-Agent': 'event-radar/1.0' } },
    );

    if (!response.ok) return events;

    const json = (await response.json()) as StockTwitsTrendingResponse;
    const symbols = parseTrendingResponse(json);
    const currentTrending = new Set(symbols.map((s) => s.symbol));

    // Detect new trending symbols
    for (const sym of symbols) {
      if (!this.previousTrending.has(sym.symbol)) {
        events.push({
          id: randomUUID(),
          source: 'stocktwits',
          type: 'social-trending',
          title: `${sym.symbol} entered StockTwits trending`,
          body: `${sym.title} (${sym.symbol}) is now trending on StockTwits with ${sym.watchlistCount} watchers.`,
          timestamp: new Date(),
          metadata: {
            ticker: sym.symbol,
            tickers: [sym.symbol],
            watchlist_count: sym.watchlistCount,
            event_subtype: 'new-trending',
          },
        });
      }
    }

    // Update tracked symbols from trending
    this.trackedSymbols = symbols.map((s) => s.symbol);
    this.previousTrending = currentTrending;

    return events;
  }

  private async pollSymbolStream(symbol: string): Promise<RawEvent[]> {
    const events: RawEvent[] = [];

    const response = await fetch(
      `https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json`,
      { headers: { 'User-Agent': 'event-radar/1.0' } },
    );

    if (!response.ok) return events;

    const json = (await response.json()) as StockTwitsStreamResponse;
    const messages = json?.messages ?? [];

    // Analyze sentiment
    const sentiment = analyzeSentiment(messages);
    const previousRatio = this.previousSentiments.get(symbol);

    // Detect sentiment flip (bullish→bearish or bearish→bullish)
    if (previousRatio !== undefined) {
      const wasBullish = previousRatio > 0.6;
      const wasBearish = previousRatio < 0.4;
      const isBullish = sentiment.ratio > 0.6;
      const isBearish = sentiment.ratio < 0.4;

      if ((wasBullish && isBearish) || (wasBearish && isBullish)) {
        const direction = isBullish ? 'bearish→bullish' : 'bullish→bearish';
        events.push({
          id: randomUUID(),
          source: 'stocktwits',
          type: 'social-sentiment',
          title: `${symbol} sentiment flipped ${direction}`,
          body: `StockTwits sentiment for ${symbol} flipped ${direction}. Ratio: ${sentiment.ratio.toFixed(2)} (${sentiment.bullish} bullish, ${sentiment.bearish} bearish out of ${sentiment.total} messages).`,
          timestamp: new Date(),
          metadata: {
            ticker: symbol,
            tickers: [symbol],
            bullish: sentiment.bullish,
            bearish: sentiment.bearish,
            ratio: sentiment.ratio,
            event_subtype: 'sentiment-flip',
          },
        });
      }
    }

    // Detect volume spike (>2x previous message count)
    const previousVolume = this.previousVolumes.get(symbol);
    if (
      previousVolume !== undefined &&
      previousVolume > 0 &&
      sentiment.total > previousVolume * VOLUME_SPIKE_MULTIPLIER
    ) {
      events.push({
        id: randomUUID(),
        source: 'stocktwits',
        type: 'social-volume',
        title: `${symbol} StockTwits volume spike (${sentiment.total} vs ${previousVolume})`,
        body: `StockTwits message volume for ${symbol} spiked to ${sentiment.total} (previous: ${previousVolume}). Sentiment ratio: ${sentiment.ratio.toFixed(2)}.`,
        timestamp: new Date(),
        metadata: {
          ticker: symbol,
          tickers: [symbol],
          current_volume: sentiment.total,
          previous_volume: previousVolume,
          ratio: sentiment.ratio,
          event_subtype: 'volume-spike',
        },
      });
    }

    // Update tracking state
    this.previousSentiments.set(symbol, sentiment.ratio);
    this.previousVolumes.set(symbol, sentiment.total);

    return events;
  }
}
