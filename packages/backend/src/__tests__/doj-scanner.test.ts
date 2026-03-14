import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  DojScanner,
  classifyDojAction,
  extractCompanyNames,
} from '../scanners/doj-scanner.js';

const mockRssXml = readFileSync(
  join(__dirname, 'fixtures', 'mock-doj-rss.xml'),
  'utf-8',
);

describe('DojScanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('classifyDojAction', () => {
    it('should classify merger challenges', () => {
      expect(classifyDojAction('DOJ seeks to block merger of two companies')).toBe('merger_challenge');
      expect(classifyDojAction('Department blocks proposed acquisition')).toBe('merger_challenge');
    });

    it('should classify lawsuits', () => {
      expect(classifyDojAction('Justice Department sues Google for monopoly')).toBe('lawsuit');
      expect(classifyDojAction('DOJ files antitrust lawsuit against tech giant')).toBe('lawsuit');
    });

    it('should classify settlements', () => {
      expect(classifyDojAction('Company settles antitrust claims for $2B')).toBe('settlement');
      expect(classifyDojAction('Major settlement reached in pricing case')).toBe('settlement');
    });

    it('should classify consent decrees', () => {
      expect(classifyDojAction('Court approves consent decree in merger case')).toBe('consent_decree');
    });

    it('should classify investigations', () => {
      expect(classifyDojAction('DOJ opens investigation into pricing practices')).toBe('investigation');
      expect(classifyDojAction('Department investigating potential price-fixing')).toBe('investigation');
    });

    it('should return other for unrecognized actions', () => {
      expect(classifyDojAction('Annual antitrust report published')).toBe('other');
    });
  });

  describe('extractCompanyNames', () => {
    it('should extract company after "sues"', () => {
      const companies = extractCompanyNames('Justice Department Sues Google for Monopolizing');
      expect(companies).toContain('Google');
    });

    it('should extract companies from merger pattern', () => {
      const companies = extractCompanyNames('Blocks Merger of Kroger and Albertsons');
      expect(companies).toContain('Kroger');
      expect(companies).toContain('Albertsons');
    });

    it('should return empty array when no companies found', () => {
      const companies = extractCompanyNames('Annual report on antitrust enforcement');
      expect(companies).toEqual([]);
    });

    it('should deduplicate company names', () => {
      const companies = extractCompanyNames('Sues Google and challenges Google monopoly');
      const googleCount = companies.filter((c) => c === 'Google').length;
      expect(googleCount).toBeLessThanOrEqual(1);
    });
  });

  describe('scan', () => {
    it('should emit events for all RSS items', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new DojScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(5);
        expect(result.value[0]!.source).toBe('doj');
        expect(result.value[0]!.type).toBe('ftc_antitrust');
      }
    });

    it('should extract tickers from DOJ press releases', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new DojScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        // First item mentions Google (NASDAQ: GOOGL)
        const google = result.value[0]!;
        expect(google.metadata!['tickers']).toContain('GOOGL');
      }
    });

    it('should classify action types in metadata', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new DojScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]!.metadata!['action_type']).toBe('lawsuit');
        expect(result.value[1]!.metadata!['action_type']).toBe('merger_challenge');
        expect(result.value[2]!.metadata!['action_type']).toBe('settlement');
        expect(result.value[3]!.metadata!['action_type']).toBe('investigation');
        expect(result.value[4]!.metadata!['action_type']).toBe('consent_decree');
      }
    });

    it('should include companies in metadata', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new DojScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const google = result.value[0]!;
        expect(google.metadata!['companies']).toContain('Google');
      }
    });

    it('should tag lawsuits and merger challenges as HIGH_IMPACT', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new DojScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const lawsuitTags = result.value[0]!.metadata!['tags'] as string[];
        expect(lawsuitTags).toContain('HIGH_IMPACT');
        expect(lawsuitTags).toContain('ANTITRUST');

        const mergerTags = result.value[1]!.metadata!['tags'] as string[];
        expect(mergerTags).toContain('HIGH_IMPACT');
      }
    });

    it('should include case_type in metadata', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new DojScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();
      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const event of result.value) {
          expect(event.metadata!['case_type']).toBe('antitrust');
        }
      }
    });
  });

  describe('deduplication', () => {
    it('should not emit duplicate events on second scan', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new DojScanner(eventBus);

      fetchSpy.mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const first = await scanner.scan();
      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.value.length).toBe(5);
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
      const scanner = new DojScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Network error');
      }
    });

    it('should handle non-200 responses', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new DojScanner(eventBus);

      fetchSpy.mockResolvedValue(new Response('', { status: 503 }));

      const result = await scanner.scan();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('503');
      }
    });

    it('should report down after 3 consecutive failures', async () => {
      const eventBus = new InMemoryEventBus();
      const scanner = new DojScanner(eventBus);

      fetchSpy.mockRejectedValue(new Error('DOJ RSS down'));

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
      const scanner = new DojScanner(eventBus);
      expect(scanner.health().status).toBe('healthy');
      expect(scanner.health().scanner).toBe('doj-antitrust');
    });
  });
});
