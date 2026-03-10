import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  EarningsScanner,
  parseEarningsCalendar,
  earningsSurpriseType,
  isUpcoming,
  type EarningsCalendarApiResponse,
} from '../scanners/earnings-scanner.js';

const mockResponse = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'mock-earnings-calendar.json'),
    'utf-8',
  ),
) as EarningsCalendarApiResponse;

describe('EarningsScanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('parseEarningsCalendar', () => {
    it('should parse earnings from fixture', () => {
      const earnings = parseEarningsCalendar(mockResponse);
      expect(earnings).toHaveLength(5);
    });

    it('should normalize ticker to uppercase', () => {
      const earnings = parseEarningsCalendar(mockResponse);
      for (const e of earnings) {
        expect(e.ticker).toBe(e.ticker.toUpperCase());
      }
    });

    it('should handle null fields', () => {
      const earnings = parseEarningsCalendar(mockResponse);
      const upcoming = earnings.find((e) => e.ticker === 'NVDA');
      expect(upcoming).toBeDefined();
      expect(upcoming!.epsActual).toBeNull();
      expect(upcoming!.revenueActual).toBeNull();
      expect(upcoming!.surprisePct).toBeNull();
    });

    it('should parse actual results correctly', () => {
      const earnings = parseEarningsCalendar(mockResponse);
      const aapl = earnings.find((e) => e.ticker === 'AAPL');
      expect(aapl).toBeDefined();
      expect(aapl!.epsActual).toBe(2.58);
      expect(aapl!.surprisePct).toBe(9.8);
      expect(aapl!.guidance).toBe('Raised full-year guidance');
    });

    it('should return empty array for invalid response', () => {
      const earnings = parseEarningsCalendar(
        {} as EarningsCalendarApiResponse,
      );
      expect(earnings).toEqual([]);
    });

    it('should default unknown report_time to unknown', () => {
      const custom = {
        earnings: [
          {
            ...mockResponse.earnings[0]!,
            report_time: 'invalid',
          },
        ],
      };
      const earnings = parseEarningsCalendar(
        custom as unknown as EarningsCalendarApiResponse,
      );
      expect(earnings[0]!.reportTime).toBe('unknown');
    });
  });

  describe('earningsSurpriseType', () => {
    it('should return beat for positive surprise > 1%', () => {
      expect(earningsSurpriseType(9.8)).toBe('beat');
    });

    it('should return miss for negative surprise < -1%', () => {
      expect(earningsSurpriseType(-20.0)).toBe('miss');
    });

    it('should return inline for small surprise', () => {
      expect(earningsSurpriseType(0.6)).toBe('inline');
    });

    it('should return null for null input', () => {
      expect(earningsSurpriseType(null)).toBeNull();
    });
  });

  describe('isUpcoming', () => {
    it('should return true for report within 24 hours', () => {
      const now = new Date('2026-03-10T12:00:00Z');
      expect(isUpcoming('2026-03-11', now)).toBe(true);
    });

    it('should return false for past reports', () => {
      const now = new Date('2026-03-10T12:00:00Z');
      expect(isUpcoming('2026-03-08', now)).toBe(false);
    });

    it('should return false for reports more than 24h away', () => {
      const now = new Date('2026-03-10T12:00:00Z');
      expect(isUpcoming('2026-04-15', now)).toBe(false);
    });
  });

  describe('scan', () => {
    it('should emit events for results and upcoming earnings', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new EarningsScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      // Mock "now" so that earn-001 (2026-03-11) is upcoming
      const origDate = Date;
      const mockNow = new Date('2026-03-10T12:00:00Z');
      vi.spyOn(globalThis, 'Date').mockImplementation(
        (...args: unknown[]) => {
          if (args.length === 0) return mockNow;
          , @typescript-eslint/no-explicit-any
          return new origDate(...(args as [any]));
        },
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        // earn-001 upcoming, earn-002/003/004 have actuals, earn-005 too far in future
        expect(result.value.length).toBe(4);

        const upcoming = result.value.find((e) => e.type === 'earnings-upcoming');
        expect(upcoming).toBeDefined();
        expect(upcoming!.title).toContain('NVDA');

        const beat = result.value.find(
          (e) => e.title.includes('AAPL') && e.type === 'earnings-result',
        );
        expect(beat).toBeDefined();
        expect(beat!.title).toContain('BEAT');

        const miss = result.value.find(
          (e) => e.title.includes('TSLA') && e.type === 'earnings-result',
        );
        expect(miss).toBeDefined();
        expect(miss!.title).toContain('MISS');
      }

      vi.restoreAllMocks();
      // Re-setup fetchSpy since we restored all mocks
    });

    it('should include metadata with earnings details', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new EarningsScanner(eventBus);

      // Only pass results (not upcoming) for simpler assertion
      const resultsOnly = {
        earnings: mockResponse.earnings.filter(
          (e) => e.eps_actual != null,
        ),
      };

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(resultsOnly), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok && result.value.length > 0) {
        const event = result.value[0]!;
        expect(event.metadata).toBeDefined();
        expect(event.metadata!['ticker']).toBeDefined();
        expect(event.metadata!['tickers']).toBeDefined();
        expect(event.metadata!['fiscal_quarter']).toBeDefined();
      }
    });
  });

  describe('deduplication', () => {
    it('should not emit duplicate events on second scan', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new EarningsScanner(eventBus);

      const resultsOnly = {
        earnings: mockResponse.earnings.filter(
          (e) => e.eps_actual != null,
        ),
      };

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(resultsOnly), { status: 200 }),
      );

      const first = await scanner.scan();
      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.value.length).toBeGreaterThan(0);
      }

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(resultsOnly), { status: 200 }),
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
      const scanner = new EarningsScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Network error');
      }
    });

    it('should handle non-200 responses', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new EarningsScanner(eventBus);

      fetchSpy.mockResolvedValue(new Response('', { status: 503 }));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('503');
      }
    });

    it('should report down after 3 consecutive failures', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new EarningsScanner(eventBus);

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
      const scanner = new EarningsScanner(eventBus);
      expect(scanner.health().status).toBe('healthy');
      expect(scanner.health().scanner).toBe('earnings');
    });
  });
});
