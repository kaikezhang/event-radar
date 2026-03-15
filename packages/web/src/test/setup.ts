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
  totals: {
    totalAlerts: 124,
    alertsWithUsableVerdicts: 96,
    directionalCorrectCount: 65,
    directionalHitRate: 0.677,
    setupWorkedCount: 57,
    setupWorkedRate: 0.589,
    avgT5Move: 1.8,
    avgT20Move: 4.3,
    medianT20Move: 3.2,
  },
  actionBuckets: [
    {
      bucket: '🔴 High-Quality Setup',
      totalAlerts: 38,
      alertsWithUsableVerdicts: 34,
      directionalCorrectCount: 25,
      directionalHitRate: 0.735,
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
      directionalCorrectCount: 34,
      directionalHitRate: 0.7391,
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
      directionalCorrectCount: 17,
      directionalHitRate: 0.7083,
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
      directionalCorrectCount: 11,
      directionalHitRate: 0.7857,
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
  totals: {
    ...SCORECARD_SUMMARY_90D.totals,
    totalAlerts: 248,
    alertsWithUsableVerdicts: 202,
    directionalCorrectCount: 133,
    directionalHitRate: 0.6584,
    setupWorkedCount: 122,
    setupWorkedRate: 0.604,
    avgT5Move: 2.4,
    avgT20Move: 5.1,
    medianT20Move: 3.8,
  },
  sourceBuckets: [
    {
      bucket: 'sec-edgar',
      totalAlerts: 35,
      alertsWithUsableVerdicts: 30,
      directionalCorrectCount: 20,
      directionalHitRate: 0.6667,
      setupWorkedCount: 18,
      setupWorkedRate: 0.6,
      avgT5Move: -1.8,
      avgT20Move: -3.4,
      medianT20Move: -3.4,
    },
  ],
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

    if (url.pathname === '/api/v1/scorecards/summary') {
      const days = url.searchParams.get('days');
      if (days === '90') {
        return jsonResponse(SCORECARD_SUMMARY_90D);
      }
      if (days === '30') {
        return jsonResponse({
          ...SCORECARD_SUMMARY_90D,
          days: 30,
          totals: {
            ...SCORECARD_SUMMARY_90D.totals,
            totalAlerts: 41,
            alertsWithUsableVerdicts: 33,
            directionalCorrectCount: 24,
            directionalHitRate: 0.7273,
            setupWorkedCount: 20,
            setupWorkedRate: 0.6061,
            avgT20Move: 6.8,
            medianT20Move: 5.4,
          },
        });
      }

      return jsonResponse(SCORECARD_SUMMARY_ALL);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  }) as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
