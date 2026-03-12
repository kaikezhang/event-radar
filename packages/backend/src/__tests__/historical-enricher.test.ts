import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmClassificationResult, RawEvent } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { resetMetrics } from '../metrics.js';
import type { MarketContextCache } from '../services/market-context-cache.js';

vi.mock('../services/similarity.js', () => ({
  findSimilarEvents: vi.fn(),
}));

import { findSimilarEvents } from '../services/similarity.js';
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
    eventType: 'earnings',
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
  it('maps SEC EDGAR item 5.02 to leadership_change', () => {
    const mapped = mapEventToSimilarityQuery(makeEvent());

    expect(mapped).toMatchObject({
      eventType: 'leadership_change',
      eventSubtype: '5.02',
      ticker: 'AAPL',
    });
  });

  it('maps earnings scanner events to earnings subtype beat with surprise context', () => {
    const mapped = mapEventToSimilarityQuery(
      makeEvent({
        source: 'earnings',
        type: 'earnings-result',
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
      eventType: 'earnings',
      eventSubtype: 'beat',
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
      makeLlmResult({ eventType: 'earnings' }),
    );

    expect(mapped).toMatchObject({
      eventType: 'earnings',
      ticker: 'AAPL',
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

  beforeEach(() => {
    similarityMock.mockReset();
    resetMetrics();
    resetSectorCacheForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a similarity query with market and sector context and returns historical context', async () => {
    similarityMock.mockResolvedValue({
      confidence: 'high',
      totalCandidates: 8,
      stats: {
        count: 8,
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
        type: 'earnings-result',
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
        eventType: 'earnings',
        eventSubtype: 'beat',
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
      matchCount: 8,
      confidence: 'high',
      avgAlphaT5: 0.024,
      avgAlphaT20: 0.083,
      winRateT20: 62,
      medianAlphaT20: 0.071,
      patternSummary:
        'Technology earnings beat in bull market: +8.3% avg alpha T+20, 62% win rate (8 cases)',
    });
  });

  it('queries both earnings and earnings_results for breaking-news earnings events', async () => {
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
        confidence: 'medium',
        totalCandidates: 6,
        stats: {
          count: 6,
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
      makeLlmResult({ eventType: 'earnings' }),
    );

    expect(similarityMock).toHaveBeenCalledTimes(2);
    expect(similarityMock.mock.calls[0]?.[1]).toMatchObject({
      eventType: 'earnings',
    });
    expect(similarityMock.mock.calls[1]?.[1]).toMatchObject({
      eventType: 'earnings_results',
    });
    expect(context?.confidence).toBe('medium');
    expect(context?.matchCount).toBe(6);
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
    similarityMock.mockImplementation(() => new Promise(() => {}));

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
