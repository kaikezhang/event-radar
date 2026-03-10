import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  CongressScanner,
  parseCongressTrades,
  isCommitteeRelevant,
  type CongressTradesApiResponse,
} from '../scanners/congress-scanner.js';

const mockResponse = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'mock-congress-trades.json'),
    'utf-8',
  ),
) as CongressTradesApiResponse;

describe('CongressScanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('parseCongressTrades', () => {
    it('should parse trades from fixture', () => {
      const trades = parseCongressTrades(mockResponse);
      // ct-004 has amount_high=15000 which is below 50k threshold
      expect(trades).toHaveLength(4);
    });

    it('should filter out trades below $50k threshold', () => {
      const trades = parseCongressTrades(mockResponse);
      const smallTrade = trades.find((t) => t.ticker === 'AAPL');
      expect(smallTrade).toBeUndefined();
    });

    it('should normalize trade fields', () => {
      const trades = parseCongressTrades(mockResponse);
      const pelosi = trades.find((t) => t.politician === 'Nancy Pelosi');
      expect(pelosi).toBeDefined();
      expect(pelosi!.party).toBe('D');
      expect(pelosi!.chamber).toBe('House');
      expect(pelosi!.ticker).toBe('NVDA');
      expect(pelosi!.tradeType).toBe('buy');
    });

    it('should handle sell trades', () => {
      const trades = parseCongressTrades(mockResponse);
      const sell = trades.find((t) => t.tradeType === 'sell');
      expect(sell).toBeDefined();
      expect(sell!.politician).toBe('Dan Crenshaw');
      expect(sell!.ticker).toBe('MSFT');
    });

    it('should return empty array for invalid response', () => {
      const trades = parseCongressTrades({} as CongressTradesApiResponse);
      expect(trades).toEqual([]);
    });

    it('should parse Senate chamber correctly', () => {
      const trades = parseCongressTrades(mockResponse);
      const senator = trades.find((t) => t.politician === 'Tommy Tuberville');
      expect(senator).toBeDefined();
      expect(senator!.chamber).toBe('Senate');
    });
  });

  describe('isCommitteeRelevant', () => {
    it('should return true for trades with committee info', () => {
      const trades = parseCongressTrades(mockResponse);
      const pelosi = trades.find((t) => t.politician === 'Nancy Pelosi')!;
      expect(isCommitteeRelevant(pelosi)).toBe(true);
    });

    it('should return false for trades without committee info', () => {
      const trades = parseCongressTrades(mockResponse);
      const crenshaw = trades.find((t) => t.politician === 'Dan Crenshaw')!;
      expect(isCommitteeRelevant(crenshaw)).toBe(false);
    });
  });

  describe('scan', () => {
    it('should emit events for significant trades', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new CongressScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(4);
        expect(result.value[0]!.source).toBe('congress');
        expect(result.value[0]!.type).toBe('congress-trade');
      }
    });

    it('should include committee relevance tag in title', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new CongressScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const pelosi = result.value.find((e) =>
          e.title.includes('Nancy Pelosi'),
        );
        expect(pelosi!.title).toContain('[COMMITTEE RELEVANT]');
      }
    });

    it('should include metadata with politician details', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new CongressScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const event = result.value[0]!;
        expect(event.metadata).toBeDefined();
        expect(event.metadata!['politician']).toBe('Nancy Pelosi');
        expect(event.metadata!['party']).toBe('D');
        expect(event.metadata!['chamber']).toBe('House');
        expect(event.metadata!['ticker']).toBe('NVDA');
        expect(event.metadata!['tickers']).toEqual(['NVDA']);
      }
    });
  });

  describe('deduplication', () => {
    it('should not emit duplicate events on second scan', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new CongressScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const first = await scanner.scan();
      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.value.length).toBe(4);
      }

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const second = await scanner.scan();
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.value.length).toBe(0);
      }
    });
  });

  describe('error handling', () => {
    it('should handle fetch errors gracefully', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new CongressScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Network error');
      }
    });

    it('should handle non-200 responses', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new CongressScanner(eventBus);

      fetchSpy.mockResolvedValue(new Response('', { status: 503 }));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('503');
      }
    });

    it('should report down after 3 consecutive failures', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new CongressScanner(eventBus);

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
      const scanner = new CongressScanner(eventBus);
      expect(scanner.health().status).toBe('healthy');
      expect(scanner.health().scanner).toBe('congress');
    });
  });
});
