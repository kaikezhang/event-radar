import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  NewswireScanner,
  classifySeverity,
  type NewswireFeedConfig,
} from '../scanners/newswire-scanner.js';
import { parseRssXml } from '../scanners/breaking-news-scanner.js';

const mockRssXml = readFileSync(
  join(__dirname, 'fixtures', 'mock-newswire-rss.xml'),
  'utf-8',
);

describe('NewswireScanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('RSS XML parsing', () => {
    it('should parse all items from newswire RSS feed', () => {
      const items = parseRssXml(mockRssXml);
      expect(items).toHaveLength(6);
    });

    it('should extract title, link, guid, and description', () => {
      const items = parseRssXml(mockRssXml);
      expect(items[0]!.title).toContain('Acme Corp');
      expect(items[0]!.title).toContain('Acquisition');
      expect(items[0]!.link).toBe(
        'https://www.prnewswire.com/news/acme-acquisition-2026',
      );
      expect(items[0]!.guid).toBe('prn-acme-acquisition-001');
      expect(items[0]!.pubDate).toBe('Thu, 12 Mar 2026 09:00:00 GMT');
    });

    it('should handle CDATA sections in description', () => {
      const items = parseRssXml(mockRssXml);
      const bioGen = items.find((i) => i.title.includes('BioGen'));
      expect(bioGen).toBeDefined();
      expect(bioGen!.description).toContain('FDA approval');
    });
  });

  describe('classifySeverity', () => {
    it('should return CRITICAL for critical keywords', () => {
      expect(classifySeverity('Company under SEC investigation')).toBe(
        'CRITICAL',
      );
      expect(classifySeverity('Stock delisted from exchange')).toBe('CRITICAL');
      expect(classifySeverity('Hostile takeover bid launched')).toBe(
        'CRITICAL',
      );
      expect(classifySeverity('Alleged fraud discovered')).toBe('CRITICAL');
    });

    it('should return HIGH for high-severity keywords', () => {
      expect(classifySeverity('Company announces merger')).toBe('HIGH');
      expect(classifySeverity('Acquisition of rival firm')).toBe('HIGH');
      expect(classifySeverity('FDA approval granted')).toBe('HIGH');
      expect(classifySeverity('Company restructuring plan')).toBe('HIGH');
      expect(classifySeverity('Filing for bankruptcy')).toBe('HIGH');
      expect(classifySeverity('Chapter 11 filing')).toBe('HIGH');
      expect(classifySeverity('Major layoff announced')).toBe('HIGH');
      expect(classifySeverity('Workforce reduction planned')).toBe('HIGH');
      expect(classifySeverity('Earnings pre-announcement issued')).toBe('HIGH');
      expect(classifySeverity('Updated guidance released')).toBe('HIGH');
    });

    it('should return MEDIUM for no keyword matches', () => {
      expect(classifySeverity('Company reports quarterly results')).toBe(
        'MEDIUM',
      );
      expect(classifySeverity('New product launch announced')).toBe('MEDIUM');
    });

    it('should be case-insensitive', () => {
      expect(classifySeverity('MERGER ANNOUNCED')).toBe('HIGH');
      expect(classifySeverity('SEC INVESTIGATION')).toBe('CRITICAL');
    });

    it('should prioritize CRITICAL over HIGH', () => {
      expect(
        classifySeverity('Merger halted due to SEC investigation and fraud'),
      ).toBe('CRITICAL');
    });
  });

  describe('scan — ticker extraction', () => {
    it('should extract tickers from press releases', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new NewswireScanner(eventBus, [
        {
          name: 'Test Feed',
          url: 'https://example.com/rss',
          source: 'pr-newswire',
        },
      ]);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const acmeEvent = result.value.find((e) =>
          e.title.includes('Acme Corp'),
        );
        expect(acmeEvent).toBeDefined();
        expect(acmeEvent!.metadata!['tickers']).toContain('ACME');

        const megaEvent = result.value.find((e) =>
          e.title.includes('MegaRetail'),
        );
        expect(megaEvent).toBeDefined();
        expect(megaEvent!.metadata!['tickers']).toContain('MEGA');
      }
    });
  });

  describe('scan — deduplication', () => {
    it('should deduplicate articles by guid', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new NewswireScanner(eventBus, [
        {
          name: 'Feed',
          url: 'https://example.com/rss',
          source: 'pr-newswire',
        },
      ]);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result1 = await scanner.scan();
      expect(result1.ok).toBe(true);
      const count1 = result1.ok ? result1.value.length : 0;
      expect(count1).toBeGreaterThan(0);

      // Second scan with same data should return 0 new events
      const result2 = await scanner.scan();
      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.value).toHaveLength(0);
      }
    });
  });

  describe('scan — multiple feeds', () => {
    it('should poll all configured feeds and set correct source', async () => {
      const eventBus = new InMemoryEventBus();
      const feeds: NewswireFeedConfig[] = [
        {
          name: 'PR Newswire',
          url: 'https://example.com/prn',
          source: 'pr-newswire',
        },
        {
          name: 'BusinessWire',
          url: 'https://example.com/bw',
          source: 'businesswire',
        },
      ];
      const scanner = new NewswireScanner(eventBus, feeds);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      if (result.ok) {
        // First feed items should have pr-newswire source
        const prnEvents = result.value.filter(
          (e) => e.source === 'pr-newswire',
        );
        expect(prnEvents.length).toBeGreaterThan(0);

        // Second feed items get deduped (same fixture), but source was set correctly
        // Verify at least some events exist
        expect(result.value.length).toBeGreaterThan(0);
      }
    });

    it('should continue if one feed fails', async () => {
      const eventBus = new InMemoryEventBus();
      const feeds: NewswireFeedConfig[] = [
        {
          name: 'Bad Feed',
          url: 'https://example.com/bad',
          source: 'pr-newswire',
        },
        {
          name: 'Good Feed',
          url: 'https://example.com/good',
          source: 'businesswire',
        },
      ];
      const scanner = new NewswireScanner(eventBus, feeds);

      let callCount = 0;
      fetchSpy.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response('', { status: 500 });
        }
        return new Response(mockRssXml, { status: 200 });
      });

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
      }
    });

    it('should handle fetch errors without crashing', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new NewswireScanner(eventBus, [
        {
          name: 'Feed',
          url: 'https://example.com/rss',
          source: 'pr-newswire',
        },
      ]);

      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  describe('scan — event mapping', () => {
    it('should map events with correct fields', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new NewswireScanner(eventBus, [
        {
          name: 'PR Newswire',
          url: 'https://example.com/rss',
          source: 'pr-newswire',
        },
      ]);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok && result.value.length > 0) {
        const event = result.value[0]!;
        expect(event.source).toBe('pr-newswire');
        expect(event.type).toBe('press-release');
        expect(event.title).toBeTruthy();
        expect(event.body).toBeTruthy();
        expect(event.body.length).toBeLessThanOrEqual(500);
        expect(event.url).toBeTruthy();
        expect(event.timestamp).toBeInstanceOf(Date);
        expect(event.metadata).toBeDefined();
        expect(event.metadata!['source_feed']).toBe('PR Newswire');
        expect(event.metadata!['severity']).toBeDefined();
        expect(event.metadata!['sourceEventId']).toBeTruthy();
      }
    });

    it('should classify severity correctly in events', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new NewswireScanner(eventBus, [
        {
          name: 'Feed',
          url: 'https://example.com/rss',
          source: 'pr-newswire',
        },
      ]);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const acme = result.value.find((e) => e.title.includes('Acquisition'));
        expect(acme!.metadata!['severity']).toBe('HIGH');

        const shady = result.value.find((e) =>
          e.title.includes('SEC Investigation'),
        );
        expect(shady!.metadata!['severity']).toBe('CRITICAL');

        const smallco = result.value.find((e) =>
          e.title.includes('SmallCo'),
        );
        expect(smallco!.metadata!['severity']).toBe('MEDIUM');
      }
    });
  });

  describe('health', () => {
    it('should report healthy initially', () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new NewswireScanner(eventBus);
      expect(scanner.health().status).toBe('healthy');
      expect(scanner.health().scanner).toBe('newswire');
    });
  });
});
