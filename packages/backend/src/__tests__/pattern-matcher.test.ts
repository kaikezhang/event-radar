import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmClassificationResult, RawEvent } from '@event-radar/shared';
import type { Database } from '../db/connection.js';

vi.mock('../services/similarity.js', () => ({
  findSimilarEvents: vi.fn(),
}));

vi.mock('../services/outcome-similarity.js', () => ({
  findSimilarFromOutcomes: vi.fn(),
}));

import { findSimilarEvents } from '../services/similarity.js';
import { findSimilarFromOutcomes } from '../services/outcome-similarity.js';
import type { PatternMatchResult } from '../services/pattern-matcher.js';

let PatternMatcher: typeof import('../services/pattern-matcher.js').PatternMatcher;

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source: 'breaking-news',
    type: 'headline',
    title: 'Apple launches new AI server platform',
    body: 'Demand is accelerating across enterprise customers.',
    timestamp: new Date('2026-03-10T14:00:00.000Z'),
    metadata: {
      ticker: 'AAPL',
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
    reasoning: 'strong demand signal',
    tags: [],
    priority: 88,
    matchedRules: [],
    ...overrides,
  };
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

function makeOutcomeMatch(index: number, overrides: Record<string, unknown> = {}) {
  const day = String((index % 9) + 1).padStart(2, '0');

  return {
    eventId: `outcome-${index}`,
    ticker: 'AAPL',
    title: `Apple AI server analog ${index}`,
    source: 'breaking-news',
    severity: 'high',
    eventTime: `2026-02-${day}T12:00:00.000Z`,
    eventPrice: 100 + index,
    change1h: 0.01,
    change1d: 0.02 + index * 0.001,
    changeT5: 0.05 + index * 0.01,
    changeT20: 0.1 + index * 0.01,
    change1w: 0.25 + index * 0.01,
    change1m: 0.15 + index * 0.01,
    score: 0.9 - index * 0.01,
    ...overrides,
  };
}

function makeSimilarityEvent(index: number, overrides: Record<string, unknown> = {}) {
  const day = String((index % 9) + 1).padStart(2, '0');

  return {
    eventId: `hist-${index}`,
    ticker: 'AAPL',
    headline: `Historical Apple analog ${index}`,
    eventDate: `2025-12-${day}T21:00:00.000Z`,
    score: 12 - index,
    scoreBreakdown: {},
    returnT1: 0.01,
    returnT5: 0.04 + index * 0.005,
    returnT20: 0.09 + index * 0.01,
    alphaT1: 0.004,
    alphaT5: 0.01 + index * 0.002,
    alphaT20: 0.02 + index * 0.002,
    ...overrides,
  };
}

function makeSimilarityResult(count: number): {
  confidence: 'insufficient' | 'low' | 'medium' | 'high';
  totalCandidates: number;
  stats: {
    count: number;
    avgReturnT1: number;
    avgReturnT5: number;
    avgReturnT20: number;
    avgAlphaT1: number;
    avgAlphaT5: number;
    avgAlphaT20: number;
    winRateT20: number;
    medianAlphaT20: number;
    bestCase: { ticker: string; alphaT20: number; headline: string } | null;
    worstCase: { ticker: string; alphaT20: number; headline: string } | null;
  };
  events: ReturnType<typeof makeSimilarityEvent>[];
} {
  const events = Array.from({ length: count }, (_, index) =>
    makeSimilarityEvent(index),
  );

  return {
    confidence: 'medium',
    totalCandidates: count,
    stats: {
      count,
      avgReturnT1: 0.01,
      avgReturnT5: 0.06,
      avgReturnT20: 0.14,
      avgAlphaT1: 0.004,
      avgAlphaT5: 0.02,
      avgAlphaT20: 0.04,
      winRateT20: 70,
      medianAlphaT20: 0.04,
      bestCase: {
        ticker: 'AAPL',
        alphaT20: 0.08,
        headline: 'Best alpha analog',
      },
      worstCase: {
        ticker: 'AAPL',
        alphaT20: -0.03,
        headline: 'Worst alpha analog',
      },
    },
    events,
  };
}

function expectVisibleStats(result: PatternMatchResult) {
  expect(result.avgMoveT5).not.toBeNull();
  expect(result.avgMoveT20).not.toBeNull();
  expect(result.winRateT5).not.toBeNull();
  expect(result.winRateT20).not.toBeNull();
}

describe('PatternMatcher', () => {
  const similarityMock = vi.mocked(findSimilarEvents);
  const outcomeSimilarityMock = vi.mocked(findSimilarFromOutcomes);

  beforeEach(async () => {
    similarityMock.mockReset();
    outcomeSimilarityMock.mockReset();
    vi.resetModules();
    ({ PatternMatcher } = await import('../services/pattern-matcher.js'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('suppresses stats below 10 matches while still returning examples', async () => {
    outcomeSimilarityMock.mockResolvedValue(
      Array.from({ length: 9 }, (_, index) => makeOutcomeMatch(index)),
    );

    const matcher = new PatternMatcher(makeMockDb());
    const result = await matcher.findSimilar(
      makeEvent({
        source: 'stocktwits',
        title: 'Apple AI chatter keeps building',
        metadata: { ticker: 'AAPL' },
      }),
      {
        llmResult: makeLlmResult(),
      },
    );

    expect(result).toMatchObject({
      count: 9,
      confidence: 'insufficient',
      confidenceLabel: 'insufficient',
      suppressed: true,
    });
    expect(result?.avgMoveT5).toBeNull();
    expect(result?.avgMoveT20).toBeNull();
    expect(result?.winRateT5).toBeNull();
    expect(result?.winRateT20).toBeNull();
    expect(result?.bestCase).toBeNull();
    expect(result?.worstCase).toBeNull();
    expect(result?.examples).toHaveLength(3);
  });

  it('marks 10 to 19 matches as low confidence with visible stats', async () => {
    outcomeSimilarityMock.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => makeOutcomeMatch(index)),
    );

    const matcher = new PatternMatcher(makeMockDb());
    const result = await matcher.findSimilar(makeEvent(), {
      llmResult: makeLlmResult(),
    });

    expect(result).toMatchObject({
      count: 10,
      confidenceLabel: 'low',
      suppressed: false,
    });
    expectVisibleStats(result!);
  });

  it('marks 20 to 29 matches as medium confidence', async () => {
    outcomeSimilarityMock.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => makeOutcomeMatch(index)),
    );

    const matcher = new PatternMatcher(makeMockDb());
    const result = await matcher.findSimilar(makeEvent(), {
      llmResult: makeLlmResult(),
    });

    expect(result).toMatchObject({
      count: 20,
      confidenceLabel: 'medium',
      suppressed: false,
    });
    expectVisibleStats(result!);
  });

  it('marks 30 or more matches as high confidence', async () => {
    outcomeSimilarityMock.mockResolvedValue(
      Array.from({ length: 30 }, (_, index) => makeOutcomeMatch(index)),
    );

    const matcher = new PatternMatcher(makeMockDb());
    const result = await matcher.findSimilar(makeEvent(), {
      llmResult: makeLlmResult(),
    });

    expect(result).toMatchObject({
      count: 30,
      confidenceLabel: 'high',
      suppressed: false,
    });
    expectVisibleStats(result!);
  });

  it('uses real T+5 and T+20 outcome windows instead of 1w or 1m proxies', async () => {
    outcomeSimilarityMock.mockResolvedValue([
      makeOutcomeMatch(0, {
        changeT5: 0.11,
        changeT20: 0.18,
        change1w: 0.37,
        change1m: 0.41,
      }),
      ...Array.from({ length: 9 }, (_, index) =>
        makeOutcomeMatch(index + 1, {
          changeT5: 0.11,
          changeT20: 0.18,
          change1w: 0.37,
          change1m: 0.41,
        })),
    ]);

    const matcher = new PatternMatcher(makeMockDb());
    const result = await matcher.findSimilar(makeEvent(), {
      llmResult: makeLlmResult(),
    });

    expect(result).toMatchObject({
      avgMoveT5: 0.11,
      avgMoveT20: 0.18,
    });
    expect(result?.avgMoveT5).not.toBe(result?.examples[0]?.move1w);
    expect(result?.avgMoveT20).not.toBe(result?.examples[0]?.move1m);
  });

  it('returns best case, worst case, and examples in product-readable shape', async () => {
    outcomeSimilarityMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) =>
        makeOutcomeMatch(index, {
          changeT20: index === 0 ? 0.42 : index === 1 ? -0.17 : 0.1 + index * 0.01,
        })),
    );

    const matcher = new PatternMatcher(makeMockDb());
    const result = await matcher.findSimilar(makeEvent(), {
      llmResult: makeLlmResult(),
    });

    expect(result?.bestCase).toMatchObject({
      ticker: 'AAPL',
      headline: 'Apple AI server analog 0',
      moveT20: 0.42,
    });
    expect(result?.worstCase).toMatchObject({
      ticker: 'AAPL',
      headline: 'Apple AI server analog 1',
      moveT20: -0.17,
    });
    expect(result?.examples[0]).toMatchObject({
      ticker: 'AAPL',
      headline: 'Apple AI server analog 0',
      moveT5: 0.05,
      moveT20: 0.42,
      score: 0.9,
    });
  });

  it('computes win rates from positive T+5 and T+20 outcomes', async () => {
    outcomeSimilarityMock.mockResolvedValue([
      ...Array.from({ length: 6 }, (_, index) =>
        makeOutcomeMatch(index, { changeT5: 0.1, changeT20: 0.2 })),
      ...Array.from({ length: 4 }, (_, index) =>
        makeOutcomeMatch(index + 6, { changeT5: -0.05, changeT20: -0.1 })),
    ]);

    const matcher = new PatternMatcher(makeMockDb());
    const result = await matcher.findSimilar(makeEvent(), {
      llmResult: makeLlmResult(),
    });

    expect(result).toMatchObject({
      winRateT5: 60,
      winRateT20: 60,
    });
  });

  it('builds historical context directly from visible matcher results', async () => {
    outcomeSimilarityMock.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => makeOutcomeMatch(index)),
    );

    const matcher = new PatternMatcher(makeMockDb());
    const context = await matcher.findHistoricalContext(makeEvent(), {
      llmResult: makeLlmResult(),
    });

    expect(context).toMatchObject({
      matchCount: 10,
      confidence: 'low',
      avgAlphaT5: 0.095,
      avgAlphaT20: 0.145,
      winRateT20: 100,
    });
    expect(context?.topMatches[0]).toMatchObject({
      ticker: 'AAPL',
      headline: 'Apple AI server analog 0',
      source: 'breaking-news',
    });
  });

  it('falls back to historical similarity when outcome matches stay below the minimum threshold', async () => {
    outcomeSimilarityMock.mockResolvedValue(
      Array.from({ length: 2 }, (_, index) => makeOutcomeMatch(index)),
    );
    similarityMock.mockResolvedValue(makeSimilarityResult(10));

    const matcher = new PatternMatcher(makeMockDb());
    const result = await matcher.findSimilar(
      makeEvent({
        source: 'earnings',
        type: 'earnings_beat',
        title: 'AAPL beats earnings expectations',
        metadata: {
          ticker: 'AAPL',
          surprise_type: 'beat',
        },
      }),
      {
        llmResult: makeLlmResult({ eventType: 'earnings_beat' }),
        marketSnapshot: {
          vixLevel: 18,
          spyClose: 510,
          spy50ma: 500,
          spy200ma: 470,
          marketRegime: 'bull',
          updatedAt: new Date('2026-03-10T14:05:00.000Z'),
        },
      },
    );

    expect(similarityMock).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      count: 10,
      confidenceLabel: 'low',
      suppressed: false,
      avgMoveT5: 0.0625,
      avgMoveT20: 0.135,
    });
  });

  it('uses similarity return windows rather than alpha stats for avg move fields', async () => {
    outcomeSimilarityMock.mockResolvedValue([]);
    similarityMock.mockResolvedValue({
      ...makeSimilarityResult(10),
      stats: {
        count: 10,
        avgReturnT1: 0.01,
        avgReturnT5: 0.99,
        avgReturnT20: 0.88,
        avgAlphaT1: 0.004,
        avgAlphaT5: 0.03,
        avgAlphaT20: 0.04,
        winRateT20: 70,
        medianAlphaT20: 0.04,
        bestCase: {
          ticker: 'AAPL',
          alphaT20: 0.08,
          headline: 'Best alpha analog',
        },
        worstCase: {
          ticker: 'AAPL',
          alphaT20: -0.03,
          headline: 'Worst alpha analog',
        },
      },
    });

    const matcher = new PatternMatcher(makeMockDb());
    const result = await matcher.findSimilar(
      makeEvent({
        source: 'earnings',
        type: 'earnings_beat',
        metadata: {
          ticker: 'AAPL',
          surprise_type: 'beat',
        },
      }),
      {
        llmResult: makeLlmResult({ eventType: 'earnings_beat' }),
      },
    );

    expect(result).toMatchObject({
      avgMoveT5: 0.0625,
      avgMoveT20: 0.135,
    });
    expect(result?.avgMoveT5).not.toBe(0.99);
    expect(result?.avgMoveT20).not.toBe(0.88);
  });

  it('returns null when neither outcome nor historical matching can produce a cohort', async () => {
    outcomeSimilarityMock.mockResolvedValue([]);

    const matcher = new PatternMatcher(makeMockDb(''));
    const result = await matcher.findSimilar(
      makeEvent({
        source: 'stocktwits',
        title: 'Random Apple chatter',
        metadata: { ticker: 'AAPL' },
      }),
      {
        llmResult: makeLlmResult(),
      },
    );

    expect(result).toBeNull();
    expect(similarityMock).not.toHaveBeenCalled();
  });
});
