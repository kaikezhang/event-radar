import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '@event-radar/shared';
import { buildApp } from '../app.js';
import { safeCloseServer } from './helpers/test-db.js';
import {
  DilutionScanner,
  detectDilutionType,
  mapDilutionSeverity,
  parseDilutionAtomFeed,
} from '../scanners/dilution-scanner.js';

const MOCK_S3_ATM_ATOM = `<?xml version="1.0" encoding="UTF-8" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>S-3 - Example Corp (0000123456) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/123456/000119312526100001/0001193125-26-100001-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0001193125-26-100001 &lt;b&gt;Size:&lt;/b&gt; 210 KB
      &lt;br&gt;Summary: Example Corp (NASDAQ: EXMP) filed a shelf registration statement for an at-the-market offering program.
    </summary>
    <updated>2026-03-12T20:00:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="S-3"/>
    <id>urn:tag:sec.gov,2008:accession-number=0001193125-26-100001</id>
  </entry>
</feed>`;

const MOCK_424B5_SECONDARY_ATOM = `<?xml version="1.0" encoding="UTF-8" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>424B5 - Example Corp (0000123456) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/123456/000119312526100002/0001193125-26-100002-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0001193125-26-100002 &lt;b&gt;Size:&lt;/b&gt; 185 KB
      &lt;br&gt;Summary: Example Corp (NASDAQ: EXMP) filed a prospectus supplement relating to a secondary offering by selling stockholders.
    </summary>
    <updated>2026-03-12T20:01:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="424B5"/>
    <id>urn:tag:sec.gov,2008:accession-number=0001193125-26-100002</id>
  </entry>
</feed>`;

const MOCK_424B2_CONVERTIBLE_ATOM = `<?xml version="1.0" encoding="UTF-8" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>424B2 - Example Corp (0000123456) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/123456/000119312526100003/0001193125-26-100003-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0001193125-26-100003 &lt;b&gt;Size:&lt;/b&gt; 190 KB
      &lt;br&gt;Summary: Example Corp (NASDAQ: EXMP) filed a prospectus supplement for convertible senior notes with an initial conversion price of $12.50 per share.
    </summary>
    <updated>2026-03-12T20:02:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="424B2"/>
    <id>urn:tag:sec.gov,2008:accession-number=0001193125-26-100003</id>
  </entry>
</feed>`;

const MOCK_8K_PIPE_ATOM = `<?xml version="1.0" encoding="UTF-8" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>8-K - Example Corp (0000123456) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/123456/000119312526100004/0001193125-26-100004-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0001193125-26-100004 &lt;b&gt;Size:&lt;/b&gt; 130 KB
      &lt;br&gt;Item 8.01: Other Events
      &lt;br&gt;Summary: Example Corp (NASDAQ: EXMP) announced a private investment in public equity (PIPE) financing.
    </summary>
    <updated>2026-03-12T20:03:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="8-K"/>
    <id>urn:tag:sec.gov,2008:accession-number=0001193125-26-100004</id>
  </entry>
</feed>`;

const MOCK_8K_NON_801_ATOM = `<?xml version="1.0" encoding="UTF-8" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>8-K - Example Corp (0000123456) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/123456/000119312526100005/0001193125-26-100005-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0001193125-26-100005 &lt;b&gt;Size:&lt;/b&gt; 120 KB
      &lt;br&gt;Item 2.02: Results of Operations and Financial Condition
      &lt;br&gt;Summary: Example Corp (NASDAQ: EXMP) discussed private investment in public equity financing alternatives.
    </summary>
    <updated>2026-03-12T20:04:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="8-K"/>
    <id>urn:tag:sec.gov,2008:accession-number=0001193125-26-100005</id>
  </entry>
</feed>`;

const MOCK_S3_PLAIN_ATOM = `<?xml version="1.0" encoding="UTF-8" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>S-3 - Example Corp (0000123456) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/123456/000119312526100006/0001193125-26-100006-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0001193125-26-100006 &lt;b&gt;Size:&lt;/b&gt; 100 KB
      &lt;br&gt;Summary: Example Corp (NASDAQ: EXMP) filed an update regarding general corporate matters.
    </summary>
    <updated>2026-03-12T20:05:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="S-3"/>
    <id>urn:tag:sec.gov,2008:accession-number=0001193125-26-100006</id>
  </entry>
</feed>`;

describe('DilutionScanner', () => {
  const originalEnabled = process.env.DILUTION_SCANNER_ENABLED;

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env.DILUTION_SCANNER_ENABLED;
    } else {
      process.env.DILUTION_SCANNER_ENABLED = originalEnabled;
    }
  });

  describe('parseDilutionAtomFeed', () => {
    it('parses SEC Atom entries with accession number, form type, and 8-K items', () => {
      const entries = parseDilutionAtomFeed(MOCK_8K_PIPE_ATOM);

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

  describe('detection helpers', () => {
    it('detects ATM offerings from S-3 filings', () => {
      const [entry] = parseDilutionAtomFeed(MOCK_S3_ATM_ATOM);
      expect(detectDilutionType(entry!)).toBe('ATM Offering');
    });

    it('detects secondary offerings from 424B filings', () => {
      const [entry] = parseDilutionAtomFeed(MOCK_424B5_SECONDARY_ATOM);
      expect(detectDilutionType(entry!)).toBe('Secondary Offering');
    });

    it('detects convertible notes from 424B filings', () => {
      const [entry] = parseDilutionAtomFeed(MOCK_424B2_CONVERTIBLE_ATOM);
      expect(detectDilutionType(entry!)).toBe('Convertible Notes');
    });

    it('detects PIPE financings from 8-K Item 8.01 filings', () => {
      const [entry] = parseDilutionAtomFeed(MOCK_8K_PIPE_ATOM);
      expect(detectDilutionType(entry!)).toBe('PIPE');
    });

    it('falls back to shelf registration for S-3 shelf filings without stronger keywords', () => {
      const [entry] = parseDilutionAtomFeed(MOCK_S3_ATM_ATOM.replace('an at-the-market offering program', 'a shelf registration statement covering future issuances'));
      expect(detectDilutionType(entry!)).toBe('Shelf Registration');
    });

    it('returns null for non-dilution filings', () => {
      const [entry] = parseDilutionAtomFeed(MOCK_S3_PLAIN_ATOM);
      expect(detectDilutionType(entry!)).toBeNull();
    });

    it('ignores 8-K dilution keywords outside Item 8.01', () => {
      const [entry] = parseDilutionAtomFeed(MOCK_8K_NON_801_ATOM);
      expect(detectDilutionType(entry!)).toBeNull();
    });
  });

  describe('severity helpers', () => {
    it('maps dilution types to the expected severities', () => {
      expect(mapDilutionSeverity('ATM Offering')).toBe('HIGH');
      expect(mapDilutionSeverity('Secondary Offering')).toBe('HIGH');
      expect(mapDilutionSeverity('Convertible Notes')).toBe('MEDIUM');
      expect(mapDilutionSeverity('PIPE')).toBe('MEDIUM');
      expect(mapDilutionSeverity('Shelf Registration')).toBe('LOW');
    });
  });

  describe('scan', () => {
    it('builds bearish dilution events from matching SEC filings with SEC-compliant headers', async () => {
      const scanner = new DilutionScanner(new InMemoryEventBus());
      const fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(MOCK_S3_ATM_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_424B2_CONVERTIBLE_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_424B5_SECONDARY_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_8K_PIPE_ATOM, { status: 200 }));

      scanner.fetchFn = fetchFn;

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(fetchFn).toHaveBeenCalledTimes(4);
      expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
        headers: expect.objectContaining({
          'User-Agent': 'EventRadar/1.0 (contact@example.com)',
          Accept: 'application/atom+xml, application/xml, text/xml',
        }),
      });

      expect(result.value).toHaveLength(4);
      expect(result.value[0]).toMatchObject({
        source: 'dilution-monitor',
        type: 'dilution',
        title: 'EXMP — ATM Offering detected',
      });
      expect(result.value[0]?.metadata).toMatchObject({
        dilution_type: 'ATM Offering',
        severity: 'HIGH',
        direction: 'bearish',
        form_type: 'S-3',
        ticker: 'EXMP',
      });
    });

    it('filters out filings that do not match dilution patterns', async () => {
      const scanner = new DilutionScanner(new InMemoryEventBus());
      scanner.fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(MOCK_S3_PLAIN_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>', { status: 200 }))
        .mockResolvedValueOnce(new Response('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>', { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_8K_NON_801_ATOM, { status: 200 }));

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toEqual([]);
    });

    it('deduplicates filings across scans by accession number and dilution type', async () => {
      const scanner = new DilutionScanner(new InMemoryEventBus());
      scanner.fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(MOCK_S3_ATM_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>', { status: 200 }))
        .mockResolvedValueOnce(new Response('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>', { status: 200 }))
        .mockResolvedValueOnce(new Response('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>', { status: 200 }))
        .mockResolvedValueOnce(new Response(MOCK_S3_ATM_ATOM, { status: 200 }))
        .mockResolvedValueOnce(new Response('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>', { status: 200 }))
        .mockResolvedValueOnce(new Response('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>', { status: 200 }))
        .mockResolvedValueOnce(new Response('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>', { status: 200 }));

      const first = await scanner.scan();
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.value).toHaveLength(1);

      const second = await scanner.scan();
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value).toEqual([]);
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
});
