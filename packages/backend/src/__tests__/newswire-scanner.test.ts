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
import { extractTickers } from '../scanners/ticker-extractor.js';

const mockRssXml = readFileSync(
  join(__dirname, 'fixtures', 'mock-newswire-rss.xml'),
  'utf-8',
);

const prnewswireXml = readFileSync(
  join(__dirname, 'fixtures', 'mock-prnewswire-rss.xml'),
  'utf-8',
);

const businesswireXml = readFileSync(
  join(__dirname, 'fixtures', 'mock-businesswire-rss.xml'),
  'utf-8',
);

const globenewswireXml = readFileSync(
  join(__dirname, 'fixtures', 'mock-globenewswire-rss.xml'),
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

    it('should parse real PR Newswire RSS shape', () => {
      const items = parseRssXml(prnewswireXml);
      expect(items).toHaveLength(3);
      expect(items[0]!.title).toContain('Vertex Pharmaceuticals');
      expect(items[0]!.guid).toBe('prn-302712500');
      expect(items[0]!.description).toContain('merger agreement');
    });

    it('should parse real BusinessWire RSS shape with stock category tags', () => {
      const items = parseRssXml(businesswireXml);
      expect(items).toHaveLength(3);
      expect(items[0]!.title).toContain('CrowdStrike');
      expect(items[0]!.categories).toContain('Nasdaq:CRWD');
      // Endeavor Silver has two stock categories
      expect(items[1]!.categories).toContain('NYSE:EXK');
      expect(items[1]!.categories).toContain('TSX:EDR');
    });

    it('should parse real GlobeNewswire RSS shape with dc:creator and stock categories', () => {
      const items = parseRssXml(globenewswireXml);
      expect(items).toHaveLength(4);
      // InterDigital item has stock category
      expect(items[0]!.categories).toContain('Nasdaq:IDCC');
      // Tilray has dual-listed stock categories
      expect(items[1]!.categories).toContain('Nasdaq:TLRY');
      expect(items[1]!.categories).toContain('TSX:TLRY');
      // BioAtla
      expect(items[2]!.categories).toContain('Nasdaq:BCAB');
      // Enerplus dual-listed
      expect(items[3]!.categories).toContain('TSX:ERF');
      expect(items[3]!.categories).toContain('NYSE:ERF');
    });

    it('should return empty categories array for items without category tags', () => {
      const items = parseRssXml(mockRssXml);
      // Original mock fixture has no category tags
      expect(items[0]!.categories).toEqual([]);
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

  describe('extractTickers — category tags', () => {
    it('should extract tickers from category tags with exchange prefixes', () => {
      const tickers = extractTickers('Some headline text', [
        'Technology',
        'Nasdaq:CRWD',
      ]);
      expect(tickers).toContain('CRWD');
    });

    it('should extract multiple tickers from multiple category tags', () => {
      const tickers = extractTickers('', [
        'Nasdaq:TLRY',
        'TSX:TLRY',
        'NYSE:ERF',
      ]);
      expect(tickers).toContain('TLRY');
      expect(tickers).toContain('ERF');
    });

    it('should combine tickers from text and categories', () => {
      const tickers = extractTickers(
        'Acme Corp (NYSE: ACME) acquires $WIDG',
        ['Nasdaq:BCAB'],
      );
      expect(tickers).toContain('ACME');
      expect(tickers).toContain('WIDG');
      expect(tickers).toContain('BCAB');
    });

    it('should handle category tags with non-stock content', () => {
      const tickers = extractTickers('Some text', [
        'Earnings Releases and Operating Results',
        'InterDigital, Inc.',
        'Nasdaq:IDCC',
      ]);
      expect(tickers).toEqual(['IDCC']);
    });

    it('should handle dual-listed category entries with semicolons', () => {
      const tickers = extractTickers('', [
        'TSX:BCT; Nasdaq:BCTX',
      ]);
      expect(tickers).toContain('BCT');
      expect(tickers).toContain('BCTX');
    });

    it('should handle comma-separated category entries', () => {
      const tickers = extractTickers('', [
        'Nasdaq:CELU, Nasdaq:CELUW',
      ]);
      expect(tickers).toContain('CELU');
      expect(tickers).toContain('CELUW');
    });

    it('should reject category entries that are only digits', () => {
      const tickers = extractTickers('', [
        'SEC:0001234567',
        'Nasdaq:AAPL',
      ]);
      expect(tickers).toEqual(['AAPL']);
    });

    it('should reject category entries that match the false-ticker blocklist', () => {
      const tickers = extractTickers('', [
        'NYSE:INC',
        'Nasdaq:TSLA',
      ]);
      expect(tickers).toEqual(['TSLA']);
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

    it('should extract tickers from BusinessWire category tags', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new NewswireScanner(eventBus, [
        {
          name: 'BusinessWire',
          url: 'https://example.com/bw',
          source: 'businesswire',
        },
      ]);

      fetchSpy.mockResolvedValue(
        new Response(businesswireXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const crowdstrike = result.value.find((e) =>
          e.title.includes('CrowdStrike'),
        );
        expect(crowdstrike).toBeDefined();
        expect(crowdstrike!.metadata!['tickers']).toContain('CRWD');

        const endeavor = result.value.find((e) =>
          e.title.includes('Endeavor Silver'),
        );
        expect(endeavor).toBeDefined();
        expect(endeavor!.metadata!['tickers']).toContain('EXK');
        expect(endeavor!.metadata!['tickers']).toContain('EDR');
      }
    });

    it('should extract tickers from GlobeNewswire category tags', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new NewswireScanner(eventBus, [
        {
          name: 'GlobeNewswire',
          url: 'https://example.com/gnw',
          source: 'globenewswire',
        },
      ]);

      fetchSpy.mockResolvedValue(
        new Response(globenewswireXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const interdigital = result.value.find((e) =>
          e.title.includes('InterDigital'),
        );
        expect(interdigital).toBeDefined();
        expect(interdigital!.metadata!['tickers']).toContain('IDCC');

        const tilray = result.value.find((e) =>
          e.title.includes('Tilray'),
        );
        expect(tilray).toBeDefined();
        expect(tilray!.metadata!['tickers']).toContain('TLRY');
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

    it('should deduplicate by link when guid is absent', async () => {
      const noGuidXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title>Test Article</title>
    <link>https://example.com/article-1</link>
    <pubDate>Thu, 12 Mar 2026 09:00:00 GMT</pubDate>
    <description>Description here</description>
  </item>
</channel></rss>`;

      const eventBus = new InMemoryEventBus();
      const scanner = new NewswireScanner(eventBus, [
        { name: 'Feed', url: 'https://example.com/rss', source: 'pr-newswire' },
      ]);

      fetchSpy.mockResolvedValue(new Response(noGuidXml, { status: 200 }));

      const r1 = await scanner.scan();
      expect(r1.ok && r1.value.length).toBe(1);

      const r2 = await scanner.scan();
      expect(r2.ok && r2.value.length).toBe(0);
    });
  });

  describe('scan — multiple feeds with real shapes', () => {
    it('should poll all three providers and set correct source', async () => {
      const eventBus = new InMemoryEventBus();
      const feeds: NewswireFeedConfig[] = [
        { name: 'PR Newswire', url: 'https://example.com/prn', source: 'pr-newswire' },
        { name: 'BusinessWire', url: 'https://example.com/bw', source: 'businesswire' },
        { name: 'GlobeNewswire', url: 'https://example.com/gnw', source: 'globenewswire' },
      ];
      const scanner = new NewswireScanner(eventBus, feeds);

      fetchSpy.mockImplementation(async (url) => {
        const u = String(url);
        if (u.includes('prn')) return new Response(prnewswireXml, { status: 200 });
        if (u.includes('bw')) return new Response(businesswireXml, { status: 200 });
        return new Response(globenewswireXml, { status: 200 });
      });

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      if (result.ok) {
        const prnEvents = result.value.filter((e) => e.source === 'pr-newswire');
        const bwEvents = result.value.filter((e) => e.source === 'businesswire');
        const gnwEvents = result.value.filter((e) => e.source === 'globenewswire');
        expect(prnEvents.length).toBe(3);
        expect(bwEvents.length).toBe(3);
        expect(gnwEvents.length).toBe(4);
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
        return new Response(businesswireXml, { status: 200 });
      });

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(3);
        expect(result.value.every((e) => e.source === 'businesswire')).toBe(true);
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

    it('should handle 404 response gracefully (broken default feed)', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new NewswireScanner(eventBus, [
        { name: 'Broken Feed', url: 'https://example.com/404', source: 'pr-newswire' },
        { name: 'Working Feed', url: 'https://example.com/ok', source: 'globenewswire' },
      ]);

      fetchSpy.mockImplementation(async (url) => {
        if (String(url).includes('404')) {
          return new Response('<html>Not Found</html>', { status: 404 });
        }
        return new Response(globenewswireXml, { status: 200 });
      });

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(4);
        expect(result.value.every((e) => e.source === 'globenewswire')).toBe(true);
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
        new Response(prnewswireXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok && result.value.length > 0) {
        const event = result.value[0]!;
        expect(event.source).toBe('pr-newswire');
        expect(event.type).toBe('press-release');
        expect(event.title).toContain('Vertex Pharmaceuticals');
        expect(event.body).toBeTruthy();
        expect(event.body.length).toBeLessThanOrEqual(500);
        expect(event.url).toBeTruthy();
        expect(event.timestamp).toBeInstanceOf(Date);
        expect(event.metadata).toBeDefined();
        expect(event.metadata!['source_feed']).toBe('PR Newswire');
        expect(event.metadata!['severity']).toBe('HIGH'); // "acquisition"
        expect(event.metadata!['sourceEventId']).toBe('prn-302712500');
        expect(event.metadata!['tickers']).toContain('VRTX');
        expect(event.metadata!['tickers']).toContain('DTIL');
      }
    });

    it('should classify severity correctly across providers', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new NewswireScanner(eventBus, [
        { name: 'GlobeNewswire', url: 'https://example.com/gnw', source: 'globenewswire' },
      ]);

      fetchSpy.mockResolvedValue(
        new Response(globenewswireXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        // InterDigital — has "guidance" in description
        const interdigital = result.value.find((e) => e.title.includes('InterDigital'));
        expect(interdigital!.metadata!['severity']).toBe('HIGH');

        // BioAtla — "hostile takeover"
        const bioatla = result.value.find((e) => e.title.includes('BioAtla'));
        expect(bioatla!.metadata!['severity']).toBe('CRITICAL');

        // Enerplus — no keywords → MEDIUM
        const enerplus = result.value.find((e) => e.title.includes('Enerplus'));
        expect(enerplus!.metadata!['severity']).toBe('MEDIUM');
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
