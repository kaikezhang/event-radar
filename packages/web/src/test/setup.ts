import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';

const FEED_EVENT = {
  id: 'evt-critical-nvda-1',
  severity: 'HIGH',
  source: 'sec-edgar',
  title: 'NVDA export filing flags China exposure risk',
  summary: 'NVIDIA Corporation flagged heightened export exposure tied to China demand.',
  tickers: ['NVDA'],
  time: '2026-03-12T20:05:00.000Z',
  receivedAt: '2026-03-12T20:05:00.000Z',
  metadata: {
    tickers: ['NVDA'],
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    direction: 'bearish',
    url: 'https://example.com/sec/nvda-export-filing',
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
      'Original action label: Fade the headline.',
      'Confidence bucket: high.',
    ],
    verdictWindow: 'T+20',
  },
};

const SCORECARD_SUMMARY = {
  days: null,
  totals: {
    totalAlerts: 12,
    alertsWithUsableVerdicts: 8,
    directionalCorrectCount: 5,
    directionalHitRate: 0.625,
    setupWorkedCount: 6,
    setupWorkedRate: 0.75,
    avgT5Move: 1.2,
    avgT20Move: 2.8,
    medianT20Move: 2.1,
  },
  actionBuckets: [],
  confidenceBuckets: [],
  sourceBuckets: [
    {
      bucket: 'sec-edgar',
      totalAlerts: 4,
      alertsWithUsableVerdicts: 3,
      directionalCorrectCount: 2,
      directionalHitRate: 0.6667,
      setupWorkedCount: 2,
      setupWorkedRate: 0.6667,
      avgT5Move: -1.8,
      avgT20Move: -3.4,
      medianT20Move: -3.4,
    },
  ],
  eventTypeBuckets: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

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
          sourceUrls: ['https://example.com/sec/nvda-export-filing'],
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

    if (url.pathname === '/api/v1/scorecards/evt-critical-nvda-1') {
      return jsonResponse(SCORECARD);
    }

    if (url.pathname === '/api/v1/scorecards/summary') {
      return jsonResponse(SCORECARD_SUMMARY);
    }

    if (url.pathname === '/api/events' && url.searchParams.get('ticker') === 'NVDA') {
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

    if (url.pathname === '/api/price/NVDA') {
      return jsonResponse({
        ticker: 'NVDA',
        range: url.searchParams.get('range') ?? '1m',
        candles: PRICE_CANDLES,
      });
    }

    // Search endpoint
    if (url.pathname === '/api/events/search') {
      const q = url.searchParams.get('q') ?? '';
      if (q.toLowerCase().includes('nvda') || q === 'NVDA') {
        return jsonResponse({ data: [FEED_EVENT], total: 1 });
      }
      if (q.toLowerCase().includes('earnings')) {
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
      return jsonResponse({ data: [], total: 0 });
    }

    // Watchlist endpoints
    if (url.pathname === '/api/watchlist') {
      return jsonResponse({ data: [] });
    }

    // Sources endpoint
    if (url.pathname === '/api/events/sources') {
      return jsonResponse({ sources: ['sec-edgar', 'fed', 'breaking-news'] });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  }) as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
