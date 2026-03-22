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
import {
  extractTickers,
  extractKeywords,
  estimateSentiment,
  POLITICAL_KEYWORDS,
} from '../utils/keyword-extractor.js';

/**
 * CNN maintains a publicly accessible archive of Trump's Truth Social posts,
 * updated every ~5 minutes. This is far more reliable than browser scraping
 * and requires no API key, proxy, or authentication.
 *
 * Format: JSON array of { id, created_at, content, url, media, replies_count, ... }
 */
const CNN_ARCHIVE_URL = 'https://ix.cnn.io/data/truth-social/truth_archive.json';
const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

export interface TruthSocialPost {
  postId: string;
  text: string;
  timestamp: string;
  isRepost: boolean;
  hasMedia: boolean;
  url: string;
}

interface CnnArchivePost {
  id: string;
  created_at: string;
  content: string;
  url: string;
  media: string[];
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
}

/**
 * Strip HTML tags from Truth Social post content.
 * Posts may contain <span>, <a>, <p>, <br> tags from Mastodon formatting.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

/**
 * Parse CNN archive posts into our standard TruthSocialPost format.
 */
export function parseCnnArchivePosts(posts: CnnArchivePost[]): TruthSocialPost[] {
  return posts.map((post) => ({
    postId: post.id,
    text: stripHtml(post.content),
    timestamp: post.created_at,
    isRepost: false, // CNN archive doesn't distinguish reposts, treat all as original
    hasMedia: Array.isArray(post.media) && post.media.length > 0,
    url: post.url || `https://truthsocial.com/@realDonaldTrump/posts/${post.id}`,
  }));
}

export class TruthSocialScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500, 'truth-social');
  private lastFetchedPostId: string | null = null;

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
      const response = await fetch(CNN_ARCHIVE_URL, {
        headers: {
          'User-Agent': 'EventRadar/1.0 (market event detection)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        return err(new Error(`CNN archive returned HTTP ${response.status}`));
      }

      const archivePosts: CnnArchivePost[] = await response.json() as CnnArchivePost[];

      if (!Array.isArray(archivePosts) || archivePosts.length === 0) {
        return ok([]);
      }

      // Archive is sorted newest-first. Only check the most recent posts
      // to avoid processing the entire 30k+ archive on every poll.
      const recentPosts = archivePosts.slice(0, 20);
      const posts = parseCnnArchivePosts(recentPosts);

      const newEvents: RawEvent[] = [];

      for (const post of posts) {
        if (this.seenIds.has(post.postId)) continue;
        this.seenIds.add(post.postId);

        // Skip empty posts (media-only with no text)
        if (!post.text.trim()) continue;

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
