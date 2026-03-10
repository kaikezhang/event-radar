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

const POLL_INTERVAL_MS = 1_800_000; // 30 minutes

export type EarningsSurprise = 'beat' | 'miss' | 'inline';
export type ReportTime = 'pre-market' | 'after-hours' | 'during-market' | 'unknown';

export interface EarningsEvent {
  id: string;
  ticker: string;
  reportDate: string;
  reportTime: ReportTime;
  fiscalQuarter: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  surprisePct: number | null;
  guidance: string | null;
}

export interface EarningsCalendarApiResponse {
  earnings: Array<{
    id: string;
    ticker: string;
    report_date: string;
    report_time: string;
    fiscal_quarter: string;
    eps_estimate: number | null;
    eps_actual: number | null;
    revenue_estimate: number | null;
    revenue_actual: number | null;
    surprise_pct: number | null;
    guidance: string | null;
  }>;
}

const VALID_REPORT_TIMES: ReportTime[] = [
  'pre-market',
  'after-hours',
  'during-market',
  'unknown',
];

/**
 * Parse earnings calendar API response into normalized EarningsEvent objects.
 */
export function parseEarningsCalendar(
  json: EarningsCalendarApiResponse,
): EarningsEvent[] {
  if (!json?.earnings) return [];

  return json.earnings.map((e) => ({
    id: e.id,
    ticker: e.ticker.toUpperCase(),
    reportDate: e.report_date,
    reportTime: (
      VALID_REPORT_TIMES.includes(e.report_time as ReportTime)
        ? e.report_time
        : 'unknown'
    ) as ReportTime,
    fiscalQuarter: e.fiscal_quarter,
    epsEstimate: e.eps_estimate ?? null,
    epsActual: e.eps_actual ?? null,
    revenueEstimate: e.revenue_estimate ?? null,
    revenueActual: e.revenue_actual ?? null,
    surprisePct: e.surprise_pct ?? null,
    guidance: e.guidance ?? null,
  }));
}

/**
 * Determine the earnings surprise type from the surprise percentage.
 */
export function earningsSurpriseType(
  surprisePct: number | null,
): EarningsSurprise | null {
  if (surprisePct == null) return null;
  if (surprisePct > 1) return 'beat';
  if (surprisePct < -1) return 'miss';
  return 'inline';
}

/**
 * Check if an earnings report is upcoming (within 24 hours).
 */
export function isUpcoming(reportDate: string, now: Date = new Date()): boolean {
  const report = new Date(reportDate);
  const diffMs = report.getTime() - now.getTime();
  return diffMs > 0 && diffMs <= 86_400_000; // 24 hours
}

export class EarningsScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500);
  /** Override for testing */
  public fetchFn: typeof fetch = globalThis.fetch.bind(globalThis);

  constructor(eventBus: EventBus) {
    super({
      name: 'earnings',
      source: 'earnings',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const apiKey = process.env.ALPHA_VANTAGE_API_KEY ?? '';
      const url = apiKey
        ? `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&apikey=${apiKey}`
        : 'https://finance.yahoo.com/calendar/earnings';

      const response = await this.fetchFn(url, {
        headers: {
          'User-Agent': 'event-radar/1.0',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return err(
          new Error(`Earnings Calendar API returned ${response.status}`),
        );
      }

      const json = (await response.json()) as EarningsCalendarApiResponse;
      const earnings = parseEarningsCalendar(json);
      const events: RawEvent[] = [];
      const now = new Date();

      for (const earning of earnings) {
        if (this.seenIds.has(earning.id)) continue;
        this.seenIds.add(earning.id);

        const upcoming = isUpcoming(earning.reportDate, now);
        const surprise = earningsSurpriseType(earning.surprisePct);

        let eventType: string;
        let title: string;
        let body: string;

        if (earning.epsActual != null && surprise) {
          // Post-earnings result
          eventType = 'earnings-result';
          const emoji =
            surprise === 'beat' ? '🟢' : surprise === 'miss' ? '🔴' : '⚪';
          const surpriseStr =
            earning.surprisePct != null
              ? ` (${earning.surprisePct > 0 ? '+' : ''}${earning.surprisePct.toFixed(1)}%)`
              : '';

          title = `${emoji} ${earning.ticker} ${earning.fiscalQuarter} Earnings ${surprise.toUpperCase()}${surpriseStr}`;

          const epsPart =
            earning.epsActual != null && earning.epsEstimate != null
              ? `EPS: $${earning.epsActual} vs $${earning.epsEstimate} est.`
              : '';
          const revPart =
            earning.revenueActual != null && earning.revenueEstimate != null
              ? ` Revenue: $${(earning.revenueActual / 1e9).toFixed(2)}B vs $${(earning.revenueEstimate / 1e9).toFixed(2)}B est.`
              : '';
          const guidancePart = earning.guidance
            ? ` Guidance: ${earning.guidance}`
            : '';

          body = `${earning.ticker} ${earning.fiscalQuarter} earnings: ${epsPart}${revPart}${guidancePart}`;
        } else if (upcoming) {
          // Upcoming earnings alert
          eventType = 'earnings-upcoming';
          const timePart =
            earning.reportTime !== 'unknown'
              ? ` (${earning.reportTime})`
              : '';
          title = `📅 ${earning.ticker} Earnings ${earning.reportDate}${timePart}`;
          const estPart =
            earning.epsEstimate != null
              ? ` EPS est: $${earning.epsEstimate}`
              : '';
          body = `${earning.ticker} reports ${earning.fiscalQuarter} earnings on ${earning.reportDate}${timePart}.${estPart}`;
        } else {
          // Future scheduled — skip unless within 24h
          continue;
        }

        events.push({
          id: randomUUID(),
          source: 'earnings',
          type: eventType,
          title,
          body,
          url: `https://finance.yahoo.com/quote/${earning.ticker}`,
          timestamp: new Date(earning.reportDate),
          metadata: {
            ticker: earning.ticker,
            tickers: [earning.ticker],
            report_date: earning.reportDate,
            report_time: earning.reportTime,
            fiscal_quarter: earning.fiscalQuarter,
            eps_estimate: earning.epsEstimate,
            eps_actual: earning.epsActual,
            revenue_estimate: earning.revenueEstimate,
            revenue_actual: earning.revenueActual,
            surprise_pct: earning.surprisePct,
            surprise_type: surprise,
            guidance: earning.guidance,
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
