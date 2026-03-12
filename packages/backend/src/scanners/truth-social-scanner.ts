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
  extractKeywords,
  estimateSentiment,
  POLITICAL_KEYWORDS,
} from '../utils/keyword-extractor.js';

const TRUTH_SOCIAL_URL = 'https://truthsocial.com/@realDonaldTrump';
const POLL_INTERVAL_MS = 15_000;

export interface TruthSocialPost {
  postId: string;
  text: string;
  timestamp: string;
  isRepost: boolean;
  hasMedia: boolean;
  url: string;
}

/**
 * Parse Truth Social posts from a DOM document.
 * Pure function — works with both real browser DOM and JSDOM for testing.
 */
export function parseTruthSocialPosts(doc: Document): TruthSocialPost[] {
  const posts: TruthSocialPost[] = [];

  const statusElements = doc.querySelectorAll(
    '[data-testid="status"], article.status',
  );

  for (const el of statusElements) {
    const permalink =
      el.querySelector<HTMLAnchorElement>('a[href*="/posts/"]') ??
      el.querySelector<HTMLAnchorElement>('a.status__relative-time');
    const href = permalink?.getAttribute('href') ?? '';
    const postIdMatch = href.match(/\/posts\/(\d+)/);
    const postId = postIdMatch?.[1] ?? el.getAttribute('data-id') ?? '';

    if (!postId) continue;

    const contentEl = el.querySelector(
      '[data-testid="status-content"], .status__content, .e-content',
    );
    const text = contentEl?.textContent?.trim() ?? '';

    const timeEl = el.querySelector('time');
    const timestamp =
      timeEl?.getAttribute('datetime') ?? new Date().toISOString();

    const repostIndicator = el.querySelector(
      '.status__prepend, [data-testid="reblog-indicator"]',
    );
    const isRepost = repostIndicator !== null;

    const mediaEl = el.querySelector(
      '.media-gallery, video, [data-testid="media"]',
    );
    const hasMedia = mediaEl !== null;

    const url = `https://truthsocial.com/@realDonaldTrump/posts/${postId}`;

    posts.push({ postId, text, timestamp, isRepost, hasMedia, url });
  }

  return posts;
}

/**
 * Extract posts from a Playwright page using browser-context evaluation.
 */
export async function extractTruthSocialPosts(
  page: Page,
): Promise<TruthSocialPost[]> {
  return page.evaluate(() => {
    // This function body is serialized and run in the browser context.
    // We inline the parsing logic because page.evaluate cannot reference external closures.
    const posts: Array<{
      postId: string;
      text: string;
      timestamp: string;
      isRepost: boolean;
      hasMedia: boolean;
      url: string;
    }> = [];

    const statusElements = document.querySelectorAll(
      '[data-testid="status"], article.status',
    );

    for (const el of statusElements) {
      const permalink =
        el.querySelector<HTMLAnchorElement>('a[href*="/posts/"]') ??
        el.querySelector<HTMLAnchorElement>('a.status__relative-time');
      const href = permalink?.getAttribute('href') ?? '';
      const postIdMatch = href.match(/\/posts\/(\d+)/);
      const postId = postIdMatch?.[1] ?? el.getAttribute('data-id') ?? '';

      if (!postId) continue;

      const contentEl = el.querySelector(
        '[data-testid="status-content"], .status__content, .e-content',
      );
      const text = contentEl?.textContent?.trim() ?? '';

      const timeEl = el.querySelector('time');
      const timestamp =
        timeEl?.getAttribute('datetime') ?? new Date().toISOString();

      const repostIndicator = el.querySelector(
        '.status__prepend, [data-testid="reblog-indicator"]',
      );
      const isRepost = repostIndicator !== null;

      const mediaEl = el.querySelector(
        '.media-gallery, video, [data-testid="media"]',
      );
      const hasMedia = mediaEl !== null;

      const url = `https://truthsocial.com/@realDonaldTrump/posts/${postId}`;

      posts.push({ postId, text, timestamp, isRepost, hasMedia, url });
    }

    return posts;
  });
}

export class TruthSocialScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500);

  constructor(eventBus: EventBus) {
    super({
      name: 'truth-social',
      source: 'truth-social',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const posts = await browserPool.scrape(
        TRUTH_SOCIAL_URL,
        async ({ page }) => {
          await page.waitForSelector(
            '[data-testid="status"], article.status',
            { timeout: 15_000 },
          );
          return extractTruthSocialPosts(page);
        },
      );

      const newEvents: RawEvent[] = [];

      for (const post of posts) {
        if (this.seenIds.has(post.postId)) continue;
        this.seenIds.add(post.postId);

        const title =
          post.text.length > 200
            ? post.text.slice(0, 200) + '…'
            : post.text;

        const tickers = extractTickers(post.text);
        const keywords = extractKeywords(post.text, POLITICAL_KEYWORDS);
        const sentiment = estimateSentiment(post.text);

        newEvents.push({
          id: randomUUID(),
          source: 'truth-social',
          type: 'political-post',
          title: title || 'Truth Social post',
          body: post.text,
          url: post.url,
          timestamp: new Date(post.timestamp),
          metadata: {
            author: 'trump',
            postId: post.postId,
            isRepost: post.isRepost,
            hasMedia: post.hasMedia,
            ticker: tickers[0],
            tickers,
            keywords,
            sentiment,
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
