import { createHash } from 'node:crypto';
import {
  BaseScanner,
  err,
  ok,
  type EventBus,
  type RawEvent,
  type Result,
} from '@event-radar/shared';
import type { EdgarAtomEntry } from './sec-edgar-scanner.js';
import { parseEdgarAtomFeed } from './sec-edgar-scanner.js';
import { SeenIdBuffer } from './scraping/scrape-utils.js';

const POLL_INTERVAL_MS = 60_000;
const SEC_USER_AGENT = 'EventRadar/1.0 (contact@example.com)';
const SEC_XML_ACCEPT = 'application/atom+xml, application/xml, text/xml';

const SEC_ATOM_FEEDS = [
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-3&dateb=&owner=include&count=40&search_text=&start=0&output=atom',
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=424B2&dateb=&owner=include&count=40&search_text=&start=0&output=atom',
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=424B5&dateb=&owner=include&count=40&search_text=&start=0&output=atom',
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&dateb=&owner=include&count=40&search_text=&start=0&output=atom',
] as const;

const ATM_PATTERNS = [
  /\bat-the-market\b/i,
  /\batm offering\b/i,
  /\batm program\b/i,
  /\batm sales agreement\b/i,
] as const;

const CONVERTIBLE_PATTERNS = [
  /\bconvertible(?:\s+(?:senior|subordinated))?\s+notes?\b/i,
  /\bconversion price\b/i,
] as const;

const SECONDARY_PATTERNS = [
  /\bsecondary offering\b/i,
  /\bselling stockholders?\b/i,
  /\bselling shareholders?\b/i,
] as const;

const SHELF_PATTERNS = [
  /\bshelf registration statement\b/i,
  /\buniversal shelf\b/i,
] as const;

const PIPE_PATTERNS = [
  /\bprivate investment in public equity\b/i,
  /\bpipe financing\b/i,
  /\bpipe transaction\b/i,
  /\(PIPE\)/,
] as const;

export type DilutionType =
  | 'ATM Offering'
  | 'Convertible Notes'
  | 'Secondary Offering'
  | 'Shelf Registration'
  | 'PIPE';

function accessionToUuid(accessionNumber: string, dilutionType: DilutionType): string {
  const hex = createHash('sha256')
    .update(`dilution:${accessionNumber}:${dilutionType}`)
    .digest('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function includesPattern(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function isItem801Filing(entry: EdgarAtomEntry): boolean {
  return entry.formType === '8-K' && entry.itemTypes.includes('8.01');
}

function buildDetectionText(entry: EdgarAtomEntry): string {
  return [
    entry.companyName,
    entry.summaryText,
    ...entry.summaryLines,
    ...entry.itemTypes.map((itemType) => entry.itemDescriptions[itemType] ?? itemType),
  ].join('\n');
}

function buildBody(entry: EdgarAtomEntry, dilutionType: DilutionType): string {
  const summaryLine = entry.summaryLines.find((line) => {
    return !/^Filed:/i.test(line) && !/^AccNo:/i.test(line) && !/^Size:/i.test(line);
  });

  const parts = [
    summaryLine?.replace(/^Summary:\s*/i, '').trim()
      ?? `${entry.companyName} filed a ${dilutionType.toLowerCase()} disclosure.`,
    `Accession number: ${entry.accessionNumber}`,
    `Form type: ${entry.formType}`,
    `Link: ${entry.link}`,
  ];

  return parts.join('\n');
}

function estimateAmount(summaryText: string): number | undefined {
  const match = /\$([\d,.]+)\s*(million|billion|thousand)?/i.exec(summaryText);
  if (!match) return undefined;

  const baseAmount = Number(match[1]!.replace(/,/g, ''));
  const unit = match[2]?.toLowerCase();

  if (Number.isNaN(baseAmount)) return undefined;
  if (unit === 'billion') return baseAmount * 1_000_000_000;
  if (unit === 'million') return baseAmount * 1_000_000;
  if (unit === 'thousand') return baseAmount * 1_000;
  return baseAmount;
}

export function parseDilutionAtomFeed(xml: string): EdgarAtomEntry[] {
  return parseEdgarAtomFeed(xml);
}

export function detectDilutionType(entry: EdgarAtomEntry): DilutionType | null {
  const detectionText = buildDetectionText(entry);

  if (includesPattern(detectionText, ATM_PATTERNS)) {
    return 'ATM Offering';
  }

  if (includesPattern(detectionText, CONVERTIBLE_PATTERNS)) {
    return entry.formType === '8-K' && !isItem801Filing(entry)
      ? null
      : 'Convertible Notes';
  }

  if (includesPattern(detectionText, SECONDARY_PATTERNS)) {
    return 'Secondary Offering';
  }

  if (includesPattern(detectionText, PIPE_PATTERNS)) {
    return isItem801Filing(entry) ? 'PIPE' : null;
  }

  if (entry.formType === 'S-3' && includesPattern(detectionText, SHELF_PATTERNS)) {
    return 'Shelf Registration';
  }

  return null;
}

export function mapDilutionSeverity(
  dilutionType: DilutionType,
): 'HIGH' | 'MEDIUM' | 'LOW' {
  switch (dilutionType) {
    case 'ATM Offering':
    case 'Secondary Offering':
      return 'HIGH';
    case 'Convertible Notes':
    case 'PIPE':
      return 'MEDIUM';
    case 'Shelf Registration':
      return 'LOW';
  }
}

export class DilutionScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(1000, 'dilution-monitor');

  public fetchFn: typeof fetch = (...args) => globalThis.fetch(...args);

  constructor(eventBus: EventBus) {
    super({
      name: 'dilution-monitor',
      source: 'dilution-monitor',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const events: RawEvent[] = [];

      for (const url of SEC_ATOM_FEEDS) {
        const entries = await this.fetchFeed(url);

        for (const entry of entries) {
          const dilutionType = detectDilutionType(entry);
          if (!dilutionType) continue;

          const dedupKey = `${entry.accessionNumber}:${dilutionType}`;
          if (this.seenIds.has(dedupKey)) continue;
          this.seenIds.add(dedupKey);

          events.push(this.toEvent(entry, dilutionType));
        }
      }

      return ok(events);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async fetchFeed(url: string): Promise<EdgarAtomEntry[]> {
    const response = await this.fetchFn(url, {
      headers: {
        'User-Agent': SEC_USER_AGENT,
        Accept: SEC_XML_ACCEPT,
      },
    });

    if (!response.ok) {
      throw new Error(`SEC dilution feed returned HTTP ${response.status}`);
    }

    const xml = await response.text();
    return parseDilutionAtomFeed(xml);
  }

  private toEvent(entry: EdgarAtomEntry, dilutionType: DilutionType): RawEvent {
    const ticker = entry.tickers[0] ?? entry.companyName;
    const severity = mapDilutionSeverity(dilutionType);

    return {
      id: accessionToUuid(entry.accessionNumber, dilutionType),
      source: 'dilution-monitor',
      type: 'dilution',
      title: `${ticker} — ${dilutionType} detected`,
      body: buildBody(entry, dilutionType),
      url: entry.link || undefined,
      timestamp: entry.updatedAt ? new Date(entry.updatedAt) : new Date(),
      metadata: {
        source_event_id: `${entry.accessionNumber}:${dilutionType}`,
        accession_number: entry.accessionNumber,
        cik: entry.cik,
        company_name: entry.companyName,
        form_type: entry.formType,
        filing_url: entry.link,
        filed_at: entry.filedAt ?? null,
        updated_at: entry.updatedAt ?? null,
        dilution_type: dilutionType,
        severity,
        direction: 'bearish',
        ticker: entry.tickers[0] ?? null,
        tickers: entry.tickers,
        estimated_amount: estimateAmount(entry.summaryText) ?? null,
      },
    };
  }
}
