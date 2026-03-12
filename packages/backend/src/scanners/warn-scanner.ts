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

const POLL_INTERVAL_MS = 3_600_000; // 1 hour
const MIN_EMPLOYEES = 100;

export interface WarnNotice {
  id: string;
  company: string;
  ticker: string | null;
  state: string;
  employeesAffected: number;
  layoffDate: string;
  noticeDate: string;
  reason: string;
}

export interface WarnNoticesApiResponse {
  notices: Array<{
    id: string;
    company: string;
    ticker: string | null;
    state: string;
    employees_affected: number;
    layoff_date: string;
    notice_date: string;
    reason: string;
  }>;
}

/**
 * Parse WARN Act notices API response into normalized WarnNotice objects.
 */
export function parseWarnNotices(
  json: WarnNoticesApiResponse,
): WarnNotice[] {
  if (!json?.notices) return [];

  return json.notices
    .filter((n) => n.employees_affected >= MIN_EMPLOYEES)
    .map((n) => ({
      id: n.id,
      company: n.company,
      ticker: n.ticker?.toUpperCase() ?? null,
      state: n.state,
      employeesAffected: n.employees_affected,
      layoffDate: n.layoff_date,
      noticeDate: n.notice_date,
      reason: n.reason,
    }));
}

/**
 * Determine severity based on number of employees affected.
 */
export function warnSeverity(
  employeesAffected: number,
): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (employeesAffected >= 1000) return 'HIGH';
  if (employeesAffected >= 500) return 'MEDIUM';
  return 'LOW';
}

export class WarnScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500, 'warn');
  /** Override for testing */
  public fetchFn: typeof fetch = (...args) => globalThis.fetch(...args);

  constructor(eventBus: EventBus) {
    super({
      name: 'warn-act',
      source: 'warn-act',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const response = await this.fetchFn(
        'https://layoffs.fyi/api/warn-notices?limit=25',
        {
          headers: {
            'User-Agent': 'event-radar/1.0',
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        return err(
          new Error(`WARN Act API returned ${response.status}`),
        );
      }

      const json = (await response.json()) as WarnNoticesApiResponse;
      const notices = parseWarnNotices(json);
      const events: RawEvent[] = [];

      for (const notice of notices) {
        if (this.seenIds.has(notice.id)) continue;
        this.seenIds.add(notice.id);

        const severity = warnSeverity(notice.employeesAffected);
        const tickerPart = notice.ticker ? ` ($${notice.ticker})` : '';

        events.push({
          id: randomUUID(),
          source: 'warn-act',
          type: 'warn-notice',
          title: `🏭 WARN Act: ${notice.company}${tickerPart} — ${notice.employeesAffected.toLocaleString()} employees, ${notice.state}`,
          body: `${notice.company} filed a WARN Act notice in ${notice.state}. ${notice.employeesAffected.toLocaleString()} employees affected. Reason: ${notice.reason}. Layoff date: ${notice.layoffDate}.`,
          url: `https://layoffs.fyi`,
          timestamp: new Date(notice.noticeDate),
          metadata: {
            company: notice.company,
            ticker: notice.ticker,
            tickers: notice.ticker ? [notice.ticker] : [],
            state: notice.state,
            employees_affected: notice.employeesAffected,
            layoff_date: notice.layoffDate,
            notice_date: notice.noticeDate,
            reason: notice.reason,
            severity,
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
