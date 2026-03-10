import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  FdaScanner,
  classifyFdaAction,
  isFdaRelevant,
  extractDrugName,
} from '../scanners/fda-scanner.js';
import type { RssItem } from '../scanners/breaking-news-scanner.js';

const mockRssXml = readFileSync(
  join(__dirname, 'fixtures', 'mock-fda-response.xml'),
  'utf-8',
);

describe('FdaScanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('classifyFdaAction', () => {
    it('should classify approval actions', () => {
      expect(classifyFdaAction('FDA Approves Keytruda for melanoma')).toBe('approval');
      expect(classifyFdaAction('NDA approved for new cancer drug')).toBe('approval');
      expect(classifyFdaAction('BLA supplemental approval granted')).toBe('approval');
    });

    it('should classify complete response letters', () => {
      expect(classifyFdaAction('FDA issues complete response letter')).toBe('crl');
      expect(classifyFdaAction('CRL issued for experimental drug')).toBe('crl');
    });

    it('should classify safety actions', () => {
      expect(classifyFdaAction('FDA issues warning letter to manufacturer')).toBe('safety');
      expect(classifyFdaAction('Safety alert: voluntary recall of drug')).toBe('safety');
      expect(classifyFdaAction('FDA announces recall of contaminated product')).toBe('safety');
    });

    it('should classify clinical trial actions', () => {
      expect(classifyFdaAction('Phase 3 clinical trial results positive')).toBe('clinical_trial');
      expect(classifyFdaAction('Phase 1 study begins for new compound')).toBe('clinical_trial');
    });

    it('should return other for unrecognized actions', () => {
      expect(classifyFdaAction('FDA updates food labeling guidelines')).toBe('other');
    });
  });

  describe('isFdaRelevant', () => {
    it('should return true for items with FDA keywords', () => {
      const item: RssItem = {
        title: 'FDA Approves New Drug',
        link: 'https://fda.gov/test',
        pubDate: '2026-03-10',
        description: 'Drug approval for cancer treatment',
        guid: 'test-001',
      };
      expect(isFdaRelevant(item)).toBe(true);
    });

    it('should return false for irrelevant items', () => {
      const item: RssItem = {
        title: 'FDA Updates Website Design',
        link: 'https://fda.gov/test',
        pubDate: '2026-03-10',
        description: 'New website launched with improved navigation',
        guid: 'test-002',
      };
      expect(isFdaRelevant(item)).toBe(false);
    });

    it('should match keywords in description', () => {
      const item: RssItem = {
        title: 'Press Release',
        link: 'https://fda.gov/test',
        pubDate: '2026-03-10',
        description: 'Phase 3 results show breakthrough efficacy',
        guid: 'test-003',
      };
      expect(isFdaRelevant(item)).toBe(true);
    });
  });

  describe('extractDrugName', () => {
    it('should extract drug name with parenthetical generic', () => {
      expect(extractDrugName('FDA Approves Keytruda (pembrolizumab) for melanoma')).toBe('Keytruda');
    });

    it('should extract drug name after approval verb', () => {
      expect(extractDrugName('FDA Approves Jardiance for heart failure')).toBe('Jardiance');
    });

    it('should return null when no drug name found', () => {
      expect(extractDrugName('FDA updates food safety guidelines')).toBeNull();
    });
  });

  describe('scan', () => {
    it('should emit events for relevant FDA items', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new FdaScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        // 5 relevant items (food labeling is filtered out)
        expect(result.value.length).toBe(5);
        expect(result.value[0]!.source).toBe('fda');
        expect(result.value[0]!.type).toBe('fda-action');
      }
    });

    it('should extract tickers from FDA press releases', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new FdaScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        // First item mentions Merck (NYSE: MRK)
        const keytruda = result.value[0]!;
        expect(keytruda.metadata!['tickers']).toContain('MRK');
        expect(keytruda.metadata!['ticker']).toBe('MRK');
      }
    });

    it('should classify FDA action types in metadata', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new FdaScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]!.metadata!['action_type']).toBe('approval');
        expect(result.value[1]!.metadata!['action_type']).toBe('crl');
        expect(result.value[2]!.metadata!['action_type']).toBe('safety');
        expect(result.value[3]!.metadata!['action_type']).toBe('clinical_trial');
      }
    });

    it('should include drug name in metadata', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new FdaScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]!.metadata!['drug_name']).toBe('Keytruda');
      }
    });

    it('should include HIGH_IMPACT tag for approvals', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new FdaScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const tags = result.value[0]!.metadata!['tags'] as string[];
        expect(tags).toContain('HIGH_IMPACT');
        expect(tags).toContain('REGULATORY');
      }
    });
  });

  describe('deduplication', () => {
    it('should not emit duplicate events on second scan', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new FdaScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const first = await scanner.scan();
      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.value.length).toBeGreaterThan(0);
      }

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
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
      const scanner = new FdaScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Network error');
      }
    });

    it('should handle non-200 responses', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new FdaScanner(eventBus);

      fetchSpy.mockResolvedValue(new Response('', { status: 503 }));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('503');
      }
    });

    it('should report down after 3 consecutive failures', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new FdaScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('FDA down'));

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
      const scanner = new FdaScanner(eventBus);
      expect(scanner.health().status).toBe('healthy');
      expect(scanner.health().scanner).toBe('fda');
    });
  });
});
