import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';

// Mock lightweight-charts to avoid jsdom crashes (canvas + matchMedia)
vi.mock('lightweight-charts', () => ({
  createChart: () => ({
    addCandlestickSeries: () => ({ setData: vi.fn(), setMarkers: vi.fn() }),
    addLineSeries: () => ({ setData: vi.fn() }),
    addAreaSeries: () => ({ setData: vi.fn() }),
    addSeries: () => ({ setData: vi.fn(), setMarkers: vi.fn() }),
    timeScale: () => ({ fitContent: vi.fn(), scrollToPosition: vi.fn(), getVisibleRange: vi.fn() }),
    applyOptions: vi.fn(),
    resize: vi.fn(),
    remove: vi.fn(),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    subscribeClick: vi.fn(),
    unsubscribeClick: vi.fn(),
  }),
  CandlestickSeries: Symbol('CandlestickSeries'),
  createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn(), destroy: vi.fn() })),
  ColorType: { Solid: 0, VerticalGradient: 1 },
  CrosshairMode: { Normal: 0, Magnet: 1 },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
}));

// Polyfill matchMedia for tests (used by lightweight-charts / fancy-canvas / useMediaQuery)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Polyfill ResizeObserver for tests (used by recharts ResponsiveContainer)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(_cb: ResizeObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Polyfill IntersectionObserver for tests (used by Feed infinite scroll)
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserver {
    readonly root: Element | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [];
    constructor(_cb: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  };
}

const FEED_EVENT = {
  id: 'evt-critical-nvda-1',
  severity: 'HIGH',
  source: 'sec-edgar',
  title: 'NVDA export filing flags China exposure risk',
  summary: 'NVIDIA Corporation flagged heightened export exposure tied to China demand.',
  tickers: ['NVDA'],
  time: '2026-03-12T20:05:00.000Z',
  receivedAt: '2026-03-12T20:05:00.000Z',
  confirmationCount: 3,
  confirmedSources: ['sec-edgar', 'pr-newswire', 'reuters'],
  metadata: {
    tickers: ['NVDA'],
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    direction: 'bearish',
    url: 'https://example.com/sec/nvda-export-filing',
    confirmationCount: 3,
    confirmedSources: ['sec-edgar', 'pr-newswire', 'reuters'],
    llm_enrichment: {
      summary: 'NVIDIA Corporation flagged heightened export exposure tied to China demand.',
      impact: 'Export controls may pressure near-term demand expectations.',
      whyNow: 'New export restrictions coincide with Q1 guidance period, amplifying uncertainty.',
      currentSetup: 'NVDA is losing momentum into resistance while RSI remains near the middle of its range.',
      historicalContext: 'Comparable export headlines produced negative T+20 follow-through in slightly less than half of matches.',
      risks: 'Regulatory escalation could further restrict chip sales to Chinese data centers.',
      action: '🟡 Monitor',
      tickers: [
        { symbol: 'NVDA', direction: 'bearish', context: 'Direct exposure to China export risk' },
      ],
      regimeContext: 'Correction market — broad risk-off sentiment amplifies headline reactions.',
      filingItems: ['2.01', '3.01', '5.02'],
    },
    historical_context: {
      patternLabel: 'Export restriction filing in correction market',
      confidence: 'medium',
      matchCount: 251,
      avgAlphaT5: -0.6,
      avgAlphaT20: -0.4,
      winRateT20: 46,
      bestCase: { ticker: 'SMCI', move: 78.3 },
      worstCase: { ticker: 'UNH', move: -35.7 },
      similarEvents: [
        { title: 'Prior NVDA export disclosure', date: '2026-02-14T14:30:00.000Z', move: '+5.2%' },
        { title: 'Semiconductor filing highlights China demand risk', date: '2026-01-10T15:00:00.000Z', move: '-3.1%' },
      ],
    },
  },
};

const LOW_SAMPLE_EVENT = {
  ...FEED_EVENT,
  id: 'evt-low-sample-pattern',
  title: 'Semiconductor supplier update raises export questions',
  summary: 'A chip supplier disclosed fresh export-related uncertainty.',
  metadata: {
    ...FEED_EVENT.metadata,
    historical_context: undefined,
    llm_enrichment: {
      ...FEED_EVENT.metadata.llm_enrichment,
      summary: 'A chip supplier disclosed fresh export-related uncertainty.',
      impact: 'The filing adds context but does not yet establish a repeatable setup.',
      currentSetup: 'Price is chopping sideways and traders are still digesting the disclosure.',
      action: '🟡 Monitor',
    },
  },
};

const NEUTRAL_SIGNAL_EVENT = {
  ...FEED_EVENT,
  id: 'evt-neutral-regime-1',
  title: 'Fed speaker keeps macro catalysts in balance',
  summary: 'The market is waiting to see whether rates volatility spills into equities.',
  source: 'fed',
  metadata: {
    ...FEED_EVENT.metadata,
    ticker: 'SPY',
    tickers: ['SPY'],
    direction: 'neutral',
    llm_enrichment: {
      summary: 'The market is waiting to see whether rates volatility spills into equities.',
      impact: 'The catalyst matters because index breadth is already fragile.',
      whyNow: 'Positioning is light ahead of the next CPI print.',
      currentSetup: 'Index positioning remains defensive and traders are reacting to rates first.',
      historicalContext: 'Past macro repricings saw follow-through depend on the next inflation print.',
      risks: 'A fast rates reversal could erase the move.',
      action: '🟡 Monitor',
      tickers: [
        { symbol: 'SPY', direction: 'neutral', context: 'The tape is waiting for confirmation from rates.' },
      ],
      regimeContext: 'Risk-off tape is amplifying macro headlines more than single-stock catalysts.',
    },
    historical_context: undefined,
  },
};

const AWAITING_REACTION_EVENT = {
  ...FEED_EVENT,
  id: 'evt-awaiting-reaction-1',
  title: 'Company update lands before the open with no clear tape response',
  summary: 'Traders have not picked a direction yet.',
  metadata: {
    ...FEED_EVENT.metadata,
    ticker: 'MSFT',
    tickers: ['MSFT'],
    direction: 'mixed',
    llm_enrichment: {
      summary: 'Traders have not picked a direction yet.',
      impact: 'The headline is notable but confirmation is still missing.',
      whyNow: 'Liquidity is thin ahead of the opening auction.',
      currentSetup: '',
      historicalContext: '',
      risks: 'A delayed conference call could change the read.',
      action: '🟡 Monitor',
      tickers: [
        { symbol: 'MSFT', direction: 'mixed', context: '' },
      ],
      regimeContext: '',
    },
    historical_context: undefined,
  },
};

const MISSING_ANALYSIS_EVENT = {
  ...FEED_EVENT,
  id: 'evt-high-missing-analysis',
  severity: 'HIGH',
  title: 'Brief filing update arrives without usable analysis context',
  summary: 'The filing is real, but the model did not produce enough structured reasoning.',
  metadata: {
    ...FEED_EVENT.metadata,
    ticker: 'AMD',
    tickers: ['AMD'],
    direction: 'neutral',
    url: undefined,
    accessionNumber: undefined,
    llm_enrichment: {
      summary: 'The filing is real, but the model did not produce enough structured reasoning.',
      impact: null,
      whyNow: null,
      currentSetup: null,
      historicalContext: null,
      risks: null,
      action: null,
      tickers: [
        { symbol: 'AMD', direction: 'neutral', context: '' },
      ],
      regimeContext: null,
    },
    historical_context: undefined,
  },
};

const PRICE_CANDLES = [
  {
    time: '2026-03-10',
    open: 118.2,
    high: 121.1,
    low: 117.4,
    close: 120.6,
    volume: 41000000,
  },
  {
    time: '2026-03-11',
    open: 120.6,
    high: 123.8,
    low: 119.7,
    close: 122.9,
    volume: 45200000,
  },
  {
    time: '2026-03-12',
    open: 122.9,
    high: 125.2,
    low: 121.9,
    close: 124.7,
    volume: 48700000,
  },
];

const SCORECARD = {
  eventId: 'evt-critical-nvda-1',
  title: FEED_EVENT.title,
  ticker: 'NVDA',
  source: FEED_EVENT.source,
  eventTimestamp: FEED_EVENT.time,
  originalAlert: {
    actionLabel: 'Fade the headline',
    direction: 'bearish',
    confidence: 0.74,
    confidenceBucket: 'high',
    classifiedBy: 'llm',
    classifiedAt: '2026-03-12T20:06:00.000Z',
    summary: FEED_EVENT.summary,
    thesis: {
      impact: 'Export controls may pressure near-term demand expectations.',
      whyNow: null,
      currentSetup: null,
      historicalContext: null,
      risks: null,
    },
  },
  outcome: {
    entryPrice: 124.7,
    tPlus5: {
      price: 118.4,
      movePercent: -5.05,
      evaluatedAt: '2026-03-17T20:05:00.000Z',
    },
    tPlus20: {
      price: 112.1,
      movePercent: -10.1,
      evaluatedAt: '2026-04-01T20:05:00.000Z',
    },
    directionVerdict: 'correct',
    setupVerdict: 'worked',
  },
  notes: {
    summary: 'Bearish setup matched the T+20 move (-10.10%).',
    items: [
      'Used T+20 as the primary verdict window.',
      'Original signal label: Fade the headline.',
      'Confidence bucket: high.',
    ],
    verdictWindow: 'T+20',
  },
};
const SCORECARD_SUMMARY_90D = {
  days: 90,
  overview: {
    totalEvents: 23769,
    sourcesMonitored: 13,
    eventsWithTickers: 12028,
    eventsWithPriceOutcomes: 6346,
  },
  totals: {
    totalAlerts: 12028,
    alertsWithUsableVerdicts: 6346,
    directionalCorrectCount: 0,
    directionalHitRate: 0,
    setupWorkedCount: 2870,
    setupWorkedRate: 0.4523,
    avgT5Move: 1.8,
    avgT20Move: 4.3,
    medianT20Move: 3.2,
  },
  actionBuckets: [
    {
      bucket: '🔴 High-Quality Setup',
      totalAlerts: 38,
      alertsWithUsableVerdicts: 34,
      directionalCorrectCount: 0,
      directionalHitRate: 0,
      setupWorkedCount: 21,
      setupWorkedRate: 0.618,
      avgT5Move: 3.2,
      avgT20Move: 8.1,
      medianT20Move: 7.4,
    },
  ],
  confidenceBuckets: [
    {
      bucket: 'high',
      totalAlerts: 51,
      alertsWithUsableVerdicts: 46,
      directionalCorrectCount: 0,
      directionalHitRate: 0,
      setupWorkedCount: 29,
      setupWorkedRate: 0.6304,
      avgT5Move: 2.5,
      avgT20Move: 6.4,
      medianT20Move: 5.7,
    },
  ],
  sourceBuckets: [
    {
      bucket: 'sec-edgar',
      totalAlerts: 29,
      alertsWithUsableVerdicts: 24,
      directionalCorrectCount: 0,
      directionalHitRate: 0,
      setupWorkedCount: 14,
      setupWorkedRate: 0.5833,
      avgT5Move: 1.9,
      avgT20Move: 4.6,
      medianT20Move: 4.2,
    },
  ],
  eventTypeBuckets: [
    {
      bucket: 'sec_form_8k',
      totalAlerts: 16,
      alertsWithUsableVerdicts: 14,
      directionalCorrectCount: 0,
      directionalHitRate: 0,
      setupWorkedCount: 9,
      setupWorkedRate: 0.6429,
      avgT5Move: 2.1,
      avgT20Move: 5.1,
      medianT20Move: 4.9,
    },
  ],
};

const SCORECARD_SUMMARY_ALL = {
  ...SCORECARD_SUMMARY_90D,
  days: null,
  overview: {
    totalEvents: 23769,
    sourcesMonitored: 13,
    eventsWithTickers: 12028,
    eventsWithPriceOutcomes: 6346,
  },
  totals: {
    ...SCORECARD_SUMMARY_90D.totals,
    totalAlerts: 12028,
    alertsWithUsableVerdicts: 6346,
    directionalCorrectCount: 0,
    directionalHitRate: 0,
    setupWorkedCount: 2870,
    setupWorkedRate: 0.4523,
    avgT5Move: 2.4,
    avgT20Move: 5.1,
    medianT20Move: 3.8,
  },
  sourceBuckets: [
    {
      bucket: 'sec-edgar',
      totalAlerts: 35,
      alertsWithUsableVerdicts: 30,
      directionalCorrectCount: 0,
      directionalHitRate: 0,
      setupWorkedCount: 18,
      setupWorkedRate: 0.6,
      avgT5Move: -1.8,
      avgT20Move: -3.4,
      medianT20Move: -3.4,
    },
  ],
};

const SCORECARD_SEVERITY_BREAKDOWN_90D = [
  { severity: 'CRITICAL', count: 9 },
  { severity: 'HIGH', count: 31 },
  { severity: 'MEDIUM', count: 58 },
  { severity: 'LOW', count: 26 },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

    // Auth endpoints
    if (url.pathname === '/api/auth/me') {
      return jsonResponse({ id: 'user-1', email: 'test@example.com', displayName: 'Test User' });
    }

    if (url.pathname === '/api/auth/refresh' && init?.method === 'POST') {
      return jsonResponse({ ok: true });
    }

    // Watchlist summary
    if (url.pathname === '/api/v1/feed/watchlist-summary') {
      return jsonResponse({ tickers: [] });
    }

    if (url.pathname === '/api/v1/feed') {
      return jsonResponse({
        events: [FEED_EVENT],
        cursor: null,
        total: 1,
      });
    }

    if (url.pathname === '/api/events/evt-critical-nvda-1') {
      return jsonResponse({
        data: {
          ...FEED_EVENT,
          rawPayload: {
            rawContent: 'NVIDIA disclosed that new export licensing requirements may constrain shipments to China and pressure demand visibility.',
            description: 'NVIDIA disclosed that new export licensing requirements may constrain shipments to China and pressure demand visibility.',
          },
          marketData: {
            price: 178.42,
            change1d: 2.3,
            change5d: 6.1,
            rsi14: 54,
            volumeRatio: 1.8,
          },
          sourceUrls: ['https://example.com/sec/nvda-export-filing'],
          metadata: {
            ...FEED_EVENT.metadata,
            accessionNumber: '0001045810-26-000042',
          },
          audit: {
            outcome: 'delivered',
            stoppedAt: 'delivery',
            reason: null,
            confidence: 0.82,
            historicalMatch: true,
            historicalConfidence: 'medium',
            deliveryChannels: [{ channel: 'discord', ok: true }],
            enrichedAt: '2026-03-12T20:05:30.000Z',
          },
          provenance: [
            {
              id: 'evt-critical-nvda-1',
              source: 'sec-edgar',
              title: 'NVDA export filing flags China exposure risk',
              receivedAt: '2026-03-12T20:05:00.000Z',
              url: 'https://example.com/sec/nvda-export-filing',
            },
            {
              id: 'evt-critical-nvda-2',
              source: 'pr-newswire',
              title: 'PR Newswire repeats NVIDIA China demand warning',
              receivedAt: '2026-03-12T20:06:00.000Z',
              url: 'https://example.com/pr/nvda-warning',
            },
            {
              id: 'evt-critical-nvda-3',
              source: 'reuters',
              title: 'Reuters confirms NVIDIA export demand pressure',
              receivedAt: '2026-03-12T20:08:00.000Z',
              url: 'https://example.com/reuters/nvda-pressure',
            },
          ],
        },
      });
    }

    if (url.pathname === '/api/events/evt-low-sample-pattern') {
      return jsonResponse({
        data: {
          ...LOW_SAMPLE_EVENT,
          sourceUrls: ['https://example.com/sec/nvda-export-filing'],
          provenance: [
            {
              id: 'evt-low-sample-pattern',
              source: 'sec-edgar',
              title: 'Semiconductor supplier update raises export questions',
              receivedAt: '2026-03-12T20:05:00.000Z',
              url: 'https://example.com/sec/nvda-export-filing',
            },
          ],
        },
      });
    }

    if (url.pathname === '/api/events/evt-neutral-regime-1') {
      return jsonResponse({
        data: {
          ...NEUTRAL_SIGNAL_EVENT,
          sourceUrls: ['https://example.com/fed/neutral-regime'],
          provenance: [
            {
              id: 'evt-neutral-regime-1',
              source: 'fed',
              title: 'Fed speaker keeps macro catalysts in balance',
              receivedAt: '2026-03-12T20:05:00.000Z',
              url: 'https://example.com/fed/neutral-regime',
            },
          ],
        },
      });
    }

    if (url.pathname === '/api/events/evt-awaiting-reaction-1') {
      return jsonResponse({
        data: {
          ...AWAITING_REACTION_EVENT,
          sourceUrls: ['https://example.com/company/awaiting-reaction'],
          provenance: [
            {
              id: 'evt-awaiting-reaction-1',
              source: 'sec-edgar',
              title: 'Company update lands before the open with no clear tape response',
              receivedAt: '2026-03-12T20:05:00.000Z',
              url: 'https://example.com/company/awaiting-reaction',
            },
          ],
        },
      });
    }

    if (url.pathname === '/api/events/evt-high-missing-analysis') {
      return jsonResponse({
        data: {
          ...MISSING_ANALYSIS_EVENT,
          rawPayload: {},
          sourceUrls: [],
          provenance: [
            {
              id: 'evt-high-missing-analysis',
              source: 'sec-edgar',
              title: 'Brief filing update arrives without usable analysis context',
              receivedAt: '2026-03-12T20:05:00.000Z',
              url: null,
            },
          ],
        },
      });
    }

    if (url.pathname === '/api/events/evt-critical-nvda-1/similar') {
      return jsonResponse({
        data: [
          {
            title: 'Prior NVDA export disclosure',
            receivedAt: '2026-02-14T14:30:00.000Z',
          },
          {
            title: 'Semiconductor filing highlights China demand risk',
            receivedAt: '2026-01-10T15:00:00.000Z',
          },
        ],
      });
    }

    if (url.pathname === '/api/events/evt-low-sample-pattern/similar') {
      return jsonResponse({
        data: [
          {
            title: 'Prior supplier warning tied to export licensing delays',
            receivedAt: '2026-02-02T14:30:00.000Z',
          },
          {
            title: 'Chip vendor discloses shipment uncertainty after policy shift',
            receivedAt: '2026-01-18T16:00:00.000Z',
          },
        ],
      });
    }

    if (url.pathname === '/api/events/evt-neutral-regime-1/similar') {
      return jsonResponse({ data: [] });
    }

    if (url.pathname === '/api/events/evt-awaiting-reaction-1/similar') {
      return jsonResponse({ data: [] });
    }

    if (url.pathname === '/api/events/evt-high-missing-analysis/similar') {
      return jsonResponse({ data: [] });
    }

    if (url.pathname === '/api/v1/scorecards/evt-critical-nvda-1') {
      return jsonResponse(SCORECARD);
    }

    if (url.pathname === '/api/events') {
      const ticker = url.searchParams.get('ticker');
      const q = url.searchParams.get('q');

      if (ticker === 'NVDA') {
        return jsonResponse({
          data: [
            FEED_EVENT,
            {
              ...FEED_EVENT,
              id: 'evt-medium-nvda-2',
              severity: 'MEDIUM',
              title: 'NVDA supplier update points to data-center demand',
              source: 'breaking-news',
              summary: 'Follow-on alert for Nvidia demand trends.',
              receivedAt: '2026-03-11T18:00:00.000Z',
              metadata: {
                ...FEED_EVENT.metadata,
                direction: 'bullish',
              },
            },
          ],
        });
      }

      if (ticker === 'OIL') {
        return jsonResponse({
          data: [{
            ...FEED_EVENT,
            id: 'evt-oil-ticker-1',
            title: 'OIL spikes on positioning',
            source: 'stocktwits',
            metadata: {
              ...FEED_EVENT.metadata,
              ticker: 'OIL',
              tickers: ['OIL'],
            },
          }],
          total: 1,
        });
      }

      if (q?.toLowerCase().includes('nvda')) {
        return jsonResponse({ data: [FEED_EVENT], total: 1 });
      }

      if (q?.toLowerCase().includes('oil')) {
        return jsonResponse({
          data: [{
            ...FEED_EVENT,
            id: 'evt-oil-text-1',
            title: 'Oil refiners jump after outage',
            summary: 'Text search result for oil',
            source: 'breaking-news',
            metadata: {
              ...FEED_EVENT.metadata,
              ticker: 'XOM',
              tickers: ['XOM'],
            },
          }],
          total: 1,
        });
      }

      if (q?.toLowerCase().includes('tesla')) {
        return jsonResponse({
          data: [{
            ...FEED_EVENT,
            id: 'evt-tsla-1',
            title: 'Tesla battery supply update',
            summary: 'Battery search match',
            metadata: {
              ...FEED_EVENT.metadata,
              ticker: 'TSLA',
              tickers: ['TSLA'],
            },
          }],
          total: 1,
        });
      }

      if (q?.toLowerCase().includes('earnings')) {
        return jsonResponse({
          data: [{
            ...FEED_EVENT,
            id: 'evt-earnings-1',
            title: 'Quarterly earnings beat expectations',
            summary: 'Strong earnings results reported.',
          }],
          total: 1,
        });
      }

      if (ticker || q) {
        return jsonResponse({ data: [], total: 0 });
      }
    }

    if (url.pathname === '/api/price/NVDA') {
      return jsonResponse({
        ticker: 'NVDA',
        range: url.searchParams.get('range') ?? '1m',
        candles: PRICE_CANDLES,
      });
    }

    // Ticker search endpoints
    if (url.pathname === '/api/tickers/search') {
      return jsonResponse({ data: [] });
    }

    if (url.pathname === '/api/tickers/trending') {
      return jsonResponse({ data: [] });
    }

    // Watchlist endpoints
    if (url.pathname === '/api/watchlist') {
      return jsonResponse({ data: [] });
    }

    // Sources endpoint
    if (url.pathname === '/api/events/sources') {
      return jsonResponse({ sources: ['sec-edgar', 'fed', 'breaking-news'] });
    }

    if (url.pathname === '/api/v1/scorecards/summary') {
      const days = url.searchParams.get('days');
      if (days === '90') {
        return jsonResponse(SCORECARD_SUMMARY_90D);
      }
      if (days === '30') {
        return jsonResponse({
          ...SCORECARD_SUMMARY_90D,
          days: 30,
          overview: {
            totalEvents: 8421,
            sourcesMonitored: 11,
            eventsWithTickers: 4186,
            eventsWithPriceOutcomes: 2194,
          },
          totals: {
            ...SCORECARD_SUMMARY_90D.totals,
            totalAlerts: 4186,
            alertsWithUsableVerdicts: 2194,
            directionalCorrectCount: 0,
            directionalHitRate: 0,
            setupWorkedCount: 1032,
            setupWorkedRate: 0.4704,
            avgT20Move: 6.8,
            medianT20Move: 5.4,
          },
        });
      }

      return jsonResponse(SCORECARD_SUMMARY_ALL);
    }

    if (url.pathname === '/api/v1/scorecards/severity-breakdown') {
      const days = url.searchParams.get('days');
      if (days === '30') {
        return jsonResponse([
          { severity: 'CRITICAL', count: 5 },
          { severity: 'HIGH', count: 12 },
          { severity: 'MEDIUM', count: 18 },
          { severity: 'LOW', count: 6 },
        ]);
      }

      return jsonResponse(SCORECARD_SEVERITY_BREAKDOWN_90D);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  }) as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
