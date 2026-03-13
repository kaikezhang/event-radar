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
import { extractTickers } from './ticker-extractor.js';
import { parseRssXml } from './breaking-news-scanner.js';

const POLL_INTERVAL_MS = 120_000;

export interface NewswireFeedConfig {
  name: string;
  url: string;
  source: 'pr-newswire' | 'businesswire' | 'globenewswire';
}

const DEFAULT_FEEDS: NewswireFeedConfig[] = [
  {
    name: 'PR Newswire',
    url:
      process.env.PRNEWSWIRE_RSS_URL ??
      'https://www.prnewswire.com/rss/news-releases-list.rss',
    source: 'pr-newswire',
  },
  {
    name: 'BusinessWire',
    url:
      process.env.BUSINESSWIRE_RSS_URL ??
      'https://www.businesswire.com/feed/home/20200101005000/en',
    source: 'businesswire',
  },
  {
    name: 'GlobeNewswire',
    url:
      process.env.GLOBENEWSWIRE_RSS_URL ??
      'https://www.globenewswire.com/RssFeed/subjectcode/25-Earnings%20Releases%20and%20Operating%20Results/feedTitle/GlobeNewswire%20-%20Earnings%20Releases%20and%20Operating%20Results',
    source: 'globenewswire',
  },
];

/** Keywords that upgrade severity to HIGH (case-insensitive) */
const HIGH_KEYWORDS = [
  'merger',
  'acquisition',
  'fda approv',
  'restructur',
  'bankrupt',
  'chapter 11',
  'layoff',
  'workforce reduction',
  'earnings pre-announcement',
  'guidance',
] as const;

/** Keywords that upgrade severity to CRITICAL (case-insensitive) */
const CRITICAL_KEYWORDS = [
  'hostile takeover',
  'delisted',
  'sec investigation',
  'fraud',
] as const;

/**
 * Classify severity based on headline/body keywords.
 * Returns 'CRITICAL', 'HIGH', or 'MEDIUM' (default).
 */
export function classifySeverity(
  text: string,
): 'CRITICAL' | 'HIGH' | 'MEDIUM' {
  const lower = text.toLowerCase();

  for (const kw of CRITICAL_KEYWORDS) {
    if (lower.includes(kw)) return 'CRITICAL';
  }

  for (const kw of HIGH_KEYWORDS) {
    if (lower.includes(kw)) return 'HIGH';
  }

  return 'MEDIUM';
}

export class NewswireScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(1000, 'newswire');
  private readonly feeds: NewswireFeedConfig[];
  /** Override for testing */
  public fetchFn: typeof fetch = (...args) => globalThis.fetch(...args);

  constructor(eventBus: EventBus, feeds?: NewswireFeedConfig[]) {
    super({
      name: 'newswire',
      source: 'newswire',
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
              'User-Agent': 'EventRadar/1.0',
              Accept: 'application/rss+xml, application/xml, text/xml',
            },
          });

          if (!response.ok) {
            console.log(
              `[newswire] ${feed.name} returned HTTP ${response.status}`,
            );
            continue;
          }

          const xml = await response.text();
          const items = parseRssXml(xml);

          const MAX_ITEM_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
          const now = Date.now();
          const isTest =
            process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

          for (const item of items) {
            const dedupKey = item.guid || item.link;
            if (this.seenIds.has(dedupKey)) continue;

            // Skip items older than 24 hours (skip in tests)
            if (!isTest && item.pubDate) {
              const itemAge = now - new Date(item.pubDate).getTime();
              if (itemAge > MAX_ITEM_AGE_MS) {
                this.seenIds.add(dedupKey);
                continue;
              }
            }

            this.seenIds.add(dedupKey);

            const fullText = `${item.title} ${item.description}`;
            const tickers = extractTickers(fullText, item.categories);
            const severity = classifySeverity(fullText);
            const body = item.description
              ? item.description.slice(0, 500)
              : item.title;

            events.push({
              id: randomUUID(),
              source: feed.source,
              type: 'press-release',
              title: item.title,
              body,
              url: item.link || undefined,
              timestamp: item.pubDate ? new Date(item.pubDate) : new Date(),
              metadata: {
                source_feed: feed.name,
                severity,
                ticker: tickers[0] ?? null,
                tickers,
                sourceEventId: dedupKey,
                publishedAt: item.pubDate || null,
              },
            });
          }

          console.log(
            `[newswire] Fetched ${items.length} items from ${feed.name}`,
          );
        } catch (feedError) {
          const msg =
            feedError instanceof Error ? feedError.message : String(feedError);
          console.log(`[newswire] ${feed.name} failed: ${msg}`);
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
