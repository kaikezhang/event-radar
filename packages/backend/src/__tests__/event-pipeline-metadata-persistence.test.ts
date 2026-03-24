import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus, type ClassificationResult, type RawEvent } from '@event-radar/shared';
import { wireEventPipeline, type EventPipelineDeps } from '../event-pipeline.js';

function makeEvent(): RawEvent {
  return {
    id: 'evt-metadata-1',
    source: 'sec-edgar',
    type: '8-K',
    title: '8-K filing',
    body: 'Material event',
    timestamp: new Date('2026-03-24T12:00:00Z'),
    metadata: {},
  };
}

function makeRuleResult(): ClassificationResult {
  return {
    severity: 'HIGH',
    tags: [],
    priority: 10,
    matchedRules: ['rule-1'],
    confidence: 0.9,
    confidenceLevel: 'high',
  };
}

function makeDb(execute: ReturnType<typeof vi.fn>) {
  const returning = vi.fn().mockResolvedValue([
    { id: 'stored-event-1', createdAt: new Date('2026-03-24T12:00:00Z') },
  ]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });
  const tx = { insert, execute };
  const transaction = vi.fn(
    async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue([]),
  };
  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);

  return {
    execute,
    transaction,
    select: vi.fn().mockReturnValue(selectChain),
  };
}

function makeDeps(dbExecute: ReturnType<typeof vi.fn>) {
  const warn = vi.fn();
  const error = vi.fn();
  const deps: EventPipelineDeps = {
    server: {
      log: { info: vi.fn(), debug: vi.fn(), warn, error },
    } as never,
    eventBus: new InMemoryEventBus(),
    db: makeDb(dbExecute) as never,
    alertRouter: {
      enabled: true,
      route: vi.fn().mockResolvedValue({
        deliveries: [],
        decision: { tier: 'high', reason: 'test', pushMode: 'normal' },
      }),
    } as never,
    ruleEngine: {
      classify: vi.fn().mockReturnValue(makeRuleResult()),
    } as never,
    llmClassifier: undefined,
    deduplicator: {
      check: vi.fn().mockResolvedValue({ isDuplicate: false }),
      activeStoryCount: 0,
      getStory: vi.fn(),
      reset: vi.fn(),
    } as never,
    alertFilter: {
      check: vi.fn().mockReturnValue({ pass: true, enrichWithLLM: false, reason: 'L1 pass' }),
      resetCooldowns: vi.fn(),
    } as never,
    llmEnricher: { enabled: false, enrich: vi.fn() } as never,
    historicalEnricher: undefined,
    llmGatekeeper: { enabled: false, isCircuitOpen: false } as never,
    deliveryGate: {
      evaluate: vi.fn().mockReturnValue({ pass: true, tier: 'high', reason: 'test' }),
    } as never,
    auditLog: { record: vi.fn() } as never,
    pipelineLimiter: {
      enqueue: vi.fn().mockImplementation(({ run }: { run: () => Promise<void> }) => {
        void run().catch(() => undefined);
        return true;
      }),
    } as never,
    marketRegimeService: {
      getRegimeSnapshot: vi.fn().mockResolvedValue({
        score: 0,
        label: 'neutral',
        factors: {},
        amplification: { bullish: 1, bearish: 1 },
        updatedAt: '2026-03-24T12:00:00Z',
      }),
      getAmplificationFactor: vi.fn().mockReturnValue(1),
    } as never,
    startTime: 0,
  };

  wireEventPipeline(deps);

  return { deps, warn, error };
}

describe('event pipeline metadata persistence', () => {
  it('warns when metadata persistence updates zero rows', async () => {
    const { deps, warn } = makeDeps(vi.fn().mockResolvedValue({ rowCount: 0 }));

    await deps.eventBus.publish(makeEvent());

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          pipeline: true,
          stage: 'metadata_persist',
          eventId: 'stored-event-1',
        }),
      );
    });
  });

  it('logs an error when metadata persistence throws', async () => {
    const { deps, error } = makeDeps(vi.fn().mockRejectedValue(new Error('metadata write failed')));

    await deps.eventBus.publish(makeEvent());

    await vi.waitFor(() => {
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({
          pipeline: true,
          stage: 'metadata_persist',
          eventId: 'stored-event-1',
          error: 'metadata write failed',
        }),
      );
    });
  });
});
