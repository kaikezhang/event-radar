import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  WhiteHouseScanner,
  parseFederalRegisterDocs,
  isMarketRelevant,
  extractTopics,
  type FederalRegisterApiResponse,
  type FederalRegisterDocument,
} from '../scanners/whitehouse-scanner.js';

const mockResponse = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'mock-federal-register.json'),
    'utf-8',
  ),
) as FederalRegisterApiResponse;

describe('WhiteHouseScanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('parseFederalRegisterDocs', () => {
    it('should parse all documents from fixture', () => {
      const docs = parseFederalRegisterDocs(mockResponse);
      expect(docs).toHaveLength(6);
    });

    it('should return empty array for invalid response', () => {
      const docs = parseFederalRegisterDocs({} as FederalRegisterApiResponse);
      expect(docs).toEqual([]);
    });

    it('should preserve document fields', () => {
      const docs = parseFederalRegisterDocs(mockResponse);
      const first = docs[0]!;
      expect(first.document_number).toBe('2026-05001');
      expect(first.executive_order_number).toBe('14250');
      expect(first.signing_date).toBe('2026-03-09');
    });
  });

  describe('isMarketRelevant', () => {
    it('should detect trade/tariff documents as relevant', () => {
      const doc: FederalRegisterDocument = {
        document_number: 'test-001',
        title: 'New Tariff on Imports',
        type: 'Presidential Document',
        abstract: 'Imposing tariffs on trade with foreign nations',
        html_url: 'https://example.com',
        pdf_url: null,
        publication_date: '2026-03-10',
        signing_date: '2026-03-09',
        executive_order_number: null,
        subtype: null,
      };
      expect(isMarketRelevant(doc)).toBe(true);
    });

    it('should filter out non-market documents', () => {
      const doc: FederalRegisterDocument = {
        document_number: 'test-002',
        title: 'Proclamation on National Agriculture Day',
        type: 'Presidential Document',
        abstract: 'Honoring American farmers and agricultural workers.',
        html_url: 'https://example.com',
        pdf_url: null,
        publication_date: '2026-03-10',
        signing_date: '2026-03-09',
        executive_order_number: null,
        subtype: 'Proclamation',
      };
      expect(isMarketRelevant(doc)).toBe(false);
    });

    it('should match keywords in abstract', () => {
      const doc: FederalRegisterDocument = {
        document_number: 'test-003',
        title: 'Presidential Memorandum',
        type: 'Presidential Document',
        abstract: 'Directing review of semiconductor industry regulations',
        html_url: 'https://example.com',
        pdf_url: null,
        publication_date: '2026-03-10',
        signing_date: null,
        executive_order_number: null,
        subtype: null,
      };
      expect(isMarketRelevant(doc)).toBe(true);
    });
  });

  describe('extractTopics', () => {
    it('should extract trade topics', () => {
      const doc = mockResponse.results[0]!;
      const topics = extractTopics(doc);
      expect(topics).toContain('trade');
      expect(topics).toContain('technology');
    });

    it('should extract energy topics', () => {
      const doc = mockResponse.results[1]!;
      const topics = extractTopics(doc);
      expect(topics).toContain('sanctions');
      expect(topics).toContain('energy');
    });

    it('should extract multiple topics', () => {
      const doc = mockResponse.results[2]!;
      const topics = extractTopics(doc);
      expect(topics).toContain('infrastructure');
      expect(topics).toContain('regulation');
      expect(topics).toContain('energy');
    });
  });

  describe('scan', () => {
    it('should emit events for market-relevant documents', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new WhiteHouseScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        // 5 market-relevant docs (agriculture proclamation filtered out)
        expect(result.value.length).toBe(5);
        expect(result.value[0]!.source).toBe('whitehouse');
        expect(result.value[0]!.type).toBe('executive_order');
      }
    });

    it('should prefix executive orders in title', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new WhiteHouseScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]!.title).toContain('Executive Order 14250');
      }
    });

    it('should include topics in metadata', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new WhiteHouseScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const topics = result.value[0]!.metadata!['topics'] as string[];
        expect(topics.length).toBeGreaterThan(0);
      }
    });

    it('should tag executive orders as HIGH_IMPACT', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new WhiteHouseScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const tags = result.value[0]!.metadata!['tags'] as string[];
        expect(tags).toContain('HIGH_IMPACT');
        expect(tags).toContain('EXECUTIVE_ORDER');
      }
    });

    it('should use signing_date for timestamp when available', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new WhiteHouseScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const event = result.value[0]!;
        expect(event.timestamp.toISOString()).toContain('2026-03-09');
      }
    });
  });

  describe('deduplication', () => {
    it('should not emit duplicate events on second scan', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new WhiteHouseScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const first = await scanner.scan();
      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.value.length).toBeGreaterThan(0);
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
      const scanner = new WhiteHouseScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Network error');
      }
    });

    it('should handle non-200 responses', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new WhiteHouseScanner(eventBus);

      fetchSpy.mockResolvedValue(new Response('', { status: 500 }));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('500');
      }
    });

    it('should report down after 3 consecutive failures', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new WhiteHouseScanner(eventBus);

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
      const scanner = new WhiteHouseScanner(eventBus);
      expect(scanner.health().status).toBe('healthy');
      expect(scanner.health().scanner).toBe('whitehouse');
    });
  });
});
