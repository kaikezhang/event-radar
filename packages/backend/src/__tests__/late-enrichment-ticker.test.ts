import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wireEventPipeline, type EventPipelineDeps } from '../event-pipeline.js';
import {
  InMemoryEventBus,
  type RawEvent,
  type ClassificationResult,
} from '@event-radar/shared';
import type { OutcomeTracker } from '../services/outcome-tracker.js';

/* ── helpers ─────────────────────────────────────────────────────── */

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: 'evt-late-001',
    source: 'breaking-news',
    type: 'breaking',
    title: 'Big tech acquisition',
    body: 'Company X acquires Company Y',
    url: 'https://example.com',
    timestamp: new Date('2026-03-20T14:00:00Z'),
    metadata: {}, // no ticker initially
    ...overrides,
  };
}

/**
 * Build a mock DB that supports storeEvent (transaction → insert → values → returning)
 * and pipeline db.execute calls.
 *
 * @param executeResults — array of results returned by successive db.execute() calls
 */
function makeMockDb(executeResults: unknown[] = []) {
  let callIndex = 0;
  const executeFn = vi.fn().mockImplementation(() => {
    const result = executeResults[callIndex] ?? [];
    callIndex++;
    return Promise.resolve(result);
  });

  // storeEvent: db.transaction(cb) → cb(tx) where tx.insert().values().returning()
  const txReturning = vi.fn().mockResolvedValue([
    { id: 'evt-late-001', createdAt: new Date('2026-03-20T14:00:00Z') },
  ]);
  const txValues = vi.fn().mockReturnValue({ returning: txReturning });
  const txInsert = vi.fn().mockReturnValue({ values: txValues });
  const tx = { insert: txInsert, execute: executeFn };
  const transaction = vi.fn(
    async (callback: (t: typeof tx) => Promise<unknown>) => callback(tx),
  );

  return { execute: executeFn, transaction };
}

function makeMinimalDeps(overrides: Partial<EventPipelineDeps> = {}): EventPipelineDeps {
  const eventBus = new InMemoryEventBus();
  return {
    server: {
      log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as never,
    eventBus,
    db: undefined,
    alertRouter: { enabled: false, route: vi.fn() } as never,
    ruleEngine: {
      classify: vi.fn().mockReturnValue({
        severity: 'HIGH',
        confidence: 0.9,
        confidenceLevel: 'confirmed',
        matchedRules: [],
      } satisfies ClassificationResult),
    } as never,
    llmClassifier: undefined,
    deduplicator: {
      check: vi.fn().mockResolvedValue({ isDuplicate: false }),
      activeStoryCount: 0,
      getStory: vi.fn(),
      reset: vi.fn(),
    } as never,
    alertFilter: {
      check: vi.fn().mockReturnValue({ pass: true, enrichWithLLM: true, reason: 'test' }),
      resetCooldowns: vi.fn(),
    } as never,
    llmEnricher: { enabled: false, enrich: vi.fn() } as never,
    llmGatekeeper: { enabled: false } as never,
    deliveryGate: {
      evaluate: vi.fn().mockReturnValue({ pass: true, tier: 'high', reason: 'test' }),
    } as never,
    auditLog: { record: vi.fn() } as never,
    pipelineLimiter: {
      enqueue: vi.fn().mockImplementation(({ run }: { run: () => Promise<void> }) => {
        run();
        return true;
      }),
    } as never,
    marketRegimeService: {
      getRegimeSnapshot: vi.fn().mockResolvedValue({
        score: 0,
        label: 'neutral',
        factors: {},
        amplification: { bullish: 1, bearish: 1 },
        updatedAt: '2026-03-20T12:00:00Z',
      }),
      getAmplificationFactor: vi.fn().mockReturnValue(1),
    } as never,
    startTime: 0,
    ...overrides,
  };
}

/* ── tests ────────────────────────────────────────────────────────── */

describe('Late-enrichment ticker: metadata sync, concurrency, casing', () => {
  let outcomeTracker: {
    scheduleOutcomeTrackingForEvent: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    outcomeTracker = {
      scheduleOutcomeTrackingForEvent: vi.fn().mockResolvedValue({ ok: true }),
    };
  });

  it('updates metadata JSON when late ticker is discovered via LLM enrichment', async () => {
    const event = makeEvent();

    // db.execute call order:
    // 1. persistEventMetadata (llm_enrichment)     → []
    // 2. UPDATE events SET ticker RETURNING id      → [{id}] (won the race)
    // 3. persistEventMetadata (ticker in metadata)  → []
    // 4. persistEventMetadata (delivery_gate)       → []
    const mockDb = makeMockDb([
      [],                            // persist llm_enrichment
      [{ id: 'evt-late-001' }],      // ticker UPDATE won race
      [],                            // persist ticker metadata
      [],                            // persist delivery_gate
    ]);

    const enricherResult = {
      tickers: [{ symbol: 'aapl', name: 'Apple Inc', confidence: 0.95 }],
      summary: 'Apple acquisition',
    };

    const deps = makeMinimalDeps({
      db: mockDb as never,
      alertRouter: {
        enabled: true,
        route: vi.fn().mockResolvedValue({
          deliveries: [],
          decision: { tier: 'high', reason: 'test' },
        }),
      } as never,
      llmEnricher: {
        enabled: true,
        enrich: vi.fn().mockResolvedValue(enricherResult),
      } as never,
      outcomeTracker: outcomeTracker as unknown as OutcomeTracker,
    });

    wireEventPipeline(deps);
    deps.eventBus.publish(event);
    await new Promise((r) => setTimeout(r, 150));

    // Verify metadata includes uppercase ticker
    expect(event.metadata).toHaveProperty('ticker', 'AAPL');

    // scheduleOutcomeTrackingForEvent is called twice:
    // 1. Initial call after storeEvent (no ticker → tracker returns error internally)
    // 2. Late-enrichment call after ticker UPDATE won the race
    expect(outcomeTracker.scheduleOutcomeTrackingForEvent).toHaveBeenCalledTimes(2);
    // The second call should have the uppercase ticker in metadata
    const secondCall = outcomeTracker.scheduleOutcomeTrackingForEvent.mock.calls[1];
    expect(secondCall[1].metadata).toHaveProperty('ticker', 'AAPL');

    // Verify the DB UPDATE was actually executed to persist the ticker
    const executeCalls = (mockDb.execute as ReturnType<typeof vi.fn>).mock.calls;
    const updateCall = executeCalls.find((call: unknown[]) => {
      const sqlArg = call[0];
      // drizzle sql tagged templates produce objects with queryChunks or sql strings
      const sqlStr = typeof sqlArg === 'string' ? sqlArg
        : JSON.stringify(sqlArg);
      return sqlStr.includes('UPDATE') && sqlStr.includes('ticker');
    });
    expect(updateCall).toBeDefined();
  });

  it('does NOT schedule outcome tracking when UPDATE loses the race (0 rows affected)', async () => {
    const event = makeEvent();

    // db.execute call order:
    // 1. persistEventMetadata (llm_enrichment)     → []
    // 2. UPDATE events SET ticker RETURNING id      → [] (LOST the race)
    // 3. persistEventMetadata (delivery_gate)       → []
    const mockDb = makeMockDb([
      [],   // persist llm_enrichment
      [],   // ticker UPDATE lost race — 0 rows
      [],   // persist delivery_gate
    ]);

    const enricherResult = {
      tickers: [{ symbol: 'TSLA', name: 'Tesla', confidence: 0.9 }],
      summary: 'Tesla news',
    };

    const deps = makeMinimalDeps({
      db: mockDb as never,
      alertRouter: {
        enabled: true,
        route: vi.fn().mockResolvedValue({
          deliveries: [],
          decision: { tier: 'high', reason: 'test' },
        }),
      } as never,
      llmEnricher: {
        enabled: true,
        enrich: vi.fn().mockResolvedValue(enricherResult),
      } as never,
      outcomeTracker: outcomeTracker as unknown as OutcomeTracker,
    });

    wireEventPipeline(deps);
    deps.eventBus.publish(event);
    await new Promise((r) => setTimeout(r, 150));

    // Only the initial call (before enrichment) should happen — NOT the late-enrichment call
    expect(outcomeTracker.scheduleOutcomeTrackingForEvent).toHaveBeenCalledTimes(1);
    // Metadata should NOT have ticker (race lost)
    expect(event.metadata).not.toHaveProperty('ticker');
  });

  it('normalizes ticker casing to uppercase consistently', async () => {
    const event = makeEvent();

    const mockDb = makeMockDb([
      [],                            // persist llm_enrichment
      [{ id: 'evt-late-001' }],      // ticker UPDATE won race
      [],                            // persist ticker metadata
      [],                            // persist delivery_gate
    ]);

    const enricherResult = {
      tickers: [{ symbol: 'msft', name: 'Microsoft', confidence: 0.85 }],
      summary: 'Microsoft news',
    };

    const deps = makeMinimalDeps({
      db: mockDb as never,
      alertRouter: {
        enabled: true,
        route: vi.fn().mockResolvedValue({
          deliveries: [],
          decision: { tier: 'high', reason: 'test' },
        }),
      } as never,
      llmEnricher: {
        enabled: true,
        enrich: vi.fn().mockResolvedValue(enricherResult),
      } as never,
      outcomeTracker: outcomeTracker as unknown as OutcomeTracker,
    });

    wireEventPipeline(deps);
    deps.eventBus.publish(event);
    await new Promise((r) => setTimeout(r, 150));

    // In-memory metadata should be uppercase
    expect(event.metadata).toHaveProperty('ticker', 'MSFT');
  });
});
