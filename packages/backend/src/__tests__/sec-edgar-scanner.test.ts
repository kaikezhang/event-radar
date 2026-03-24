import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '@event-radar/shared';
import { buildApp } from '../app.js';
import { safeCloseServer } from './helpers/test-db.js';
import {
  SecEdgarScanner,
  parseEdgarAtomFeed,
  map8KSeverity,
  mapForm4Severity,
} from '../scanners/sec-edgar-scanner.js';

const MOCK_8K_ATOM = `<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>8-K - Example Corp (0000123456) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/123456/000119312526012345/0001193125-26-012345-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0001193125-26-012345 &lt;b&gt;Size:&lt;/b&gt; 123 KB
      &lt;br&gt;Item 2.05: Costs Associated with Exit or Disposal Activities
      &lt;br&gt;Item 9.01: Financial Statements and Exhibits
      &lt;br&gt;Summary: Example Corp announced a workforce reduction impacting $EXMP holders.
    </summary>
    <updated>2026-03-12T20:05:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="8-K"/>
    <id>urn:tag:sec.gov,2008:accession-number=0001193125-26-012345</id>
  </entry>
</feed>`;

const MOCK_FORM4_ATOM = `<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>4 - Jane Doe (0001987654) (Reporting)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1987654/000198765426000001/0001987654-26-000001-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0001987654-26-000001 &lt;b&gt;Size:&lt;/b&gt; 45 KB
      &lt;br&gt;Officer: Jane Doe
      &lt;br&gt;Issuer: Example Corp (NASDAQ: EXMP)
      &lt;br&gt;Transaction: Purchase
      &lt;br&gt;Shares: 100000
      &lt;br&gt;Price: 25.00
      &lt;br&gt;Value: $2,500,000
    </summary>
    <updated>2026-03-12T20:06:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="4"/>
    <id>urn:tag:sec.gov,2008:accession-number=0001987654-26-000001</id>
  </entry>
  <entry>
    <title>4 - Example Corp (0000123456) (Issuer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/123456/000198765426000001/0001987654-26-000001-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0001987654-26-000001 &lt;b&gt;Size:&lt;/b&gt; 45 KB
      &lt;br&gt;Officer: Jane Doe
      &lt;br&gt;Issuer: Example Corp (NASDAQ: EXMP)
      &lt;br&gt;Transaction: Purchase
      &lt;br&gt;Shares: 100000
      &lt;br&gt;Price: 25.00
      &lt;br&gt;Value: $2,500,000
    </summary>
    <updated>2026-03-12T20:06:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="4"/>
    <id>urn:tag:sec.gov,2008:accession-number=0001987654-26-000001</id>
  </entry>
</feed>`;

const MOCK_FORM4_MINIMAL_ATOM = `<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>4 - Jane Doe (0001987654) (Reporting)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1987654/000198765426000002/0001987654-26-000002-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0001987654-26-000002 &lt;b&gt;Size:&lt;/b&gt; 45 KB
    </summary>
    <updated>2026-03-12T20:07:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="4"/>
    <id>urn:tag:sec.gov,2008:accession-number=0001987654-26-000002</id>
  </entry>
  <entry>
    <title>4 - Example Corp (0000123456) (Issuer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/123456/000198765426000002/0001987654-26-000002-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0001987654-26-000002 &lt;b&gt;Size:&lt;/b&gt; 45 KB
    </summary>
    <updated>2026-03-12T20:07:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="4"/>
    <id>urn:tag:sec.gov,2008:accession-number=0001987654-26-000002</id>
  </entry>
</feed>`;

const MOCK_8K_CIK_MAPPED_ATOM = `<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>8-K - Unknown Holdings LLC (0000320193) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/0000320193-26-000001-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0000320193-26-000001 &lt;b&gt;Size:&lt;/b&gt; 50 KB
      &lt;br&gt;Item 8.01: Other Events
      &lt;br&gt;Summary: Unknown Holdings posted a filing update with no ticker in the text.
    </summary>
    <updated>2026-03-12T20:05:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="8-K"/>
    <id>urn:tag:sec.gov,2008:accession-number=0000320193-26-000001</id>
  </entry>
</feed>`;

const MOCK_FORM4_COMPANY_NAME_MAPPED_ATOM = `<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>4 - Jane Doe (0000000001) (Reporting)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1/000000000126000001/0000000001-26-000001-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0000000001-26-000001 &lt;b&gt;Size:&lt;/b&gt; 45 KB
      &lt;br&gt;Officer: Jane Doe
      &lt;br&gt;Issuer: Apple Inc.
      &lt;br&gt;Transaction: Purchase
      &lt;br&gt;Value: $2,500,000
    </summary>
    <updated>2026-03-12T20:06:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="4"/>
    <id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000001</id>
  </entry>
  <entry>
    <title>4 - Apple Inc. (0000000002) (Issuer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/2/000000000126000001/0000000001-26-000001-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0000000001-26-000001 &lt;b&gt;Size:&lt;/b&gt; 45 KB
      &lt;br&gt;Officer: Jane Doe
      &lt;br&gt;Issuer: Apple Inc.
      &lt;br&gt;Transaction: Purchase
      &lt;br&gt;Value: $2,500,000
    </summary>
    <updated>2026-03-12T20:06:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="4"/>
    <id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000001</id>
  </entry>
</feed>`;

describe('SecEdgarScanner', () => {
  const originalSecEnabled = process.env.SEC_EDGAR_ENABLED;

  afterEach(() => {
    if (originalSecEnabled === undefined) {
      delete process.env.SEC_EDGAR_ENABLED;
    } else {
      process.env.SEC_EDGAR_ENABLED = originalSecEnabled;
    }
  });

  describe('parseEdgarAtomFeed', () => {
    it('parses 8-K Atom entries with accession, cik, and item metadata', () => {
      const entries = parseEdgarAtomFeed(MOCK_8K_ATOM);

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        accessionNumber: '0001193125-26-012345',
        cik: '0000123456',
        companyName: 'Example Corp',
        formType: '8-K',
        itemTypes: ['2.05', '9.01'],
      });
      expect(entries[0]?.itemDescriptions['2.05']).toContain('Exit or Disposal Activities');
    });

    it('parses Form 4 Atom entries with reporting details from summary text', () => {
      const entries = parseEdgarAtomFeed(MOCK_FORM4_ATOM);

      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({
        accessionNumber: '0001987654-26-000001',
        formType: '4',
        officerName: 'Jane Doe',
        issuerName: 'Example Corp',
        transactionType: 'purchase',
        transactionValue: 2_500_000,
      });
      expect(entries[0]?.tickers).toEqual(['EXMP']);
    });

    it('returns an empty list for empty Atom feeds', () => {
      expect(parseEdgarAtomFeed('')).toEqual([]);
      expect(parseEdgarAtomFeed('<feed></feed>')).toEqual([]);
    });
  });

  describe('severity helpers', () => {
    it('maps 8-K items to scanner severity hints', () => {
      expect(map8KSeverity(['2.05'])).toBe('HIGH');
      expect(map8KSeverity(['8.01'])).toBe('LOW');
      expect(map8KSeverity(['9.01'])).toBe('LOW');
    });

    it('maps Form 4 transaction values to severity hints', () => {
      expect(mapForm4Severity(500_000)).toBe('MEDIUM');
      expect(mapForm4Severity(2_500_000)).toBe('HIGH');
      expect(mapForm4Severity(12_000_000)).toBe('CRITICAL');
    });
  });

  describe('scan', () => {
    it('builds 8-K and Form 4 events from Atom feeds with SEC-compliant headers', async () => {
      const scanner = new SecEdgarScanner(new InMemoryEventBus());
      const fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(MOCK_8K_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_FORM4_ATOM, { status: 200 }));

      scanner.fetchFn = fetchFn;

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
        headers: expect.objectContaining({
          'User-Agent': 'EventRadar/1.0 (contact@example.com)',
          Accept: 'application/atom+xml, application/xml, text/xml',
        }),
      });

      expect(result.value).toHaveLength(2);

      const filing8k = result.value.find((event) => event.type === 'sec_form_8k');
      expect(filing8k).toMatchObject({
        source: 'sec-edgar',
        title: 'SEC 8-K: Example Corp — Item 2.05 (Costs Associated with Exit or Disposal Activities)',
      });
      expect(filing8k?.body).toContain('Accession number: 0001193125-26-012345');
      expect(filing8k?.metadata).toMatchObject({
        accession_number: '0001193125-26-012345',
        cik: '0000123456',
        item_types: ['2.05', '9.01'],
        ticker: 'EXMP',
        severity_hint: 'HIGH',
      });

      const form4 = result.value.find((event) => event.type === 'sec_form_4');
      expect(form4).toMatchObject({
        source: 'sec-edgar',
        title: 'SEC Form 4: Jane Doe bought $2,500,000 of EXMP',
      });
      expect(form4?.metadata).toMatchObject({
        accession_number: '0001987654-26-000001',
        issuer_name: 'Example Corp',
        transaction_type: 'purchase',
        transaction_value: 2_500_000,
        severity_hint: 'HIGH',
        ticker: 'EXMP',
      });
    });

    it('deduplicates filings by accession number across scans and duplicate Form 4 entries', async () => {
      const scanner = new SecEdgarScanner(new InMemoryEventBus());
      const fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(MOCK_8K_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_FORM4_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_8K_ATOM, { status: 200 }));

      scanner.fetchFn = fetchFn;

      const first = await scanner.scan();
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.value).toHaveLength(2);

      const second = await scanner.scan();
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value).toEqual([]);
    });

    it('polls Form 4 on a 120-second cadence while keeping 8-K at 60 seconds', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      const scanner = new SecEdgarScanner(new InMemoryEventBus());
      const fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValue(new Response(MOCK_8K_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_8K_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_FORM4_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_8K_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_8K_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_FORM4_ATOM, { status: 200 }));

      scanner.fetchFn = fetchFn;

      await scanner.scan();
      vi.setSystemTime(60_000);
      await scanner.scan();
      vi.setSystemTime(120_000);
      await scanner.scan();

      expect(fetchFn).toHaveBeenCalledTimes(5);
      vi.useRealTimers();
    });

    it('falls back to a generic Form 4 title when transaction details are absent from the feed', async () => {
      const scanner = new SecEdgarScanner(new InMemoryEventBus());
      scanner.fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(MOCK_8K_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_FORM4_MINIMAL_ATOM, { status: 200 }));

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const form4 = result.value.find((event) => event.type === 'sec_form_4');
      expect(form4?.title).toBe(
        'SEC Form 4: Jane Doe filed insider trade disclosure for Example Corp',
      );
      expect(form4?.metadata?.['transaction_value']).toBe(0);
    });

    it('fills missing SEC tickers from the CIK mapping when the feed has no ticker', async () => {
      const scanner = new SecEdgarScanner(new InMemoryEventBus());
      scanner.fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(MOCK_8K_CIK_MAPPED_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response('<feed xmlns="http://www.w3.org/2005/Atom"></feed>', { status: 200 }));

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.metadata).toMatchObject({
        cik: '0000320193',
        ticker: 'AAPL',
        tickers: ['AAPL'],
      });
    });

    it('falls back to company-name ticker inference for SEC filings when the CIK is unmapped', async () => {
      const scanner = new SecEdgarScanner(new InMemoryEventBus());
      scanner.fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(MOCK_8K_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_FORM4_COMPANY_NAME_MAPPED_ATOM, { status: 200 }));

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const form4 = result.value.find((event) => event.type === 'sec_form_4');
      expect(form4?.metadata).toMatchObject({
        issuer_name: 'Apple Inc.',
        ticker: 'AAPL',
        tickers: ['AAPL'],
      });
    });
  });

  describe('app registration', () => {
    it('registers the scanner only when SEC_EDGAR_ENABLED=true', async () => {
      process.env.SEC_EDGAR_ENABLED = 'false';
      const disabledCtx = buildApp({ logger: false });
      await disabledCtx.server.ready();
      expect(disabledCtx.registry.getById('sec-edgar')).toBeUndefined();
      await safeCloseServer(disabledCtx.server);

      process.env.SEC_EDGAR_ENABLED = 'true';
      const enabledCtx = buildApp({ logger: false });
      await enabledCtx.server.ready();
      expect(enabledCtx.registry.getById('sec-edgar')).toBeDefined();
      await safeCloseServer(enabledCtx.server);
    });
  });
});
