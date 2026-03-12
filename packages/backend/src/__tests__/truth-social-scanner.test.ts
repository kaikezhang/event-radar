import { describe, it, expect, vi, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { existsSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  parseTruthSocialPosts,
  TruthSocialScanner,
} from '../scanners/truth-social-scanner.js';
import { SeenIdBuffer } from '../scanners/scraping/scrape-utils.js';

const fixtureHtml = readFileSync(
  join(__dirname, 'fixtures', 'truth-social-post.html'),
  'utf-8',
);
const seenDataDir = fileURLToPath(new URL('../../data/seen/', import.meta.url));
const testSeenBufferPath = join(seenDataDir, 'vitest-seen-buffer.json');

function getFixtureDocument(html: string): Document {
  const dom = new JSDOM(html);
  return dom.window.document;
}

afterEach(() => {
  vi.useRealTimers();
  if (existsSync(testSeenBufferPath)) unlinkSync(testSeenBufferPath);
  rmSync(seenDataDir, { recursive: true, force: true });
});

describe('TruthSocialScanner', () => {
  describe('parseTruthSocialPosts', () => {
    it('should extract all posts from fixture HTML', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);
      expect(posts).toHaveLength(4);
    });

    it('should extract post text correctly', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);
      expect(posts[0]!.text).toContain('TARIFFS on China are going UP');
    });

    it('should extract post IDs from data-id attributes', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);
      expect(posts[0]!.postId).toBe('111111111111111111');
      expect(posts[1]!.postId).toBe('222222222222222222');
      expect(posts[2]!.postId).toBe('333333333333333333');
    });

    it('should detect reposts', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);
      expect(posts[0]!.isRepost).toBe(false);
      expect(posts[1]!.isRepost).toBe(true);
    });

    it('should detect media attachments', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);
      expect(posts[0]!.hasMedia).toBe(false);
      expect(posts[2]!.hasMedia).toBe(true);
    });

    it('should extract timestamps', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);
      expect(posts[0]!.timestamp).toBe('2025-06-15T14:30:00Z');
    });

    it('should construct correct post URLs', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseTruthSocialPosts(doc);
      expect(posts[0]!.url).toBe(
        'https://truthsocial.com/@realDonaldTrump/posts/111111111111111111',
      );
    });

    it('should return empty array for page with no posts', () => {
      const doc = getFixtureDocument(
        '<html><body><div>No posts here</div></body></html>',
      );
      const posts = parseTruthSocialPosts(doc);
      expect(posts).toHaveLength(0);
    });
  });

  describe('SeenIdBuffer (dedup)', () => {
    it('should track seen IDs', () => {
      const buffer = new SeenIdBuffer(5);
      buffer.add('a');
      buffer.add('b');
      expect(buffer.has('a')).toBe(true);
      expect(buffer.has('c')).toBe(false);
    });

    it('should evict oldest entries when capacity exceeded', () => {
      const buffer = new SeenIdBuffer(3);
      buffer.add('a');
      buffer.add('b');
      buffer.add('c');
      buffer.add('d'); // evicts 'a'
      expect(buffer.has('a')).toBe(false);
      expect(buffer.has('d')).toBe(true);
      expect(buffer.size).toBe(3);
    });

    it('should not add duplicate IDs', () => {
      const buffer = new SeenIdBuffer(5);
      buffer.add('a');
      buffer.add('a');
      expect(buffer.size).toBe(1);
    });

    it('should persist named buffers under backend data/seen', async () => {
      vi.useFakeTimers();
      const buffer = new SeenIdBuffer(5, 'vitest-seen-buffer');

      buffer.add('persist-me');
      await vi.advanceTimersByTimeAsync(1000);

      expect(existsSync(testSeenBufferPath)).toBe(true);
    });
  });

  describe('keyword/ticker extraction in scanner', () => {
    it('should extract ticker from "Truth about Tesla"', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new TruthSocialScanner(eventBus);

      const { browserPool } = await import(
        '../scanners/scraping/browser-pool.js'
      );
      const mockScrape = vi.spyOn(browserPool, 'scrape');

      mockScrape.mockResolvedValue([
        {
          postId: 'ticker-1',
          text: 'The Truth about Tesla is that they make great cars!',
          timestamp: new Date().toISOString(),
          isRepost: false,
          hasMedia: false,
          url: 'https://truthsocial.com/@realDonaldTrump/posts/ticker-1',
        },
      ]);

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const event = result.value[0]!;
        expect(event.metadata?.['ticker']).toBe('TSLA');
        expect(event.metadata?.['tickers']).toContain('TSLA');
      }

      mockScrape.mockRestore();
    });

    it('should return no ticker from "tariff on China"', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new TruthSocialScanner(eventBus);

      const { browserPool } = await import(
        '../scanners/scraping/browser-pool.js'
      );
      const mockScrape = vi.spyOn(browserPool, 'scrape');

      mockScrape.mockResolvedValue([
        {
          postId: 'noticker-1',
          text: 'TARIFFS on China are going UP!',
          timestamp: new Date().toISOString(),
          isRepost: false,
          hasMedia: false,
          url: 'https://truthsocial.com/@realDonaldTrump/posts/noticker-1',
        },
      ]);

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const event = result.value[0]!;
        expect(event.metadata?.['ticker']).toBeUndefined();
        expect(event.metadata?.['tickers']).toHaveLength(0);
        expect(event.metadata?.['keywords']).toContain('tariffs');
        expect(event.metadata?.['keywords']).toContain('china');
      }

      mockScrape.mockRestore();
    });

    it('should include sentiment in metadata', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new TruthSocialScanner(eventBus);

      const { browserPool } = await import(
        '../scanners/scraping/browser-pool.js'
      );
      const mockScrape = vi.spyOn(browserPool, 'scrape');

      mockScrape.mockResolvedValue([
        {
          postId: 'sentiment-1',
          text: 'Great deal with our partners, tremendous growth!',
          timestamp: new Date().toISOString(),
          isRepost: false,
          hasMedia: false,
          url: 'https://truthsocial.com/@realDonaldTrump/posts/sentiment-1',
        },
      ]);

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]!.metadata?.['sentiment']).toBe('bullish');
      }

      mockScrape.mockRestore();
    });
  });

  describe('scanner deduplication', () => {
    it('should not emit events for already-seen post IDs', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new TruthSocialScanner(eventBus);

      const { browserPool } = await import(
        '../scanners/scraping/browser-pool.js'
      );
      const mockScrape = vi.spyOn(browserPool, 'scrape');

      const mockPosts = [
        {
          postId: 'dedup-1',
          text: 'First post',
          timestamp: new Date().toISOString(),
          isRepost: false,
          hasMedia: false,
          url: 'https://truthsocial.com/@realDonaldTrump/posts/dedup-1',
        },
      ];

      mockScrape.mockResolvedValue(mockPosts);

      const result1 = await scanner.scan();
      expect(result1.ok).toBe(true);
      if (result1.ok) expect(result1.value).toHaveLength(1);

      const result2 = await scanner.scan();
      expect(result2.ok).toBe(true);
      if (result2.ok) expect(result2.value).toHaveLength(0);

      mockScrape.mockRestore();
    });
  });

  describe('health degradation', () => {
    it('should report degraded after first failure, down after 3', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new TruthSocialScanner(eventBus);

      const { browserPool } = await import(
        '../scanners/scraping/browser-pool.js'
      );
      const mockScrape = vi.spyOn(browserPool, 'scrape');
      mockScrape.mockRejectedValue(new Error('Network error'));

      await scanner.scan();
      expect(scanner.health().status).toBe('degraded');

      await scanner.scan();
      expect(scanner.health().status).toBe('degraded');

      await scanner.scan();
      expect(scanner.health().status).toBe('down');

      mockScrape.mockRestore();
    });

    it('should reset error count on successful scan', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new TruthSocialScanner(eventBus);

      const { browserPool } = await import(
        '../scanners/scraping/browser-pool.js'
      );
      const mockScrape = vi.spyOn(browserPool, 'scrape');

      mockScrape.mockRejectedValue(new Error('Network error'));
      await scanner.scan();
      await scanner.scan();
      expect(scanner.health().status).toBe('degraded');

      mockScrape.mockResolvedValue([]);
      await scanner.scan();
      expect(scanner.health().status).toBe('healthy');

      mockScrape.mockRestore();
    });
  });
});
