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
  estimateSentiment,
} from '../utils/keyword-extractor.js';

const DEFAULT_ACCOUNTS = [
  'realDonaldTrump',
  'elonmusk',
  'DeItaone',
  'unusual_whales',
  'zaborsky',
  'FirstSquawk',
];

const DEFAULT_INTERVAL_MS = 600_000; // 10 minutes

const API_BASE = 'https://api.twitterapi.io/twitter/tweet/advanced_search';

export interface TwitterApiTweet {
  id: string;
  text: string;
  createdAt: string;
  author: {
    userName: string;
    name: string;
  };
  isRetweet: boolean;
  isQuote: boolean;
  isReply: boolean;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  url: string;
}

interface TwitterApiResponse {
  tweets: Array<{
    id: string;
    text: string;
    createdAt: string;
    author: {
      userName: string;
      name: string;
    };
    isRetweet: boolean;
    isQuote: boolean;
    isReply: boolean;
    likeCount: number;
    retweetCount: number;
    replyCount: number;
    url: string;
  }>;
  has_next_page: boolean;
  next_cursor: string;
}

/**
 * Check if current time is within US market hours (4 AM – 8 PM ET, weekdays only).
 */
export function isMarketHours(now: Date = new Date()): boolean {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const hour = et.getHours();
  return hour >= 4 && hour < 20;
}

export class XScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(1000, 'x');
  private readonly apiKey: string;
  private readonly accounts: string[];
  private lastCheckTime: Date;

  constructor(eventBus: EventBus) {
    const intervalMs = process.env.X_SCANNER_INTERVAL_MS
      ? parseInt(process.env.X_SCANNER_INTERVAL_MS, 10)
      : DEFAULT_INTERVAL_MS;

    super({
      name: 'x-scanner',
      source: 'x-scanner',
      pollIntervalMs: intervalMs,
      eventBus,
    });

    this.apiKey = process.env.TWITTER_API_KEY ?? '';
    this.accounts = process.env.X_SCANNER_ACCOUNTS
      ? process.env.X_SCANNER_ACCOUNTS.split(',').map((a) => a.trim()).filter(Boolean)
      : DEFAULT_ACCOUNTS;
    // Start checking from 30 minutes ago to catch recent tweets on startup
    this.lastCheckTime = new Date(Date.now() - 30 * 60 * 1000);
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    if (!this.apiKey) {
      return err(new Error('TWITTER_API_KEY not configured'));
    }

    if (!isMarketHours()) {
      console.log('[x-scanner] Outside market hours, skipping poll');
      return ok([]);
    }

    try {
      const allEvents: RawEvent[] = [];
      const sinceTime = this.formatSearchTime(this.lastCheckTime);
      const checkStart = new Date();

      for (const account of this.accounts) {
        const tweets = await this.fetchTweets(account, sinceTime);
        const events = this.processTweets(tweets, account);
        allEvents.push(...events);
      }

      this.lastCheckTime = checkStart;

      console.log(
        `[x-scanner] Checked ${this.accounts.length} accounts, found ${allEvents.length} new tweets`,
      );

      return ok(allEvents);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return err(error);
    }
  }

  private async fetchTweets(
    username: string,
    sinceTime: string,
  ): Promise<TwitterApiTweet[]> {
    const query = `from:${username} since:${sinceTime}`;
    const url = `${API_BASE}?query=${encodeURIComponent(query)}&queryType=Latest`;

    const response = await fetch(url, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    if (response.status === 429) {
      console.warn(`[x-scanner] Rate limited querying @${username}, will retry next cycle`);
      return [];
    }

    if (response.status === 401) {
      throw new Error('TwitterAPI.io authentication failed — check TWITTER_API_KEY');
    }

    if (!response.ok) {
      console.warn(
        `[x-scanner] API error for @${username}: ${response.status} ${response.statusText}`,
      );
      return [];
    }

    const data = (await response.json()) as TwitterApiResponse;
    return data.tweets ?? [];
  }

  private processTweets(tweets: TwitterApiTweet[], account: string): RawEvent[] {
    const events: RawEvent[] = [];

    for (const tweet of tweets) {
      if (this.seenIds.has(tweet.id)) continue;
      this.seenIds.add(tweet.id);

      const title =
        tweet.text.length > 200
          ? tweet.text.slice(0, 200) + '…'
          : tweet.text;

      const tickers = extractTickers(tweet.text);
      const sentiment = estimateSentiment(tweet.text);

      events.push({
        id: randomUUID(),
        source: 'x-scanner',
        type: 'social-post',
        title: title || 'X post',
        body: tweet.text,
        url: tweet.url || `https://x.com/${account}/status/${tweet.id}`,
        timestamp: new Date(tweet.createdAt),
        metadata: {
          author: tweet.author?.userName ?? account,
          tweetId: tweet.id,
          isRetweet: tweet.isRetweet ?? false,
          isQuote: tweet.isQuote ?? false,
          tickers,
          keywords: tickers,
          sentiment,
          engagement: {
            likes: tweet.likeCount ?? 0,
            retweets: tweet.retweetCount ?? 0,
            replies: tweet.replyCount ?? 0,
          },
        },
      });
    }

    return events;
  }

  /**
   * Format a Date into the search query format: YYYY-MM-DD_HH:mm:ss_UTC
   */
  private formatSearchTime(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}_${hh}:${mm}:${ss}_UTC`;
  }
}
