import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  parseXPosts,
  isMarketRelevantReply,
  XScanner,
} from '../scanners/x-scanner.js';

const fixtureHtml = readFileSync(
  join(__dirname, 'fixtures', 'x-tweet.html'),
  'utf-8',
);

function getFixtureDocument(html: string): Document {
  const dom = new JSDOM(html);
  return dom.window.document;
}

describe('XScanner', () => {
  describe('parseXPosts', () => {
    it('should extract all tweets from fixture HTML', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseXPosts(doc);
      expect(posts).toHaveLength(6);
    });

    it('should extract tweet text correctly', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseXPosts(doc);
      expect(posts[0]!.text).toContain(
        'DOGE has saved taxpayers $100 billion',
      );
    });

    it('should extract tweet IDs from status links', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseXPosts(doc);
      expect(posts[0]!.tweetId).toBe('1800000000000000001');
      expect(posts[1]!.tweetId).toBe('1800000000000000002');
    });

    it('should detect retweets via socialContext', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseXPosts(doc);
      expect(posts[0]!.isRetweet).toBe(false);
      expect(posts[1]!.isRetweet).toBe(true);
    });

    it('should detect quote tweets', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseXPosts(doc);
      expect(posts[2]!.isQuote).toBe(true);
      expect(posts[0]!.isQuote).toBe(false);
    });

    it('should detect replies', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseXPosts(doc);
      expect(posts[3]!.isReply).toBe(true);
      expect(posts[0]!.isReply).toBe(false);
    });

    it('should detect media attachments', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseXPosts(doc);
      expect(posts[5]!.hasMedia).toBe(true);
      expect(posts[0]!.hasMedia).toBe(false);
    });

    it('should construct correct tweet URLs', () => {
      const doc = getFixtureDocument(fixtureHtml);
      const posts = parseXPosts(doc);
      expect(posts[0]!.url).toBe(
        'https://x.com/elonmusk/status/1800000000000000001',
      );
    });
  });

  describe('isMarketRelevantReply', () => {
    it('should return true for text with market keywords', () => {
      expect(isMarketRelevantReply('Bitcoin is the future')).toBe(true);
      expect(isMarketRelevantReply('The stock market is up')).toBe(true);
      expect(isMarketRelevantReply('Tesla is great')).toBe(true);
      expect(isMarketRelevantReply('DOGE to the moon')).toBe(true);
      expect(isMarketRelevantReply('Worth $50 billion')).toBe(true);
    });

    it('should return false for text without market keywords', () => {
      expect(isMarketRelevantReply('Thanks for the kind words!')).toBe(false);
      expect(isMarketRelevantReply('Nice photo')).toBe(false);
      expect(isMarketRelevantReply('Good morning everyone')).toBe(false);
    });
  });

  describe('reply filtering', () => {
    it('should filter out non-market replies but keep market-relevant ones', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      const { browserPool } = await import(
        '../scanners/scraping/browser-pool.js'
      );
      const mockScrape = vi.spyOn(browserPool, 'scrape');

      mockScrape.mockResolvedValue([
        {
          tweetId: 'reply-1',
          text: 'Thanks for the kind words!',
          timestamp: new Date().toISOString(),
          isRetweet: false,
          isQuote: false,
          isReply: true,
          hasMedia: false,
          url: 'https://x.com/elonmusk/status/reply-1',
        },
        {
          tweetId: 'reply-2',
          text: 'Bitcoin is fundamentally sound',
          timestamp: new Date().toISOString(),
          isRetweet: false,
          isQuote: false,
          isReply: true,
          hasMedia: false,
          url: 'https://x.com/elonmusk/status/reply-2',
        },
        {
          tweetId: 'original-1',
          text: 'Big announcement coming',
          timestamp: new Date().toISOString(),
          isRetweet: false,
          isQuote: false,
          isReply: false,
          hasMedia: false,
          url: 'https://x.com/elonmusk/status/original-1',
        },
      ]);

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        const bodies = result.value.map((e) => e.body);
        expect(bodies).toContain('Bitcoin is fundamentally sound');
        expect(bodies).toContain('Big announcement coming');
        expect(bodies).not.toContain('Thanks for the kind words!');
      }

      mockScrape.mockRestore();
    });
  });

  describe('ticker and crypto tagging', () => {
    it('should tag TSLA when Elon mentions Tesla', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      const { browserPool } = await import(
        '../scanners/scraping/browser-pool.js'
      );
      const mockScrape = vi.spyOn(browserPool, 'scrape');

      mockScrape.mockResolvedValue([
        {
          tweetId: 'tesla-1',
          text: 'Tesla is doing amazing things with AI and robotics',
          timestamp: new Date().toISOString(),
          isRetweet: false,
          isQuote: false,
          isReply: false,
          hasMedia: false,
          url: 'https://x.com/elonmusk/status/tesla-1',
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

    it('should tag crypto-related when mentioning doge/bitcoin', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      const { browserPool } = await import(
        '../scanners/scraping/browser-pool.js'
      );
      const mockScrape = vi.spyOn(browserPool, 'scrape');

      mockScrape.mockResolvedValue([
        {
          tweetId: 'crypto-1',
          text: 'Doge to the moon! Bitcoin is the future',
          timestamp: new Date().toISOString(),
          isRetweet: false,
          isQuote: false,
          isReply: false,
          hasMedia: false,
          url: 'https://x.com/elonmusk/status/crypto-1',
        },
      ]);

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const event = result.value[0]!;
        expect(event.metadata?.['cryptoRelated']).toBe(true);
      }

      mockScrape.mockRestore();
    });

    it('should include sentiment in metadata', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      const { browserPool } = await import(
        '../scanners/scraping/browser-pool.js'
      );
      const mockScrape = vi.spyOn(browserPool, 'scrape');

      mockScrape.mockResolvedValue([
        {
          tweetId: 'sentiment-1',
          text: 'Great partnership and record growth ahead',
          timestamp: new Date().toISOString(),
          isRetweet: false,
          isQuote: false,
          isReply: false,
          hasMedia: false,
          url: 'https://x.com/elonmusk/status/sentiment-1',
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

  describe('deduplication', () => {
    it('should not emit events for already-seen tweet IDs', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      const { browserPool } = await import(
        '../scanners/scraping/browser-pool.js'
      );
      const mockScrape = vi.spyOn(browserPool, 'scrape');

      mockScrape.mockResolvedValue([
        {
          tweetId: 'dedup-x-1',
          text: 'First tweet',
          timestamp: new Date().toISOString(),
          isRetweet: false,
          isQuote: false,
          isReply: false,
          hasMedia: false,
          url: 'https://x.com/elonmusk/status/dedup-x-1',
        },
      ]);

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
    it('should report down after 3 consecutive failures', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      const { browserPool } = await import(
        '../scanners/scraping/browser-pool.js'
      );
      const mockScrape = vi.spyOn(browserPool, 'scrape');
      mockScrape.mockRejectedValue(new Error('X rate limit'));

      await scanner.scan();
      await scanner.scan();
      await scanner.scan();

      expect(scanner.health().status).toBe('down');
      expect(scanner.health().errorCount).toBe(3);

      mockScrape.mockRestore();
    });
  });
});
