import { describe, expect, it, vi } from 'vitest';
import { getEventDetail, searchEvents } from './api.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('searchEvents', () => {
  it('uses q search for text queries and defaults to 50 results', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
      expect(url.pathname).toBe('/api/events');
      expect(url.searchParams.get('q')).toBe('Tesla');
      expect(url.searchParams.get('limit')).toBe('50');
      return jsonResponse({
        data: [{
          id: 'evt-text-1',
          severity: 'HIGH',
          source: 'sec-edgar',
          title: 'Tesla battery supply update',
          summary: 'Battery search match',
          metadata: { ticker: 'TSLA', tickers: ['TSLA'] },
          receivedAt: '2026-03-16T12:00:00.000Z',
        }],
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const results = await searchEvents('Tesla');

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('Tesla battery supply update');
  });

  it('uses ticker search for uppercase ticker-like queries', async () => {
    const requests: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
      requests.push(`${url.pathname}?${url.searchParams.toString()}`);
      return jsonResponse({
        data: [{
          id: 'evt-ticker-1',
          severity: 'HIGH',
          source: 'sec-edgar',
          title: 'NVDA filing update',
          summary: 'Ticker match',
          metadata: { ticker: 'NVDA', tickers: ['NVDA'] },
          receivedAt: '2026-03-16T12:00:00.000Z',
        }],
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const results = await searchEvents('NVDA');

    expect(requests).toContain('/api/events?ticker=NVDA&limit=50');
    expect(results).toHaveLength(1);
    expect(results[0]?.tickers).toEqual(['NVDA']);
  });

  it('queries both ticker and full-text endpoints for ambiguous short uppercase input', async () => {
    const requests: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
      requests.push(`${url.pathname}?${url.searchParams.toString()}`);

      if (url.searchParams.get('ticker') === 'OIL') {
        return jsonResponse({
          data: [{
            id: 'evt-ambiguous-ticker',
            severity: 'MEDIUM',
            source: 'stocktwits',
            title: 'OIL spikes on positioning',
            summary: 'Ticker result',
            metadata: { ticker: 'OIL', tickers: ['OIL'] },
            receivedAt: '2026-03-16T12:00:00.000Z',
          }],
        });
      }

      if (url.searchParams.get('q') === 'OIL') {
        return jsonResponse({
          data: [{
            id: 'evt-ambiguous-text',
            severity: 'HIGH',
            source: 'breaking-news',
            title: 'Oil refiners jump after outage',
            summary: 'Text result',
            metadata: { ticker: 'XOM', tickers: ['XOM'] },
            receivedAt: '2026-03-16T12:01:00.000Z',
          }],
        });
      }

      return jsonResponse({ data: [] });
    });

    vi.stubGlobal('fetch', fetchMock);

    const results = await searchEvents('OIL');

    expect(requests).toContain('/api/events?ticker=OIL&limit=50');
    expect(requests).toContain('/api/events?q=OIL&limit=50');
    expect(results.map((result) => result.id)).toEqual(['evt-ambiguous-ticker', 'evt-ambiguous-text']);
  });

  it('deduplicates merged ticker and text results by title and source', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
      return jsonResponse({
        data: [{
          id: url.searchParams.get('ticker') ? 'evt-duplicate-ticker' : 'evt-duplicate-text',
          severity: 'HIGH',
          source: 'sec-edgar',
          title: 'META ad checks improve',
          summary: 'Duplicate result',
          metadata: { ticker: 'META', tickers: ['META'] },
          receivedAt: '2026-03-16T12:00:00.000Z',
        }],
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const results = await searchEvents('META');

    expect(results).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('getEventDetail historical pattern mapping', () => {
  it('maps delivery-style historical_context data into web detail fields', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/events/evt-historical-1') {
        return jsonResponse({
          data: {
            id: 'evt-historical-1',
            severity: 'HIGH',
            source: 'sec-edgar',
            title: 'AI hardware demand accelerates',
            summary: 'Historical context should be mapped from metadata.',
            metadata: {
              ticker: 'NVDA',
              tickers: ['NVDA'],
              historical_context: {
                patternSummary: 'Technology earnings beat in correction market',
                confidence: 'medium',
                matchCount: 18,
                avgAlphaT5: 0.034,
                avgAlphaT20: 0.12,
                winRateT20: 68,
                bestCase: {
                  ticker: 'SMCI',
                  alphaT20: 0.41,
                  headline: 'Server demand upside surprise',
                },
                worstCase: {
                  ticker: 'AMD',
                  alphaT20: -0.18,
                  headline: 'Margin guide reset',
                },
                topMatches: [
                  {
                    ticker: 'SMCI',
                    headline: 'Server demand upside surprise',
                    eventDate: '2025-01-15T14:30:00.000Z',
                    alphaT20: 0.27,
                    score: 0.83,
                  },
                ],
              },
            },
            sourceUrls: ['https://example.com/source'],
          },
        });
      }

      if (url.pathname === '/api/events/evt-historical-1/similar') {
        return jsonResponse({ data: [] });
      }

      throw new Error(`Unexpected URL: ${url.pathname}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const detail = await getEventDetail('evt-historical-1');

    expect(detail?.historicalPattern.patternSummary).toBe('Technology earnings beat in correction market');
    expect(detail?.historicalPattern.avgMoveT5).toBe(3.4);
    expect(detail?.historicalPattern.avgMoveT20).toBe(12);
    expect(detail?.historicalPattern.winRate).toBe(68);
    expect(detail?.historicalPattern.bestCase).toEqual({ ticker: 'SMCI', move: 41 });
    expect(detail?.historicalPattern.worstCase).toEqual({ ticker: 'AMD', move: -18 });
  });

  it('builds similar events from topMatches when the metadata has no preformatted similarEvents array', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/events/evt-historical-2') {
        return jsonResponse({
          data: {
            id: 'evt-historical-2',
            severity: 'MEDIUM',
            source: 'pr-newswire',
            title: 'Industrial demand check',
            summary: 'Mapped from top matches.',
            metadata: {
              ticker: 'CAT',
              tickers: ['CAT'],
              historical_context: {
                patternSummary: 'Industrial backlog acceleration',
                confidence: 'high',
                matchCount: 9,
                avgAlphaT5: 0.011,
                avgAlphaT20: 0.056,
                winRateT20: 71,
                topMatches: [
                  {
                    ticker: 'DE',
                    headline: 'Machinery orders reaccelerate',
                    eventDate: '2025-02-10T15:00:00.000Z',
                    alphaT20: 0.144,
                    score: 0.77,
                  },
                ],
              },
            },
          },
        });
      }

      if (url.pathname === '/api/events/evt-historical-2/similar') {
        return jsonResponse({ data: [] });
      }

      throw new Error(`Unexpected URL: ${url.pathname}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const detail = await getEventDetail('evt-historical-2');

    expect(detail?.historicalPattern.similarEvents).toEqual([
      {
        title: 'Machinery orders reaccelerate',
        date: '2025-02-10T15:00:00.000Z',
        move: '+14.4%',
      },
    ]);
  });

  it('falls back to historicalPattern from the API response when metadata lacks historical context', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/events/evt-historical-3') {
        return jsonResponse({
          data: {
            id: 'evt-historical-3',
            severity: 'HIGH',
            source: 'fed',
            title: 'Rate cut odds reset',
            summary: 'Fallback response shape.',
            metadata: {
              ticker: 'SPY',
              tickers: ['SPY'],
            },
            historicalPattern: {
              matchCount: 7,
              confidence: 'high',
              avgMoveT5: 1.8,
              avgMoveT20: 5.6,
              winRate: 71,
              similarEvents: [
                {
                  title: 'Prior dovish repricing',
                  date: '2025-11-01T13:30:00.000Z',
                  move: '+5.1%',
                },
              ],
            },
          },
        });
      }

      if (url.pathname === '/api/events/evt-historical-3/similar') {
        return jsonResponse({ data: [] });
      }

      throw new Error(`Unexpected URL: ${url.pathname}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const detail = await getEventDetail('evt-historical-3');

    expect(detail?.historicalPattern).toEqual({
      matchCount: 7,
      confidence: 'high',
      avgMoveT5: 1.8,
      avgMoveT20: 5.6,
      winRate: 71,
      similarEvents: [
        {
          title: 'Prior dovish repricing',
          date: '2025-11-01T13:30:00.000Z',
          move: '+5.1%',
        },
      ],
      patternSummary: undefined,
      bestCase: null,
      worstCase: null,
    });
  });

  it('maps marketData from the event detail response', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/events/evt-market-data-1') {
        return jsonResponse({
          data: {
            id: 'evt-market-data-1',
            severity: 'HIGH',
            source: 'sec-edgar',
            title: 'Price context event',
            summary: 'Market data should be mapped.',
            metadata: {
              ticker: 'GOOG',
              tickers: ['GOOG'],
            },
            marketData: {
              price: 178.42,
              change1d: 2.3,
              change5d: 6.1,
              rsi14: 54,
              volumeRatio: 1.8,
            },
          },
        });
      }

      if (url.pathname === '/api/events/evt-market-data-1/similar') {
        return jsonResponse({ data: [] });
      }

      throw new Error(`Unexpected URL: ${url.pathname}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const detail = await getEventDetail('evt-market-data-1');

    expect(detail?.marketData).toEqual({
      price: 178.42,
      change1d: 2.3,
      change5d: 6.1,
      rsi14: 54,
      volumeRatio: 1.8,
    });
  });

  it('maps currentSetup and historicalContext into enrichment fields', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/events/evt-enrichment-1') {
        return jsonResponse({
          data: {
            id: 'evt-enrichment-1',
            severity: 'MEDIUM',
            source: 'reuters',
            title: 'Signal context event',
            summary: 'Signal context should be preserved.',
            metadata: {
              ticker: 'SPY',
              tickers: ['SPY'],
              llm_enrichment: {
                summary: 'Summary',
                impact: 'Impact',
                action: '🟡 Monitor',
                currentSetup: 'Breadth is deteriorating while headline sensitivity is rising.',
                historicalContext: 'Prior policy shocks saw weaker follow-through after day one.',
                regimeContext: 'Risk-off tape is amplifying macro surprises.',
                tickers: [{ symbol: 'SPY', direction: 'neutral' }],
              },
            },
          },
        });
      }

      if (url.pathname === '/api/events/evt-enrichment-1/similar') {
        return jsonResponse({ data: [] });
      }

      throw new Error(`Unexpected URL: ${url.pathname}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const detail = await getEventDetail('evt-enrichment-1');

    expect(detail?.enrichment?.currentSetup).toBe(
      'Breadth is deteriorating while headline sensitivity is rising.',
    );
    expect(detail?.enrichment?.historicalContext).toBe(
      'Prior policy shocks saw weaker follow-through after day one.',
    );
  });
});
