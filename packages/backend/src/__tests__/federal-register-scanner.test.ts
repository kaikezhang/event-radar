import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '@event-radar/shared';
import { FederalRegisterScanner } from '../scanners/federal-register-scanner.js';

describe('FederalRegisterScanner', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('keeps the scanner source fixed to federal-register and tags FDA agencies', async () => {
    const scanner = new FederalRegisterScanner(new InMemoryEventBus());
    scanner.fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        results: [
          {
            document_number: '2026-10001',
            title: 'FDA approves new rule for drug labeling updates',
            type: 'RULE',
            abstract: 'The Food and Drug Administration finalizes a pharmaceutical regulation update for drug labeling.',
            html_url: 'https://example.com/fda-rule',
            publication_date: '2026-03-24',
            agencies: [
              {
                name: 'Food and Drug Administration',
                slug: 'food-and-drug-administration',
              },
            ],
          },
        ],
      }), { status: 200 }),
    ) as never;

    const result = await scanner.scan();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.source).toBe('federal-register');
      expect(result.value[0]?.metadata?.['tags']).toContain('agency:fda');
    }
  });

  it('adds agency tags from the Federal Register agencies payload', async () => {
    const scanner = new FederalRegisterScanner(new InMemoryEventBus());
    scanner.fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        results: [
          {
            document_number: '2026-10002',
            title: 'Joint rule on market structure oversight',
            type: 'NOTICE',
            abstract: 'The agencies request feedback on securities regulation and interest rate market safeguards.',
            html_url: 'https://example.com/joint-rule',
            publication_date: '2026-03-24',
            agencies: [
              {
                name: 'Securities and Exchange Commission',
                slug: 'securities-and-exchange-commission',
              },
              {
                name: 'Federal Reserve System',
                slug: 'federal-reserve-system',
              },
            ],
          },
        ],
      }), { status: 200 }),
    ) as never;

    const result = await scanner.scan();

    expect(result.ok).toBe(true);
    if (result.ok) {
      const tags = result.value[0]?.metadata?.['tags'] as string[];
      expect(tags).toContain('agency:sec');
      expect(tags).toContain('agency:fed');
    }
  });
});
