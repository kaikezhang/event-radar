import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '@event-radar/shared';
import { buildApp } from '../app.js';
import { safeCloseServer } from './helpers/test-db.js';
import {
  DilutionScanner,
  detectDilutionType,
  estimateAmount,
  mapDilutionSeverity,
  parseDilutionAtomFeed,
} from '../scanners/dilution-scanner.js';

interface AtomEntryOptions {
  accessionNumber: string;
  formType: string;
  summaryLines: string[];
  updatedAt?: string;
}

function buildAtomEntry({
  accessionNumber,
  formType,
  summaryLines,
  updatedAt = '2026-03-12T20:00:00-04:00',
}: AtomEntryOptions): string {
  const summaryHtml = [
    `&lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; ${accessionNumber} &lt;b&gt;Size:&lt;/b&gt; 150 KB`,
    ...summaryLines.map((line) => `&lt;br&gt;${line}`),
  ].join('\n      ');

  return `
  <entry>
    <title>${formType} - Example Corp (0000123456) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/123456/${accessionNumber.replace(/-/g, '')}/${accessionNumber}-index.htm"/>
    <summary type="html">
      ${summaryHtml}
    </summary>
    <updated>${updatedAt}</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="${formType}"/>
    <id>urn:tag:sec.gov,2008:accession-number=${accessionNumber}</id>
  </entry>`;
}

function buildAtomFeed(...entries: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
${entries.join('\n')}
</feed>`;
}

const EMPTY_ATOM_FEED = buildAtomFeed();

const ATM_ATOM = buildAtomFeed(buildAtomEntry({
  accessionNumber: '0001193125-26-100001',
  formType: 'S-3',
  summaryLines: [
    'Summary: Example Corp (NASDAQ: EXMP) filed an at-the-market offering program for up to $1.5 million of common stock.',
  ],
}));

const SECONDARY_ATOM = buildAtomFeed(buildAtomEntry({
  accessionNumber: '0001193125-26-100002',
  formType: '424B5',
  summaryLines: [
    'Summary: Example Corp (NASDAQ: EXMP) filed a prospectus supplement relating to a secondary offering by selling stockholders.',
  ],
}));

const CONVERTIBLE_ATOM = buildAtomFeed(buildAtomEntry({
  accessionNumber: '0001193125-26-100003',
  formType: '424B2',
  summaryLines: [
    'Summary: Example Corp (NASDAQ: EXMP) filed a prospectus supplement for convertible senior notes with a conversion price of $12.50 per share.',
  ],
}));

const PIPE_ATOM = buildAtomFeed(buildAtomEntry({
  accessionNumber: '0001193125-26-100004',
  formType: '8-K',
  summaryLines: [
    'Item 8.01: Other Events',
    'Summary: Example Corp (NASDAQ: EXMP) announced a private investment in public equity (PIPE) financing.',
  ],
}));

const SHELF_ATOM = buildAtomFeed(buildAtomEntry({
  accessionNumber: '0001193125-26-100005',
  formType: 'S-3',
  summaryLines: [
    'Summary: Example Corp (NASDAQ: EXMP) filed a shelf registration statement covering future issuances.',
  ],
}));

const NON_DILUTION_ATOM = buildAtomFeed(buildAtomEntry({
  accessionNumber: '0001193125-26-100006',
  formType: 'S-3',
  summaryLines: [
    'Summary: Example Corp (NASDAQ: EXMP) filed an update regarding general corporate matters.',
  ],
}));

const NON_ITEM_801_CONVERTIBLE_ATOM = buildAtomFeed(buildAtomEntry({
  accessionNumber: '0001193125-26-100007',
  formType: '8-K',
  summaryLines: [
    'Item 2.02: Results of Operations and Financial Condition',
    'Summary: Example Corp (NASDAQ: EXMP) disclosed convertible senior notes financing alternatives.',
  ],
}));

describe('DilutionScanner', () => {
  const originalEnabled = process.env.DILUTION_SCANNER_ENABLED;

  afterEach(() => {
    vi.restoreAllMocks();

    if (originalEnabled === undefined) {
      delete process.env.DILUTION_SCANNER_ENABLED;
    } else {
      process.env.DILUTION_SCANNER_ENABLED = originalEnabled;
    }
  });

  describe('parseDilutionAtomFeed', () => {
    it('parses a minimal SEC Atom feed entry', () => {
      const entries = parseDilutionAtomFeed(PIPE_ATOM);

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        accessionNumber: '0001193125-26-100004',
        formType: '8-K',
        companyName: 'Example Corp',
        tickers: ['EXMP'],
        itemTypes: ['8.01'],
      });
    });
  });

  describe('detectDilutionType', () => {
    it.each([
      ['ATM Offering', ATM_ATOM],
      ['Secondary Offering', SECONDARY_ATOM],
      ['Convertible Notes', CONVERTIBLE_ATOM],
      ['PIPE', PIPE_ATOM],
      ['Shelf Registration', SHELF_ATOM],
    ])('detects %s filings', (expectedType, xml) => {
      const [entry] = parseDilutionAtomFeed(xml);
      expect(detectDilutionType(entry!)).toBe(expectedType);
    });

    it('returns null for non-dilution filings', () => {
      const [entry] = parseDilutionAtomFeed(NON_DILUTION_ATOM);
      expect(detectDilutionType(entry!)).toBeNull();
    });

    it('returns null for 8-K convertible language outside Item 8.01', () => {
      const [entry] = parseDilutionAtomFeed(NON_ITEM_801_CONVERTIBLE_ATOM);
      expect(detectDilutionType(entry!)).toBeNull();
    });
  });

  describe('mapDilutionSeverity', () => {
    it.each([
      ['ATM Offering', 'HIGH'],
      ['Secondary Offering', 'HIGH'],
      ['Convertible Notes', 'MEDIUM'],
      ['PIPE', 'MEDIUM'],
      ['Shelf Registration', 'LOW'],
    ])('maps %s to %s', (dilutionType, severity) => {
      expect(mapDilutionSeverity(dilutionType as Parameters<typeof mapDilutionSeverity>[0])).toBe(severity);
    });
  });

  describe('estimateAmount', () => {
    it.each([
      ['Summary: registered up to $1.5 million of stock.', 1_500_000],
      ['Summary: registered up to $2.3 billion of notes.', 2_300_000_000],
      ['Summary: registered up to $750 thousand of warrants.', 750_000],
      ['Summary: registered up to $125,000 of securities.', 125_000],
      ['Summary: no amount disclosed.', undefined],
    ])('parses amount from %p', (summary, expectedAmount) => {
      expect(estimateAmount(summary)).toBe(expectedAmount);
    });
  });

  describe('scan', () => {
    it('builds dilution events on first scan and deduplicates the same filings on the second scan', async () => {
      const scanner = new DilutionScanner(new InMemoryEventBus());
      scanner.fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(ATM_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(CONVERTIBLE_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(SECONDARY_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(PIPE_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(ATM_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(CONVERTIBLE_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(SECONDARY_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(PIPE_ATOM, { status: 200 }));

      const first = await scanner.scan();
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      expect(first.value).toHaveLength(4);
      expect(first.value[0]).toMatchObject({
        source: 'dilution-monitor',
        type: 'dilution',
        title: 'EXMP — ATM Offering detected',
      });
      expect(first.value[0]?.metadata).toMatchObject({
        dilution_type: 'ATM Offering',
        severity: 'HIGH',
        direction: 'bearish',
        form_type: 'S-3',
        ticker: 'EXMP',
        estimated_amount: 1_500_000,
      });

      const second = await scanner.scan();
      expect(second.ok).toBe(true);
      if (!second.ok) return;

      expect(second.value).toEqual([]);
    });

    it('continues scanning other feeds when one SEC feed returns an HTTP error', async () => {
      const scanner = new DilutionScanner(new InMemoryEventBus());
      scanner.fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('rate limited', { status: 503 }))
        .mockResolvedValueOnce(new Response(CONVERTIBLE_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(SECONDARY_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(PIPE_ATOM, { status: 200 }));

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toHaveLength(3);
      expect(result.value.map((event) => event.metadata?.dilution_type)).toEqual([
        'Convertible Notes',
        'Secondary Offering',
        'PIPE',
      ]);
    });
  });

  describe('app registration', () => {
    it('registers the scanner only when DILUTION_SCANNER_ENABLED=true', async () => {
      process.env.DILUTION_SCANNER_ENABLED = 'false';
      const disabledCtx = buildApp({ logger: false });
      await disabledCtx.server.ready();
      expect(disabledCtx.registry.getById('dilution-monitor')).toBeUndefined();
      await safeCloseServer(disabledCtx.server);

      process.env.DILUTION_SCANNER_ENABLED = 'true';
      const enabledCtx = buildApp({ logger: false });
      await enabledCtx.server.ready();
      expect(enabledCtx.registry.getById('dilution-monitor')).toBeDefined();
      await safeCloseServer(enabledCtx.server);
    });
  });

  describe('request headers', () => {
    it('uses SEC-compliant Atom headers for each feed request', async () => {
      const scanner = new DilutionScanner(new InMemoryEventBus());
      const fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(ATM_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(EMPTY_ATOM_FEED, { status: 200 }))
        .mockResolvedValueOnce(new Response(EMPTY_ATOM_FEED, { status: 200 }))
        .mockResolvedValueOnce(new Response(EMPTY_ATOM_FEED, { status: 200 }));

      scanner.fetchFn = fetchFn;

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      expect(fetchFn).toHaveBeenCalledTimes(4);
      expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
        headers: expect.objectContaining({
          'User-Agent': 'EventRadar/1.0 (contact@example.com)',
          Accept: 'application/atom+xml, application/xml, text/xml',
        }),
      });
    });
  });
});
