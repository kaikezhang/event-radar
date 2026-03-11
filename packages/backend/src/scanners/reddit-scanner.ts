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

const POLL_INTERVAL_MS = 60_000;
const HIGH_UPVOTE_THRESHOLD = 500;
const HIGH_COMMENT_THRESHOLD = 200;
/** Maximum age of a post in hours to qualify for anomaly detection */
const ANOMALY_WINDOW_HOURS = 2;

const SUBREDDITS = [
  'wallstreetbets',
  'stocks',
  'investing',
  'options',
] as const;

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  score: number;
  numComments: number;
  createdUtc: number;
  permalink: string;
  url: string;
  stickied: boolean;
  totalAwards: number;
}

export interface RedditApiResponse {
  data: {
    children: Array<{
      data: {
        id: string;
        title: string;
        selftext: string;
        author: string;
        subreddit: string;
        score: number;
        num_comments: number;
        created_utc: number;
        permalink: string;
        url: string;
        stickied: boolean;
        total_awards_received: number;
      };
    }>;
  };
}

/**
 * Parse a Reddit JSON API response into normalized RedditPost objects.
 */
export function parseRedditResponse(json: RedditApiResponse): RedditPost[] {
  if (!json?.data?.children) return [];

  return json.data.children.map((child) => ({
    id: child.data.id,
    title: child.data.title,
    selftext: child.data.selftext ?? '',
    author: child.data.author,
    subreddit: child.data.subreddit,
    score: child.data.score,
    numComments: child.data.num_comments,
    createdUtc: child.data.created_utc,
    permalink: child.data.permalink,
    url: child.data.url,
    stickied: child.data.stickied ?? false,
    totalAwards: child.data.total_awards_received ?? 0,
  }));
}

/**
 * Check if a post has unusually high engagement (anomaly detection).
 * Flags posts with >500 upvotes or >200 comments within 2 hours.
 */
export function isHighEngagement(
  post: RedditPost,
  nowSeconds: number = Date.now() / 1000,
): boolean {
  const ageHours = (nowSeconds - post.createdUtc) / 3600;
  if (ageHours > ANOMALY_WINDOW_HOURS) return false;

  return post.score > HIGH_UPVOTE_THRESHOLD || post.numComments > HIGH_COMMENT_THRESHOLD;
}

export class RedditScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500);
  private readonly responseTextCache = new WeakMap<Response, string>();
  public fetchFn: typeof fetch = (...args) => globalThis.fetch(...args);

  constructor(eventBus: EventBus) {
    super({
      name: 'reddit',
      source: 'reddit',
      pollIntervalMs: POLL_INTERVAL_MS,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    try {
      const allEvents: RawEvent[] = [];

      for (const subreddit of SUBREDDITS) {
        const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`;
        const response = await this.fetchFn(url, {
          headers: {
            'User-Agent': 'event-radar/1.0',
          },
        });

        if (!response.ok) {
          continue; // Skip this subreddit but don't fail the whole poll
        }

        const json = await this.readJson(response);
        const posts = parseRedditResponse(json);

        for (const post of posts) {
          const seenKey = `${subreddit}:${post.id}`;
          if (this.seenIds.has(seenKey)) continue;
          if (post.stickied) continue;

          this.seenIds.add(seenKey);

          const fullText = `${post.title} ${post.selftext}`;
          const tickers = extractTickers(fullText);
          const highEngagement = isHighEngagement(post);

          const title =
            post.title.length > 200
              ? post.title.slice(0, 200) + '…'
              : post.title;

          allEvents.push({
            id: randomUUID(),
            source: 'reddit',
            type: 'social-post',
            title,
            body: post.selftext || post.title,
            url: `https://www.reddit.com${post.permalink}`,
            timestamp: new Date(post.createdUtc * 1000),
            metadata: {
              subreddit: post.subreddit,
              upvotes: post.score,
              comments: post.numComments,
              post_url: `https://www.reddit.com${post.permalink}`,
              ticker: tickers[0],
              tickers,
              author: post.author,
              awards: post.totalAwards,
              high_engagement: highEngagement,
            },
          });
        }
      }

      return ok(allEvents);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return err(error);
    }
  }

  private async readJson(response: Response): Promise<RedditApiResponse> {
    if (response.bodyUsed) {
      const cached = this.responseTextCache.get(response);
      if (cached != null) {
        return JSON.parse(cached) as RedditApiResponse;
      }
    }

    const text = await response.text();
    this.responseTextCache.set(response, text);
    return JSON.parse(text) as RedditApiResponse;
  }
}
