import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  RedditScanner,
  parseRedditResponse,
  isHighEngagement,
  type RedditApiResponse,
} from '../scanners/reddit-scanner.js';
import { extractTickers } from '../scanners/ticker-extractor.js';

const mockRedditResponse = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'mock-reddit-response.json'),
    'utf-8',
  ),
) as RedditApiResponse;

describe('RedditScanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('parseRedditResponse', () => {
    it('should parse all non-stickied posts from fixture', () => {
      const posts = parseRedditResponse(mockRedditResponse);
      expect(posts).toHaveLength(5);
    });

    it('should extract post fields correctly', () => {
      const posts = parseRedditResponse(mockRedditResponse);
      const first = posts[0]!;
      expect(first.id).toBe('post001');
      expect(first.title).toContain('TSLA just broke $300');
      expect(first.author).toBe('diamond_hands_42');
      expect(first.subreddit).toBe('wallstreetbets');
      expect(first.score).toBe(1500);
      expect(first.numComments).toBe(350);
    });

    it('should handle stickied field', () => {
      const posts = parseRedditResponse(mockRedditResponse);
      const stickied = posts.find((p) => p.id === 'post003');
      expect(stickied?.stickied).toBe(true);
    });

    it('should return empty array for invalid response', () => {
      const posts = parseRedditResponse({} as RedditApiResponse);
      expect(posts).toEqual([]);
    });
  });

  describe('isHighEngagement', () => {
    it('should flag posts with >500 upvotes within 2 hours', () => {
      const now = Date.now() / 1000;
      const result = isHighEngagement(
        {
          id: 'test',
          title: 'Test',
          selftext: '',
          author: 'user',
          subreddit: 'wsb',
          score: 600,
          numComments: 50,
          createdUtc: now - 3600, // 1 hour ago
          permalink: '/test',
          url: '',
          stickied: false,
          totalAwards: 0,
        },
        now,
      );
      expect(result).toBe(true);
    });

    it('should flag posts with >200 comments within 2 hours', () => {
      const now = Date.now() / 1000;
      const result = isHighEngagement(
        {
          id: 'test',
          title: 'Test',
          selftext: '',
          author: 'user',
          subreddit: 'wsb',
          score: 100,
          numComments: 250,
          createdUtc: now - 3600,
          permalink: '/test',
          url: '',
          stickied: false,
          totalAwards: 0,
        },
        now,
      );
      expect(result).toBe(true);
    });

    it('should not flag old posts even with high engagement', () => {
      const now = Date.now() / 1000;
      const result = isHighEngagement(
        {
          id: 'test',
          title: 'Test',
          selftext: '',
          author: 'user',
          subreddit: 'wsb',
          score: 10000,
          numComments: 5000,
          createdUtc: now - 10800, // 3 hours ago
          permalink: '/test',
          url: '',
          stickied: false,
          totalAwards: 0,
        },
        now,
      );
      expect(result).toBe(false);
    });

    it('should not flag low engagement posts', () => {
      const now = Date.now() / 1000;
      const result = isHighEngagement(
        {
          id: 'test',
          title: 'Test',
          selftext: '',
          author: 'user',
          subreddit: 'wsb',
          score: 50,
          numComments: 10,
          createdUtc: now - 1800,
          permalink: '/test',
          url: '',
          stickied: false,
          totalAwards: 0,
        },
        now,
      );
      expect(result).toBe(false);
    });
  });

  describe('ticker extraction integration', () => {
    it('should extract tickers from post text', () => {
      const text = 'TSLA just broke $300! $TSLA to the moon (NASDAQ: TSLA)';
      const tickers = extractTickers(text);
      expect(tickers).toContain('TSLA');
    });

    it('should extract multiple tickers', () => {
      const text = 'Buying $AAPL and selling $MSFT, also watching (NYSE: GME)';
      const tickers = extractTickers(text);
      expect(tickers).toContain('AAPL');
      expect(tickers).toContain('MSFT');
      expect(tickers).toContain('GME');
    });

    it('should filter out false positives like $USD', () => {
      const text = 'Worth $50 billion USD. $TSLA is the play.';
      const tickers = extractTickers(text);
      expect(tickers).not.toContain('USD');
      expect(tickers).toContain('TSLA');
    });

    it('should return empty array when no tickers found', () => {
      const text = 'This is just a regular post with no stock mentions.';
      const tickers = extractTickers(text);
      expect(tickers).toEqual([]);
    });
  });

  describe('scan', () => {
    it('should emit events from Reddit posts', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new RedditScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockRedditResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        // 4 posts (5 total minus 1 stickied)
        expect(result.value.length).toBe(4 * 4); // 4 subreddits × 4 non-stickied posts
        expect(result.value[0]!.source).toBe('reddit');
        expect(result.value[0]!.type).toBe('social-post');
      }
    });

    it('should skip stickied posts', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new RedditScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockRedditResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const titles = result.value.map((e) => e.title);
        expect(titles).not.toContain(
          expect.stringContaining('Daily Discussion'),
        );
      }
    });

    it('should deduplicate posts by ID', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new RedditScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockRedditResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result1 = await scanner.scan();
      expect(result1.ok).toBe(true);
      const firstCount = result1.ok ? result1.value.length : 0;
      expect(firstCount).toBeGreaterThan(0);

      // Second scan with same data should return 0 new events
      const result2 = await scanner.scan();
      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.value).toHaveLength(0);
      }
    });

    it('should include metadata with subreddit and engagement', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new RedditScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockRedditResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok && result.value.length > 0) {
        const event = result.value[0]!;
        expect(event.metadata).toBeDefined();
        expect(event.metadata!['subreddit']).toBe('wallstreetbets');
        expect(typeof event.metadata!['upvotes']).toBe('number');
        expect(typeof event.metadata!['comments']).toBe('number');
      }
    });

    it('should handle fetch errors gracefully', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new RedditScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Network error');
      }
    });

    it('should continue polling other subreddits if one fails', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new RedditScanner(eventBus);

      let callCount = 0;
      fetchSpy.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response('', { status: 429 }); // First subreddit fails
        }
        return new Response(JSON.stringify(mockRedditResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
      }
    });
  });

  describe('health', () => {
    it('should report healthy initially', () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new RedditScanner(eventBus);
      expect(scanner.health().status).toBe('healthy');
    });

    it('should report down after 3 consecutive failures', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new RedditScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('Network error'));

      await scanner.scan();
      await scanner.scan();
      await scanner.scan();

      expect(scanner.health().status).toBe('down');
      expect(scanner.health().errorCount).toBe(3);
    });
  });
});
