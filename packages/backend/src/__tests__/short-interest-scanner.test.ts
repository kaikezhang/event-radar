import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  ShortInterestScanner,
  parseShortInterest,
  isSignificantChange,
  isMostShorted,
  type ShortInterestApiResponse,
} from '../scanners/short-interest-scanner.js';

const mockResponse = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'mock-short-interest.json'),
    'utf-8',
  ),
) as ShortInterestApiResponse;

describe('ShortInterestScanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('parseShortInterest', () => {
    it('should parse entries from fixture', () => {
      const entries = parseShortInterest(mockResponse);
      expect(entries).toHaveLength(5);
    });

    it('should calculate change percentage correctly', () => {
      const entries = parseShortInterest(mockResponse);
      const gme = entries.find((e) => e.ticker === 'GME');
      expect(gme).toBeDefined();
      // (45M - 38M) / 38M * 100 = 18.42%
      expect(gme!.changePct).toBeCloseTo(18.42, 1);
    });

    it('should normalize ticker to uppercase', () => {
      const response: ShortInterestApiResponse = {
        data: [
          {
            ticker: 'aapl',
            short_interest: 10000,
            short_pct_float: 5.0,
            days_to_cover: 1.5,
            previous_short_interest: 9000,
          },
        ],
      };
      const entries = parseShortInterest(response);
      expect(entries[0]!.ticker).toBe('AAPL');
    });

    it('should handle zero previous short interest', () => {
      const response: ShortInterestApiResponse = {
        data: [
          {
            ticker: 'NEW',
            short_interest: 10000,
            short_pct_float: 5.0,
            days_to_cover: 1.5,
            previous_short_interest: 0,
          },
        ],
      };
      const entries = parseShortInterest(response);
      expect(entries[0]!.changePct).toBe(0);
    });

    it('should return empty array for invalid response', () => {
      const entries = parseShortInterest({} as ShortInterestApiResponse);
      expect(entries).toEqual([]);
    });
  });

  describe('isSignificantChange', () => {
    it('should flag entries with >5% change', () => {
      const entries = parseShortInterest(mockResponse);
      const gme = entries.find((e) => e.ticker === 'GME')!;
      // 18.42% change > 5%
      expect(isSignificantChange(gme)).toBe(true);
    });

    it('should not flag entries with <5% change', () => {
      const entries = parseShortInterest(mockResponse);
      const tsla = entries.find((e) => e.ticker === 'TSLA')!;
      // (25M - 24.5M) / 24.5M * 100 = 2.04%
      expect(isSignificantChange(tsla)).toBe(false);
    });
  });

  describe('isMostShorted', () => {
    it('should flag entries with >20% of float shorted', () => {
      const entries = parseShortInterest(mockResponse);
      const gme = entries.find((e) => e.ticker === 'GME')!;
      expect(isMostShorted(gme)).toBe(true);
    });

    it('should not flag entries with <20% of float shorted', () => {
      const entries = parseShortInterest(mockResponse);
      const tsla = entries.find((e) => e.ticker === 'TSLA')!;
      expect(isMostShorted(tsla)).toBe(false);
    });
  });

  describe('scan', () => {
    it('should emit events for significant short interest changes', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new ShortInterestScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        // GME: 18.42% change + most shorted ✓
        // AMC: 4.35% change but most shorted (22.1%) ✓
        // BBBY: 20% change + most shorted ✓
        // TSLA: 2.04% change, 3.2% float ✗
        // CVNA: 50% change ✓
        expect(result.value.length).toBe(4);
        expect(result.value[0]!.source).toBe('short-interest');
        expect(result.value[0]!.type).toBe('short_interest');
      }
    });

    it('should include short interest data in metadata', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new ShortInterestScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const event = result.value[0]!;
        expect(event.metadata!['ticker']).toBeDefined();
        expect(event.metadata!['short_interest']).toBeDefined();
        expect(event.metadata!['short_pct_float']).toBeDefined();
        expect(event.metadata!['days_to_cover']).toBeDefined();
        expect(event.metadata!['change_pct']).toBeDefined();
        expect(event.metadata!['previous_si']).toBeDefined();
      }
    });

    it('should include tags in metadata', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new ShortInterestScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const gme = result.value.find(
          (e) => e.metadata?.['ticker'] === 'GME',
        );
        expect(gme).toBeDefined();
        const tags = gme!.metadata!['tags'] as string[];
        expect(tags).toContain('SI_CHANGE');
        expect(tags).toContain('MOST_SHORTED');
      }
    });
  });

  describe('deduplication', () => {
    it('should not emit duplicate events on second scan', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new ShortInterestScanner(eventBus);

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
      const scanner = new ShortInterestScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Network error');
      }
    });

    it('should handle non-200 responses', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new ShortInterestScanner(eventBus);

      fetchSpy.mockResolvedValue(new Response('', { status: 500 }));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('500');
      }
    });

    it('should report down after 3 consecutive failures', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new ShortInterestScanner(eventBus);

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
      const scanner = new ShortInterestScanner(eventBus);
      expect(scanner.health().status).toBe('healthy');
      expect(scanner.health().scanner).toBe('short-interest');
    });
  });
});
