import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryEventBus } from '@event-radar/shared';
import {
  HaltScanner,
  buildHaltDedupKey,
  describeHaltReason,
  isLuldHaltCode,
  mapHaltReasonSeverity,
  parseFeedTimestamp,
  parseNasdaqTradeHaltsJson,
  parseNasdaqTradeHaltsRss,
  type NasdaqTradeHaltRecord,
} from '../scanners/halt-scanner.js';

const RSS_FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:ndaq="http://www.nasdaqtrader.com/">
  <channel>
    <item>
      <title>ABCD</title>
      <pubDate>Thu, 12 Mar 2026 14:35:00 GMT</pubDate>
      <ndaq:HaltDate>03/12/2026</ndaq:HaltDate>
      <ndaq:HaltTime>09:35:00</ndaq:HaltTime>
      <ndaq:IssueSymbol>ABCD</ndaq:IssueSymbol>
      <ndaq:IssueName>Alpha Beta Corp</ndaq:IssueName>
      <ndaq:Market>NASDAQ</ndaq:Market>
      <ndaq:ReasonCode>T5</ndaq:ReasonCode>
      <ndaq:PauseThresholdPrice>12.34</ndaq:PauseThresholdPrice>
      <ndaq:ResumptionDate />
      <ndaq:ResumptionQuoteTime />
      <ndaq:ResumptionTradeTime />
    </item>
    <item>
      <title>WXYZ</title>
      <pubDate>Thu, 12 Mar 2026 15:15:00 GMT</pubDate>
      <ndaq:HaltDate>03/12/2026</ndaq:HaltDate>
      <ndaq:HaltTime>10:15:00.000</ndaq:HaltTime>
      <ndaq:IssueSymbol>WXYZ</ndaq:IssueSymbol>
      <ndaq:IssueName>Widget Holdings</ndaq:IssueName>
      <ndaq:Market>NYSE</ndaq:Market>
      <ndaq:ReasonCode>T2</ndaq:ReasonCode>
      <ndaq:PauseThresholdPrice />
      <ndaq:ResumptionDate>03/12/2026</ndaq:ResumptionDate>
      <ndaq:ResumptionQuoteTime>10:45:00</ndaq:ResumptionQuoteTime>
      <ndaq:ResumptionTradeTime>10:50:00</ndaq:ResumptionTradeTime>
    </item>
  </channel>
</rss>`;

const RSS_HALT_ONLY = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:ndaq="http://www.nasdaqtrader.com/">
  <channel>
    <item>
      <title>WXYZ</title>
      <pubDate>Thu, 12 Mar 2026 15:15:00 GMT</pubDate>
      <ndaq:HaltDate>03/12/2026</ndaq:HaltDate>
      <ndaq:HaltTime>10:15:00.000</ndaq:HaltTime>
      <ndaq:IssueSymbol>WXYZ</ndaq:IssueSymbol>
      <ndaq:IssueName>Widget Holdings</ndaq:IssueName>
      <ndaq:Market>NYSE</ndaq:Market>
      <ndaq:ReasonCode>T2</ndaq:ReasonCode>
      <ndaq:PauseThresholdPrice />
      <ndaq:ResumptionDate />
      <ndaq:ResumptionQuoteTime />
      <ndaq:ResumptionTradeTime />
    </item>
  </channel>
</rss>`;

const RSS_WITH_RESUME = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:ndaq="http://www.nasdaqtrader.com/">
  <channel>
    <item>
      <title>WXYZ</title>
      <pubDate>Thu, 12 Mar 2026 15:50:00 GMT</pubDate>
      <ndaq:HaltDate>03/12/2026</ndaq:HaltDate>
      <ndaq:HaltTime>10:15:00.000</ndaq:HaltTime>
      <ndaq:IssueSymbol>WXYZ</ndaq:IssueSymbol>
      <ndaq:IssueName>Widget Holdings</ndaq:IssueName>
      <ndaq:Market>NYSE</ndaq:Market>
      <ndaq:ReasonCode>T2</ndaq:ReasonCode>
      <ndaq:PauseThresholdPrice />
      <ndaq:ResumptionDate>03/12/2026</ndaq:ResumptionDate>
      <ndaq:ResumptionQuoteTime>10:45:00</ndaq:ResumptionQuoteTime>
      <ndaq:ResumptionTradeTime>10:50:00</ndaq:ResumptionTradeTime>
    </item>
  </channel>
</rss>`;

const JSON_FEED = {
  data: {
    rows: [
      {
        IssueSymbol: 'LMNO',
        IssueName: 'Lumen Orbit Ltd',
        Market: 'NASDAQ',
        HaltDate: '03/12/2026',
        HaltTime: '11:05:00',
        ReasonCode: 'M',
        PauseThresholdPrice: '5.55',
        ResumptionDate: '',
        ResumptionQuoteTime: '',
        ResumptionTradeTime: '',
      },
    ],
  },
};

const MALFORMED_TIMESTAMP_FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:ndaq="http://www.nasdaqtrader.com/">
  <channel>
    <item>
      <title>BADT</title>
      <pubDate>Thu, 12 Mar 2026 15:15:00 GMT</pubDate>
      <ndaq:HaltDate>2026-03-12</ndaq:HaltDate>
      <ndaq:HaltTime>10:15:00.000</ndaq:HaltTime>
      <ndaq:IssueSymbol>BADT</ndaq:IssueSymbol>
      <ndaq:IssueName>Broken Timestamp Corp</ndaq:IssueName>
      <ndaq:Market>NASDAQ</ndaq:Market>
      <ndaq:ReasonCode>T1</ndaq:ReasonCode>
    </item>
  </channel>
</rss>`;

describe('HaltScanner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseNasdaqTradeHaltsRss', () => {
    it('parses namespaced trade halt fields from RSS items', () => {
      const records = parseNasdaqTradeHaltsRss(RSS_FEED);

      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({
        ticker: 'ABCD',
        issueName: 'Alpha Beta Corp',
        market: 'NASDAQ',
        haltDate: '03/12/2026',
        haltTime: '09:35:00',
        reasonCode: 'T5',
        pauseThresholdPrice: '12.34',
      });
    });

    it('normalizes blank resumption fields to null', () => {
      const records = parseNasdaqTradeHaltsRss(RSS_FEED);

      expect(records[0]?.resumptionDate).toBeNull();
      expect(records[0]?.resumptionTradeTime).toBeNull();
      expect(records[1]?.resumptionTradeTime).toBe('10:50:00');
    });

    it('skips malformed RSS items without a ticker or halt timestamp', () => {
      const records = parseNasdaqTradeHaltsRss(`<?xml version="1.0"?>
<rss version="2.0" xmlns:ndaq="http://www.nasdaqtrader.com/">
  <channel>
    <item>
      <ndaq:HaltDate>03/12/2026</ndaq:HaltDate>
      <ndaq:HaltTime>09:35:00</ndaq:HaltTime>
      <ndaq:ReasonCode>T1</ndaq:ReasonCode>
    </item>
    <item>
      <ndaq:IssueSymbol>GOOD</ndaq:IssueSymbol>
      <ndaq:HaltDate>03/12/2026</ndaq:HaltDate>
      <ndaq:HaltTime>09:40:00</ndaq:HaltTime>
      <ndaq:ReasonCode>T1</ndaq:ReasonCode>
    </item>
  </channel>
</rss>`);

      expect(records).toEqual([
        expect.objectContaining({ ticker: 'GOOD', haltTime: '09:40:00' }),
      ]);
    });
  });

  describe('reason mapping helpers', () => {
    it('maps high-priority halt codes to the expected severities', () => {
      expect(mapHaltReasonSeverity('T1')).toBe('CRITICAL');
      expect(mapHaltReasonSeverity('T2')).toBe('HIGH');
      expect(mapHaltReasonSeverity('T12')).toBe('MEDIUM');
      expect(mapHaltReasonSeverity('H11')).toBe('LOW');
    });

    it('returns human-readable reason descriptions', () => {
      expect(describeHaltReason('T5')).toBe('Single Stock Circuit Breaker (LULD)');
      expect(describeHaltReason('M')).toBe('Volatility Trading Pause (MWCB)');
      expect(describeHaltReason('ZZZ')).toBe('Other / Unknown');
    });

    it('flags only LULD-specific halt codes', () => {
      expect(isLuldHaltCode('T5')).toBe(true);
      expect(isLuldHaltCode('T6')).toBe(false);
      expect(isLuldHaltCode('M')).toBe(false);
    });

    it('builds dedup keys from ticker, halt time, and reason code', () => {
      const record: NasdaqTradeHaltRecord = {
        ticker: 'ABCD',
        issueName: 'Alpha Beta Corp',
        market: 'NASDAQ',
        haltDate: '03/12/2026',
        haltTime: '09:35:00',
        reasonCode: 'T5',
        pauseThresholdPrice: null,
        resumptionDate: null,
        resumptionQuoteTime: null,
        resumptionTradeTime: null,
      };

      expect(buildHaltDedupKey(record)).toBe('ABCD|03/12/2026 09:35:00|T5');
    });
  });

  describe('parseNasdaqTradeHaltsJson', () => {
    it('parses fallback JSON payloads into halt records', () => {
      const records = parseNasdaqTradeHaltsJson(JSON_FEED);

      expect(records).toEqual([
        expect.objectContaining({
          ticker: 'LMNO',
          market: 'NASDAQ',
          haltTime: '11:05:00',
          reasonCode: 'M',
        }),
      ]);
    });

    it('accepts flat array payloads', () => {
      const records = parseNasdaqTradeHaltsJson(JSON_FEED.data.rows);

      expect(records).toHaveLength(1);
      expect(records[0]?.ticker).toBe('LMNO');
    });

    it('returns an empty list for null payloads', () => {
      expect(parseNasdaqTradeHaltsJson(null)).toEqual([]);
    });

    it('parses deeply nested candidate keys without throwing', () => {
      const payload = {
        data: {
          results: {
            halts: JSON_FEED.data.rows,
          },
        },
      };

      const records = parseNasdaqTradeHaltsJson(payload);

      expect(records).toHaveLength(1);
      expect(records[0]?.ticker).toBe('LMNO');
    });

    it('ignores cyclic payloads instead of recursing forever', () => {
      const payload: Record<string, unknown> = {};
      payload['data'] = payload;

      expect(parseNasdaqTradeHaltsJson(payload)).toEqual([]);
    });
  });

  describe('parseFeedTimestamp', () => {
    it('converts Eastern Time timestamps to UTC during DST', () => {
      const timestamp = parseFeedTimestamp('03/12/2026', '09:35:00');

      expect(timestamp?.toISOString()).toBe('2026-03-12T13:35:00.000Z');
    });

    it('converts Eastern Time timestamps to UTC during standard time', () => {
      const timestamp = parseFeedTimestamp('01/12/2026', '09:35:00');

      expect(timestamp?.toISOString()).toBe('2026-01-12T14:35:00.000Z');
    });

    it('rejects empty or malformed date strings', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(parseFeedTimestamp('', '09:35:00')).toBeNull();
      expect(parseFeedTimestamp('2026-03-12', '09:35:00')).toBeNull();
      expect(parseFeedTimestamp('03/12', '09:35:00')).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(3);
    });

    it('rejects malformed time strings', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(parseFeedTimestamp('03/12/2026', '9am')).toBeNull();
      expect(parseFeedTimestamp('03/12/2026', '25:00:00')).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('scan', () => {
    it('emits halt and resume events with structured metadata', async () => {
      const scanner = new HaltScanner(new InMemoryEventBus());
      scanner.fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(RSS_FEED, {
          status: 200,
          headers: { 'Content-Type': 'application/rss+xml' },
        }),
      );

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toHaveLength(3);

      const halt = result.value.find((event) => event.type === 'halt' && event.title.includes('ABCD'));
      expect(halt).toBeDefined();
      expect(halt?.source).toBe('trading-halt');
      expect(halt?.title).toContain('HALTED');
      expect(halt?.title).toContain('Single Stock Circuit Breaker');
      expect(halt?.metadata).toMatchObject({
        ticker: 'ABCD',
        tickers: ['ABCD'],
        haltReasonCode: 'T5',
        market: 'NASDAQ',
        severity: 'CRITICAL',
        direction: 'bearish',
        isLULD: true,
      });

      const resume = result.value.find((event) => event.type === 'resume');
      expect(resume).toBeDefined();
      expect(resume?.title).toContain('WXYZ trading RESUMED');
      expect(resume?.metadata).toMatchObject({
        ticker: 'WXYZ',
        severity: 'HIGH',
        direction: 'neutral',
        resumeTime: '03/12/2026 10:50:00',
      });
    });

    it('deduplicates repeated scans of the same halt record', async () => {
      const scanner = new HaltScanner(new InMemoryEventBus());
      scanner.fetchFn = vi.fn<typeof fetch>().mockImplementation(
        async () => new Response(RSS_FEED, { status: 200 }),
      );

      const first = await scanner.scan();
      const second = await scanner.scan();

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!second.ok) return;

      expect(second.value).toHaveLength(0);
    });

    it('emits a resume later without re-emitting the original halt', async () => {
      const scanner = new HaltScanner(new InMemoryEventBus());
      scanner.fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(RSS_HALT_ONLY, { status: 200 }))
        .mockResolvedValueOnce(new Response(RSS_WITH_RESUME, { status: 200 }));

      const first = await scanner.scan();
      const second = await scanner.scan();

      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.value).toHaveLength(1);
        expect(first.value[0]?.type).toBe('halt');
      }

      expect(second.ok).toBe(true);
      if (!second.ok) return;

      expect(second.value).toHaveLength(1);
      expect(second.value[0]?.type).toBe('resume');
      expect(second.value[0]?.title).toContain('RESUMED');
    });

    it('falls back to the JSON endpoint when the RSS endpoint fails', async () => {
      const scanner = new HaltScanner(new InMemoryEventBus());
      scanner.fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('rss failed', { status: 500 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(JSON_FEED), { status: 200 }));

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.metadata?.['ticker']).toBe('LMNO');
      expect(result.value[0]?.metadata?.['severity']).toBe('CRITICAL');
    });

    it('skips malformed timestamps and logs a warning instead of using current time', async () => {
      const scanner = new HaltScanner(new InMemoryEventBus());
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      scanner.fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(MALFORMED_TIMESTAMP_FEED, { status: 200 }),
      );

      const result = await scanner.scan();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('returns an error when all feed fetch attempts fail', async () => {
      const scanner = new HaltScanner(new InMemoryEventBus());
      scanner.fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('rss failed', { status: 500 }))
        .mockResolvedValueOnce(new Response('json failed', { status: 500 }));

      const result = await scanner.scan();

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.message).toContain('Trade halt feed fetch failed');
    });
  });

  describe('app registration', () => {
    it('wires HaltScanner behind HALT_SCANNER_ENABLED in scanner-registry-setup.ts', () => {
      const appSource = readFileSync(join(__dirname, '..', 'scanner-registry-setup.ts'), 'utf-8');

      expect(appSource).toContain("process.env.HALT_SCANNER_ENABLED === 'true'");
      expect(appSource).toContain('new HaltScanner(eventBus)');
    });
  });
});
