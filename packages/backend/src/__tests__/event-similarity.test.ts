import { describe, it, expect, vi } from 'vitest';
import {
  extractTickers,
  extractKeywords,
  jaccardSimilarity,
  timeProximityScore,
  computeSimilarity,
  findSimilarEvents,
} from '../services/event-similarity.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: crypto.randomUUID(),
    source: 'sec-8k',
    sourceEventId: null,
    title: 'Test event',
    summary: null,
    rawPayload: null,
    metadata: null,
    severity: 'MEDIUM',
    receivedAt: new Date('2024-06-15T12:00:00Z'),
    createdAt: new Date('2024-06-15T12:00:00Z'),
    ...overrides,
  };
}

interface EventRow {
  id: string;
  source: string;
  sourceEventId: string | null;
  title: string;
  summary: string | null;
  rawPayload: unknown;
  metadata: unknown;
  severity: string | null;
  receivedAt: Date;
  createdAt: Date;
}

// ── extractTickers ──────────────────────────────────────────────

describe('extractTickers', () => {
  it('should extract single ticker from metadata', () => {
    expect(extractTickers({ ticker: 'AAPL' })).toEqual(['AAPL']);
  });

  it('should extract tickers array from metadata', () => {
    expect(extractTickers({ tickers: ['AAPL', 'GOOG'] })).toEqual(['AAPL', 'GOOG']);
  });

  it('should uppercase tickers', () => {
    expect(extractTickers({ ticker: 'aapl' })).toEqual(['AAPL']);
  });

  it('should return empty array for null/undefined metadata', () => {
    expect(extractTickers(null)).toEqual([]);
    expect(extractTickers(undefined)).toEqual([]);
  });

  it('should return empty array for metadata without ticker fields', () => {
    expect(extractTickers({ source: 'test' })).toEqual([]);
  });
});

// ── extractKeywords ─────────────────────────────────────────────

describe('extractKeywords', () => {
  it('should tokenize text and remove stopwords', () => {
    const keywords = extractKeywords('Apple announces new iPhone product launch');
    expect(keywords).toContain('apple');
    expect(keywords).toContain('announces');
    expect(keywords).toContain('iphone');
    expect(keywords).toContain('product');
    expect(keywords).toContain('launch');
    // "new" is a stopword
    expect(keywords).not.toContain('new');
  });

  it('should remove short words (<=2 chars)', () => {
    const keywords = extractKeywords('an AI is great');
    // "an" is stopword, "AI" becomes "ai" (2 chars, filtered out), "is" is stopword
    expect(keywords).toContain('great');
    expect(keywords).not.toContain('ai');
  });

  it('should handle empty string', () => {
    expect(extractKeywords('')).toEqual([]);
  });
});

// ── jaccardSimilarity ───────────────────────────────────────────

describe('jaccardSimilarity', () => {
  it('should return 1.0 for identical sets', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('should return 0.0 for disjoint sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('should return correct value for partial overlap', () => {
    // intersection = {a, b} = 2, union = {a, b, c, d} = 4
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'd'])).toBeCloseTo(0.5, 5);
  });

  it('should return 0 for two empty arrays', () => {
    expect(jaccardSimilarity([], [])).toBe(0);
  });

  it('should return 0 when one array is empty', () => {
    expect(jaccardSimilarity(['a'], [])).toBe(0);
  });
});

// ── timeProximityScore ──────────────────────────────────────────

describe('timeProximityScore', () => {
  it('should return 1.0 for identical times', () => {
    const t = new Date('2024-06-15T12:00:00Z');
    expect(timeProximityScore(t, t)).toBe(1);
  });

  it('should return ~0.5 at the half-life', () => {
    const t1 = new Date('2024-06-15T12:00:00Z');
    const t2 = new Date('2024-06-15T12:30:00Z'); // 30 min later (default half-life)
    expect(timeProximityScore(t1, t2)).toBeCloseTo(0.5, 5);
  });

  it('should decay with increasing time difference', () => {
    const t1 = new Date('2024-06-15T12:00:00Z');
    const t10min = new Date('2024-06-15T12:10:00Z');
    const t60min = new Date('2024-06-15T13:00:00Z');
    const t24h = new Date('2024-06-16T12:00:00Z');

    const score10 = timeProximityScore(t1, t10min);
    const score60 = timeProximityScore(t1, t60min);
    const score24h = timeProximityScore(t1, t24h);

    expect(score10).toBeGreaterThan(score60);
    expect(score60).toBeGreaterThan(score24h);
    expect(score24h).toBeCloseTo(0, 2); // 24h should be near zero
  });

  it('should be symmetric', () => {
    const t1 = new Date('2024-06-15T12:00:00Z');
    const t2 = new Date('2024-06-15T13:00:00Z');
    expect(timeProximityScore(t1, t2)).toBe(timeProximityScore(t2, t1));
  });
});

// ── computeSimilarity ───────────────────────────────────────────

describe('computeSimilarity', () => {
  it('should return high score for same ticker, close time, similar content', () => {
    const eventA = makeEvent({
      title: 'AAPL announces record quarterly earnings',
      metadata: { ticker: 'AAPL' },
      receivedAt: new Date('2024-06-15T12:00:00Z'),
    });
    const eventB = makeEvent({
      title: 'AAPL reports record quarterly earnings beat',
      metadata: { ticker: 'AAPL' },
      receivedAt: new Date('2024-06-15T12:05:00Z'),
    });

    const score = computeSimilarity(eventA, eventB);

    expect(score.ticker).toBe(1); // Same ticker
    expect(score.time).toBeGreaterThan(0.8); // 5 min apart
    expect(score.content).toBeGreaterThan(0); // Overlapping keywords
    expect(score.composite).toBeGreaterThan(0.6);
  });

  it('should return low score for different ticker, far time, no content overlap', () => {
    const eventA = makeEvent({
      title: 'AAPL announces iPhone launch',
      metadata: { ticker: 'AAPL' },
      receivedAt: new Date('2024-06-15T12:00:00Z'),
    });
    const eventB = makeEvent({
      title: 'TSLA recalls vehicles due to brake issue',
      metadata: { ticker: 'TSLA' },
      receivedAt: new Date('2024-06-20T12:00:00Z'),
    });

    const score = computeSimilarity(eventA, eventB);

    expect(score.ticker).toBe(0); // Different tickers
    expect(score.time).toBeCloseTo(0, 1); // 5 days apart
    expect(score.composite).toBeLessThan(0.3);
  });

  it('should weight ticker at 0.4, time at 0.3, content at 0.3', () => {
    // Same ticker, same time, same content = all 1.0
    const eventA = makeEvent({
      title: 'test event',
      metadata: { ticker: 'AAPL' },
      receivedAt: new Date('2024-06-15T12:00:00Z'),
    });

    const score = computeSimilarity(eventA, eventA);

    // All factors should be 1.0, composite = 0.4 + 0.3 + 0.3 = 1.0
    expect(score.ticker).toBe(1);
    expect(score.time).toBe(1);
    expect(score.content).toBe(1);
    expect(score.composite).toBeCloseTo(1.0, 5);
  });

  it('should handle events with no tickers', () => {
    const eventA = makeEvent({
      title: 'Breaking news about market crash',
      metadata: {},
    });
    const eventB = makeEvent({
      title: 'Market crash continues to worsen',
      metadata: null,
    });

    const score = computeSimilarity(eventA, eventB);

    expect(score.ticker).toBe(0);
    // Content should still work
    expect(score.content).toBeGreaterThan(0);
  });

  it('should include summary in content similarity', () => {
    const eventA = makeEvent({
      title: 'FDA decision coming',
      summary: 'Drug approval expected for cancer treatment',
      metadata: {},
    });
    const eventB = makeEvent({
      title: 'Health announcement',
      summary: 'Cancer treatment drug approval review',
      metadata: {},
    });

    const score = computeSimilarity(eventA, eventB);

    // Content similarity should pick up "cancer", "treatment", "drug", "approval"
    expect(score.content).toBeGreaterThan(0);
  });
});

// ── findSimilarEvents ───────────────────────────────────────────

describe('findSimilarEvents', () => {
  it('should return empty array when source event not found', async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // No event found
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await findSimilarEvents(mockDb as any, 'non-existent-id');
    expect(result).toEqual([]);
  });

  it('should filter results by minScore threshold', async () => {
    const now = new Date('2024-06-15T12:00:00Z');
    const sourceEvent = makeEvent({
      id: 'source-id',
      title: 'AAPL earnings report beat expectations',
      metadata: { ticker: 'AAPL' },
      receivedAt: now,
    });
    const similarEvent = makeEvent({
      id: 'similar-id',
      title: 'AAPL earnings report exceeds expectations',
      metadata: { ticker: 'AAPL' },
      receivedAt: new Date(now.getTime() + 5 * 60 * 1000), // 5 min later
    });
    const dissimilarEvent = makeEvent({
      id: 'dissimilar-id',
      title: 'TSLA announces new factory in Germany',
      metadata: { ticker: 'TSLA' },
      receivedAt: new Date(now.getTime() + 50 * 60 * 1000), // 50 min later
    });

    let callCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([sourceEvent]);
              return Promise.reject(new Error('Unexpected call'));
            }),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([similarEvent, dissimilarEvent]),
            }),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await findSimilarEvents(mockDb as any, 'source-id', {
      minScore: 0.5,
    });

    // Only the similar event (same ticker AAPL, close time) should pass threshold
    const aaplResults = result.filter((r) => r.tickerScore > 0);
    expect(aaplResults.length).toBeGreaterThanOrEqual(1);
    for (const r of result) {
      expect(r.score).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('should respect maxResults option', async () => {
    const now = new Date('2024-06-15T12:00:00Z');
    const sourceEvent = makeEvent({
      id: 'source-id',
      title: 'Market crash',
      metadata: { ticker: 'SPY' },
      receivedAt: now,
    });

    // Create many similar candidates
    const candidates = Array.from({ length: 20 }, (_, i) =>
      makeEvent({
        id: `candidate-${i}`,
        title: `Market crash update ${i}`,
        metadata: { ticker: 'SPY' },
        receivedAt: new Date(now.getTime() + i * 60 * 1000),
      }),
    );

    let callCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([sourceEvent]);
              return Promise.reject(new Error('Unexpected call'));
            }),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(candidates),
            }),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await findSimilarEvents(mockDb as any, 'source-id', {
      maxResults: 3,
      minScore: 0,
    });

    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('should sort results by composite score descending', async () => {
    const now = new Date('2024-06-15T12:00:00Z');
    const sourceEvent = makeEvent({
      id: 'source-id',
      title: 'AAPL announces quarterly earnings',
      metadata: { ticker: 'AAPL' },
      receivedAt: now,
    });

    const closeInTime = makeEvent({
      id: 'close',
      title: 'AAPL quarterly earnings exceed expectations',
      metadata: { ticker: 'AAPL' },
      receivedAt: new Date(now.getTime() + 2 * 60 * 1000), // 2 min
    });

    const farInTime = makeEvent({
      id: 'far',
      title: 'AAPL quarterly earnings results',
      metadata: { ticker: 'AAPL' },
      receivedAt: new Date(now.getTime() + 55 * 60 * 1000), // 55 min
    });

    let callCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([sourceEvent]);
              return Promise.reject(new Error('Unexpected call'));
            }),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([farInTime, closeInTime]),
            }),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await findSimilarEvents(mockDb as any, 'source-id', {
      minScore: 0,
    });

    if (result.length >= 2) {
      expect(result[0]!.score).toBeGreaterThanOrEqual(result[1]!.score);
    }
  });

  it('should return similarity score factors for each result', async () => {
    const now = new Date('2024-06-15T12:00:00Z');
    const sourceEvent = makeEvent({
      id: 'source-id',
      title: 'AAPL earnings beat',
      metadata: { ticker: 'AAPL' },
      receivedAt: now,
    });
    const candidate = makeEvent({
      id: 'candidate-id',
      title: 'AAPL earnings strong results',
      metadata: { ticker: 'AAPL' },
      receivedAt: new Date(now.getTime() + 10 * 60 * 1000),
    });

    let callCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([sourceEvent]);
              return Promise.reject(new Error('Unexpected call'));
            }),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([candidate]),
            }),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await findSimilarEvents(mockDb as any, 'source-id', {
      minScore: 0,
    });

    expect(result.length).toBe(1);
    const first = result[0]!;
    expect(first).toHaveProperty('eventId');
    expect(first).toHaveProperty('score');
    expect(first).toHaveProperty('tickerScore');
    expect(first).toHaveProperty('timeScore');
    expect(first).toHaveProperty('contentScore');
    expect(first).toHaveProperty('event');
    expect(first.tickerScore).toBe(1); // Same ticker
    expect(first.timeScore).toBeGreaterThan(0);
    expect(first.score).toBeGreaterThan(0);
  });
});
