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

const POLL_INTERVAL_MS = 3_600_000; // 1 hour (FINRA reports are bi-monthly)
const SIGNIFICANT_CHANGE_PCT = 5;

export interface ShortInterestEntry {
  ticker: string;
  shortInterest: number;
  shortPctFloat: number;
  daysToCover: number;
  changePct: number;
  previousSi: number;
}

export interface ShortInterestApiResponse {
  data: Array<{
    ticker: string;
    short_interest: number;
    short_pct_float: number;
    days_to_cover: number;
    previous_short_interest: number;
  }>;
}

/**
 * Parse short interest API response into normalized entries.
 */
export function parseShortInterest(
  json: ShortInterestApiResponse,
): ShortInterestEntry[] {
  if (!json?.data) return [];

  return json.data.map((item) => {
    const changePct =
      item.previous_short_interest > 0
        ? Math.round(
            ((item.short_interest - item.previous_short_interest) /
              item.previous_short_interest) *
              10000,
          ) / 100
        : 0;

    return {
      ticker: item.ticker.toUpperCase(),
      shortInterest: item.short_interest,
      shortPctFloat: item.short_pct_float,
      daysToCover: item.days_to_cover,
      changePct,
      previousSi: item.previous_short_interest,
    };
  });
}

/**
 * Determine if a short interest change is significant (>5% change).
 */
export function isSignificantChange(entry: ShortInterestEntry): boolean {
  return Math.abs(entry.changePct) >= SIGNIFICANT_CHANGE_PCT;
}

/**
 * Determine if an entry qualifies as "most shorted" (>20% of float).
 */
export function isMostShorted(entry: ShortInterestEntry): boolean {
  return entry.shortPctFloat >= 20;
}

export class ShortInterestScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500, 'short-interest');
  /** Override for testing */
  public fetchFn: typeof fetch = globalThis.fetch.bind(globalThis);

  constructor(eventBus: EventBus) {
    super({
      name: 'short-interest',
      source: 'short-interest',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const response = await this.fetchFn(
        'https://finviz.com/api/short_interest.ashx?v=1',
        {
          headers: {
            'User-Agent': 'event-radar/1.0',
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        return err(
          new Error(`Short interest API returned ${response.status}`),
        );
      }

      const json = (await response.json()) as ShortInterestApiResponse;
      const entries = parseShortInterest(json);
      const events: RawEvent[] = [];

      for (const entry of entries) {
        const dedupKey = `${entry.ticker}-${entry.shortInterest}`;
        if (this.seenIds.has(dedupKey)) continue;

        const significant = isSignificantChange(entry);
        const mostShorted = isMostShorted(entry);

        if (!significant && !mostShorted) continue;

        this.seenIds.add(dedupKey);

        const direction = entry.changePct > 0 ? 'increased' : 'decreased';
        const tags: string[] = [];
        if (significant) tags.push('SI_CHANGE');
        if (mostShorted) tags.push('MOST_SHORTED');

        events.push({
          id: randomUUID(),
          source: 'short-interest',
          type: 'short-interest',
          title: `${entry.ticker} short interest ${direction} ${Math.abs(entry.changePct).toFixed(1)}% — ${entry.shortPctFloat.toFixed(1)}% of float`,
          body: `${entry.ticker} short interest ${direction} by ${Math.abs(entry.changePct).toFixed(1)}% to ${entry.shortInterest.toLocaleString()} shares (${entry.shortPctFloat.toFixed(1)}% of float). Days to cover: ${entry.daysToCover.toFixed(1)}.`,
          timestamp: new Date(),
          metadata: {
            ticker: entry.ticker,
            tickers: [entry.ticker],
            short_interest: entry.shortInterest,
            short_pct_float: entry.shortPctFloat,
            days_to_cover: entry.daysToCover,
            change_pct: entry.changePct,
            previous_si: entry.previousSi,
            tags,
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
