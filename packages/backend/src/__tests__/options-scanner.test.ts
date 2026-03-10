import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  UnusualOptionsScanner,
  parseUnusualOptions,
  isSignificantActivity,
  inferSignal,
  type UnusualOptionsApiResponse,
} from '../scanners/options-scanner.js';

const mockResponse = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'mock-unusual-options.json'),
    'utf-8',
  ),
) as UnusualOptionsApiResponse;

describe('UnusualOptionsScanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('parseUnusualOptions', () => {
    it('should parse options from fixture', () => {
      const options = parseUnusualOptions(mockResponse);
      expect(options).toHaveLength(5);
    });

    it('should normalize option fields', () => {
      const options = parseUnusualOptions(mockResponse);
      const tsla = options.find((o) => o.ticker === 'TSLA');
      expect(tsla).toBeDefined();
      expect(tsla!.strike).toBe(250);
      expect(tsla!.type).toBe('call');
      expect(tsla!.tradeType).toBe('sweep');
      expect(tsla!.premium).toBe(500000);
    });

    it('should calculate vol/OI ratio', () => {
      const options = parseUnusualOptions(mockResponse);
      const tsla = options.find((o) => o.ticker === 'TSLA');
      expect(tsla).toBeDefined();
      // 15000 / 2000 = 7.5
      expect(tsla!.volOiRatio).toBe(7.5);
    });

    it('should handle zero open interest', () => {
      const response: UnusualOptionsApiResponse = {
        data: [
          {
            id: 'opt-z',
            ticker: 'XYZ',
            strike: 100,
            expiry: '2026-04-17',
            option_type: 'call',
            premium: 200000,
            volume: 5000,
            open_interest: 0,
            trade_type: 'block',
          },
        ],
      };
      const options = parseUnusualOptions(response);
      expect(options[0]!.volOiRatio).toBe(0);
    });

    it('should return empty array for invalid response', () => {
      const options = parseUnusualOptions({} as UnusualOptionsApiResponse);
      expect(options).toEqual([]);
    });
  });

  describe('isSignificantActivity', () => {
    it('should flag high premium trades', () => {
      const options = parseUnusualOptions(mockResponse);
      const tsla = options.find((o) => o.ticker === 'TSLA')!;
      // premium 500000 >= 100000
      expect(isSignificantActivity(tsla)).toBe(true);
    });

    it('should flag high vol/OI ratio', () => {
      const options = parseUnusualOptions(mockResponse);
      const amd = options.find((o) => o.ticker === 'AMD')!;
      // premium 75000 < 100000, but vol/OI 12000/1000 = 12 >= 5
      expect(isSignificantActivity(amd)).toBe(true);
    });

    it('should not flag insignificant trades', () => {
      const options = parseUnusualOptions(mockResponse);
      const spy = options.find((o) => o.ticker === 'SPY')!;
      // premium 30000 < 100000, vol/OI 200/5000 = 0.04 < 5
      expect(isSignificantActivity(spy)).toBe(false);
    });
  });

  describe('inferSignal', () => {
    it('should return bullish for call sweeps', () => {
      const options = parseUnusualOptions(mockResponse);
      const tsla = options.find((o) => o.ticker === 'TSLA')!;
      expect(inferSignal(tsla)).toBe('bullish');
    });

    it('should return bearish for put blocks', () => {
      const options = parseUnusualOptions(mockResponse);
      const aapl = options.find((o) => o.ticker === 'AAPL')!;
      expect(inferSignal(aapl)).toBe('bearish');
    });

    it('should return bearish for put sweeps', () => {
      const option = {
        id: 'test',
        ticker: 'TEST',
        strike: 100,
        expiry: '2026-04-17',
        type: 'put' as const,
        premium: 200000,
        volume: 5000,
        openInterest: 500,
        volOiRatio: 10,
        tradeType: 'sweep' as const,
      };
      expect(inferSignal(option)).toBe('bearish');
    });
  });

  describe('scan', () => {
    it('should emit events for significant options activity', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new UnusualOptionsScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        // TSLA (500k premium), AAPL (250k premium), NVDA (1.2M premium), AMD (12x vol/OI)
        // SPY is filtered out (30k premium, 0.04x vol/OI)
        expect(result.value.length).toBe(4);
        expect(result.value[0]!.source).toBe('unusual-options');
        expect(result.value[0]!.type).toBe('unusual-options');
      }
    });

    it('should include signal in event metadata', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new UnusualOptionsScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const tslaEvent = result.value.find(
          (e) => e.metadata?.['ticker'] === 'TSLA',
        );
        expect(tslaEvent).toBeDefined();
        expect(tslaEvent!.metadata!['signal']).toBe('bullish');
      }
    });

    it('should include ticker in metadata', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new UnusualOptionsScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const event = result.value[0]!;
        expect(event.metadata!['ticker']).toBeDefined();
        expect(event.metadata!['tickers']).toBeDefined();
      }
    });
  });

  describe('deduplication', () => {
    it('should not emit duplicate events on second scan', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new UnusualOptionsScanner(eventBus);

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
      const scanner = new UnusualOptionsScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Network error');
      }
    });

    it('should handle non-200 responses', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new UnusualOptionsScanner(eventBus);

      fetchSpy.mockResolvedValue(new Response('', { status: 429 }));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('429');
      }
    });

    it('should report down after 3 consecutive failures', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new UnusualOptionsScanner(eventBus);

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
      const scanner = new UnusualOptionsScanner(eventBus);
      expect(scanner.health().status).toBe('healthy');
      expect(scanner.health().scanner).toBe('unusual-options');
    });
  });
});
