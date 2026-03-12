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
const MIN_TRADE_AMOUNT = 50_000;

export interface CongressTrade {
  id: string;
  politician: string;
  party: string;
  chamber: 'House' | 'Senate';
  ticker: string;
  tradeType: 'buy' | 'sell';
  amountRange: string;
  filingDate: string;
  reportDate: string;
  committeeRelevance: string | null;
}

export interface CongressTradesApiResponse {
  trades: Array<{
    id: string;
    politician: string;
    party: string;
    chamber: string;
    ticker: string;
    trade_type: string;
    amount_low: number;
    amount_high: number;
    filing_date: string;
    report_date: string;
    committee: string | null;
  }>;
}

/**
 * Parse Congress trades API response into normalized CongressTrade objects.
 */
export function parseCongressTrades(
  json: CongressTradesApiResponse,
): CongressTrade[] {
  if (!json?.trades) return [];

  return json.trades
    .filter((t) => t.amount_high >= MIN_TRADE_AMOUNT)
    .map((t) => ({
      id: t.id,
      politician: t.politician,
      party: t.party,
      chamber: (t.chamber === 'Senate' ? 'Senate' : 'House') as
        | 'House'
        | 'Senate',
      ticker: t.ticker.toUpperCase(),
      tradeType: (t.trade_type === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell',
      amountRange: `$${t.amount_low.toLocaleString()}-$${t.amount_high.toLocaleString()}`,
      filingDate: t.filing_date,
      reportDate: t.report_date,
      committeeRelevance: t.committee ?? null,
    }));
}

/**
 * Determine if a trade is committee-relevant (politician sits on a committee
 * related to the traded stock's sector).
 */
export function isCommitteeRelevant(trade: CongressTrade): boolean {
  return trade.committeeRelevance !== null && trade.committeeRelevance !== '';
}

export class CongressScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500, 'congress');
  /** Override for testing */
  public fetchFn: typeof fetch = (...args) => globalThis.fetch(...args);

  constructor(eventBus: EventBus) {
    super({
      name: 'congress',
      source: 'congress',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const response = await this.fetchFn(
        'https://www.capitoltrades.com/api/trades?page=1&pageSize=25',
        {
          headers: {
            'User-Agent': 'event-radar/1.0',
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        return err(
          new Error(`Capitol Trades API returned ${response.status}`),
        );
      }

      const json = (await response.json()) as CongressTradesApiResponse;
      const trades = parseCongressTrades(json);
      const events: RawEvent[] = [];

      for (const trade of trades) {
        if (this.seenIds.has(trade.id)) continue;
        this.seenIds.add(trade.id);

        const committeeTag = isCommitteeRelevant(trade)
          ? ' [COMMITTEE RELEVANT]'
          : '';
        const direction = trade.tradeType === 'buy' ? 'bought' : 'sold';

        events.push({
          id: randomUUID(),
          source: 'congress',
          type: 'congress-trade',
          title: `${trade.politician} (${trade.party}-${trade.chamber}) ${direction} ${trade.ticker} ${trade.amountRange}${committeeTag}`,
          body: `Congress member ${trade.politician} (${trade.party}) filed a ${trade.tradeType} of ${trade.ticker} in the range ${trade.amountRange}. Filing date: ${trade.filingDate}.`,
          url: `https://www.capitoltrades.com/trades`,
          timestamp: new Date(trade.filingDate),
          metadata: {
            politician: trade.politician,
            party: trade.party,
            chamber: trade.chamber,
            ticker: trade.ticker,
            tickers: [trade.ticker],
            trade_type: trade.tradeType,
            amount_range: trade.amountRange,
            filing_date: trade.filingDate,
            report_date: trade.reportDate,
            committee_relevance: trade.committeeRelevance,
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
