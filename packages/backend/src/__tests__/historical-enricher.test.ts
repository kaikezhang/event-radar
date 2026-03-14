import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmClassificationResult, RawEvent } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { resetMetrics } from '../metrics.js';
import type { MarketContextCache } from '../services/market-context-cache.js';

vi.mock('../services/similarity.js', () => ({
  findSimilarEvents: vi.fn(),
}));

vi.mock('../services/outcome-similarity.js', () => ({
  findSimilarFromOutcomes: vi.fn(),
}));

import { findSimilarEvents } from '../services/similarity.js';
import { findSimilarFromOutcomes } from '../services/outcome-similarity.js';
import {
  HistoricalEnricher,
  generatePatternSummary,
} from '../pipeline/historical-enricher.js';
import {
  mapEventToSimilarityQuery,
  resetSectorCacheForTests,
} from '../pipeline/event-type-mapper.js';

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source: 'sec-edgar',
    type: '8-K',
    title: '8-K departure filing',
    body: 'Board announced a CEO departure.',
    timestamp: new Date('2026-03-10T14:00:00.000Z'),
    metadata: {
      ticker: 'AAPL',
      item_types: ['5.02'],
    },
    ...overrides,
  };
}

function makeLlmResult(
  overrides: Partial<LlmClassificationResult> = {},
): LlmClassificationResult {
  return {
    severity: 'HIGH',
    direction: 'BULLISH',
    eventType: 'news_breaking',
    confidence: 0.92,
    reasoning: 'earnings beat',
    tags: [],
    priority: 88,
    matchedRules: [],
    ...overrides,
  };
}

function makeMarketCache(): MarketContextCache {
  return {
    get: vi.fn(() => ({
      vixLevel: 18,
      spyClose: 510,
      spy50ma: 500,
      spy200ma: 470,
      marketRegime: 'bull',
      updatedAt: new Date('2026-03-10T14:05:00.000Z'),
    })),
  } as unknown as MarketContextCache;
}

function makeMockDb(sector = 'Technology'): Database {
  const where = vi.fn().mockResolvedValue(
    sector.length > 0 ? [{ ticker: 'AAPL', sector }] : [],
  );
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  const select = vi.fn(() => ({ from }));

  return { select } as unknown as Database;
}

describe('mapEventToSimilarityQuery', () => {
  it('maps SEC EDGAR item 5.02 to sec_form_8k while preserving the filing item as subtype', () => {
    const mapped = mapEventToSimilarityQuery(makeEvent());

    expect(mapped).toMatchObject({
      eventType: 'sec_form_8k',
      eventSubtype: '5.02',
      ticker: 'AAPL',
    });
  });

  it('maps earnings scanner events to earnings_beat with surprise context', () => {
    const mapped = mapEventToSimilarityQuery(
      makeEvent({
        source: 'earnings',
        type: 'earnings_beat',
        title: 'AAPL Q1 earnings beat expectations',
        metadata: {
          ticker: 'AAPL',
          surprise_type: 'beat',
          surprise_pct: 12.5,
          consecutive_beats: 4,
        },
      }),
    );

    expect(mapped).toMatchObject({
      eventType: 'earnings_beat',
      ticker: 'AAPL',
      epsSurprisePct: 12.5,
      consecutiveBeats: 4,
    });
  });

  it('maps breaking news earnings events from LLM context and extracts a ticker from the title', () => {
    const mapped = mapEventToSimilarityQuery(
      makeEvent({
        source: 'breaking-news',
        title: 'Apple ($AAPL) beats earnings expectations and raises guidance',
        metadata: {},
      }),
      makeLlmResult({ eventType: 'earnings_beat' }),
    );

    expect(mapped).toMatchObject({
      eventType: 'earnings_beat',
      ticker: 'AAPL',
    });
  });

  it('maps FDA events to fda_approval using action metadata', () => {
    const mapped = mapEventToSimilarityQuery(
      makeEvent({
        source: 'fda',
        type: 'fda_approval',
        metadata: {
          ticker: 'MRK',
          action_type: 'approval',
        },
      }),
    );

    expect(mapped).toMatchObject({
      eventType: 'fda_approval',
      ticker: 'MRK',
    });
  });

  it('maps Congress trade events to insider_large_trade', () => {
    const mapped = mapEventToSimilarityQuery(
      makeEvent({
        source: 'congress',
        type: 'insider_large_trade',
        metadata: {
          ticker: 'NVDA',
          trade_type: 'buy',
        },
      }),
    );

    expect(mapped).toMatchObject({
      eventType: 'insider_large_trade',
      ticker: 'NVDA',
    });
  });

  it('maps White House events to executive_order', () => {
    const mapped = mapEventToSimilarityQuery(
      makeEvent({
        source: 'whitehouse',
        type: 'executive_order',
        metadata: {
          executive_order_number: '14250',
        },
      }),
    );

    expect(mapped).toMatchObject({
      eventType: 'executive_order',
    });
  });

  it('skips stocktwits events because there is no historical analog yet', () => {
    const mapped = mapEventToSimilarityQuery(
      makeEvent({ source: 'stocktwits', metadata: { ticker: 'AAPL' } }),
    );

    expect(mapped).toBeNull();
  });
});

describe('HistoricalEnricher', () => {
  const similarityMock = vi.mocked(findSimilarEvents);
  const outcomeSimilarityMock = vi.mocked(findSimilarFromOutcomes);
  const tickerMarketContext = {
    price: 182.45,
    change1d: 1.25,
    change5d: 4.5,
    change20d: 12.75,
    volumeRatio: 1.8,
    rsi14: 63.2,
    high52w: 199.5,
    low52w: 145.1,
    support: 175,
    resistance: 188,
  };

  beforeEach(() => {
    similarityMock.mockReset();
    outcomeSimilarityMock.mockReset();
    resetMetrics();
    resetSectorCacheForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes per-ticker market context when a ticker is available and the cache returns data', async () => {
    outcomeSimilarityMock.mockResolvedValue([]);
    similarityMock.mockResolvedValue({
      confidence: 'low',
      totalCandidates: 10,
      stats: {
        count: 10,
        avgReturnT1: 0.01,
        avgReturnT5: 0.03,
        avgReturnT20: 0.05,
        avgAlphaT1: 0.005,
        avgAlphaT5: 0.02,
        avgAlphaT20: 0.06,
        winRateT20: 60,
        medianAlphaT20: 0.05,
        bestCase: null,
        worstCase: null,
      },
      events: [],
    });
    const marketDataCache = {
      getOrFetch: vi.fn().mockResolvedValue(tickerMarketContext),
    };

    const enricher = new HistoricalEnricher(
      makeMockDb(),
      makeMarketCache(),
      {
        enabled: true,
        marketDataCache,
      },
    );

    const context = await enricher.enrich(makeEvent(), makeLlmResult());

    expect(marketDataCache.getOrFetch).toHaveBeenCalledWith('AAPL');
    expect(context).toMatchObject({
      marketContext: tickerMarketContext,
    });
  });

  it('uses the primary ticker from metadata arrays when ticker is not set directly', async () => {
    outcomeSimilarityMock.mockResolvedValue([]);
    similarityMock.mockResolvedValue({
      confidence: 'low',
      totalCandidates: 10,
      stats: {
        count: 10,
        avgReturnT1: 0.01,
        avgReturnT5: 0.03,
        avgReturnT20: 0.05,
        avgAlphaT1: 0.005,
        avgAlphaT5: 0.02,
        avgAlphaT20: 0.06,
        winRateT20: 60,
        medianAlphaT20: 0.05,
        bestCase: null,
        worstCase: null,
      },
      events: [],
    });
    const marketDataCache = {
      getOrFetch: vi.fn().mockResolvedValue(tickerMarketContext),
    };

    const enricher = new HistoricalEnricher(
      makeMockDb(''),
      makeMarketCache(),
      { marketDataCache },
    );

    await enricher.enrich(
      makeEvent({
        title: 'Company update without explicit single ticker',
        body: 'No clear ticker in text.',
        metadata: {
          primary_ticker: 'msft',
          tickers: ['msft', 'aapl'],
          item_types: ['5.02'],
        },
      }),
      makeLlmResult(),
    );

    expect(marketDataCache.getOrFetch).toHaveBeenCalledWith('MSFT');
  });

  it('stays successful when ticker market context lookup fails', async () => {
    outcomeSimilarityMock.mockResolvedValue([]);
    similarityMock.mockResolvedValue({
      confidence: 'low',
      totalCandidates: 10,
      stats: {
        count: 10,
        avgReturnT1: 0.01,
        avgReturnT5: 0.03,
        avgReturnT20: 0.05,
        avgAlphaT1: 0.005,
        avgAlphaT5: 0.02,
        avgAlphaT20: 0.06,
        winRateT20: 60,
        medianAlphaT20: 0.05,
        bestCase: null,
        worstCase: null,
      },
      events: [],
    });
    const marketDataCache = {
      getOrFetch: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    };

    const enricher = new HistoricalEnricher(
      makeMockDb(),
      makeMarketCache(),
      { marketDataCache },
    );

    const context = await enricher.enrich(makeEvent(), makeLlmResult());

    expect(context).not.toBeNull();
    expect(context).not.toHaveProperty('marketContext');
  });

  it('does not try to load per-ticker market context when no ticker is available', async () => {
    outcomeSimilarityMock.mockResolvedValue([]);
    similarityMock.mockResolvedValue({
      confidence: 'low',
      totalCandidates: 10,
      stats: {
        count: 10,
        avgReturnT1: 0.01,
        avgReturnT5: 0.03,
        avgReturnT20: 0.05,
        avgAlphaT1: 0.005,
        avgAlphaT5: 0.02,
        avgAlphaT20: 0.06,
        winRateT20: 60,
        medianAlphaT20: 0.05,
        bestCase: null,
        worstCase: null,
      },
      events: [],
    });
    const marketDataCache = {
      getOrFetch: vi.fn(),
    };

    const enricher = new HistoricalEnricher(
      makeMockDb(''),
      makeMarketCache(),
      { marketDataCache },
    );

    const context = await enricher.enrich(
      makeEvent({
        title: '8-K departure filing without ticker metadata',
        body: 'Board announced a CEO departure.',
        metadata: {
          item_types: ['5.02'],
        },
      }),
      makeLlmResult(),
    );

    expect(context).not.toBeNull();
    expect(marketDataCache.getOrFetch).not.toHaveBeenCalled();
    expect(context).not.toHaveProperty('marketContext');
  });

  it('builds a similarity query with market and sector context and returns historical context', async () => {
    outcomeSimilarityMock.mockResolvedValue([]);
    similarityMock.mockResolvedValue({
      confidence: 'high',
      totalCandidates: 30,
      stats: {
        count: 30,
        avgReturnT1: 0.01,
        avgReturnT5: 0.03,
        avgReturnT20: 0.06,
        avgAlphaT1: 0.005,
        avgAlphaT5: 0.024,
        avgAlphaT20: 0.083,
        winRateT20: 62,
        medianAlphaT20: 0.071,
        bestCase: {
          ticker: 'NVDA',
          alphaT20: 0.22,
          headline: 'Nvidia beat and raised guidance',
        },
        worstCase: {
          ticker: 'INTC',
          alphaT20: -0.12,
          headline: 'Intel beat but guided down',
        },
      },
      events: [
        {
          eventId: '1',
          ticker: 'NVDA',
          headline: 'Nvidia beat and raised guidance',
          eventDate: '2025-02-21T21:00:00.000Z',
          score: 11,
          scoreBreakdown: {},
          returnT1: 0.04,
          returnT5: 0.08,
          returnT20: 0.18,
          alphaT1: 0.02,
          alphaT5: 0.05,
          alphaT20: 0.16,
        },
      ],
    });

    const enricher = new HistoricalEnricher(
      makeMockDb(),
      makeMarketCache(),
      { enabled: true, minConfidence: 'low', timeoutMs: 2_000 },
    );

    const context = await enricher.enrich(
      makeEvent({
        source: 'earnings',
        type: 'earnings_beat',
        title: 'AAPL Q1 earnings beat expectations',
        metadata: {
          ticker: 'AAPL',
          surprise_type: 'beat',
          surprise_pct: 12.5,
          consecutive_beats: 4,
        },
      }),
      makeLlmResult(),
    );

    expect(similarityMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'earnings_beat',
        ticker: 'AAPL',
        sector: 'Technology',
        severity: 'high',
        vixLevel: 18,
        marketRegime: 'bull',
        epsSurprisePct: 12.5,
        consecutiveBeats: 4,
      }),
    );
    expect(context).toMatchObject({
      avgAlphaT5: 0.024,
      avgAlphaT20: 0.083,
      winRateT20: 62,
      medianAlphaT20: 0.071,
    });
    expect(context?.patternSummary).toContain(
      'Technology earnings beat in bull market',
    );
  });

  it('queries both the earnings taxonomy and SEC filing fallback for breaking-news earnings events', async () => {
    outcomeSimilarityMock.mockResolvedValue([]);
    similarityMock
      .mockResolvedValueOnce({
        confidence: 'low',
        totalCandidates: 3,
        stats: {
          count: 3,
          avgReturnT1: 0,
          avgReturnT5: 0.01,
          avgReturnT20: 0.02,
          avgAlphaT1: 0,
          avgAlphaT5: 0.01,
          avgAlphaT20: 0.03,
          winRateT20: 55,
          medianAlphaT20: 0.025,
          bestCase: null,
          worstCase: null,
        },
        events: [],
      })
      .mockResolvedValueOnce({
        confidence: 'low',
        totalCandidates: 10,
        stats: {
          count: 10,
          avgReturnT1: 0.01,
          avgReturnT5: 0.04,
          avgReturnT20: 0.09,
          avgAlphaT1: 0.005,
          avgAlphaT5: 0.03,
          avgAlphaT20: 0.08,
          winRateT20: 66,
          medianAlphaT20: 0.07,
          bestCase: null,
          worstCase: null,
        },
        events: [],
      });

    const enricher = new HistoricalEnricher(makeMockDb(), makeMarketCache());
    const context = await enricher.enrich(
      makeEvent({
        source: 'breaking-news',
        title: 'Apple ($AAPL) beats earnings expectations',
        metadata: {},
      }),
      makeLlmResult({ eventType: 'earnings_beat' }),
    );

    expect(similarityMock).toHaveBeenCalledTimes(2);
    expect(similarityMock.mock.calls[0]?.[1]).toMatchObject({
      eventType: 'earnings_beat',
    });
    expect(similarityMock.mock.calls[1]?.[1]).toMatchObject({
      eventType: 'sec_form_8k',
    });
    expect(context).not.toBeNull();
  });

  it('uses event_outcomes first and skips the historical fallback when enough strong matches exist', async () => {
    outcomeSimilarityMock.mockResolvedValue([
      {
        eventId: 'event-1',
        ticker: 'AAPL',
        title: 'Apple launches AI server platform',
        source: 'stocktwits',
        severity: 'high',
        eventTime: '2026-03-10T12:00:00.000Z',
        eventPrice: 100,
        change1h: 0.01,
        change1d: 0.08,
        changeT5: 0.12,
        changeT20: 0.24,
        change1w: 0.12,
        change1m: 0.2,
        score: 0.9,
      },
      {
        eventId: 'event-2',
        ticker: 'AAPL',
        title: 'Apple expands AI server rollout',
        source: 'breaking-news',
        severity: 'high',
        eventTime: '2026-03-08T12:00:00.000Z',
        eventPrice: 98,
        change1h: 0.01,
        change1d: 0.04,
        changeT5: 0.1,
        changeT20: 0.18,
        change1w: 0.1,
        change1m: 0.18,
        score: 0.72,
      },
      ...Array.from({ length: 8 }, (_, index) => ({
        eventId: `event-extra-${index + 3}`,
        ticker: 'AAPL',
        title: `Apple AI server analog ${index + 3}`,
        source: 'breaking-news',
        severity: 'high',
        eventTime: `2026-03-0${(index % 7) + 1}T12:00:00.000Z`,
        eventPrice: 97 - index,
        change1h: 0.01,
        change1d: 0.05,
        changeT5: 0.11,
        changeT20: 0.2,
        change1w: 0.11,
        change1m: 0.19,
        score: 0.7 - index * 0.01,
      })),
    ]);

    const enricher = new HistoricalEnricher(makeMockDb(), makeMarketCache());
    const context = await enricher.enrich(
      makeEvent({
        source: 'stocktwits',
        title: 'Apple AI server demand is accelerating',
        body: 'Momentum remains strong.',
        metadata: { ticker: 'AAPL' },
      }),
      makeLlmResult({ severity: 'HIGH' }),
    );

    expect(outcomeSimilarityMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ticker: 'AAPL',
        source: 'stocktwits',
        severity: 'high',
        excludeEventId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    );
    expect(similarityMock).not.toHaveBeenCalled();
    expect(context).toMatchObject({
      topMatches: expect.arrayContaining([
        expect.objectContaining({
          headline: 'Apple launches AI server platform',
          source: 'stocktwits',
          alphaT20: 0.24,
        }),
      ]),
      similarEvents: expect.arrayContaining([
        expect.objectContaining({
          title: 'Apple launches AI server platform',
          ticker: 'AAPL',
          change1d: 0.08,
          change1w: 0.12,
        }),
      ]),
    });
  });

  it('extracts focused title keywords for outcome similarity queries', async () => {
    outcomeSimilarityMock.mockResolvedValue([]);
    similarityMock.mockResolvedValue({
      confidence: 'insufficient',
      totalCandidates: 0,
      stats: {
        count: 0,
        avgReturnT1: 0,
        avgReturnT5: 0,
        avgReturnT20: 0,
        avgAlphaT1: 0,
        avgAlphaT5: 0,
        avgAlphaT20: 0,
        winRateT20: 0,
        medianAlphaT20: 0,
        bestCase: null,
        worstCase: null,
      },
      events: [],
    });

    const enricher = new HistoricalEnricher(makeMockDb(), makeMarketCache());
    await enricher.enrich(
      makeEvent({
        source: 'breaking-news',
        title: 'META announces massive layoffs: 20,000 jobs cut in restructuring',
        body: 'Management says costs will be reduced.',
        metadata: { ticker: 'META' },
      }),
      makeLlmResult({ severity: 'HIGH' }),
    );

    expect(outcomeSimilarityMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ticker: 'META',
        titleKeywords: ['layoffs', 'jobs', 'cut', 'restructuring'],
      }),
    );
  });

  it('filters outcome matches below the display threshold and includes source on top matches', async () => {
    outcomeSimilarityMock.mockResolvedValue([
      {
        eventId: 'event-1',
        ticker: 'META',
        title: 'Meta cuts 20000 jobs in restructuring',
        source: 'breaking-news',
        severity: 'high',
        eventTime: '2026-03-10T12:00:00.000Z',
        eventPrice: 210,
        change1h: 0.01,
        change1d: 0.08,
        changeT5: 0.16,
        changeT20: 0.28,
        change1w: 0.14,
        change1m: 0.22,
        score: 0.82,
      },
      {
        eventId: 'event-2',
        ticker: 'META',
        title: 'Meta begins workforce restructuring',
        source: 'sec-edgar',
        severity: 'high',
        eventTime: '2026-03-08T12:00:00.000Z',
        eventPrice: 205,
        change1h: 0.01,
        change1d: 0.06,
        changeT5: 0.12,
        changeT20: 0.21,
        change1w: 0.1,
        change1m: 0.19,
        score: 0.4,
      },
      {
        eventId: 'event-3',
        ticker: 'META',
        title: 'Meta chatter spikes on layoffs rumor',
        source: 'stocktwits',
        severity: 'medium',
        eventTime: '2026-03-09T12:00:00.000Z',
        eventPrice: 202,
        change1h: 0,
        change1d: 0.01,
        changeT5: 0.03,
        changeT20: 0.05,
        change1w: 0.02,
        change1m: 0.03,
        score: 0.39,
      },
      ...Array.from({ length: 8 }, (_, index) => ({
        eventId: `event-extra-${index + 4}`,
        ticker: 'META',
        title: `Meta restructuring analog ${index + 4}`,
        source: 'breaking-news',
        severity: 'high',
        eventTime: `2026-03-0${(index % 7) + 1}T10:00:00.000Z`,
        eventPrice: 200 - index,
        change1h: 0.01,
        change1d: 0.07,
        changeT5: 0.14,
        changeT20: 0.24,
        change1w: 0.12,
        change1m: 0.2,
        score: 0.7 - index * 0.01,
      })),
    ]);

    const enricher = new HistoricalEnricher(makeMockDb(), makeMarketCache());
    const context = await enricher.enrich(
      makeEvent({
        source: 'breaking-news',
        title: 'META announces layoffs and restructuring',
        metadata: { ticker: 'META' },
      }),
      makeLlmResult({ severity: 'HIGH' }),
    );

    expect(similarityMock).not.toHaveBeenCalled();
    expect(context).toMatchObject({
      similarEvents: expect.arrayContaining([
        expect.objectContaining({ title: 'Meta cuts 20000 jobs in restructuring' }),
        expect.objectContaining({ title: 'Meta begins workforce restructuring' }),
      ]),
      topMatches: expect.arrayContaining([
        expect.objectContaining({
          ticker: 'META',
          headline: 'Meta cuts 20000 jobs in restructuring',
          source: 'breaking-news',
        }),
        expect.objectContaining({
          ticker: 'META',
          headline: 'Meta begins workforce restructuring',
          source: 'sec-edgar',
        }),
      ]),
    });
  });

  it('returns null when all outcome matches fall below the minimum display threshold', async () => {
    outcomeSimilarityMock.mockResolvedValue([
      {
        eventId: 'event-1',
        ticker: 'AAPL',
        title: 'Weak stocktwits analog',
        source: 'stocktwits',
        severity: 'medium',
        eventTime: '2026-03-10T12:00:00.000Z',
        eventPrice: 100,
        change1h: 0,
        change1d: 0,
        changeT5: 0,
        changeT20: 0,
        change1w: 0,
        change1m: 0,
        score: 0.39,
      },
      {
        eventId: 'event-2',
        ticker: 'AAPL',
        title: 'Another weak stocktwits analog',
        source: 'stocktwits',
        severity: 'medium',
        eventTime: '2026-03-09T12:00:00.000Z',
        eventPrice: 100,
        change1h: 0,
        change1d: 0,
        changeT5: 0,
        changeT20: 0,
        change1w: 0,
        change1m: 0,
        score: 0.15,
      },
    ]);

    const enricher = new HistoricalEnricher(makeMockDb(), makeMarketCache());
    const context = await enricher.enrich(
      makeEvent({
        source: 'stocktwits',
        title: 'Random Apple chatter',
        metadata: { ticker: 'AAPL' },
      }),
      makeLlmResult(),
    );

    expect(context).toBeNull();
    expect(similarityMock).not.toHaveBeenCalled();
  });

  it('falls back to historical_events when outcomes do not produce enough strong matches', async () => {
    outcomeSimilarityMock.mockResolvedValue([
      {
        eventId: 'event-1',
        ticker: 'AAPL',
        title: 'Weak analog',
        source: 'earnings',
        severity: 'high',
        eventTime: '2026-03-10T12:00:00.000Z',
        eventPrice: 100,
        change1h: 0,
        change1d: 0.01,
        changeT5: 0.04,
        changeT20: 0.08,
        change1w: 0.02,
        change1m: 0.03,
        score: 0.29,
      },
    ]);
    similarityMock.mockResolvedValue({
      confidence: 'low',
      totalCandidates: 10,
      stats: {
        count: 10,
        avgReturnT1: 0.01,
        avgReturnT5: 0.03,
        avgReturnT20: 0.05,
        avgAlphaT1: 0.005,
        avgAlphaT5: 0.02,
        avgAlphaT20: 0.06,
        winRateT20: 60,
        medianAlphaT20: 0.05,
        bestCase: null,
        worstCase: null,
      },
      events: [],
    });

    const enricher = new HistoricalEnricher(makeMockDb(), makeMarketCache());
    const context = await enricher.enrich(
      makeEvent({
        source: 'earnings',
        type: 'earnings-result',
        title: 'AAPL beats earnings expectations',
        metadata: {
          ticker: 'AAPL',
          surprise_type: 'beat',
        },
      }),
      makeLlmResult({ eventType: 'earnings_beat' }),
    );

    expect(outcomeSimilarityMock).toHaveBeenCalledOnce();
    expect(similarityMock).toHaveBeenCalledOnce();
    expect(context?.avgAlphaT20).toBe(0.06);
    expect(context?.avgChange1d).toBe(0.01);
    expect(context?.avgChange1w).toBe(0.03);
  });

  it('returns null for skipped sources when outcome similarity also has no viable matches', async () => {
    outcomeSimilarityMock.mockResolvedValue([
      {
        eventId: 'event-1',
        ticker: 'AAPL',
        title: 'Weak stocktwits analog',
        source: 'stocktwits',
        severity: 'medium',
        eventTime: '2026-03-10T12:00:00.000Z',
        eventPrice: 100,
        change1h: 0,
        change1d: 0,
        change1w: 0,
        change1m: 0,
        score: 0.2,
      },
    ]);

    const enricher = new HistoricalEnricher(makeMockDb(), makeMarketCache());
    const context = await enricher.enrich(
      makeEvent({
        source: 'stocktwits',
        title: 'Random Apple chatter',
        metadata: { ticker: 'AAPL' },
      }),
      makeLlmResult(),
    );

    expect(outcomeSimilarityMock).toHaveBeenCalledOnce();
    expect(similarityMock).not.toHaveBeenCalled();
    expect(context).toBeNull();
  });

  it('returns null when the enricher is disabled', async () => {
    const enricher = new HistoricalEnricher(
      makeMockDb(),
      makeMarketCache(),
      { enabled: false },
    );

    await expect(enricher.enrich(makeEvent(), makeLlmResult())).resolves.toBeNull();
    expect(similarityMock).not.toHaveBeenCalled();
  });

  it('returns null when similarity search reports insufficient confidence', async () => {
    outcomeSimilarityMock.mockResolvedValue([]);
    similarityMock.mockResolvedValue({
      confidence: 'insufficient',
      totalCandidates: 1,
      stats: {
        count: 1,
        avgReturnT1: 0,
        avgReturnT5: 0,
        avgReturnT20: 0,
        avgAlphaT1: 0,
        avgAlphaT5: 0,
        avgAlphaT20: 0,
        winRateT20: 0,
        medianAlphaT20: 0,
        bestCase: null,
        worstCase: null,
      },
      events: [],
    });

    const enricher = new HistoricalEnricher(makeMockDb(), makeMarketCache());
    await expect(enricher.enrich(makeEvent(), makeLlmResult())).resolves.toBeNull();
  });

  it('returns null when the similarity query times out', async () => {
    vi.useFakeTimers();
    outcomeSimilarityMock.mockImplementation(() => new Promise(() => {}));

    const enricher = new HistoricalEnricher(
      makeMockDb(),
      makeMarketCache(),
      { timeoutMs: 25 },
    );

    const promise = enricher.enrich(makeEvent(), makeLlmResult());
    await vi.advanceTimersByTimeAsync(25);

    await expect(promise).resolves.toBeNull();
  });
});

describe('generatePatternSummary', () => {
  it('formats the one-line pattern summary with display percentages', () => {
    expect(
      generatePatternSummary({
        sector: 'Technology',
        eventType: 'earnings',
        eventSubtype: 'beat',
        marketRegime: 'bull',
        avgAlphaT20: 0.083,
        winRateT20: 62,
        count: 8,
      }),
    ).toBe(
      'Technology earnings beat in bull market: +8.3% avg alpha T+20, 62% win rate (8 cases)',
    );
  });
});
