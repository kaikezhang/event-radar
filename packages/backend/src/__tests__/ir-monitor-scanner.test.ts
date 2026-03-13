import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import { buildApp } from '../app.js';
import {
  DEFAULT_IR_MONITOR_COMPANIES,
  IR_MONITOR_POLL_INTERVAL_MS,
  IrMonitorScanner,
  buildIrMonitorEventId,
  extractPressReleasesFromHtml,
  hashContent,
  parseIrMonitorCompaniesEnv,
  type IrMonitorCompanyConfig,
} from '../scanners/ir-monitor-scanner.js';

const mockRssXml = readFileSync(
  join(__dirname, 'fixtures', 'mock-ir-rss.xml'),
  'utf-8',
);

const pageBeforeHtml = readFileSync(
  join(__dirname, 'fixtures', 'mock-ir-page-before.html'),
  'utf-8',
);

const pageAfterHtml = readFileSync(
  join(__dirname, 'fixtures', 'mock-ir-page-after.html'),
  'utf-8',
);

describe('IrMonitorScanner', () => {
  let originalCompanies: string | undefined;
  let originalEnabled: string | undefined;

  beforeEach(() => {
    originalCompanies = process.env.IR_MONITOR_COMPANIES;
    originalEnabled = process.env.IR_MONITOR_ENABLED;
    delete process.env.IR_MONITOR_COMPANIES;
    delete process.env.IR_MONITOR_ENABLED;
  });

  afterEach(() => {
    if (originalCompanies === undefined) {
      delete process.env.IR_MONITOR_COMPANIES;
    } else {
      process.env.IR_MONITOR_COMPANIES = originalCompanies;
    }

    if (originalEnabled === undefined) {
      delete process.env.IR_MONITOR_ENABLED;
    } else {
      process.env.IR_MONITOR_ENABLED = originalEnabled;
    }
  });

  describe('parseIrMonitorCompaniesEnv', () => {
    it('returns default company configs when env var is empty', () => {
      const companies = parseIrMonitorCompaniesEnv();

      expect(companies).toEqual(DEFAULT_IR_MONITOR_COMPANIES);
      expect(companies).toHaveLength(6);
    });

    it('uses a stable Microsoft press release index URL in the default config', () => {
      const companies = parseIrMonitorCompaniesEnv();
      const microsoft = companies.find((company) => company.ticker === 'MSFT');

      expect(microsoft?.pageUrl).toBe(
        'https://www.microsoft.com/en-us/investor/press-releases-and-news/press-releases/default.aspx',
      );
    });

    it('parses a JSON array from IR_MONITOR_COMPANIES', () => {
      process.env.IR_MONITOR_COMPANIES = JSON.stringify([
        {
          ticker: 'NFLX',
          name: 'Netflix',
          feedUrl: 'https://ir.netflix.net/rss',
          pageUrl: 'https://ir.netflix.net/news',
        },
      ] satisfies IrMonitorCompanyConfig[]);

      const companies = parseIrMonitorCompaniesEnv();

      expect(companies).toEqual([
        {
          ticker: 'NFLX',
          name: 'Netflix',
          feedUrl: 'https://ir.netflix.net/rss',
          pageUrl: 'https://ir.netflix.net/news',
        },
      ]);
    });

    it('parses a comma-separated object list from IR_MONITOR_COMPANIES', () => {
      process.env.IR_MONITOR_COMPANIES = [
        '{"ticker":"AMD","name":"AMD","pageUrl":"https://ir.amd.com/news","selector":".press-release a"}',
        '{"ticker":"AMZN","name":"Amazon","pageUrl":"https://www.aboutamazon.com/news/company-news"}',
      ].join(',');

      const companies = parseIrMonitorCompaniesEnv();

      expect(companies.map((company) => company.ticker)).toEqual(['AMD', 'AMZN']);
      expect(companies[0]?.selector).toBe('.press-release a');
    });

    it('returns an empty config when IR_MONITOR_COMPANIES is invalid JSON', () => {
      process.env.IR_MONITOR_COMPANIES = '{"ticker":"BROKEN"';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const companies = parseIrMonitorCompaniesEnv();

      expect(companies).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid IR_MONITOR_COMPANIES config'),
      );
    });
  });

  describe('helpers', () => {
    it('extracts press releases from HTML and resolves relative URLs', () => {
      const releases = extractPressReleasesFromHtml(
        pageAfterHtml,
        'https://ir.tesla.com/press-release',
        '.press-release',
      );

      expect(releases).toHaveLength(3);
      expect(releases[0]).toEqual({
        title: 'Tesla launches new energy storage system',
        url: 'https://ir.tesla.com/news/tesla-launches-energy-storage',
        snippet: 'Tesla announced a new Megapack deployment.',
      });
    });

    it('creates distinct hashes for changed content', () => {
      expect(hashContent(pageBeforeHtml)).not.toBe(hashContent(pageAfterHtml));
    });

    it('builds a stable dedup id for press releases', () => {
      expect(
        buildIrMonitorEventId('TSLA', 'https://ir.tesla.com/news/tesla-updates-deliveries-guidance'),
      ).toBe(
        'TSLA:https://ir.tesla.com/news/tesla-updates-deliveries-guidance',
      );
    });

    it('normalizes whitespace before hashing content', () => {
      expect(hashContent(' hello   world ')).toBe(hashContent('hello world'));
    });
  });

  describe('scan', () => {
    it('uses the configured 5 minute poll interval', () => {
      const scanner = new IrMonitorScanner(new InMemoryEventBus());
      expect(scanner.pollIntervalMs).toBe(IR_MONITOR_POLL_INTERVAL_MS);
    });

    it('emits events for new RSS feed items', async () => {
      const scanner = new IrMonitorScanner(new InMemoryEventBus(), [
        {
          ticker: 'AAPL',
          name: 'Apple',
          feedUrl: 'https://investor.apple.com/rss',
          pageUrl: 'https://investor.apple.com/news',
        },
      ]);

      scanner.fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(mockRssXml, { status: 200 }),
      );

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toHaveLength(2);
      expect(result.value[0]?.source).toBe('company-ir');
      expect(result.value[0]?.type).toBe('press-release');
      expect(result.value[0]?.title).toBe('[AAPL] Apple Reports First Quarter Results');
      expect(result.value[0]?.metadata?.['companyName']).toBe('Apple');
      expect(result.value[0]?.metadata?.['tickers']).toEqual(['AAPL']);
    });

    it('rejects direct RSS polling without a feed URL before calling fetch', async () => {
      const scanner = new IrMonitorScanner(new InMemoryEventBus(), []);
      const fetchFn = vi.fn<typeof fetch>();
      scanner.fetchFn = fetchFn;

      await expect(
        (scanner as unknown as {
          pollRssCompany: (company: IrMonitorCompanyConfig) => Promise<unknown>;
        }).pollRssCompany({
          ticker: 'AAPL',
          name: 'Apple',
          pageUrl: 'https://investor.apple.com/news',
        }),
      ).rejects.toThrow('RSS feed URL is required');

      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('deduplicates RSS items across scans', async () => {
      const scanner = new IrMonitorScanner(new InMemoryEventBus(), [
        {
          ticker: 'AAPL',
          name: 'Apple',
          feedUrl: 'https://investor.apple.com/rss',
          pageUrl: 'https://investor.apple.com/news',
        },
      ]);

      scanner.fetchFn = vi.fn<typeof fetch>().mockImplementation(async () =>
        new Response(mockRssXml, { status: 200 }),
      );

      const first = await scanner.scan();
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.value).toHaveLength(2);

      const second = await scanner.scan();
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value).toHaveLength(0);
    });

    it('does not emit page-diff events on the initial baseline fetch', async () => {
      const scanner = new IrMonitorScanner(new InMemoryEventBus(), [
        {
          ticker: 'TSLA',
          name: 'Tesla',
          pageUrl: 'https://ir.tesla.com/press-release',
          selector: '.press-release',
        },
      ]);

      scanner.fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(pageBeforeHtml, { status: 200 }),
      );

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(0);
    });

    it('emits only new page-diff entries after the page hash changes', async () => {
      const scanner = new IrMonitorScanner(new InMemoryEventBus(), [
        {
          ticker: 'TSLA',
          name: 'Tesla',
          pageUrl: 'https://ir.tesla.com/press-release',
          selector: '.press-release',
        },
      ]);

      scanner.fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(pageBeforeHtml, { status: 200 }))
        .mockResolvedValueOnce(new Response(pageAfterHtml, { status: 200 }));

      const first = await scanner.scan();
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.value).toHaveLength(0);

      const second = await scanner.scan();
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value).toHaveLength(1);
      expect(second.value[0]?.title).toBe('[TSLA] Tesla updates deliveries guidance');
      expect(second.value[0]?.url).toBe(
        'https://ir.tesla.com/news/tesla-updates-deliveries-guidance',
      );
    });

    it('does not re-emit the same page-diff entry after it has been seen', async () => {
      const scanner = new IrMonitorScanner(new InMemoryEventBus(), [
        {
          ticker: 'TSLA',
          name: 'Tesla',
          pageUrl: 'https://ir.tesla.com/press-release',
          selector: '.press-release',
        },
      ]);

      scanner.fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(pageBeforeHtml, { status: 200 }))
        .mockResolvedValueOnce(new Response(pageAfterHtml, { status: 200 }))
        .mockResolvedValueOnce(new Response(pageAfterHtml, { status: 200 }));

      await scanner.scan();
      const second = await scanner.scan();
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value).toHaveLength(1);

      const third = await scanner.scan();
      expect(third.ok).toBe(true);
      if (!third.ok) return;
      expect(third.value).toHaveLength(0);
    });

    it('continues polling other companies when one RSS request returns an HTTP error', async () => {
      const scanner = new IrMonitorScanner(new InMemoryEventBus(), [
        {
          ticker: 'AAPL',
          name: 'Apple',
          feedUrl: 'https://investor.apple.com/rss',
          pageUrl: 'https://investor.apple.com/news',
        },
        {
          ticker: 'TSLA',
          name: 'Tesla',
          pageUrl: 'https://ir.tesla.com/press-release',
          selector: '.press-release',
        },
      ]);

      scanner.fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('', { status: 503 }))
        .mockResolvedValueOnce(new Response(pageBeforeHtml, { status: 200 }));

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
      expect(scanner.fetchFn).toHaveBeenCalledTimes(2);
    });

    it('continues polling other companies when one request throws a network error', async () => {
      const scanner = new IrMonitorScanner(new InMemoryEventBus(), [
        {
          ticker: 'AAPL',
          name: 'Apple',
          feedUrl: 'https://investor.apple.com/rss',
          pageUrl: 'https://investor.apple.com/news',
        },
        {
          ticker: 'TSLA',
          name: 'Tesla',
          pageUrl: 'https://ir.tesla.com/press-release',
          selector: '.press-release',
        },
      ]);

      scanner.fetchFn = vi.fn<typeof fetch>()
        .mockRejectedValueOnce(new Error('socket hang up'))
        .mockResolvedValueOnce(new Response(pageBeforeHtml, { status: 200 }));

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
      expect(scanner.fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('health', () => {
    it('reports the initial healthy state before any scans run', () => {
      const scanner = new IrMonitorScanner(new InMemoryEventBus(), []);
      const health = scanner.health();

      expect(health).toMatchObject({
        scanner: 'ir-monitor',
        status: 'healthy',
        errorCount: 0,
        consecutiveErrors: 0,
        currentIntervalMs: IR_MONITOR_POLL_INTERVAL_MS,
        inBackoff: false,
      });
      expect(health.lastScanAt).toBeNull();
    });
  });

  describe('app registration', () => {
    it('registers the scanner only when IR_MONITOR_ENABLED=true', async () => {
      process.env.IR_MONITOR_ENABLED = 'false';
      const disabledCtx = buildApp({ logger: false });
      await disabledCtx.server.ready();
      expect(disabledCtx.registry.getById('ir-monitor')).toBeUndefined();
      await disabledCtx.server.close();

      process.env.IR_MONITOR_ENABLED = 'true';
      const enabledCtx = buildApp({ logger: false });
      await enabledCtx.server.ready();
      expect(enabledCtx.registry.getById('ir-monitor')).toBeDefined();
      await enabledCtx.server.close();
    });
  });
});
