import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  AnalystScanner,
  parseAnalystRatings,
  ratingSeverity,
  type AnalystRatingsApiResponse,
} from '../scanners/analyst-scanner.js';

const mockResponse = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'mock-analyst-ratings.json'),
    'utf-8',
  ),
) as AnalystRatingsApiResponse;

describe('AnalystScanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('parseAnalystRatings', () => {
    it('should parse ratings from fixture', () => {
      const ratings = parseAnalystRatings(mockResponse);
      expect(ratings).toHaveLength(5);
    });

    it('should normalize ticker to uppercase', () => {
      const ratings = parseAnalystRatings(mockResponse);
      for (const r of ratings) {
        expect(r.ticker).toBe(r.ticker.toUpperCase());
      }
    });

    it('should handle null old_rating for initiations', () => {
      const ratings = parseAnalystRatings(mockResponse);
      const initiation = ratings.find((r) => r.actionType === 'initiation');
      expect(initiation).toBeDefined();
      expect(initiation!.oldRating).toBeNull();
      expect(initiation!.oldPt).toBeNull();
    });

    it('should handle null analyst_name', () => {
      const ratings = parseAnalystRatings(mockResponse);
      const jpMorgan = ratings.find((r) => r.analystFirm === 'JP Morgan');
      expect(jpMorgan).toBeDefined();
      expect(jpMorgan!.analystName).toBeNull();
    });

    it('should return empty array for invalid response', () => {
      const ratings = parseAnalystRatings({} as AnalystRatingsApiResponse);
      expect(ratings).toEqual([]);
    });

    it('should default unknown action types to reiteration', () => {
      const custom = {
        ratings: [
          {
            ...mockResponse.ratings[0]!,
            action_type: 'unknown_action',
          },
        ],
      };
      const ratings = parseAnalystRatings(
        custom as unknown as AnalystRatingsApiResponse,
      );
      expect(ratings[0]!.actionType).toBe('reiteration');
    });
  });

  describe('ratingSeverity', () => {
    it('should return HIGH for downgrades', () => {
      const ratings = parseAnalystRatings(mockResponse);
      const downgrade = ratings.find((r) => r.actionType === 'downgrade')!;
      expect(ratingSeverity(downgrade)).toBe('HIGH');
    });

    it('should return HIGH for Sell→Buy upgrade', () => {
      const ratings = parseAnalystRatings(mockResponse);
      const meta = ratings.find((r) => r.ticker === 'META')!;
      expect(ratingSeverity(meta)).toBe('HIGH');
    });

    it('should return MEDIUM for normal upgrades', () => {
      const ratings = parseAnalystRatings(mockResponse);
      const nvda = ratings.find((r) => r.ticker === 'NVDA')!;
      expect(ratingSeverity(nvda)).toBe('MEDIUM');
    });

    it('should return MEDIUM for initiations', () => {
      const ratings = parseAnalystRatings(mockResponse);
      const initiation = ratings.find((r) => r.actionType === 'initiation')!;
      expect(ratingSeverity(initiation)).toBe('MEDIUM');
    });

    it('should return LOW for PT changes', () => {
      const ratings = parseAnalystRatings(mockResponse);
      const ptChange = ratings.find((r) => r.actionType === 'pt_change')!;
      expect(ratingSeverity(ptChange)).toBe('LOW');
    });
  });

  describe('scan', () => {
    it('should emit events for all ratings', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new AnalystScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(5);
        expect(result.value[0]!.source).toBe('analyst');
        expect(result.value[0]!.type).toBe('analyst-rating');
      }
    });

    it('should include action label emoji in title', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new AnalystScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const upgrade = result.value.find((e) => e.title.includes('NVDA'));
        expect(upgrade!.title).toContain('⬆️ Upgrade');

        const downgrade = result.value.find((e) => e.title.includes('TSLA'));
        expect(downgrade!.title).toContain('⬇️ Downgrade');
      }
    });

    it('should include metadata with analyst details', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new AnalystScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const event = result.value[0]!;
        expect(event.metadata).toBeDefined();
        expect(event.metadata!['ticker']).toBe('NVDA');
        expect(event.metadata!['tickers']).toEqual(['NVDA']);
        expect(event.metadata!['analyst_firm']).toBe('Goldman Sachs');
        expect(event.metadata!['action_type']).toBe('upgrade');
        expect(event.metadata!['severity']).toBe('MEDIUM');
      }
    });
  });

  describe('deduplication', () => {
    it('should not emit duplicate events on second scan', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new AnalystScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const first = await scanner.scan();
      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.value.length).toBe(5);
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
      const scanner = new AnalystScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Network error');
      }
    });

    it('should handle non-200 responses', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new AnalystScanner(eventBus);

      fetchSpy.mockResolvedValue(new Response('', { status: 429 }));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('429');
      }
    });

    it('should report down after 3 consecutive failures', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new AnalystScanner(eventBus);

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
      const scanner = new AnalystScanner(eventBus);
      expect(scanner.health().status).toBe('healthy');
      expect(scanner.health().scanner).toBe('analyst');
    });
  });
});
