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
          },
        ],
      });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  }) as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
