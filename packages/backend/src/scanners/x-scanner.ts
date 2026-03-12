import { randomUUID } from 'node:crypto';
import {
  BaseScanner,
  ok,
  err,
  type EventBus,
  type RawEvent,
  type Result,
} from '@event-radar/shared';
import { browserPool } from './scraping/browser-pool.js';
import { SeenIdBuffer } from './scraping/scrape-utils.js';
import type { Page } from 'playwright';
import {
  extractTickers,
  estimateSentiment,
} from '../utils/keyword-extractor.js';

const X_PROFILE_URL = 'https://x.com/elonmusk';
const POLL_INTERVAL_MS = 30_000;

/** Keywords that indicate a reply might be market-relevant */
const MARKET_KEYWORDS = [
  '$',
  'stock',
  'market',
  'billion',
  'million',
  'crypto',
  'bitcoin',
  'doge',
  'tesla',
  'spacex',
];

export interface XPost {
  tweetId: string;
  text: string;
  timestamp: string;
  isRetweet: boolean;
  isQuote: boolean;
  isReply: boolean;
  hasMedia: boolean;
  url: string;
}

/**
 * Parse X/Twitter posts from a DOM document.
 * Pure function — works with both real browser DOM and JSDOM for testing.
 */
export function parseXPosts(doc: Document): XPost[] {
  const posts: XPost[] = [];

  const tweetElements = doc.querySelectorAll(
    '[data-testid="tweet"], article[role="article"]',
  );

  for (const el of tweetElements) {
    const permalink = el.querySelector<HTMLAnchorElement>(
      'a[href*="/status/"]',
    );
    const href = permalink?.getAttribute('href') ?? '';
    const tweetIdMatch = href.match(/\/status\/(\d+)/);
    const tweetId = tweetIdMatch?.[1] ?? '';

    if (!tweetId) continue;

    const contentEl = el.querySelector(
      '[data-testid="tweetText"], .tweet-text',
    );
    const text = contentEl?.textContent?.trim() ?? '';

    const timeEl = el.querySelector('time');
    const timestamp =
      timeEl?.getAttribute('datetime') ?? new Date().toISOString();

    const retweetIndicator = el.querySelector(
      '[data-testid="socialContext"]',
    );
    const retweetText =
      retweetIndicator?.textContent?.toLowerCase() ?? '';
    const isRetweet = retweetText.includes('reposted');

    const quoteEl = el.querySelector(
      '[data-testid="quoteTweet"], .quoted-tweet',
    );
    const isQuote = quoteEl !== null;

    const replyIndicator = el.querySelector(
      '[data-testid="reply-indicator"], .reply-to',
    );
    const isReply = replyIndicator !== null;

    const mediaEl = el.querySelector(
      '[data-testid="tweetPhoto"], video, [data-testid="videoPlayer"]',
    );
    const hasMedia = mediaEl !== null;

    const url = `https://x.com/elonmusk/status/${tweetId}`;

    posts.push({
      tweetId,
      text,
      timestamp,
      isRetweet,
      isQuote,
      isReply,
      hasMedia,
      url,
    });
  }

  return posts;
}

/**
 * Extract tweets from a Playwright page using browser-context evaluation.
 */
export async function extractXPosts(page: Page): Promise<XPost[]> {
  return page.evaluate(() => {
    const posts: Array<{
      tweetId: string;
      text: string;
      timestamp: string;
      isRetweet: boolean;
      isQuote: boolean;
      isReply: boolean;
      hasMedia: boolean;
      url: string;
    }> = [];

    const tweetElements = document.querySelectorAll(
      '[data-testid="tweet"], article[role="article"]',
    );

    for (const el of tweetElements) {
      const permalink = el.querySelector<HTMLAnchorElement>(
        'a[href*="/status/"]',
      );
      const href = permalink?.getAttribute('href') ?? '';
      const tweetIdMatch = href.match(/\/status\/(\d+)/);
      const tweetId = tweetIdMatch?.[1] ?? '';

      if (!tweetId) continue;

      const contentEl = el.querySelector(
        '[data-testid="tweetText"], .tweet-text',
      );
      const text = contentEl?.textContent?.trim() ?? '';

      const timeEl = el.querySelector('time');
      const timestamp =
        timeEl?.getAttribute('datetime') ?? new Date().toISOString();

      const retweetIndicator = el.querySelector(
        '[data-testid="socialContext"]',
      );
      const retweetText =
        retweetIndicator?.textContent?.toLowerCase() ?? '';
      const isRetweet = retweetText.includes('reposted');

      const quoteEl = el.querySelector(
        '[data-testid="quoteTweet"], .quoted-tweet',
      );
      const isQuote = quoteEl !== null;

      const replyIndicator = el.querySelector(
        '[data-testid="reply-indicator"], .reply-to',
      );
      const isReply = replyIndicator !== null;

      const mediaEl = el.querySelector(
        '[data-testid="tweetPhoto"], video, [data-testid="videoPlayer"]',
      );
      const hasMedia = mediaEl !== null;

      const url = `https://x.com/elonmusk/status/${tweetId}`;

      posts.push({
        tweetId,
        text,
        timestamp,
        isRetweet,
        isQuote,
        isReply,
        hasMedia,
        url,
      });
    }

    return posts;
  });
}

/**
 * Check if a reply text contains market-relevant keywords.
 */
export function isMarketRelevantReply(text: string): boolean {
  const lower = text.toLowerCase();
  return MARKET_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

export class XScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500, 'x');

  constructor(eventBus: EventBus) {
    super({
      name: 'x-elonmusk',
      source: 'x',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const posts = await browserPool.scrape(
        X_PROFILE_URL,
        async ({ page }) => {
          await page.waitForSelector(
            '[data-testid="tweet"], article[role="article"]',
            { timeout: 15_000 },
          );
          return extractXPosts(page);
        },
      );

      const newEvents: RawEvent[] = [];

      for (const post of posts) {
        if (this.seenIds.has(post.tweetId)) continue;

        // Filter: skip replies unless they contain market keywords
        if (post.isReply && !post.isQuote && !isMarketRelevantReply(post.text)) {
          continue;
        }

        this.seenIds.add(post.tweetId);

        const title =
          post.text.length > 200
            ? post.text.slice(0, 200) + '…'
            : post.text;

        const tickers = extractTickers(post.text);
        const sentiment = estimateSentiment(post.text);
        const lower = post.text.toLowerCase();
        const isCryptoRelated = ['crypto', 'bitcoin', 'doge', 'dogecoin', 'btc', 'eth'].some(
          (kw) => lower.includes(kw),
        );

        newEvents.push({
          id: randomUUID(),
          source: 'x',
          type: 'political-post',
          title: title || 'X post',
          body: post.text,
          url: post.url,
          timestamp: new Date(post.timestamp),
          metadata: {
            author: 'elonmusk',
            tweetId: post.tweetId,
            isRetweet: post.isRetweet,
            isQuote: post.isQuote,
            hasMedia: post.hasMedia,
            ticker: tickers[0],
            tickers,
            sentiment,
            cryptoRelated: isCryptoRelated,
          },
        });
      }

      return ok(newEvents);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return err(error);
    }
  }
}
