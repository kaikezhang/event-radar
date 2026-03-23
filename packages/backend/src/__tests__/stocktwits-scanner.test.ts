import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  StockTwitsScanner,
  getStockTwitsTrendingDefaultSeverity,
  parseTrendingResponse,
  analyzeSentiment,
  type StockTwitsTrendingResponse,
  type StockTwitsStreamResponse,
  type StockTwitsMessage,
} from '../scanners/stocktwits-scanner.js';
import { RuleEngine } from '../pipeline/rule-engine.js';
import { DEFAULT_RULES } from '../pipeline/default-rules.js';

const mockFixture = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'mock-stocktwits-response.json'),
    'utf-8',
  ),
);

const mockTrendingResponse = mockFixture.trending as StockTwitsTrendingResponse;
const mockStreamResponse = mockFixture.symbolStream as StockTwitsStreamResponse;

describe('StockTwitsScanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('parseTrendingResponse', () => {
    it('should parse trending symbols from fixture', () => {
      const symbols = parseTrendingResponse(mockTrendingResponse);
      expect(symbols).toHaveLength(5);
      expect(symbols[0]!.symbol).toBe('TSLA');
      expect(symbols[0]!.title).toBe('Tesla, Inc.');
      expect(symbols[0]!.watchlistCount).toBe(350000);
    });

    it('should return empty array for invalid response', () => {
      const symbols = parseTrendingResponse({} as StockTwitsTrendingResponse);
      expect(symbols).toEqual([]);
    });
  });

  describe('analyzeSentiment', () => {
    it('should count bullish and bearish messages', () => {
      const messages = mockStreamResponse.messages as StockTwitsMessage[];
      const result = analyzeSentiment(messages);
      expect(result.bullish).toBe(3); // 3 bullish messages in fixture
      expect(result.bearish).toBe(1); // 1 bearish message
      expect(result.neutral).toBe(1); // 1 null sentiment
      expect(result.total).toBe(5);
    });

    it('should calculate correct sentiment ratio', () => {
      const messages = mockStreamResponse.messages as StockTwitsMessage[];
      const result = analyzeSentiment(messages);
      // 3 bullish / (3 bullish + 1 bearish) = 0.75
      expect(result.ratio).toBe(0.75);
    });

    it('should handle empty messages array', () => {
      const result = analyzeSentiment([]);
      expect(result.bullish).toBe(0);
      expect(result.bearish).toBe(0);
      expect(result.total).toBe(0);
      expect(result.ratio).toBe(0.5); // Default neutral ratio
    });

    it('should handle all-bullish messages', () => {
      const messages: StockTwitsMessage[] = [
        {
          id: 1,
          body: 'Bullish!',
          created_at: '',
          user: { id: 1, username: 'a' },
          entities: { sentiment: { basic: 'Bullish' } },
          likes: { total: 0 },
        },
        {
          id: 2,
          body: 'Very bullish!',
          created_at: '',
          user: { id: 2, username: 'b' },
          entities: { sentiment: { basic: 'Bullish' } },
          likes: { total: 0 },
        },
      ];
      const result = analyzeSentiment(messages);
      expect(result.ratio).toBe(1);
    });
  });

  describe('scan — trending detection', () => {
    it('uses LOW as the default configured severity for new trending entries', () => {
      expect(getStockTwitsTrendingDefaultSeverity()).toBe('LOW');
    });

    it('should emit events for new trending symbols on first poll', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new StockTwitsScanner(eventBus);

      fetchSpy.mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('trending')) {
          return new Response(JSON.stringify(mockTrendingResponse), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(mockStreamResponse), {
          status: 200,
        });
      });

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        // All 5 trending symbols are new on first poll
        const trendingEvents = result.value.filter(
          (e) => e.type === 'social-trending',
        );
        expect(trendingEvents).toHaveLength(5);
        expect(trendingEvents[0]!.source).toBe('stocktwits');
        expect(trendingEvents[0]!.metadata!['ticker']).toBe('TSLA');
        expect(trendingEvents[0]!.metadata!['default_severity']).toBe('LOW');
      }
    });

    it('should not emit duplicate trending events on second poll', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new StockTwitsScanner(eventBus);

      fetchSpy.mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('trending')) {
          return new Response(JSON.stringify(mockTrendingResponse), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(mockStreamResponse), {
          status: 200,
        });
      });

      await scanner.scan();
      const result2 = await scanner.scan();
      expect(result2.ok).toBe(true);
      if (result2.ok) {
        const trendingEvents = result2.value.filter(
          (e) => e.type === 'social-trending',
        );
        expect(trendingEvents).toHaveLength(0);
      }
    });

    it('classifies entered trending events as LOW instead of falling back to MEDIUM', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new StockTwitsScanner(eventBus);
      const ruleEngine = new RuleEngine();
      ruleEngine.loadRules(DEFAULT_RULES);

      fetchSpy.mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('trending')) {
          return new Response(JSON.stringify(mockTrendingResponse), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(mockStreamResponse), {
          status: 200,
        });
      });

      const result = await scanner.scan();
      expect(result.ok).toBe(true);

      if (result.ok) {
        const firstTrendingEvent = result.value.find(
          (event) => event.type === 'social-trending',
        );

        expect(firstTrendingEvent).toBeDefined();
        expect(ruleEngine.classify(firstTrendingEvent!).severity).toBe('LOW');
      }
    });
  });

  describe('scan — sentiment flip detection', () => {
    it('should detect sentiment flip from bullish to bearish', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new StockTwitsScanner(eventBus);

      // First poll: bullish stream (ratio 0.75)
      fetchSpy.mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('trending')) {
          return new Response(JSON.stringify(mockTrendingResponse), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(mockStreamResponse), {
          status: 200,
        });
      });

      await scanner.scan();

      // Second poll: bearish stream
      const bearishStream: StockTwitsStreamResponse = {
        ...mockStreamResponse,
        messages: [
          {
            id: 200001,
            body: 'Bearish',
            created_at: '',
            user: { id: 1, username: 'a' },
            entities: { sentiment: { basic: 'Bearish' } },
            likes: { total: 0 },
          },
          {
            id: 200002,
            body: 'Bearish',
            created_at: '',
            user: { id: 2, username: 'b' },
            entities: { sentiment: { basic: 'Bearish' } },
            likes: { total: 0 },
          },
          {
            id: 200003,
            body: 'Bullish',
            created_at: '',
            user: { id: 3, username: 'c' },
            entities: { sentiment: { basic: 'Bullish' } },
            likes: { total: 0 },
          },
        ],
      };

      fetchSpy.mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('trending')) {
          return new Response(JSON.stringify(mockTrendingResponse), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(bearishStream), { status: 200 });
      });

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const flipEvents = result.value.filter(
          (e) => e.type === 'social-sentiment',
        );
        expect(flipEvents.length).toBeGreaterThan(0);
        expect(flipEvents[0]!.title).toContain('sentiment flipped');
      }
    });
  });

  describe('scan — volume spike detection', () => {
    it('should detect volume spike >2x previous', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new StockTwitsScanner(eventBus);

      // First poll: 5 messages
      fetchSpy.mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('trending')) {
          return new Response(JSON.stringify(mockTrendingResponse), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(mockStreamResponse), {
          status: 200,
        });
      });

      await scanner.scan();

      // Second poll: 11 messages (>2x of 5)
      const highVolumeStream: StockTwitsStreamResponse = {
        ...mockStreamResponse,
        messages: Array.from({ length: 11 }, (_, i) => ({
          id: 300000 + i,
          body: 'Test message',
          created_at: '',
          user: { id: i, username: `user${i}` },
          entities: { sentiment: { basic: 'Bullish' as const } },
          likes: { total: 0 },
        })),
      };

      fetchSpy.mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('trending')) {
          return new Response(JSON.stringify(mockTrendingResponse), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(highVolumeStream), { status: 200 });
      });

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const volumeEvents = result.value.filter(
          (e) => e.type === 'social-volume',
        );
        expect(volumeEvents.length).toBeGreaterThan(0);
        expect(volumeEvents[0]!.title).toContain('volume spike');
      }
    });
  });

  describe('scan — error handling', () => {
    it('should handle fetch errors gracefully', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new StockTwitsScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Network error');
      }
    });

    it('should report down after 3 consecutive failures', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new StockTwitsScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('API down'));

      await scanner.scan();
      await scanner.scan();
      await scanner.scan();

      expect(scanner.health().status).toBe('down');
      expect(scanner.health().errorCount).toBe(3);
    });
  });

  describe('health', () => {
    it('should report healthy initially', () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new StockTwitsScanner(eventBus);
      expect(scanner.health().status).toBe('healthy');
      expect(scanner.health().scanner).toBe('stocktwits');
    });
  });
});
