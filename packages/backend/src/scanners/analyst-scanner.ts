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

const POLL_INTERVAL_MS = 600_000; // 10 minutes

export type RatingAction =
  | 'upgrade'
  | 'downgrade'
  | 'initiation'
  | 'reiteration'
  | 'pt_change';

export interface AnalystRating {
  id: string;
  ticker: string;
  analystFirm: string;
  analystName: string | null;
  oldRating: string | null;
  newRating: string;
  oldPt: number | null;
  newPt: number | null;
  actionType: RatingAction;
  publishedAt: string;
  url: string;
}

export interface AnalystRatingsApiResponse {
  ratings: Array<{
    id: string;
    ticker: string;
    analyst_firm: string;
    analyst_name: string | null;
    old_rating: string | null;
    new_rating: string;
    old_pt: number | null;
    new_pt: number | null;
    action_type: string;
    published_at: string;
    url: string;
  }>;
}

const VALID_ACTIONS: RatingAction[] = [
  'upgrade',
  'downgrade',
  'initiation',
  'reiteration',
  'pt_change',
];

/**
 * Parse analyst ratings API response into normalized AnalystRating objects.
 */
export function parseAnalystRatings(
  json: AnalystRatingsApiResponse,
): AnalystRating[] {
  if (!json?.ratings) return [];

  return json.ratings.map((r) => ({
    id: r.id,
    ticker: r.ticker.toUpperCase(),
    analystFirm: r.analyst_firm,
    analystName: r.analyst_name ?? null,
    oldRating: r.old_rating ?? null,
    newRating: r.new_rating,
    oldPt: r.old_pt ?? null,
    newPt: r.new_pt ?? null,
    actionType: (
      VALID_ACTIONS.includes(r.action_type as RatingAction)
        ? r.action_type
        : 'reiteration'
    ) as RatingAction,
    publishedAt: r.published_at,
    url: r.url,
  }));
}

/**
 * Determine severity based on the type of rating change.
 * Sell→Buy or downgrade = HIGH, minor PT change = LOW.
 */
export function ratingSeverity(rating: AnalystRating): 'HIGH' | 'MEDIUM' | 'LOW' {
  const bearish = ['sell', 'underperform', 'underweight', 'reduce'];
  const bullish = ['buy', 'outperform', 'overweight', 'strong buy'];

  if (rating.actionType === 'downgrade') return 'HIGH';

  if (rating.actionType === 'upgrade') {
    const oldLower = rating.oldRating?.toLowerCase() ?? '';
    const newLower = rating.newRating.toLowerCase();
    if (bearish.includes(oldLower) && bullish.includes(newLower)) return 'HIGH';
    return 'MEDIUM';
  }

  if (rating.actionType === 'initiation') return 'MEDIUM';
  if (rating.actionType === 'pt_change') return 'LOW';

  return 'LOW';
}

export class AnalystScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500, 'analyst');
  /** Override for testing */
  public fetchFn: typeof fetch = globalThis.fetch.bind(globalThis);

  constructor(eventBus: EventBus) {
    super({
      name: 'analyst',
      source: 'analyst',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const response = await this.fetchFn(
        'https://www.benzinga.com/api/v2/analyst-ratings?pageSize=25',
        {
          headers: {
            'User-Agent': 'event-radar/1.0',
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        return err(
          new Error(`Analyst Ratings API returned ${response.status}`),
        );
      }

      const json = (await response.json()) as AnalystRatingsApiResponse;
      const ratings = parseAnalystRatings(json);
      const events: RawEvent[] = [];

      for (const rating of ratings) {
        if (this.seenIds.has(rating.id)) continue;
        this.seenIds.add(rating.id);

        const actionLabel =
          rating.actionType === 'upgrade'
            ? '⬆️ Upgrade'
            : rating.actionType === 'downgrade'
              ? '⬇️ Downgrade'
              : rating.actionType === 'initiation'
                ? '🆕 Initiation'
                : rating.actionType === 'pt_change'
                  ? '🎯 PT Change'
                  : '🔄 Reiteration';

        const ptPart =
          rating.newPt != null
            ? ` PT $${rating.newPt}${rating.oldPt != null ? ` (was $${rating.oldPt})` : ''}`
            : '';

        const ratingPart = rating.oldRating
          ? `${rating.oldRating} → ${rating.newRating}`
          : rating.newRating;

        events.push({
          id: randomUUID(),
          source: 'analyst',
          type: 'analyst-rating',
          title: `${actionLabel}: ${rating.ticker} — ${rating.analystFirm} ${ratingPart}${ptPart}`,
          body: `${rating.analystFirm}${rating.analystName ? ` (${rating.analystName})` : ''} ${rating.actionType} ${rating.ticker}: ${ratingPart}.${ptPart ? ` Price target${ptPart}.` : ''}`,
          url: rating.url,
          timestamp: new Date(rating.publishedAt),
          metadata: {
            ticker: rating.ticker,
            tickers: [rating.ticker],
            analyst_firm: rating.analystFirm,
            analyst_name: rating.analystName,
            old_rating: rating.oldRating,
            new_rating: rating.newRating,
            old_pt: rating.oldPt,
            new_pt: rating.newPt,
            action_type: rating.actionType,
            severity: ratingSeverity(rating),
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
