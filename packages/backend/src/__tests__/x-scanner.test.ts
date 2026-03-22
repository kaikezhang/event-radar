import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryEventBus } from '@event-radar/shared';
import { XScanner, isMarketHours } from '../scanners/x-scanner.js';

// Mock scannerFetch from shared
vi.mock('@event-radar/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@event-radar/shared')>();
  return {
    ...actual,
    scannerFetch: (...args: unknown[]) => mockFetch(...args),
  };
});

const mockFetch = vi.fn();

function makeTweetResponse(
  tweets: Array<Record<string, unknown>> = [],
  hasNextPage = false,
  nextCursor = '',
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ tweets, has_next_page: hasNextPage, next_cursor: nextCursor }),
  };
}

function makeTweet(overrides: Record<string, unknown> = {}) {
  return {
    id: `tweet-${Math.random().toString(36).slice(2, 8)}`,
    text: 'Test tweet content',
    createdAt: new Date().toISOString(),
    author: { userName: 'DeItaone', name: 'Walter Bloomberg' },
    isRetweet: false,
    isQuote: false,
    isReply: false,
    likeCount: 10,
    retweetCount: 5,
    replyCount: 2,
    url: 'https://x.com/DeItaone/status/123',
    ...overrides,
  };
}

describe('XScanner', () => {
  beforeEach(() => {
    // Use fake timers set to a Wednesday during market hours (11 AM ET)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T15:00:00Z'));
    vi.stubEnv('TWITTER_API_KEY', 'test-api-key');
    vi.stubEnv('X_SCANNER_ACCOUNTS', 'DeItaone,elonmusk');
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(makeTweetResponse([]));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe('isMarketHours', () => {
    it('should return true during weekday market hours (ET)', () => {
      // Wednesday 10 AM ET = 15:00 UTC
      const wed10am = new Date('2026-03-25T15:00:00Z');
      expect(isMarketHours(wed10am)).toBe(true);
    });

    it('should return false on weekends', () => {
      // Saturday 10 AM ET = 15:00 UTC
      const sat10am = new Date('2026-03-28T15:00:00Z');
      expect(isMarketHours(sat10am)).toBe(false);
    });

    it('should return false outside market hours', () => {
      // Wednesday 2 AM ET = 07:00 UTC
      const wed2am = new Date('2026-03-25T07:00:00Z');
      expect(isMarketHours(wed2am)).toBe(false);
    });

    it('should return true at 4 AM ET (pre-market open)', () => {
      // Wednesday 4 AM ET = 08:00 UTC (EDT)
      const wed4am = new Date('2026-03-25T08:00:00Z');
      expect(isMarketHours(wed4am)).toBe(true);
    });

    it('should return false at 8 PM ET (after-hours close)', () => {
      // Wednesday 8 PM ET = 00:00 UTC next day (EDT)
      const wed8pm = new Date('2026-03-26T00:00:00Z');
      expect(isMarketHours(wed8pm)).toBe(false);
    });
  });

  describe('poll', () => {
    it('should return error if TWITTER_API_KEY is not set', async () => {
      vi.stubEnv('TWITTER_API_KEY', '');
      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('TWITTER_API_KEY');
      }
    });

    it('should skip poll outside market hours', async () => {
      // Set to Sunday
      vi.setSystemTime(new Date('2026-03-29T15:00:00Z'));

      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch tweets for each configured account', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      // Should have called fetch for each account (DeItaone, elonmusk)
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const calls = mockFetch.mock.calls;
      expect(calls[0]![0]).toContain('from%3ADeItaone');
      expect(calls[1]![0]).toContain('from%3Aelonmusk');
    });

    it('should create events from tweets with correct metadata', async () => {
      const tweet = makeTweet({
        id: 'tweet-123',
        text: 'Tesla $TSLA is surging today, bullish sentiment across the board',
        author: { userName: 'elonmusk', name: 'Elon Musk' },
        likeCount: 50000,
        retweetCount: 10000,
        replyCount: 5000,
        url: 'https://x.com/elonmusk/status/tweet-123',
      });

      mockFetch.mockResolvedValue(makeTweetResponse([tweet]));

      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThanOrEqual(1);
        const event = result.value[0]!;
        expect(event.source).toBe('x');
        expect(event.type).toBe('political-post');
        expect(event.metadata?.['author']).toBe('elonmusk');
        expect(event.metadata?.['tweetId']).toBe('tweet-123');
        expect(event.metadata?.['engagement']).toEqual({
          likes: 50000,
          retweets: 10000,
          replies: 5000,
        });
        expect(event.metadata?.['tickers']).toContain('TSLA');
        expect(event.metadata?.['sentiment']).toBe('bullish');
      }
    });

    it('should send X-API-Key header with timeout', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);
      await scanner.scan();

      expect(mockFetch).toHaveBeenCalled();
      const call = mockFetch.mock.calls[0]!;
      expect(call[1]?.headers?.['X-API-Key']).toBe('test-api-key');
      expect(call[1]?.timeoutMs).toBe(15_000);
    });
  });

  describe('deduplication', () => {
    it('should not emit events for already-seen tweet IDs', async () => {
      const tweet = makeTweet({ id: 'dedup-1', text: 'First tweet' });
      mockFetch.mockResolvedValue(makeTweetResponse([tweet]));

      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      const result1 = await scanner.scan();
      expect(result1.ok).toBe(true);
      if (result1.ok) expect(result1.value.length).toBeGreaterThanOrEqual(1);

      const result2 = await scanner.scan();
      expect(result2.ok).toBe(true);
      if (result2.ok) expect(result2.value).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should handle rate limiting (429) gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });

    it('should throw on auth error (401)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('authentication');
      }
    });

    it('should report down after 3 consecutive auth failures', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      await scanner.scan();
      await scanner.scan();
      await scanner.scan();

      expect(scanner.health().status).toBe('down');
      expect(scanner.health().errorCount).toBe(3);
    });

    it('should return ok with empty events when all accounts have network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });
  });

  describe('pagination', () => {
    it('should follow cursor pagination across multiple pages', async () => {
      const page1Tweets = [makeTweet({ id: 'p1-1' }), makeTweet({ id: 'p1-2' })];
      const page2Tweets = [makeTweet({ id: 'p2-1' })];

      mockFetch
        .mockResolvedValueOnce(makeTweetResponse(page1Tweets, true, 'cursor-page2'))
        .mockResolvedValueOnce(makeTweetResponse(page2Tweets, false, ''))
        // Second account returns empty
        .mockResolvedValue(makeTweetResponse([]));

      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);
      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
      }

      // First call: page 1 (no cursor), second call: page 2 (with cursor)
      const firstCall = mockFetch.mock.calls[0]![0] as string;
      expect(firstCall).not.toContain('cursor=');
      const secondCall = mockFetch.mock.calls[1]![0] as string;
      expect(secondCall).toContain('cursor=cursor-page2');
    });

    it('should stop after MAX_PAGES even if more pages exist', async () => {
      // Always return has_next_page: true
      mockFetch.mockImplementation(() =>
        Promise.resolve(makeTweetResponse(
          [makeTweet({ id: `tweet-${Math.random()}` })],
          true,
          `cursor-${Math.random()}`,
        )),
      );

      vi.stubEnv('X_SCANNER_ACCOUNTS', 'DeItaone');
      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);
      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      // MAX_PAGES is 5, so at most 5 calls for 1 account
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });
  });

  describe('per-account error isolation', () => {
    it('should continue scanning other accounts when one fails', async () => {
      const tweet = makeTweet({ id: 'survivor-tweet' });

      // First account (DeItaone) throws, second account (elonmusk) succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error for DeItaone'))
        .mockResolvedValueOnce(makeTweetResponse([tweet]));

      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);
      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.metadata?.['tweetId']).toBe('survivor-tweet');
      }
    });

    it('should handle timeout errors without killing other accounts', async () => {
      const timeoutError = new Error('request timed out after 15000ms');
      timeoutError.name = 'AbortError';

      const tweet = makeTweet({ id: 'after-timeout' });

      mockFetch
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce(makeTweetResponse([tweet]));

      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);
      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
      }
    });
  });

  describe('source/type matching with political rules', () => {
    it('should emit source "x" to match political rules', async () => {
      const tweet = makeTweet({ id: 'source-check', text: 'DOGE is cutting waste' });
      mockFetch.mockResolvedValue(makeTweetResponse([tweet]));

      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);
      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThanOrEqual(1);
        // Must match political-rules.ts sourceEquals: 'x'
        expect(result.value[0]!.source).toBe('x');
      }
    });

    it('should emit type "political-post" to match political rules', async () => {
      const tweet = makeTweet({ id: 'type-check', text: 'Government efficiency update' });
      mockFetch.mockResolvedValue(makeTweetResponse([tweet]));

      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);
      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThanOrEqual(1);
        // Must match political-rules.ts type expectations
        expect(result.value[0]!.type).toBe('political-post');
      }
    });
  });

  describe('configuration', () => {
    it('should use default accounts when X_SCANNER_ACCOUNTS is not set', () => {
      vi.stubEnv('X_SCANNER_ACCOUNTS', '');
      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);
      expect(scanner.name).toBe('x-scanner');
    });

    it('should use custom interval from X_SCANNER_INTERVAL_MS', () => {
      vi.stubEnv('X_SCANNER_INTERVAL_MS', '300000');
      const eventBus = new InMemoryEventBus();
      const scanner = new XScanner(eventBus);
      expect(scanner.pollIntervalMs).toBe(300_000);
    });
  });
});
