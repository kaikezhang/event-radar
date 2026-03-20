import {
  BaseScanner,
  err,
  ok,
  scannerFetch,
  type EventBus,
  type RawEvent,
  type Result,
} from '@event-radar/shared';
import { resolveScannerIntervalMs } from './scanner-intervals.js';
import { SeenIdBuffer } from './scraping/scrape-utils.js';
import { extractTickers } from './ticker-extractor.js';
import {
  deterministicScannerUuid,
  SEC_USER_AGENT,
  SEC_XML_ACCEPT,
} from './sec-edgar-feed-utils.js';

const EIGHT_K_POLL_INTERVAL_MS = 60_000;
const FORM_4_POLL_INTERVAL_MS = 120_000;

const EIGHT_K_ATOM_URL =
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&dateb=&owner=include&count=40&search_text=&start=0&output=atom';
const FORM_4_ATOM_URL =
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&dateb=&owner=include&count=40&search_text=&start=0&output=atom';

const HIGH_PRIORITY_8K_ITEMS = new Set([
  '1.01',
  '1.02',
  '2.01',
  '2.05',
  '2.06',
  '5.02',
]);

const MEDIUM_PRIORITY_8K_ITEMS = new Set([
  '7.01',
  '8.01',
]);

const FORM_4_PURCHASE_PATTERN = /\b(acquir|purchase|buy|bought)\b/i;
const FORM_4_SALE_PATTERN = /\b(sale|sell|sold|dispose|disposed)\b/i;
const ACCESSION_PATTERN = /\b\d{10}-\d{2}-\d{6}\b/;
const ITEM_LINE_PATTERN = /^Item\s+(\d+\.\d{2})\s*:\s*(.+)$/i;
const TITLE_COMPANY_PATTERN = /^(.+?)\s-\s(.+?)\s+\((\d{1,10})\)\s+\(([^)]+)\)$/;

export type EdgarSeverityHint = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface EdgarAtomEntry {
  accessionNumber: string;
  cik: string;
  companyName: string;
  filingRole?: string;
  formType: string;
  link: string;
  filedAt?: string;
  updatedAt?: string;
  summaryText: string;
  summaryLines: string[];
  itemTypes: string[];
  itemDescriptions: Record<string, string>;
  tickers: string[];
  officerName?: string;
  issuerName?: string;
  transactionType?: 'purchase' | 'sale';
  transactionValue?: number;
  shares?: number;
  pricePerShare?: number;
}

function htmlDecode(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractTag(xml: string, tag: string): string {
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    'i',
  );
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1]!.trim();

  const plainRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const plainMatch = plainRegex.exec(xml);
  if (plainMatch) return plainMatch[1]!.trim();

  return '';
}

function extractLinkHref(xml: string): string {
  const match =
    /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i.exec(xml)
    ?? /<link[^>]*href="([^"]+)"/i.exec(xml);

  return match?.[1]?.trim() ?? '';
}

function parseSummary(summary: string): {
  summaryText: string;
  summaryLines: string[];
  filedAt?: string;
  accessionNumber?: string;
  itemTypes: string[];
  itemDescriptions: Record<string, string>;
  tickers: string[];
  officerName?: string;
  issuerName?: string;
  transactionType?: 'purchase' | 'sale';
  transactionValue?: number;
  shares?: number;
  pricePerShare?: number;
} {
  const decoded = htmlDecode(summary)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const summaryLines = decoded
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const itemTypes: string[] = [];
  const itemDescriptions: Record<string, string> = {};
  let filedAt: string | undefined;
  let accessionNumber: string | undefined;
  let officerName: string | undefined;
  let issuerName: string | undefined;
  let transactionType: 'purchase' | 'sale' | undefined;
  let transactionValue: number | undefined;
  let shares: number | undefined;
  let pricePerShare: number | undefined;

  for (const line of summaryLines) {
    if (!filedAt) {
      const filedMatch = /Filed:\s*(\d{4}-\d{2}-\d{2})/i.exec(line);
      if (filedMatch) filedAt = filedMatch[1];
    }

    if (!accessionNumber) {
      const accessionMatch = /AccNo:\s*(\d{10}-\d{2}-\d{6})/i.exec(line);
      if (accessionMatch) accessionNumber = accessionMatch[1];
    }

    const itemMatch = ITEM_LINE_PATTERN.exec(line);
    if (itemMatch) {
      const itemType = itemMatch[1]!;
      itemTypes.push(itemType);
      itemDescriptions[itemType] = itemMatch[2]!.trim();
      continue;
    }

    if (!officerName) {
      const officerMatch = /^Officer:\s*(.+)$/i.exec(line);
      if (officerMatch) officerName = officerMatch[1]!.trim();
    }

    if (!issuerName) {
      const issuerMatch = /^Issuer:\s*(.+)$/i.exec(line);
      if (issuerMatch) issuerName = issuerMatch[1]!.trim();
    }

    if (!transactionType) {
      const transactionMatch = /^Transaction:\s*(.+)$/i.exec(line);
      const transactionLabel = transactionMatch?.[1] ?? line;
      if (FORM_4_PURCHASE_PATTERN.test(transactionLabel)) {
        transactionType = 'purchase';
      } else if (FORM_4_SALE_PATTERN.test(transactionLabel)) {
        transactionType = 'sale';
      }
    }

    if (transactionValue === undefined) {
      const valueMatch = /^Value:\s*\$?([\d,]+(?:\.\d+)?)$/i.exec(line);
      if (valueMatch) transactionValue = parseAmount(valueMatch[1]!);
    }

    if (shares === undefined) {
      const sharesMatch = /^Shares:\s*([\d,]+(?:\.\d+)?)$/i.exec(line);
      if (sharesMatch) shares = parseAmount(sharesMatch[1]!);
    }

    if (pricePerShare === undefined) {
      const priceMatch = /^Price:\s*\$?([\d,]+(?:\.\d+)?)$/i.exec(line);
      if (priceMatch) pricePerShare = parseAmount(priceMatch[1]!);
    }
  }

  const summaryText = summaryLines.join('\n');
  const tickers = extractTickers(summaryText);

  return {
    summaryText,
    summaryLines,
    filedAt,
    accessionNumber,
    itemTypes,
    itemDescriptions,
    tickers,
    officerName,
    issuerName,
    transactionType,
    transactionValue,
    shares,
    pricePerShare,
  };
}

function parseAmount(value: string): number {
  return Number(value.replace(/,/g, ''));
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value);
}

function accessionToUuid(accessionNumber: string): string {
  return deterministicScannerUuid(`sec-edgar:${accessionNumber}`);
}

function normalizeCompanyName(value: string): string {
  return value
    .replace(/\((?:NASDAQ|NYSE|TSX|AMEX|OTC)\s*:\s*[A-Z]{1,5}\)/gi, '')
    .trim();
}

function build8KSummaryText(entry: EdgarAtomEntry): string {
  const lines = entry.summaryLines.filter((line) => {
    return !/^Filed:/i.test(line) && !/^Item\s+\d+\.\d{2}:/i.test(line);
  });

  const summaryLine = lines.find((line) => !/^Size:/i.test(line) && !/^AccNo:/i.test(line));
  return summaryLine?.replace(/^Summary:\s*/i, '').trim() ?? 'Recent SEC 8-K filing detected.';
}

function inferForm4Action(entry: EdgarAtomEntry): 'bought' | 'sold' | 'filed' {
  if (entry.transactionType === 'purchase') return 'bought';
  if (entry.transactionType === 'sale') return 'sold';
  return 'filed';
}

function buildForm4Title(entry: EdgarAtomEntry): string {
  const actor = entry.officerName ?? entry.issuerName ?? entry.companyName;
  const ticker = entry.tickers[0] ?? normalizeCompanyName(entry.issuerName ?? entry.companyName);
  const action = inferForm4Action(entry);

  if (entry.transactionValue !== undefined && entry.transactionValue > 0 && action !== 'filed') {
    return `SEC Form 4: ${actor} ${action} $${formatAmount(entry.transactionValue)} of ${ticker}`;
  }

  return `SEC Form 4: ${actor} filed insider trade disclosure for ${ticker}`;
}

function buildForm4Body(entry: EdgarAtomEntry): string {
  const parts = [
    entry.summaryText || 'Recent SEC Form 4 filing detected.',
    `Accession number: ${entry.accessionNumber}`,
    `CIK: ${entry.cik}`,
    `Link: ${entry.link}`,
  ];

  return parts.join('\n');
}

function build8KBody(entry: EdgarAtomEntry): string {
  const parts = [
    build8KSummaryText(entry),
    `Accession number: ${entry.accessionNumber}`,
    `CIK: ${entry.cik}`,
    `Link: ${entry.link}`,
  ];

  return parts.join('\n');
}

function primary8KItem(entry: EdgarAtomEntry): string | undefined {
  const priority = (itemType: string): number => {
    if (HIGH_PRIORITY_8K_ITEMS.has(itemType)) return 0;
    if (MEDIUM_PRIORITY_8K_ITEMS.has(itemType)) return 1;
    return 2;
  };

  return [...entry.itemTypes].sort((left, right) => priority(left) - priority(right))[0];
}

function coalesceForm4Entries(entries: EdgarAtomEntry[]): EdgarAtomEntry[] {
  const merged = new Map<string, EdgarAtomEntry>();

  for (const entry of entries) {
    const existing = merged.get(entry.accessionNumber);
    if (!existing) {
      const normalizedEntry: EdgarAtomEntry = {
        ...entry,
        tickers: [...entry.tickers],
        itemTypes: [...entry.itemTypes],
        itemDescriptions: { ...entry.itemDescriptions },
      };
      if (normalizedEntry.filingRole?.toLowerCase() === 'reporting') {
        normalizedEntry.officerName ??= normalizedEntry.companyName;
      }
      if (normalizedEntry.filingRole?.toLowerCase() === 'issuer') {
        normalizedEntry.issuerName ??= normalizedEntry.companyName;
      }
      merged.set(entry.accessionNumber, normalizedEntry);
      continue;
    }

    existing.summaryText = existing.summaryText || entry.summaryText;
    existing.summaryLines = existing.summaryLines.length > 0 ? existing.summaryLines : entry.summaryLines;
    existing.filedAt ??= entry.filedAt;
    existing.updatedAt ??= entry.updatedAt;
    existing.link ||= entry.link;
    existing.officerName ??= entry.officerName;
    existing.issuerName ??= entry.issuerName;
    existing.transactionType ??= entry.transactionType;
    existing.transactionValue ??= entry.transactionValue;
    existing.shares ??= entry.shares;
    existing.pricePerShare ??= entry.pricePerShare;

    if (entry.filingRole?.toLowerCase() === 'reporting') {
      existing.officerName ??= entry.companyName;
    }
    if (entry.filingRole?.toLowerCase() === 'issuer') {
      existing.issuerName ??= entry.companyName;
    }

    for (const ticker of entry.tickers) {
      if (!existing.tickers.includes(ticker)) {
        existing.tickers.push(ticker);
      }
    }
  }

  return Array.from(merged.values());
}

export function map8KSeverity(itemTypes: string[]): EdgarSeverityHint {
  if (itemTypes.some((itemType) => HIGH_PRIORITY_8K_ITEMS.has(itemType))) {
    return 'HIGH';
  }

  if (itemTypes.some((itemType) => MEDIUM_PRIORITY_8K_ITEMS.has(itemType))) {
    return 'MEDIUM';
  }

  return 'LOW';
}

export function mapForm4Severity(transactionValue = 0): EdgarSeverityHint {
  if (transactionValue > 10_000_000) return 'CRITICAL';
  if (transactionValue > 1_000_000) return 'HIGH';
  return 'MEDIUM';
}

export function parseEdgarAtomFeed(xml: string): EdgarAtomEntry[] {
  const entries: EdgarAtomEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1]!;
    const title = extractTag(block, 'title');
    const summary = extractTag(block, 'summary');
    const updatedAt = extractTag(block, 'updated') || undefined;
    const id = extractTag(block, 'id');
    const formType =
      /<category[^>]*term="([^"]+)"/i.exec(block)?.[1]?.trim()
      ?? title.split(' - ')[0]?.trim()
      ?? '';

    if (!title || !formType) continue;

    const titleMatch = TITLE_COMPANY_PATTERN.exec(title);
    const companyName = titleMatch?.[2]?.trim() ?? title;
    const cik = titleMatch?.[3]?.padStart(10, '0') ?? '';
    const filingRole = titleMatch?.[4]?.trim();
    const summaryMeta = parseSummary(summary);
    const accessionNumber =
      summaryMeta.accessionNumber
      ?? ACCESSION_PATTERN.exec(id)?.[0]
      ?? ACCESSION_PATTERN.exec(summaryMeta.summaryText)?.[0]
      ?? '';

    if (!accessionNumber) continue;

    entries.push({
      accessionNumber,
      cik,
      companyName,
      filingRole,
      formType,
      link: extractLinkHref(block),
      filedAt: summaryMeta.filedAt,
      updatedAt,
      summaryText: summaryMeta.summaryText,
      summaryLines: summaryMeta.summaryLines,
      itemTypes: summaryMeta.itemTypes,
      itemDescriptions: summaryMeta.itemDescriptions,
      tickers: summaryMeta.tickers,
      officerName: summaryMeta.officerName,
      issuerName: summaryMeta.issuerName
        ? normalizeCompanyName(summaryMeta.issuerName)
        : undefined,
      transactionType: summaryMeta.transactionType,
      transactionValue: summaryMeta.transactionValue,
      shares: summaryMeta.shares,
      pricePerShare: summaryMeta.pricePerShare,
    });
  }

  return entries;
}

export class SecEdgarScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(1000, 'sec-edgar');
  private lastForm4PollAt: number | null = null;
  private readonly form4PollIntervalMs: number;

  public fetchFn: typeof scannerFetch = (url, options) =>
    scannerFetch(url, options);

  constructor(eventBus: EventBus) {
    const eightKPollIntervalMs = resolveScannerIntervalMs('SEC', EIGHT_K_POLL_INTERVAL_MS);
    const form4PollIntervalMs = resolveScannerIntervalMs(
      ['SEC_FORM4', 'SEC'],
      FORM_4_POLL_INTERVAL_MS,
    );

    super({
      name: 'sec-edgar',
      source: 'sec-edgar',
      pollIntervalMs: eightKPollIntervalMs,
      eventBus,
    });

    this.form4PollIntervalMs = form4PollIntervalMs;
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const now = Date.now();
      const shouldPollForm4 =
        this.lastForm4PollAt === null || now - this.lastForm4PollAt >= this.form4PollIntervalMs;

      const filings8K = await this.fetchFeed(EIGHT_K_ATOM_URL);
      const form4Entries = shouldPollForm4
        ? await this.fetchFeed(FORM_4_ATOM_URL)
        : [];

      if (shouldPollForm4) {
        this.lastForm4PollAt = now;
      }

      const events: RawEvent[] = [];

      for (const entry of filings8K) {
        if (this.seenIds.has(entry.accessionNumber)) continue;
        this.seenIds.add(entry.accessionNumber);
        events.push(this.to8KEvent(entry));
      }

      for (const entry of coalesceForm4Entries(form4Entries)) {
        if (this.seenIds.has(entry.accessionNumber)) continue;
        this.seenIds.add(entry.accessionNumber);
        events.push(this.toForm4Event(entry));
      }

      return ok(events);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async fetchFeed(url: string): Promise<EdgarAtomEntry[]> {
    const response = await this.fetchFn(url, {
      timeoutMs: 30_000,
      headers: {
        'User-Agent': SEC_USER_AGENT,
        Accept: SEC_XML_ACCEPT,
      },
    });

    if (!response.ok) {
      throw new Error(`SEC feed returned HTTP ${response.status}`);
    }

    const xml = await response.text();
    return parseEdgarAtomFeed(xml);
  }

  private to8KEvent(entry: EdgarAtomEntry): RawEvent {
    const primaryItem = primary8KItem(entry);
    const primaryItemDescription = primaryItem
      ? entry.itemDescriptions[primaryItem] ?? 'Recent filing update'
      : 'Recent filing update';
    const severityHint = map8KSeverity(entry.itemTypes);
    const ticker = entry.tickers[0];

    return {
      id: accessionToUuid(entry.accessionNumber),
      source: 'sec-edgar',
      type: 'sec_form_8k',
      title: `SEC 8-K: ${entry.companyName} — Item ${primaryItem ?? 'N/A'} (${primaryItemDescription})`,
      body: build8KBody(entry),
      url: entry.link || undefined,
      timestamp: entry.updatedAt ? new Date(entry.updatedAt) : new Date(),
      metadata: {
        source_event_id: entry.accessionNumber,
        accession_number: entry.accessionNumber,
        cik: entry.cik,
        company_name: entry.companyName,
        form_type: entry.formType,
        filing_link: entry.link,
        filed_at: entry.filedAt ?? null,
        updated_at: entry.updatedAt ?? null,
        item_types: entry.itemTypes,
        item_descriptions: entry.itemDescriptions,
        ticker: ticker ?? null,
        tickers: entry.tickers,
        severity_hint: severityHint,
      },
    };
  }

  private toForm4Event(entry: EdgarAtomEntry): RawEvent {
    const transactionValue = entry.transactionValue ?? 0;
    const severityHint = mapForm4Severity(transactionValue);
    const ticker = entry.tickers[0];

    return {
      id: accessionToUuid(entry.accessionNumber),
      source: 'sec-edgar',
      type: 'sec_form_4',
      title: buildForm4Title(entry),
      body: buildForm4Body(entry),
      url: entry.link || undefined,
      timestamp: entry.updatedAt ? new Date(entry.updatedAt) : new Date(),
      metadata: {
        source_event_id: entry.accessionNumber,
        accession_number: entry.accessionNumber,
        cik: entry.cik,
        form_type: entry.formType,
        filing_link: entry.link,
        filed_at: entry.filedAt ?? null,
        updated_at: entry.updatedAt ?? null,
        officer_name: entry.officerName ?? null,
        issuer_name: normalizeCompanyName(entry.issuerName ?? entry.companyName),
        transaction_type: entry.transactionType ?? null,
        transaction_value: transactionValue,
        shares: entry.shares ?? null,
        price_per_share: entry.pricePerShare ?? null,
        ticker: ticker ?? null,
        tickers: entry.tickers,
        severity_hint: severityHint,
      },
    };
  }
}
