import { createHash, randomUUID } from 'node:crypto';
import { load, type AnyNode, type Cheerio } from 'cheerio';
import { z } from 'zod';
import {
  BaseScanner,
  err,
  ok,
  type EventBus,
  type RawEvent,
  type Result,
} from '@event-radar/shared';
import { parseRssXml, type RssItem } from './breaking-news-scanner.js';
import { SeenIdBuffer } from './scraping/scrape-utils.js';

export const IR_MONITOR_POLL_INTERVAL_MS = 300_000;
const DEFAULT_SELECTOR = 'article, li, .press-release, .module_item';

const IrMonitorCompanyConfigSchema = z.object({
  ticker: z.string().trim().min(1),
  name: z.string().trim().min(1),
  feedUrl: z.string().url().optional(),
  pageUrl: z.string().url(),
  selector: z.string().trim().min(1).optional(),
});

export type IrMonitorCompanyConfig = z.infer<typeof IrMonitorCompanyConfigSchema>;
type IrMonitorRssCompanyConfig = IrMonitorCompanyConfig & { feedUrl: string };

export interface IrPressRelease {
  title: string;
  url: string;
  snippet: string;
}

export const DEFAULT_IR_MONITOR_COMPANIES: IrMonitorCompanyConfig[] = [
  {
    ticker: 'AAPL',
    name: 'Apple',
    pageUrl: 'https://investor.apple.com/sec-filings/default.aspx',
    selector: '.module_item',
  },
  {
    ticker: 'NVDA',
    name: 'NVIDIA',
    pageUrl: 'https://investor.nvidia.com/news/press-release-details/',
    selector: 'article, .module_item',
  },
  {
    ticker: 'TSLA',
    name: 'Tesla',
    pageUrl: 'https://ir.tesla.com/press-release',
    selector: '.press-release, article',
  },
  {
    ticker: 'META',
    name: 'Meta',
    pageUrl: 'https://investor.fb.com/press-releases/',
    selector: '.module_item, article',
  },
  {
    ticker: 'MSFT',
    name: 'Microsoft',
    pageUrl: 'https://www.microsoft.com/en-us/investor/press-releases-and-news/press-releases/default.aspx',
    selector: 'article, main a[href]',
  },
  {
    ticker: 'GOOGL',
    name: 'Alphabet',
    pageUrl: 'https://abc.xyz/investor/',
    selector: 'article, .investor-feed__item, a[href*=\"press\"]',
  },
];

function normalizeCompanyConfig(
  config: IrMonitorCompanyConfig,
): IrMonitorCompanyConfig {
  return {
    ticker: config.ticker.trim().toUpperCase(),
    name: config.name.trim(),
    feedUrl: config.feedUrl?.trim(),
    pageUrl: config.pageUrl.trim(),
    selector: config.selector?.trim(),
  };
}

function parseIrMonitorCompaniesRaw(
  rawValue: string,
): Result<IrMonitorCompanyConfig[], Error> {
  try {
    const trimmed = rawValue.trim();
    const parsed: unknown = trimmed.startsWith('[')
      ? JSON.parse(trimmed)
      : JSON.parse(`[${trimmed}]`);

    const normalizedArray = z
      .array(IrMonitorCompanyConfigSchema)
      .parse(parsed)
      .map(normalizeCompanyConfig);

    return ok(normalizedArray);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

export function parseIrMonitorCompaniesEnv(
  rawValue = process.env.IR_MONITOR_COMPANIES,
): IrMonitorCompanyConfig[] {
  if (!rawValue?.trim()) {
    return DEFAULT_IR_MONITOR_COMPANIES.map(normalizeCompanyConfig);
  }

  const parsed = parseIrMonitorCompaniesRaw(rawValue);
  if (parsed.ok) {
    return parsed.value;
  }

  console.log(
    `[ir-monitor] Invalid IR_MONITOR_COMPANIES config: ${parsed.error.message}. Scanner companies disabled until the config is fixed.`,
  );

  return [];
}

export function hashContent(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex');
}

export function buildIrMonitorEventId(ticker: string, sourceId: string): string {
  return `${ticker}:${sourceId}`;
}

const decodeEntityRoot = load('<div id="entity-decoder"></div>');

function decodeHtmlEntities(text: string): string {
  const root = decodeEntityRoot('#entity-decoder');
  root.html(text);
  return root.text();
}

function normalizeText(text: string): string {
  return decodeHtmlEntities(text).replace(/\s+/g, ' ').trim();
}

function trimSnippet(text: string, maxLength = 280): string {
  const normalized = normalizeText(text);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function resolveUrl(href: string, pageUrl: string): string | null {
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return null;
  }
}

function extractSnippet($root: Cheerio<AnyNode>, title: string): string {
  const paragraph = normalizeText($root.find('p').first().text());
  if (paragraph) return trimSnippet(paragraph);

  const combined = normalizeText($root.text());
  const withoutTitle = combined.startsWith(title)
    ? combined.slice(title.length).trim()
    : combined;

  return trimSnippet(withoutTitle || title);
}

export function extractPressReleasesFromHtml(
  html: string,
  pageUrl: string,
  selector?: string,
): IrPressRelease[] {
  const $ = load(html);
  const releases: IrPressRelease[] = [];
  const seenKeys = new Set<string>();
  const targets = $(selector ?? DEFAULT_SELECTOR);

  const addRelease = (anchor: Cheerio<AnyNode>) => {
    const href = anchor.attr('href');
    const resolvedUrl = href ? resolveUrl(href, pageUrl) : null;
    const title = normalizeText(anchor.text());

    if (!resolvedUrl || !title) return;

    const container = anchor.closest('article, li, section, div');
    const snippet = extractSnippet(container.length > 0 ? container : anchor, title);
    const dedupKey = `${resolvedUrl}::${title}`;

    if (seenKeys.has(dedupKey)) return;
    seenKeys.add(dedupKey);
    releases.push({ title, url: resolvedUrl, snippet });
  };

  if (targets.length > 0) {
    targets.each((_index, element) => {
      const $element = $(element);
      if ($element.is('a[href]')) {
        addRelease($element);
        return;
      }

      const anchor = $element.find('a[href]').first();
      if (anchor.length > 0) {
        addRelease(anchor);
      }
    });
  }

  if (releases.length === 0) {
    $('a[href]').each((_index, element) => {
      const anchor = $(element);
      const href = anchor.attr('href') ?? '';
      if (!/press|news|release/i.test(href)) return;
      addRelease(anchor);
    });
  }

  return releases;
}

function buildPageHashSource(
  html: string,
  pageUrl: string,
  selector?: string,
): string {
  const $ = load(html);

  if (selector) {
    const scopedHtml = $(selector)
      .toArray()
      .map((element) => $.html(element))
      .join('\n');
    if (scopedHtml.trim()) return scopedHtml;
  }

  const extractedReleases = extractPressReleasesFromHtml(html, pageUrl);
  if (extractedReleases.length > 0) {
    return extractedReleases
      .map((release) => `${release.url}\n${release.title}\n${release.snippet}`)
      .join('\n---\n');
  }

  // JS-rendered IR pages may not expose meaningful static content in the body.
  // Fall back to the full document so head/script changes still affect the hash.
  return html;
}

function mapRssItemToEvent(
  company: IrMonitorCompanyConfig,
  item: RssItem,
  sourceEventId: string,
): RawEvent {
  const url = item.link || company.pageUrl;
  const detectedAt = new Date().toISOString();

  return {
    id: randomUUID(),
    source: 'company-ir',
    type: 'press-release',
    title: `[${company.ticker}] ${normalizeText(item.title)}`,
    body: trimSnippet(item.description || item.title),
    url,
    timestamp: item.pubDate ? new Date(item.pubDate) : new Date(),
    metadata: {
      companyName: company.name,
      url,
      detectedAt,
      ticker: company.ticker,
      tickers: [company.ticker],
      sourceEventId,
      detectionMethod: 'rss',
      publishedAt: item.pubDate || null,
    },
  };
}

function mapPageReleaseToEvent(
  company: IrMonitorCompanyConfig,
  release: IrPressRelease,
  sourceEventId: string,
): RawEvent {
  return {
    id: randomUUID(),
    source: 'company-ir',
    type: 'press-release',
    title: `[${company.ticker}] ${release.title}`,
    body: trimSnippet(release.snippet || release.title),
    url: release.url,
    timestamp: new Date(),
    metadata: {
      companyName: company.name,
      url: release.url,
      detectedAt: new Date().toISOString(),
      ticker: company.ticker,
      tickers: [company.ticker],
      sourceEventId,
      detectionMethod: 'page-diff',
    },
  };
}

export class IrMonitorScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(2000, 'ir-monitor');
  private readonly companies: IrMonitorCompanyConfig[];
  private readonly pageHashes = new Map<string, string>();
  private readonly pageEntries = new Map<string, Set<string>>();
  public fetchFn: typeof fetch = (...args) => globalThis.fetch(...args);

  constructor(
    eventBus: EventBus,
    companies = parseIrMonitorCompaniesEnv(),
  ) {
    super({
      name: 'ir-monitor',
      source: 'company-ir',
      pollIntervalMs: IR_MONITOR_POLL_INTERVAL_MS,
      eventBus,
    });
    this.companies = companies.map(normalizeCompanyConfig);
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const events: RawEvent[] = [];

      for (const company of this.companies) {
        try {
          const companyEvents = company.feedUrl
            ? await this.pollRssCompany({ ...company, feedUrl: company.feedUrl })
            : await this.pollPageCompany(company);

          events.push(...companyEvents);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(`[ir-monitor] ${company.ticker} failed: ${message}`);
        }
      }

      return ok(events);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async pollRssCompany(
    company: IrMonitorRssCompanyConfig,
  ): Promise<RawEvent[]> {
    if (!company.feedUrl) {
      throw new Error(`RSS feed URL is required for ${company.ticker}`);
    }

    const response = await this.fetchFn(company.feedUrl, {
      headers: {
        'User-Agent': 'event-radar/1.0',
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      throw new Error(`RSS returned HTTP ${response.status}`);
    }

    const xml = await response.text();
    const items = parseRssXml(xml);
    const events: RawEvent[] = [];

    for (const item of items) {
      const sourceId = item.guid || item.link || item.title;
      const dedupKey = buildIrMonitorEventId(company.ticker, sourceId);

      if (this.seenIds.has(dedupKey)) continue;

      this.seenIds.add(dedupKey);
      events.push(mapRssItemToEvent(company, item, dedupKey));
    }

    console.log(`[ir-monitor] ${company.ticker} RSS fetched ${items.length} items`);
    return events;
  }

  private async pollPageCompany(
    company: IrMonitorCompanyConfig,
  ): Promise<RawEvent[]> {
    const response = await this.fetchFn(company.pageUrl, {
      headers: {
        'User-Agent': 'event-radar/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`Page returned HTTP ${response.status}`);
    }

    const html = await response.text();
    const pageHash = hashContent(buildPageHashSource(html, company.pageUrl, company.selector));
    const releases = extractPressReleasesFromHtml(html, company.pageUrl, company.selector);
    const currentIds = new Set(
      releases.map((release) => buildIrMonitorEventId(company.ticker, release.url)),
    );

    const previousHash = this.pageHashes.get(company.ticker);
    const previousIds = this.pageEntries.get(company.ticker) ?? new Set<string>();

    this.pageHashes.set(company.ticker, pageHash);
    this.pageEntries.set(company.ticker, currentIds);

    if (!previousHash) {
      for (const id of currentIds) {
        this.seenIds.add(id);
      }
      console.log(`[ir-monitor] ${company.ticker} baseline set with ${releases.length} entries`);
      return [];
    }

    if (previousHash === pageHash) {
      console.log(`[ir-monitor] ${company.ticker} page unchanged`);
      return [];
    }

    const events: RawEvent[] = [];

    for (const release of releases) {
      const sourceEventId = buildIrMonitorEventId(company.ticker, release.url);
      if (previousIds.has(sourceEventId) || this.seenIds.has(sourceEventId)) continue;

      this.seenIds.add(sourceEventId);
      events.push(mapPageReleaseToEvent(company, release, sourceEventId));
    }

    console.log(`[ir-monitor] ${company.ticker} page diff detected, ${events.length} new entries`);
    return events;
  }
}
