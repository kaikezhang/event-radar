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

/** Market-moving keywords to filter breaking news */
const MARKET_KEYWORDS = [
  'tariff',
  'sanction',
  'war',
  'embargo',
  'opec',
  'fed',
  'rate',
  'inflation',
  'recession',
  'default',
  'bailout',
  'merger',
  'acquisition',
  'layoff',
  'guidance',
  'earnings',
  'bankruptcy',
  'stimulus',
  'shutdown',
  'stock',
  'market',
  'trade',
  'economy',
  'gdp',
  'treasury',
  'debt',
  'regulation',
] as const;

export interface RssFeedConfig {
  name: string;
  url: string;
}

const DEFAULT_FEEDS: RssFeedConfig[] = [
  {
    name: 'Reuters',
    url: 'https://www.reutersagency.com/feed/',
  },
  {
    name: 'AP News',
    url: 'https://rsshub.app/apnews/topics/business',
  },
  {
    name: 'MarketWatch',
    url: 'https://feeds.marketwatch.com/marketwatch/topstories/',
  },
  {
    name: 'CNBC',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
  },
  {
    name: 'Yahoo Finance',
    url: 'https://finance.yahoo.com/news/rssindex',
  },
];

export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  guid: string;
}

/**
 * Parse a simplified XML RSS feed into items.
 * This is a lightweight parser that extracts <item> elements
 * without requiring a full XML library.
 */
export function parseRssXml(xml: string): RssItem[] {
  const items: RssItem[] = [];

  // Match all <item>...</item> blocks
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]!;

    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const description = extractTag(block, 'description');
    const guid = extractTag(block, 'guid') || link || title;

    if (title && guid) {
      items.push({
        title,
        link: link || '',
        pubDate: pubDate || '',
        description: description || '',
        guid,
      });
    }
  }

  return items;
}

/**
 * Extract text content from an XML tag.
 */
function extractTag(xml: string, tag: string): string {
  // Match both CDATA and plain text
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

/**
 * Check if article text matches any market-moving keywords.
 * Returns the list of matched keywords.
 */
export function matchKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return MARKET_KEYWORDS.filter((kw) => lower.includes(kw));
}

export class BreakingNewsScanner extends BaseScanner {
  private readonly seenUrls = new SeenIdBuffer(1000);
  private readonly feeds: RssFeedConfig[];
  /** Override for testing */
  public fetchFn: typeof fetch = globalThis.fetch.bind(globalThis);

  constructor(eventBus: EventBus, feeds?: RssFeedConfig[]) {
    super({
      name: 'breaking-news',
      source: 'breaking-news',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
    this.feeds = feeds ?? DEFAULT_FEEDS;
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const events: RawEvent[] = [];

      for (const feed of this.feeds) {
        try {
          const response = await this.fetchFn(feed.url, {
            headers: {
              'User-Agent': 'event-radar/1.0',
              Accept: 'application/rss+xml, application/xml, text/xml',
            },
          });

          if (!response.ok) {
            console.log(`[breaking-news] ${feed.name} returned HTTP ${response.status}`);
            continue;
          }

          const xml = await response.text();
          const items = parseRssXml(xml);
          let matchedCount = 0;

          for (const item of items) {
            const dedupKey = item.guid || item.link;
            if (this.seenUrls.has(dedupKey)) continue;

            const fullText = `${item.title} ${item.description}`;
            const matched = matchKeywords(fullText);

            if (matched.length === 0) continue;

            matchedCount++;
            this.seenUrls.add(dedupKey);

            events.push({
              id: randomUUID(),
              source: 'breaking-news',
              type: 'breaking-news',
              title: item.title,
              body: item.description || item.title,
              url: item.link || undefined,
              timestamp: item.pubDate ? new Date(item.pubDate) : new Date(),
              metadata: {
                source_feed: feed.name,
                headline: item.title,
                url: item.link,
                matched_keywords: matched,
              },
            });
          }

          console.log(`[breaking-news] Fetched ${items.length} items from ${feed.name}, ${matchedCount} matched keywords`);
        } catch (feedError) {
          const msg = feedError instanceof Error ? feedError.message : String(feedError);
          console.log(`[breaking-news] ${feed.name} failed: ${msg}`);
          continue;
        }
      }

      return ok(events);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return err(error);
    }
  }
}
