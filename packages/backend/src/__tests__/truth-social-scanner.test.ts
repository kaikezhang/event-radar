import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { InMemoryEventBus } from '@event-radar/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  parseTruthSocialRssFeed,
  parseTruthSocialPosts,
  TruthSocialScanner,
} from '../scanners/truth-social-scanner.js';
import { SeenIdBuffer } from '../scanners/scraping/scrape-utils.js';

const fixtureHtml = readFileSync(
  join(__dirname, 'fixtures', 'truth-social-post.html'),
  'utf-8',
);
const fixtureRss = readFileSync(
  join(__dirname, 'fixtures', 'mock-truth-social-rss.xml'),
  'utf-8',
);

function getFixtureDocument(html: string): Document {
  const dom = new JSDOM(html);
  return dom.window.document;
}

function createHtmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });
}

function setFetchFn(
  scanner: TruthSocialScanner,
  fetchFn: (url: string | URL, options?: unknown) => Promise<Response>,
): void {
  (
    scanner as unknown as {
      fetchFn: (url: string | URL, options?: unknown) => Promise<Response>;
    }
  ).fetchFn = fetchFn;
}

describe('TruthSocialScanner', () => {
  describe('parseTruthSocialRssFeed', () => {
    it('extracts rss items into Truth Social posts', () => {
      const posts = parseTruthSocialRssFeed(fixtureRss);

      expect(posts).toHaveLength(2);
      expect(posts[0]!.postId).toBe('https://trumpstruth.org/statuses/37409');
      expect(posts[1]!.postId).toBe('truth-social-guid-37408');
    });

    it('uses the rss title text as the post body without html tags', () => {
      const posts = parseTruthSocialRssFeed(fixtureRss);

      expect(posts[0]!.text).toBe('TARIFFS on China are going UP and an executive order is coming.');
      expect(posts[1]!.text).not.toContain('<p>');
    });

    it('parses RFC 2822 pubDate values into ISO timestamps', () => {
      const posts = parseTruthSocialRssFeed(fixtureRss);

      expect(posts[0]!.timestamp).toBe('2026-03-23T11:23:40.000Z');
      expect(posts[1]!.timestamp).toBe('2026-03-23T10:05:00.000Z');
    });

    it('uses truthsocial originalUrl when present', () => {
      const posts = parseTruthSocialRssFeed(fixtureRss);

      expect(posts[0]!.url).toBe('https://truthsocial.com/@realDonaldTrump/116278232362967212');
      expect(posts[1]!.url).toBe('https://truthsocial.com/@realDonaldTrump/116278232362967111');
    });

    it('skips rss items missing required title content', () => {
      const posts = parseTruthSocialRssFeed(fixtureRss);

      expect(posts.map((post) => post.postId)).not.toContain('skip-empty-title');
    });
  });

  describe('parseTruthSocialPosts', () => {
    it('extracts all trumpstruth.org posts from fixture HTML', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);

      expect(posts).toHaveLength(4);
    });

    it('extracts post IDs from trumpstruth status URLs', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);

      expect(posts[0]!.postId).toBe('37408');
      expect(posts[1]!.postId).toBe('37407');
      expect(posts[2]!.postId).toBe('37406');
      expect(posts[3]!.postId).toBe('37405');
    });

    it('extracts normalized post text', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);

      expect(posts[0]!.text).toContain('TARIFFS on China are going UP');
      expect(posts[0]!.text).not.toContain('  ');
    });

    it('strips nested HTML and decodes entities in content', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);

      expect(posts[2]!.text).toContain("America's economy");
      expect(posts[2]!.text).toContain('https://winning.example/now');
      expect(posts[2]!.text).toContain('winning again!');
    });

    it('converts eastern timestamps to UTC timestamps', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);

      expect(posts[0]!.timestamp).toBe('2026-03-23T11:05:00.000Z');
      expect(posts[3]!.timestamp).toBe('2026-03-22T14:55:00.000Z');
    });

    it('constructs canonical trumpstruth.org post URLs', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);

      expect(posts[0]!.url).toBe('https://trumpstruth.org/statuses/37408');
    });

    it('detects repost markers when present', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);

      expect(posts[0]!.isRepost).toBe(false);
      expect(posts[1]!.isRepost).toBe(true);
    });

    it('detects media attachments without counting profile avatars', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);

      expect(posts[0]!.hasMedia).toBe(false);
      expect(posts[2]!.hasMedia).toBe(true);
    });

    it('returns empty array for pages with no posts', () => {
      const doc = getFixtureDocument('<html><body><div>No posts here</div></body></html>');
      const posts = parseTruthSocialPosts(doc);

      expect(posts).toHaveLength(0);
    });

    it('skips posts with empty content or missing timestamps', () => {
      const doc = getFixtureDocument(`
        <html>
          <body>
            <div class="status" data-status-url="https://trumpstruth.org/statuses/1">
              <div class="status__content"><p></p></div>
              <a href="https://trumpstruth.org/statuses/1" class="status-info__meta-item">
                March 23, 2026, 7:05 AM
              </a>
            </div>
            <div class="status" data-status-url="https://trumpstruth.org/statuses/2">
              <div class="status__content"><p>Missing timestamp</p></div>
            </div>
          </body>
        </html>
      `);
      const posts = parseTruthSocialPosts(doc);

      expect(posts).toEqual([]);
    });
  });

  describe('SeenIdBuffer (dedup)', () => {
    it('tracks seen IDs', () => {
      const buffer = new SeenIdBuffer(5);
      buffer.add('a');
      buffer.add('b');

      expect(buffer.has('a')).toBe(true);
      expect(buffer.has('c')).toBe(false);
    });

    it('evicts oldest entries when capacity exceeded', () => {
      const buffer = new SeenIdBuffer(3);
      buffer.add('a');
      buffer.add('b');
      buffer.add('c');
      buffer.add('d');

      expect(buffer.has('a')).toBe(false);
      expect(buffer.has('d')).toBe(true);
      expect(buffer.size).toBe(3);
    });

    it('does not add duplicate IDs', () => {
      const buffer = new SeenIdBuffer(5);
      buffer.add('a');
      buffer.add('a');

      expect(buffer.size).toBe(1);
    });
  });

  describe('scanner fetch + enrichment', () => {
    it('fetches the trumpstruth rss feed and emits parsed events', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new TruthSocialScanner(eventBus);
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(fixtureRss, {
          status: 200,
          headers: {
            'content-type': 'application/rss+xml; charset=utf-8',
          },
        }),
      );

      setFetchFn(scanner, fetchFn);

      const result = await scanner.scan();

      expect(fetchFn).toHaveBeenCalledOnce();
      expect(fetchFn).toHaveBeenCalledWith(
        'https://trumpstruth.org/feed',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: expect.stringContaining('application/rss+xml'),
          }),
        }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]!.url).toBe('https://truthsocial.com/@realDonaldTrump/116278232362967212');
      }
    });

    it('keeps ticker, keyword, and sentiment metadata from parsed post text', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new TruthSocialScanner(eventBus);
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(fixtureRss, {
          status: 200,
          headers: {
            'content-type': 'application/rss+xml; charset=utf-8',
          },
        }),
      );

      setFetchFn(scanner, fetchFn);

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]!.metadata?.['ticker']).toBeUndefined();
        expect(result.value[0]!.metadata?.['tickers']).toEqual([]);
        expect(result.value[0]!.metadata?.['keywords']).toContain('tariffs');
        expect(result.value[0]!.metadata?.['keywords']).toContain('china');
        expect(result.value[1]!.metadata?.['sentiment']).toBe('bearish');
        expect(result.value[1]!.metadata?.['postId']).toBe('truth-social-guid-37408');
      }
    });

    it('does not emit events for already-seen post IDs', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new TruthSocialScanner(eventBus);
      const fetchFn = vi.fn().mockImplementation(async () => new Response(fixtureRss, {
        status: 200,
        headers: {
          'content-type': 'application/rss+xml; charset=utf-8',
        },
      }));

      setFetchFn(scanner, fetchFn);

      const result1 = await scanner.scan();
      const result2 = await scanner.scan();

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok) expect(result1.value).toHaveLength(2);
      if (result2.ok) expect(result2.value).toHaveLength(0);
    });

    it('returns an error result when fetch returns a non-ok response', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new TruthSocialScanner(eventBus);
      const fetchFn = vi.fn().mockResolvedValue(createHtmlResponse('nope', 503));

      setFetchFn(scanner, fetchFn);

      const result = await scanner.scan();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('503');
        expect(result.error.message).toContain('trumpstruth.org');
      }
    });

    it('returns an empty success result when the page contains no posts', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new TruthSocialScanner(eventBus);
      const fetchFn = vi
        .fn()
        .mockResolvedValue(new Response('<rss><channel></channel></rss>', {
          status: 200,
          headers: {
            'content-type': 'application/rss+xml; charset=utf-8',
          },
        }));

      setFetchFn(scanner, fetchFn);

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('health degradation', () => {
    it('reports degraded after first failure and down after 3 failures', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new TruthSocialScanner(eventBus);
      const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'));

      setFetchFn(scanner, fetchFn);

      await scanner.scan();
      expect(scanner.health().status).toBe('degraded');

      await scanner.scan();
      expect(scanner.health().status).toBe('degraded');

      await scanner.scan();
      expect(scanner.health().status).toBe('down');
    });

    it('resets error count after a successful scan', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new TruthSocialScanner(eventBus);
      const fetchFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(createHtmlResponse(fixtureHtml));

      setFetchFn(scanner, fetchFn);

      await scanner.scan();
      await scanner.scan();
      expect(scanner.health().status).toBe('degraded');

      await scanner.scan();
      expect(scanner.health().status).toBe('healthy');
    });
  });
});
