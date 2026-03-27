import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InMemoryEventBus,
  type ClassificationResult,
  type RawEvent,
} from '@event-radar/shared';
import { wireEventPipeline, type EventPipelineDeps } from '../event-pipeline.js';

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: 'evt-enrichment-001',
    source: 'breaking-news',
    type: 'headline',
    title: 'Breaking market catalyst',
    body: 'A material update is moving the market.',
    timestamp: new Date('2026-03-23T12:00:00.000Z'),
    metadata: {},
    ...overrides,
  };
}

function makeMockDb() {
  const execute = vi.fn().mockResolvedValue([]);
  const returning = vi.fn().mockResolvedValue([
    { id: 'evt-enrichment-db-001', createdAt: new Date('2026-03-23T12:00:00.000Z') },
  ]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });
  const transaction = vi.fn(
    async (callback: (tx: { insert: typeof insert; execute: typeof execute }) => Promise<unknown>) =>
      callback({ insert, execute }),
  );

  return { execute, transaction };
}

function makeDeps({
  severity = 'HIGH',
  enrichWithLLM = false,
  enrichResult = { summary: 'LLM summary', tickers: [] },
  db = undefined,
}: {
  severity?: ClassificationResult['severity'];
  enrichWithLLM?: boolean;
  enrichResult?: unknown;
  db?: ReturnType<typeof makeMockDb> | undefined;
} = {}) {
  const eventBus = new InMemoryEventBus();
  const warn = vi.fn();
  const error = vi.fn();
  const llmEnricher = {
    enabled: true,
    enrich: vi.fn().mockResolvedValue(enrichResult),
  };
  const alertRouter = {
    enabled: true,
    route: vi.fn().mockResolvedValue({
      deliveries: [],
      decision: { tier: 'high', reason: 'test', pushMode: 'normal' },
    }),
  };

  const deps: EventPipelineDeps = {
    server: {
      log: { info: vi.fn(), debug: vi.fn(), warn, error },
    } as never,
    eventBus,
    db: db as never,
    alertRouter: alertRouter as never,
    ruleEngine: {
      classify: vi.fn().mockReturnValue({
        severity,
        confidence: 0.92,
        confidenceLevel: 'high',
        matchedRules: ['rule-1'],
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
      check: vi.fn().mockReturnValue({ pass: true, enrichWithLLM, reason: 'test' }),
      resetCooldowns: vi.fn(),
    } as never,
    llmEnricher: llmEnricher as never,
    historicalEnricher: undefined,
    llmGatekeeper: { enabled: false, isCircuitOpen: false } as never,
    deliveryGate: {
      evaluate: vi.fn().mockReturnValue({ pass: true, tier: 'high', reason: 'test' }),
    } as never,
    auditLog: { record: vi.fn() } as never,
    pipelineLimiter: {
      enqueue: vi.fn().mockImplementation(({ run }: { run: () => Promise<void> }) => {
        void run();
        return true;
      }),
    } as never,
    startTime: 0,
  };

  return { deps, llmEnricher, alertRouter, warn, error };
}

async function publishAndFlush(eventBus: InMemoryEventBus, event: RawEvent): Promise<void> {
  await eventBus.publish(event);
  await vi.waitFor(() => {
    expect(true).toBe(true);
  });
}

describe('LLM enrichment regression handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forces enrichment for HIGH events even when the filter does not request it', async () => {
    const event = makeEvent();
    const { deps, llmEnricher } = makeDeps({ severity: 'HIGH', enrichWithLLM: false });

    wireEventPipeline(deps);
    await publishAndFlush(deps.eventBus, event);

    expect(llmEnricher.enrich).toHaveBeenCalledWith(
      event,
      undefined,
      { severity: 'HIGH' },
    );
  });

  it('forces enrichment for CRITICAL events even when the filter does not request it', async () => {
    const event = makeEvent({ title: 'Critical catalyst' });
    const { deps, llmEnricher } = makeDeps({ severity: 'CRITICAL', enrichWithLLM: false });

    wireEventPipeline(deps);
    await publishAndFlush(deps.eventBus, event);

    expect(llmEnricher.enrich).toHaveBeenCalledWith(
      event,
      undefined,
      { severity: 'CRITICAL' },
    );
  });

  it('does not force enrichment for MEDIUM events when the filter opts out', async () => {
    const event = makeEvent({ title: 'Medium catalyst' });
    const { deps, llmEnricher } = makeDeps({ severity: 'MEDIUM', enrichWithLLM: false });

    wireEventPipeline(deps);
    await publishAndFlush(deps.eventBus, event);

    expect(llmEnricher.enrich).not.toHaveBeenCalled();
  });

  it('continues delivery and marks metadata when enrichment fails for HIGH events', async () => {
    const db = makeMockDb();
    const event = makeEvent({ title: 'High severity event' });
    const { deps, llmEnricher, alertRouter, warn, error } = makeDeps({ severity: 'HIGH', enrichWithLLM: true, db });
    llmEnricher.enrich.mockRejectedValueOnce(new Error('rate limited'));

    wireEventPipeline(deps);
    await publishAndFlush(deps.eventBus, event);

    await vi.waitFor(() => {
      expect(alertRouter.route).toHaveBeenCalledOnce();
    });

    expect(event.metadata).toMatchObject({ enrichment_failed: true });
    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    const persistedMetadataWrite = db.execute.mock.calls.find(([statement]) => (
      typeof statement?.queryChunks?.[1] === 'string'
      && statement.queryChunks[1].includes('"enrichment_failed":true')
    ));
    expect(persistedMetadataWrite).toBeDefined();
  });

  it('continues delivery without marking enrichment_failed for LOW events', async () => {
    const event = makeEvent({ title: 'Low severity event' });
    const { deps, llmEnricher, alertRouter } = makeDeps({ severity: 'LOW', enrichWithLLM: true });
    llmEnricher.enrich.mockRejectedValueOnce(new Error('timeout'));

    wireEventPipeline(deps);
    await publishAndFlush(deps.eventBus, event);

    await vi.waitFor(() => {
      expect(alertRouter.route).toHaveBeenCalledOnce();
    });

    expect(event.metadata?.['enrichment_failed']).toBeUndefined();
  });
});
