import { randomUUID } from 'node:crypto';
import {
  BaseScanner,
  err,
  ok,
  scannerFetch,
  type EventBus,
  type RawEvent,
  type Result,
} from '@event-radar/shared';
import { SeenIdBuffer } from './scraping/scrape-utils.js';
import {
  POLITICAL_KEYWORDS,
  estimateSentiment,
  extractKeywords,
  extractTickers,
} from '../utils/keyword-extractor.js';

const TRUMP_TRUTH_URL = 'https://trumpstruth.org';
const POLL_INTERVAL_MS = 3 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

const MONTHS = new Map([
  ['january', 0],
  ['february', 1],
  ['march', 2],
  ['april', 3],
  ['may', 4],
  ['june', 5],
  ['july', 6],
  ['august', 7],
  ['september', 8],
  ['october', 9],
  ['november', 10],
  ['december', 11],
]);

const TIMESTAMP_PATTERN =
  /([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s+(AM|PM)/i;
const STATUS_URL_PATTERN = /https:\/\/trumpstruth\.org\/statuses\/(\d+)/i;
const STATUS_META_LINK_PATTERN =
  /<a[^>]+href="(https:\/\/trumpstruth\.org\/statuses\/(\d+))"[^>]*class="status-info__meta-item"[^>]*>\s*([^<]+?)\s*<\/a>/i;
const STATUS_CONTENT_PATTERN =
  /<div[^>]+class="[^"]*\bstatus__content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
const STATUS_REPOST_PATTERN =
  /class="[^"]*(?:status__reblog|status__repost|retruth|repost)[^"]*"|>\s*(?:ReTruth|Retruth|Reposted)\s*</i;
const STATUS_MEDIA_PATTERN =
  /class="[^"]*\bstatus__(?:media|gallery|attachment|attachments|card|video)\b[^"]*"|<video\b/i;

const EASTERN_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface TruthSocialPost {
  postId: string;
  text: string;
  timestamp: string;
  isRepost: boolean;
  hasMedia: boolean;
  url: string;
}

function normalizeWhitespace(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function stripHtml(html: string): string {
  const compact = html.replace(/>\s+</g, '><');

  return normalizeWhitespace(
    decodeHtmlEntities(
      compact
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/(?:p|div|li|ul|ol|blockquote)>/gi, ' ')
        .replace(/<[^>]+>/g, ''),
    ),
  );
}

function getHtmlSource(source: string | ParentNode): string {
  if (typeof source === 'string') {
    return source;
  }

  const candidate = source as ParentNode & {
    documentElement?: { outerHTML?: string | null } | null;
    body?: { innerHTML?: string | null } | null;
    innerHTML?: string | null;
  };

  if (candidate.documentElement?.outerHTML) {
    return candidate.documentElement.outerHTML;
  }

  if (candidate.body?.innerHTML) {
    return candidate.body.innerHTML;
  }

  return candidate.innerHTML ?? '';
}

function getTimeZoneOffsetMs(date: Date): number {
  const parts = EASTERN_TIME_FORMATTER.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  const asUtc = Date.UTC(
    Number(values['year']),
    Number(values['month']) - 1,
    Number(values['day']),
    Number(values['hour']),
    Number(values['minute']),
    Number(values['second']),
  );

  return asUtc - date.getTime();
}

function parseTrumpTruthTimestamp(timestampText: string): string | null {
  const match = TIMESTAMP_PATTERN.exec(normalizeWhitespace(timestampText));
  if (!match) {
    return null;
  }

  const [, monthName, dayText, yearText, hourText, minuteText, meridiem] = match;
  const month = MONTHS.get(monthName.toLowerCase());
  if (month === undefined) {
    return null;
  }

  const day = Number(dayText);
  const year = Number(yearText);
  const minute = Number(minuteText);
  let hour = Number(hourText) % 12;

  if (meridiem.toUpperCase() === 'PM') {
    hour += 12;
  }

  const utcGuess = Date.UTC(year, month, day, hour, minute, 0);
  const firstOffset = getTimeZoneOffsetMs(new Date(utcGuess));
  const adjustedUtc = utcGuess - firstOffset;
  const finalOffset = getTimeZoneOffsetMs(new Date(adjustedUtc));

  return new Date(utcGuess - finalOffset).toISOString();
}

function parseStatusBlock(statusHtml: string): TruthSocialPost | null {
  const metaMatch = STATUS_META_LINK_PATTERN.exec(statusHtml);
  const contentMatch = STATUS_CONTENT_PATTERN.exec(statusHtml);
  const urlMatch = STATUS_URL_PATTERN.exec(statusHtml);

  const url = normalizeWhitespace(metaMatch?.[1] ?? urlMatch?.[0] ?? '');
  const postId = normalizeWhitespace(metaMatch?.[2] ?? urlMatch?.[1] ?? '');
  const timestamp = parseTrumpTruthTimestamp(metaMatch?.[3] ?? '');
  const text = stripHtml(contentMatch?.[1] ?? '');

  if (!url || !postId || !timestamp || !text) {
    return null;
  }

  return {
    postId,
    text,
    timestamp,
    isRepost: STATUS_REPOST_PATTERN.test(statusHtml),
    hasMedia: STATUS_MEDIA_PATTERN.test(statusHtml),
    url,
  };
}

export function parseTruthSocialPosts(source: string | ParentNode): TruthSocialPost[] {
  const html = getHtmlSource(source);
  if (!html) {
    return [];
  }

  return html
    .split(/<div\s+class="status"(?:\s|>)/i)
    .slice(1)
    .map((fragment) => parseStatusBlock(`<div class="status"${fragment}`))
    .filter((post): post is TruthSocialPost => post !== null);
}

export class TruthSocialScanner extends BaseScanner {
  private readonly seenIds = new SeenIdBuffer(500, 'truth-social');
  public fetchFn: typeof scannerFetch = (url, options) =>
    scannerFetch(url, options);

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
      const response = await this.fetchFn(TRUMP_TRUTH_URL, {
        timeoutMs: FETCH_TIMEOUT_MS,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'event-radar/1.0',
        },
      });

      if (!response.ok) {
        return err(
          new Error(
            `trumpstruth.org returned ${response.status} ${response.statusText}`,
          ),
        );
      }

      const html = await response.text();
      const posts = parseTruthSocialPosts(html);

      if (posts.length === 0) {
        console.warn('[truth-social] No posts found on trumpstruth.org homepage');
        return ok([]);
      }

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
            author: '@realDonaldTrump',
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
