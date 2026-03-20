import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '@event-radar/shared';
import { BreakingNewsScanner } from '../scanners/breaking-news-scanner.js';
import { IrMonitorScanner } from '../scanners/ir-monitor-scanner.js';
import { NewswireScanner } from '../scanners/newswire-scanner.js';
import { RedditScanner } from '../scanners/reddit-scanner.js';
import { SecEdgarScanner } from '../scanners/sec-edgar-scanner.js';

const MOCK_8K_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>8-K - Example Corp (0000123456) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/example-8k"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0001193125-26-012345
      &lt;br&gt;Item 8.01: Other Events
    </summary>
    <updated>2026-03-12T20:05:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="8-K"/>
    <id>urn:tag:sec.gov,2008:accession-number=0001193125-26-012345</id>
  </entry>
</feed>`;

const MOCK_FORM4_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>4 - Jane Doe (0001987654) (Reporting)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/example-form4"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-12 &lt;b&gt;AccNo:&lt;/b&gt; 0001987654-26-000001
      &lt;br&gt;Issuer: Example Corp (NASDAQ: EXMP)
      &lt;br&gt;Transaction: Purchase
      &lt;br&gt;Value: $2500000
    </summary>
    <updated>2026-03-12T20:06:00-04:00</updated>
    <category scheme="https://www.sec.gov/" label="form type" term="4"/>
    <id>urn:tag:sec.gov,2008:accession-number=0001987654-26-000001</id>
  </entry>
</feed>`;

const INTERVAL_ENV_KEYS = [
  'SCANNER_INTERVAL_DEFAULT',
  'SCANNER_INTERVAL_BREAKING_NEWS',
  'SCANNER_INTERVAL_IR_MONITOR',
  'SCANNER_INTERVAL_NEWSWIRE',
  'SCANNER_INTERVAL_REDDIT',
  'SCANNER_INTERVAL_SEC',
  'SCANNER_INTERVAL_SEC_FORM4',
] as const;

describe('scanner interval configuration', () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of INTERVAL_ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.useRealTimers();

    for (const key of INTERVAL_ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('keeps the Reddit default interval when interval env vars are unset', () => {
    const scanner = new RedditScanner(new InMemoryEventBus());

    expect(scanner.pollIntervalMs).toBe(60_000);
  });

  it('uses SCANNER_INTERVAL_DEFAULT when a scanner-specific Reddit override is absent', () => {
    process.env.SCANNER_INTERVAL_DEFAULT = '75_000'.replace('_', '');
    const scanner = new RedditScanner(new InMemoryEventBus());

    expect(scanner.pollIntervalMs).toBe(75_000);
  });

  it('prefers SCANNER_INTERVAL_REDDIT over SCANNER_INTERVAL_DEFAULT', () => {
    process.env.SCANNER_INTERVAL_DEFAULT = '75_000'.replace('_', '');
    process.env.SCANNER_INTERVAL_REDDIT = '45_000'.replace('_', '');
    const scanner = new RedditScanner(new InMemoryEventBus());

    expect(scanner.pollIntervalMs).toBe(45_000);
  });

  it('uses a breaking-news-specific override when provided', () => {
    process.env.SCANNER_INTERVAL_DEFAULT = '75_000'.replace('_', '');
    process.env.SCANNER_INTERVAL_BREAKING_NEWS = '15_000'.replace('_', '');
    const scanner = new BreakingNewsScanner(new InMemoryEventBus());

    expect(scanner.pollIntervalMs).toBe(15_000);
  });

  it('keeps the Newswire default interval when interval env vars are unset', () => {
    const scanner = new NewswireScanner(new InMemoryEventBus());

    expect(scanner.pollIntervalMs).toBe(120_000);
  });

  it('uses SCANNER_INTERVAL_DEFAULT for Newswire when no specific override is present', () => {
    process.env.SCANNER_INTERVAL_DEFAULT = '75_000'.replace('_', '');
    const scanner = new NewswireScanner(new InMemoryEventBus());

    expect(scanner.pollIntervalMs).toBe(75_000);
  });

  it('keeps the IR monitor default interval when interval env vars are unset', () => {
    const scanner = new IrMonitorScanner(new InMemoryEventBus(), []);

    expect(scanner.pollIntervalMs).toBe(300_000);
  });

  it('uses a scanner-specific SEC override for the primary poll interval', () => {
    process.env.SCANNER_INTERVAL_DEFAULT = '75_000'.replace('_', '');
    process.env.SCANNER_INTERVAL_SEC = '30_000'.replace('_', '');
    const scanner = new SecEdgarScanner(new InMemoryEventBus());

    expect(scanner.pollIntervalMs).toBe(30_000);
  });

  it('uses SCANNER_INTERVAL_SEC_FORM4 to control the Form 4 cadence', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    process.env.SCANNER_INTERVAL_SEC = '30_000'.replace('_', '');
    process.env.SCANNER_INTERVAL_SEC_FORM4 = '30_000'.replace('_', '');

    const scanner = new SecEdgarScanner(new InMemoryEventBus());
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(MOCK_8K_ATOM, { status: 200 }))
      .mockResolvedValueOnce(new Response(MOCK_FORM4_ATOM, { status: 200 }))
      .mockResolvedValueOnce(new Response(MOCK_8K_ATOM, { status: 200 }))
      .mockResolvedValueOnce(new Response(MOCK_8K_ATOM, { status: 200 }))
      .mockResolvedValueOnce(new Response(MOCK_FORM4_ATOM, { status: 200 }));

    scanner.fetchFn = fetchFn;

    await scanner.scan();
    vi.setSystemTime(29_000);
    await scanner.scan();
    vi.setSystemTime(30_000);
    await scanner.scan();

    expect(fetchFn).toHaveBeenCalledTimes(5);
  });
});
