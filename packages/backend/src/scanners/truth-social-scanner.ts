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
import {
  POLITICAL_KEYWORDS,
  estimateSentiment,
  extractKeywords,
  extractTickers,
} from '../utils/keyword-extractor.js';

const TRUTH_SOCIAL_URL = 'https://truthsocial.com/@realDonaldTrump';
const TRUTH_SOCIAL_BASE_URL = 'https://truthsocial.com';
const POLL_INTERVAL_MS = 3 * 60 * 1000;

export interface TruthSocialPost {
  postId: string;
  text: string;
  timestamp: string;
  isRepost: boolean;
  hasMedia: boolean;
  url: string;
}

function normalizeText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

export function parseTruthSocialPosts(doc: ParentNode): TruthSocialPost[] {
  return Array.from(doc.querySelectorAll('article.status[data-id]'))
    .map((post) => {
      const postId = post.getAttribute('data-id')?.trim();
      const text = normalizeText(
        post.querySelector('[data-testid="status-content"]')?.textContent,
      );
      const timestamp = post.querySelector('time')?.getAttribute('datetime')?.trim();
      const href =
        post.querySelector('a.status__relative-time')?.getAttribute('href')
        ?? `/@realDonaldTrump/posts/${postId ?? ''}`;

      if (!postId || !text || !timestamp) {
        return null;
      }

      return {
        postId,
        text,
        timestamp,
        isRepost: /reposted/i.test(
          normalizeText(post.querySelector('.status__prepend')?.textContent),
        ),
        hasMedia: Boolean(post.querySelector('.media-gallery img, .media-gallery video')),
        url: new URL(href, TRUTH_SOCIAL_BASE_URL).toString(),
      };
    })
    .filter((post): post is TruthSocialPost => post !== null);
}

export class TruthSocialScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500, 'truth-social');

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
      const posts = await browserPool.scrape<TruthSocialPost[]>(
        TRUTH_SOCIAL_URL,
        async ({ page }) =>
          page.evaluate((baseUrl) => {
            const normalize = (value: string | null | undefined) =>
              (value ?? '').replace(/\s+/g, ' ').trim();

            return Array.from(document.querySelectorAll('article.status[data-id]'))
              .map((post) => {
                const postId = post.getAttribute('data-id')?.trim();
                const text = normalize(
                  post.querySelector('[data-testid="status-content"]')?.textContent,
                );
                const timestamp = post.querySelector('time')?.getAttribute('datetime')?.trim();
                const href =
                  post.querySelector('a.status__relative-time')?.getAttribute('href')
                  ?? `/@realDonaldTrump/posts/${postId ?? ''}`;

                if (!postId || !text || !timestamp) {
                  return null;
                }

                return {
                  postId,
                  text,
                  timestamp,
                  isRepost: /reposted/i.test(
                    normalize(post.querySelector('.status__prepend')?.textContent),
                  ),
                  hasMedia: Boolean(
                    post.querySelector('.media-gallery img, .media-gallery video'),
                  ),
                  url: new URL(href, baseUrl).toString(),
                };
              })
              .filter((post): post is TruthSocialPost => post !== null);
          }, TRUTH_SOCIAL_BASE_URL),
      );

      const events: RawEvent[] = [];

      for (const post of posts) {
        if (this.seenIds.has(post.postId)) continue;
        this.seenIds.add(post.postId);

        const title =
          post.text.length > 200
            ? `${post.text.slice(0, 200)}…`
            : post.text;
        const tickers = extractTickers(post.text);
        const keywords = extractKeywords(post.text, POLITICAL_KEYWORDS);
        const sentiment = estimateSentiment(post.text);

        events.push({
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

      return ok(events);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return err(error);
    }
  }
}
