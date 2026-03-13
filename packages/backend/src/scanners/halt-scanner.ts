import { randomUUID } from 'node:crypto';
import {
  BaseScanner,
  err,
  ok,
  type EventBus,
  type RawEvent,
  type Result,
  type Severity,
} from '@event-radar/shared';
import { SeenIdBuffer } from './scraping/scrape-utils.js';

export const HALT_SCANNER_POLL_INTERVAL_MS = 15_000;
export const NASDAQ_TRADE_HALTS_RSS_URL =
  'https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts';
export const NASDAQ_TRADE_HALTS_JSON_URL =
  'https://www.nasdaqtrader.com/dynamic/symdir/shorthalts/shorthalts.json';
export const NASDAQ_TRADE_HALTS_PAGE_URL =
  'https://www.nasdaqtrader.com/Trader.aspx?id=TradeHalts';

const HALT_SEVERITY_MAP: Record<string, Severity> = {
  T1: 'CRITICAL',
  T5: 'CRITICAL',
  T6: 'CRITICAL',
  M: 'CRITICAL',
  T2: 'HIGH',
  T8: 'HIGH',
  T12: 'MEDIUM',
  H4: 'MEDIUM',
};

const HALT_REASON_DESCRIPTIONS: Record<string, string> = {
  T1: 'News Pending',
  T2: 'News Dissemination',
  T5: 'Single Stock Circuit Breaker (LULD)',
  T6: 'Extraordinary Market Volatility',
  T8: 'ETF Halt',
  T12: 'IPO Not Yet Trading',
  M: 'Volatility Trading Pause (MWCB)',
  H4: 'Non-compliance',
};

const EASTERN_TIME_ZONE = 'America/New_York';
const FEED_DATE_PATTERN = /^(?<month>\d{1,2})\/(?<day>\d{1,2})\/(?<year>\d{4})$/;
const FEED_TIME_PATTERN = /^(?<hour>\d{1,2}):(?<minute>\d{2})(?::(?<second>\d{2}))?$/;
const EASTERN_OFFSET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  timeZoneName: 'shortOffset',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const EASTERN_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface NasdaqTradeHaltRecord {
  ticker: string;
  issueName: string | null;
  market: string | null;
  haltDate: string;
  haltTime: string;
  reasonCode: string;
  pauseThresholdPrice: string | null;
  resumptionDate: string | null;
  resumptionQuoteTime: string | null;
  resumptionTradeTime: string | null;
}

function extractAllItemBlocks(xml: string): string[] {
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    blocks.push(match[1] ?? '');
  }

  return blocks;
}

function extractTag(xml: string, tag: string): string {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cdataRegex = new RegExp(
    `<${escapedTag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${escapedTag}>`,
    'i',
  );
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) {
    return cdataMatch[1]?.trim() ?? '';
  }

  const plainRegex = new RegExp(
    `<${escapedTag}[^>]*>([\\s\\S]*?)</${escapedTag}>`,
    'i',
  );
  const plainMatch = plainRegex.exec(xml);
  if (plainMatch) {
    return plainMatch[1]?.trim() ?? '';
  }

  return '';
}

function normalizeString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeTime(value: string | null | undefined): string | null {
  const trimmed = normalizeString(value);
  if (!trimmed) return null;

  return trimmed.replace(/\.\d+$/, '');
}

function normalizeRecord(raw: Record<string, unknown>): NasdaqTradeHaltRecord | null {
  const ticker = normalizeString(String(raw['IssueSymbol'] ?? raw['issueSymbol'] ?? ''))?.toUpperCase();
  const haltDate = normalizeString(String(raw['HaltDate'] ?? raw['haltDate'] ?? ''));
  const haltTime = normalizeTime(String(raw['HaltTime'] ?? raw['haltTime'] ?? ''));
  const reasonCode = normalizeString(String(raw['ReasonCode'] ?? raw['reasonCode'] ?? ''))?.toUpperCase();

  if (!ticker || !haltDate || !haltTime || !reasonCode) {
    return null;
  }

  return {
    ticker,
    issueName: normalizeString(String(raw['IssueName'] ?? raw['issueName'] ?? '')),
    market: normalizeString(String(raw['Market'] ?? raw['market'] ?? '')),
    haltDate,
    haltTime,
    reasonCode,
    pauseThresholdPrice: normalizeString(
      String(raw['PauseThresholdPrice'] ?? raw['pauseThresholdPrice'] ?? ''),
    ),
    resumptionDate: normalizeString(
      String(raw['ResumptionDate'] ?? raw['resumptionDate'] ?? ''),
    ),
    resumptionQuoteTime: normalizeTime(
      String(raw['ResumptionQuoteTime'] ?? raw['resumptionQuoteTime'] ?? ''),
    ),
    resumptionTradeTime: normalizeTime(
      String(raw['ResumptionTradeTime'] ?? raw['resumptionTradeTime'] ?? ''),
    ),
  };
}

export function parseNasdaqTradeHaltsRss(xml: string): NasdaqTradeHaltRecord[] {
  if (!xml.trim()) {
    return [];
  }

  const records: NasdaqTradeHaltRecord[] = [];

  for (const item of extractAllItemBlocks(xml)) {
    const record = normalizeRecord({
      IssueSymbol: extractTag(item, 'ndaq:IssueSymbol') || extractTag(item, 'title'),
      IssueName: extractTag(item, 'ndaq:IssueName'),
      Market: extractTag(item, 'ndaq:Market'),
      HaltDate: extractTag(item, 'ndaq:HaltDate'),
      HaltTime: extractTag(item, 'ndaq:HaltTime'),
      ReasonCode: extractTag(item, 'ndaq:ReasonCode'),
      PauseThresholdPrice: extractTag(item, 'ndaq:PauseThresholdPrice'),
      ResumptionDate: extractTag(item, 'ndaq:ResumptionDate'),
      ResumptionQuoteTime: extractTag(item, 'ndaq:ResumptionQuoteTime'),
      ResumptionTradeTime: extractTag(item, 'ndaq:ResumptionTradeTime'),
    });

    if (record) {
      records.push(record);
    }
  }

  return records;
}

function extractJsonRows(
  payload: unknown,
  visited = new WeakSet<object>(),
  depth = 0,
): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  if (depth > 10 || visited.has(payload)) {
    return [];
  }

  visited.add(payload);

  const record = payload as Record<string, unknown>;
  const candidateKeys = ['rows', 'data', 'items', 'results', 'halts'];

  for (const key of candidateKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === 'object') {
      const nested = extractJsonRows(value, visited, depth + 1);
      if (nested.length > 0) {
        return nested;
      }
    }
  }

  return [];
}

export function parseNasdaqTradeHaltsJson(payload: unknown): NasdaqTradeHaltRecord[] {
  const rows = extractJsonRows(payload);

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return null;
      }
      return normalizeRecord(row as Record<string, unknown>);
    })
    .filter((record): record is NasdaqTradeHaltRecord => record !== null);
}

export function mapHaltReasonSeverity(reasonCode: string): Severity {
  return HALT_SEVERITY_MAP[reasonCode.toUpperCase()] ?? 'LOW';
}

export function describeHaltReason(reasonCode: string): string {
  return HALT_REASON_DESCRIPTIONS[reasonCode.toUpperCase()] ?? 'Other / Unknown';
}

export function isLuldHaltCode(reasonCode: string): boolean {
  return reasonCode.toUpperCase() === 'T5';
}

export function buildHaltDedupKey(record: NasdaqTradeHaltRecord): string {
  return `${record.ticker}|${record.haltDate} ${record.haltTime}|${record.reasonCode}`;
}

function getEasternOffsetMinutes(date: Date): number | null {
  const timeZoneName = EASTERN_OFFSET_FORMATTER
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')
    ?.value;
  const match = /^GMT(?:(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?)?$/.exec(
    timeZoneName ?? '',
  );

  if (!match?.groups) {
    return null;
  }

  if (!match.groups['sign']) {
    return 0;
  }

  const hours = Number(match.groups['hours'] ?? '0');
  const minutes = Number(match.groups['minutes'] ?? '0');
  const direction = match.groups['sign'] === '+' ? 1 : -1;
  return direction * (hours * 60 + minutes);
}

function easternPartsMatch(date: Date, expected: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}): boolean {
  const parts = EASTERN_PARTS_FORMATTER.formatToParts(date);
  const lookup: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      lookup[part.type] = part.value;
    }
  }

  return (
    lookup['year'] === String(expected.year)
    && lookup['month'] === String(expected.month).padStart(2, '0')
    && lookup['day'] === String(expected.day).padStart(2, '0')
    && lookup['hour'] === String(expected.hour).padStart(2, '0')
    && lookup['minute'] === String(expected.minute).padStart(2, '0')
    && lookup['second'] === String(expected.second).padStart(2, '0')
  );
}

export function parseFeedTimestamp(date: string, time: string): Date | null {
  const normalizedDate = normalizeString(date) ?? '';
  const normalizedTime = normalizeTime(time) ?? '';
  const dateMatch = FEED_DATE_PATTERN.exec(normalizedDate);
  const timeMatch = FEED_TIME_PATTERN.exec(normalizedTime);

  if (!dateMatch?.groups || !timeMatch?.groups) {
    console.warn(
      `[trading-halt] Ignoring malformed feed timestamp date="${date}" time="${time}"`,
    );
    return null;
  }

  const month = Number(dateMatch.groups['month']);
  const day = Number(dateMatch.groups['day']);
  const year = Number(dateMatch.groups['year']);
  const hour = Number(timeMatch.groups['hour']);
  const minute = Number(timeMatch.groups['minute']);
  const second = Number(timeMatch.groups['second'] ?? '0');

  if (
    month < 1
    || month > 12
    || day < 1
    || day > 31
    || hour > 23
    || minute > 59
    || second > 59
  ) {
    console.warn(
      `[trading-halt] Ignoring malformed feed timestamp date="${date}" time="${time}"`,
    );
    return null;
  }

  const seed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    seed.getUTCFullYear() !== year
    || seed.getUTCMonth() !== month - 1
    || seed.getUTCDate() !== day
  ) {
    console.warn(
      `[trading-halt] Ignoring malformed feed timestamp date="${date}" time="${time}"`,
    );
    return null;
  }

  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offsetMinutes = getEasternOffsetMinutes(new Date(utcMillis));
    if (offsetMinutes === null) {
      console.warn(
        `[trading-halt] Ignoring feed timestamp with unknown timezone offset date="${date}" time="${time}"`,
      );
      return null;
    }

    const adjustedMillis =
      Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
    if (adjustedMillis === utcMillis) {
      break;
    }
    utcMillis = adjustedMillis;
  }

  const parsed = new Date(utcMillis);
  if (!easternPartsMatch(parsed, { year, month, day, hour, minute, second })) {
    console.warn(
      `[trading-halt] Ignoring malformed feed timestamp date="${date}" time="${time}"`,
    );
    return null;
  }

  return parsed;
}

function formatEventTime(date: string, time: string | null): string | null {
  const normalizedTime = normalizeTime(time);
  if (!date || !normalizedTime) {
    return null;
  }

  return `${date} ${normalizedTime}`;
}

function hasResumeInfo(record: NasdaqTradeHaltRecord): boolean {
  return Boolean(record.resumptionDate && (record.resumptionTradeTime || record.resumptionQuoteTime));
}

export class HaltScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(1_000, 'trading-halt');
  public fetchFn: typeof fetch = (...args) => globalThis.fetch(...args);

  constructor(eventBus: EventBus) {
    super({
      name: 'trading-halt',
      source: 'trading-halt',
      pollIntervalMs: HALT_SCANNER_POLL_INTERVAL_MS,
      eventBus,
    });
  }

  private async fetchRecords(): Promise<Result<NasdaqTradeHaltRecord[], Error>> {
    let rssFailure: string | null = null;

    try {
      const response = await this.fetchFn(NASDAQ_TRADE_HALTS_RSS_URL, {
        headers: {
          'User-Agent': 'event-radar/1.0',
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
      });

      if (response.ok) {
        const xml = await response.text();
        const records = parseNasdaqTradeHaltsRss(xml);
        return ok(records);
      }

      rssFailure = `RSS ${response.status}`;
    } catch (error) {
      rssFailure = error instanceof Error ? error.message : String(error);
    }

    let jsonFailure: string | null = null;

    try {
      const response = await this.fetchFn(NASDAQ_TRADE_HALTS_JSON_URL, {
        headers: {
          'User-Agent': 'event-radar/1.0',
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const json = (await response.json()) as unknown;
        const records = parseNasdaqTradeHaltsJson(json);
        return ok(records);
      }

      jsonFailure = `JSON ${response.status}`;
    } catch (error) {
      jsonFailure = error instanceof Error ? error.message : String(error);
    }

    return err(
      new Error(
        `Trade halt feed fetch failed (rss=${rssFailure ?? 'unknown'}, json=${jsonFailure ?? 'unknown'})`,
      ),
    );
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    const recordsResult = await this.fetchRecords();
    if (!recordsResult.ok) {
      return err(recordsResult.error);
    }

    const events: RawEvent[] = [];

    for (const record of recordsResult.value) {
      const dedupKey = buildHaltDedupKey(record);
      const severity = mapHaltReasonSeverity(record.reasonCode);
      const reasonDescription = describeHaltReason(record.reasonCode);
      const haltTime = formatEventTime(record.haltDate, record.haltTime);
      const resumeTime = formatEventTime(
        record.resumptionDate ?? '',
        record.resumptionTradeTime ?? record.resumptionQuoteTime,
      );
      const haltTimestamp = parseFeedTimestamp(record.haltDate, record.haltTime);

      const commonMetadata = {
        ticker: record.ticker,
        tickers: [record.ticker],
        issueName: record.issueName,
        market: record.market,
        haltReasonCode: record.reasonCode,
        haltReasonDescription: reasonDescription,
        haltTime,
        resumeTime,
        pauseThresholdPrice: record.pauseThresholdPrice,
        isLULD: isLuldHaltCode(record.reasonCode),
        severity,
        dedupKey,
      };

      if (haltTimestamp !== null && !this.seenIds.has(dedupKey)) {
        this.seenIds.add(dedupKey);
        events.push({
          id: randomUUID(),
          source: 'trading-halt',
          type: 'halt',
          title: `${record.ticker} trading HALTED — ${reasonDescription}`,
          body: `${record.issueName ?? record.ticker} on ${record.market ?? 'exchange'} was halted at ${haltTime ?? record.haltTime}. Reason: ${reasonDescription}.`,
          url: NASDAQ_TRADE_HALTS_PAGE_URL,
          timestamp: haltTimestamp,
          metadata: {
            ...commonMetadata,
            direction: 'bearish',
          },
        });
      }

      if (hasResumeInfo(record)) {
        const resumeDedupKey = `${dedupKey}:resume`;
        const resumeTimestamp = parseFeedTimestamp(
          record.resumptionDate ?? record.haltDate,
          record.resumptionTradeTime ?? record.resumptionQuoteTime ?? record.haltTime,
        );

        if (resumeTimestamp === null || this.seenIds.has(resumeDedupKey)) {
          continue;
        }

        this.seenIds.add(resumeDedupKey);
        events.push({
          id: randomUUID(),
          source: 'trading-halt',
          type: 'resume',
          title: `${record.ticker} trading RESUMED`,
          body: `${record.issueName ?? record.ticker} on ${record.market ?? 'exchange'} resumed trading at ${resumeTime ?? record.resumptionTradeTime}.`,
          url: NASDAQ_TRADE_HALTS_PAGE_URL,
          timestamp: resumeTimestamp,
          metadata: {
            ...commonMetadata,
            direction: 'neutral',
          },
        });
      }
    }

    return ok(events);
  }
}
