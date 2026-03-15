import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LlmClassificationResult,
  RawEvent,
  RegimeSnapshot,
} from '@event-radar/shared';
import { buildPrompt, LLMEnricher } from '../pipeline/llm-enricher.js';
import type { MarketSnapshot } from '../services/market-context-cache.js';
import type { MarketQuote } from '../services/market-data-provider.js';
import type { PatternMatchResult } from '../services/pattern-matcher.js';
import {
  MockMarketRegimeService,
  createNeutralSnapshot,
} from '../services/mock-market-regime.js';

function makeEvent(overrides?: Partial<RawEvent>): RawEvent {
  return {
    id: 'test-001',
    source: 'sec-edgar',
    type: '8-K',
    title: '8-K: NVDA Restructuring',
    body: '$2.1B restructuring charge, 12% workforce reduction',
    url: 'https://sec.gov/filing/456',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    metadata: { ticker: 'NVDA' },
    ...overrides,
  };
}

function makeQuote(overrides?: Partial<MarketQuote>): MarketQuote {
  return {
    symbol: 'NVDA',
    price: 742.15,
    change1d: 4.2,
    change5d: 8.7,
    change20d: 16.4,
    volumeRatio: 1.8,
    rsi14: 68.3,
    high52w: 760,
    low52w: 180,
    support: 710,
    resistance: 755,
    ...overrides,
  };
}

function makePatternMatch(
  overrides?: Partial<PatternMatchResult>,
): PatternMatchResult {
  return {
    count: 24,
    confidence: 'medium',
    confidenceLabel: 'medium',
    suppressed: false,
    avgMoveT5: 3.4,
    avgMoveT20: 7.8,
    winRateT5: 0.63,
    winRateT20: 0.67,
    bestCase: {
      ticker: 'NVDA',
      headline: 'Prior restructuring triggered squeeze',
      source: 'sec-edgar',
      eventTime: '2023-06-01T13:30:00.000Z',
      moveT20: 19.6,
    },
    worstCase: {
      ticker: 'NVDA',
      headline: 'Earlier charge led to follow-through selling',
      source: 'sec-edgar',
      eventTime: '2022-02-10T13:30:00.000Z',
      moveT20: -11.4,
    },
    examples: [
      {
        eventId: 'hist-1',
        ticker: 'NVDA',
        headline: 'Prior restructuring triggered squeeze',
        source: 'sec-edgar',
        eventTime: '2023-06-01T13:30:00.000Z',
        score: 0.91,
        move1d: 2.1,
        moveT5: 4.8,
        moveT20: 19.6,
        move1w: 4.8,
        move1m: 19.6,
      },
    ],
    matchSource: 'outcomes',
    legacyContext: {
      avgAlphaT5: 3.4,
      avgAlphaT20: 7.8,
      avgChange1d: 2.1,
      avgChange1w: 4.8,
      winRateT20: 0.67,
      medianAlphaT20: 6.4,
      bestCase: {
        ticker: 'NVDA',
        alphaT20: 19.6,
        headline: 'Prior restructuring triggered squeeze',
      },
      worstCase: {
        ticker: 'NVDA',
        alphaT20: -11.4,
        headline: 'Earlier charge led to follow-through selling',
      },
      topMatches: [
        {
          ticker: 'NVDA',
          headline: 'Prior restructuring triggered squeeze',
          source: 'sec-edgar',
          eventDate: '2023-06-01T13:30:00.000Z',
          alphaT20: 19.6,
          score: 0.91,
        },
      ],
      similarEvents: [
        {
          title: 'Prior restructuring triggered squeeze',
          ticker: 'NVDA',
          source: 'sec-edgar',
          eventTime: '2023-06-01T13:30:00.000Z',
          eventPrice: 410,
          change1h: 0.8,
          change1d: 2.1,
          change1w: 4.8,
          change1m: 19.6,
          score: 0.91,
        },
      ],
      patternSummary: 'Historical analogs skew constructive with above-baseline follow-through.',
    },
    ...overrides,
  };
}

function makeLlmPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    summary: 'NVIDIA disclosed a sizable restructuring charge tied to a headcount reduction.',
    impact: 'The filing resets near-term expectations while raising the odds of a margin and execution debate.',
    whyNow: 'The catalyst is fresh, headline-driven, and likely to reprice the stock intraday.',
    currentSetup: 'NVDA is already extended with elevated volume and RSI near the upper end of its recent range.',
    historicalContext: 'Comparable restructuring filings produced positive 20-day follow-through in roughly two-thirds of matches.',
    risks: 'If management frames this as a one-off cleanup with stable demand, the initial read-through can fade quickly.',
    action: '🟡 Monitor',
    tickers: [{ symbol: 'NVDA', direction: 'bearish' }],
    regimeContext: 'An overbought tape can amplify disappointment and mute dip-buying early.',
    ...overrides,
  };
}

function makeChatCompletion(content: Record<string, unknown>) {
  return {
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
    },
  };
}

function setClient(
  enricher: LLMEnricher,
  create: ReturnType<typeof vi.fn>,
): void {
  (enricher as { client: unknown }).client = {
    chat: {
      completions: {
        create,
      },
    },
  };
}

function makeDependencies(overrides?: {
  regimeService?: MockMarketRegimeService;
  marketDataCache?: { getOrFetch: ReturnType<typeof vi.fn> };
  patternMatcher?: { findSimilar: ReturnType<typeof vi.fn> };
  marketSnapshotProvider?: { get: ReturnType<typeof vi.fn> };
}) {
  return {
    regimeService:
      overrides?.regimeService ??
      new MockMarketRegimeService({
        ...createNeutralSnapshot(),
        score: 65,
        label: 'overbought',
      }),
    marketDataCache:
      overrides?.marketDataCache ?? {
        getOrFetch: vi.fn().mockResolvedValue(makeQuote()),
      },
    patternMatcher:
      overrides?.patternMatcher ?? {
        findSimilar: vi.fn().mockResolvedValue(makePatternMatch()),
      },
    marketSnapshotProvider:
      overrides?.marketSnapshotProvider ?? {
        get: vi.fn().mockReturnValue({
          vixLevel: 18.5,
          spyClose: 508,
          spy50ma: 497,
          spy200ma: 468,
          marketRegime: 'bull',
          updatedAt: new Date('2024-01-15T10:00:00Z'),
        } satisfies MarketSnapshot),
      },
  };
}

describe('buildPrompt', () => {
  it('includes the core event fields without optional context', () => {
    const prompt = buildPrompt(makeEvent());

    expect(prompt).toContain('Event: 8-K: NVDA Restructuring');
    expect(prompt).toContain('Details: $2.1B restructuring charge, 12% workforce reduction');
    expect(prompt).toContain('Source: sec-edgar');
    expect(prompt).not.toContain('## Current Market Setup');
    expect(prompt).not.toContain('## Historical Pattern Stats');
  });

  it('includes the legacy regime section when provided', () => {
    const regime: RegimeSnapshot = {
      score: 65,
      label: 'overbought',
      factors: {
        vix: { value: 14.2, zscore: -0.8 },
        spyRsi: { value: 72.5, signal: 'overbought' },
        spy52wPosition: { pctFromHigh: -1.0, pctFromLow: 28.0 },
        maSignal: { sma20: 460.0, sma50: 445.0, signal: 'golden_cross' },
        yieldCurve: { spread: -0.15, inverted: true },
      },
      amplification: { bullish: 0.7, bearish: 1.5 },
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    const prompt = buildPrompt(makeEvent(), regime);

    expect(prompt).toContain('## Market Context');
    expect(prompt).toContain('Current regime: overbought (score: 65)');
    expect(prompt).toContain('-15bp (INVERTED)');
  });
});

describe('LLMEnricher.enrich', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('injects per-ticker market setup and historical pattern stats into the user prompt', async () => {
    const create = vi.fn().mockResolvedValue(makeChatCompletion(makeLlmPayload()));
    const enricher = new LLMEnricher(
      { enabled: true, apiKey: 'test-key', timeoutMs: 100 },
      makeDependencies() as never,
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    setClient(enricher, create);

    await enricher.enrich(makeEvent());

    const request = create.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.messages[1]?.content).toContain('## Current Market Setup');
    expect(request.messages[1]?.content).toContain('Ticker: NVDA');
    expect(request.messages[1]?.content).toContain('Price: 742.15');
    expect(request.messages[1]?.content).toContain('## Historical Pattern Stats');
    expect(request.messages[1]?.content).toContain('Matches: 24');
    expect(request.messages[1]?.content).toContain('20-day win rate: 67%');
  });

  it('passes llm classification and market snapshot into the pattern matcher', async () => {
    const create = vi.fn().mockResolvedValue(makeChatCompletion(makeLlmPayload()));
    const patternMatcher = {
      findSimilar: vi.fn().mockResolvedValue(makePatternMatch()),
    };
    const marketSnapshot: MarketSnapshot = {
      vixLevel: 18.5,
      spyClose: 508,
      spy50ma: 497,
      spy200ma: 468,
      marketRegime: 'bull',
      updatedAt: new Date('2024-01-15T10:00:00Z'),
    };
    const llmResult: LlmClassificationResult = {
      eventType: 'sec_form_8k',
      severity: 'HIGH',
      direction: 'bearish',
      confidence: 0.82,
      reasoning: 'Restructuring events often hit sentiment first.',
      source: 'llm',
    };
    const enricher = new LLMEnricher(
      { enabled: true, apiKey: 'test-key', timeoutMs: 100 },
      makeDependencies({
        patternMatcher,
        marketSnapshotProvider: { get: vi.fn().mockReturnValue(marketSnapshot) },
      }) as never,
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    setClient(enricher, create);

    await enricher.enrich(makeEvent(), llmResult);

    expect(patternMatcher.findSimilar).toHaveBeenCalledWith(makeEvent(), {
      llmResult,
      marketSnapshot,
    });
  });

  it('keeps the structured enrichment fields returned by the model', async () => {
    const create = vi.fn().mockResolvedValue(makeChatCompletion(makeLlmPayload()));
    const enricher = new LLMEnricher(
      { enabled: true, apiKey: 'test-key', timeoutMs: 100 },
      makeDependencies() as never,
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    setClient(enricher, create);

    const result = await enricher.enrich(makeEvent());

    expect(result).toMatchObject({
      summary: expect.stringContaining('NVIDIA'),
      impact: expect.stringContaining('margin'),
      whyNow: expect.stringContaining('fresh'),
      currentSetup: expect.stringContaining('RSI'),
      historicalContext: expect.stringContaining('two-thirds'),
      risks: expect.stringContaining('fade quickly'),
      action: '🟡 Monitor',
    });
  });

  it('normalizes invalid actions and null tickers while preserving structured fields', async () => {
    const create = vi.fn().mockResolvedValue(
      makeChatCompletion(
        makeLlmPayload({
          action: 'INVALID',
          tickers: null,
        }),
      ),
    );
    const enricher = new LLMEnricher(
      { enabled: true, apiKey: 'test-key', timeoutMs: 100 },
      makeDependencies() as never,
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    setClient(enricher, create);

    const result = await enricher.enrich(makeEvent());

    expect(result).toMatchObject({
      action: '🟢 Background',
      tickers: [],
      whyNow: expect.any(String),
      currentSetup: expect.any(String),
      historicalContext: expect.any(String),
      risks: expect.any(String),
    });
  });

  it('still succeeds when per-ticker market context is unavailable', async () => {
    const create = vi.fn().mockResolvedValue(makeChatCompletion(makeLlmPayload()));
    const enricher = new LLMEnricher(
      { enabled: true, apiKey: 'test-key', timeoutMs: 100 },
      makeDependencies({
        marketDataCache: {
          getOrFetch: vi.fn().mockResolvedValue(undefined),
        },
      }) as never,
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    setClient(enricher, create);

    const result = await enricher.enrich(makeEvent());
    const request = create.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(result?.summary).toContain('NVIDIA');
    expect(request.messages[1]?.content).not.toContain('## Current Market Setup');
  });

  it('still succeeds when pattern stats are unavailable', async () => {
    const create = vi.fn().mockResolvedValue(makeChatCompletion(makeLlmPayload()));
    const enricher = new LLMEnricher(
      { enabled: true, apiKey: 'test-key', timeoutMs: 100 },
      makeDependencies({
        patternMatcher: {
          findSimilar: vi.fn().mockResolvedValue(null),
        },
      }) as never,
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    setClient(enricher, create);

    const result = await enricher.enrich(makeEvent());
    const request = create.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(result?.summary).toContain('NVIDIA');
    expect(request.messages[1]?.content).not.toContain('## Historical Pattern Stats');
  });

  it('keeps enrichment running when market data lookup fails', async () => {
    const create = vi.fn().mockResolvedValue(makeChatCompletion(makeLlmPayload()));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const enricher = new LLMEnricher(
      { enabled: true, apiKey: 'test-key', timeoutMs: 100 },
      makeDependencies({
        marketDataCache: {
          getOrFetch: vi.fn().mockRejectedValue(new Error('quote failed')),
        },
      }) as never,
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    setClient(enricher, create);

    const result = await enricher.enrich(makeEvent());

    expect(result?.summary).toContain('NVIDIA');
    expect(consoleError).toHaveBeenCalled();
  });

  it('keeps enrichment running when pattern stats lookup fails', async () => {
    const create = vi.fn().mockResolvedValue(makeChatCompletion(makeLlmPayload()));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const enricher = new LLMEnricher(
      { enabled: true, apiKey: 'test-key', timeoutMs: 100 },
      makeDependencies({
        patternMatcher: {
          findSimilar: vi.fn().mockRejectedValue(new Error('pattern failed')),
        },
      }) as never,
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    setClient(enricher, create);

    const result = await enricher.enrich(makeEvent());

    expect(result?.summary).toContain('NVIDIA');
    expect(consoleError).toHaveBeenCalled();
  });

  it('keeps the prompt instructions in English and out of financial-advice territory', async () => {
    const create = vi.fn().mockResolvedValue(makeChatCompletion(makeLlmPayload()));
    const enricher = new LLMEnricher(
      { enabled: true, apiKey: 'test-key', timeoutMs: 100 },
      makeDependencies() as never,
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    setClient(enricher, create);

    await enricher.enrich(makeEvent());

    const request = create.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.messages[0]?.content).toContain('English');
    expect(request.messages[0]?.content).toContain('trader-usable');
    expect(request.messages[0]?.content).toContain('Do not use BUY, SELL, HOLD');
  });

  it('returns null when the llm payload fails runtime validation', async () => {
    const create = vi.fn().mockResolvedValue(
      makeChatCompletion({
        summary: null,
        impact: 'AI impact',
        action: '🟡 Monitor',
        tickers: [],
      }),
    );
    const enricher = new LLMEnricher(
      { enabled: true, apiKey: 'test-key', timeoutMs: 100 },
      makeDependencies() as never,
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setClient(enricher, create);

    await expect(enricher.enrich(makeEvent())).resolves.toBeNull();
  });
});
