import { describe, it, expect, vi } from 'vitest';
import { ok, InMemoryEventBus, type ClassificationResult, type RawEvent } from '@event-radar/shared';
import { wireEventPipeline, type EventPipelineDeps } from '../event-pipeline.js';

function makePoliticalEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: 'political-evt-1',
    source: 'truth-social',
    type: 'political-post',
    title: 'POSTPONE MILITARY STRIKES',
    body: 'I have instructed the Department of War to postpone military strikes.',
    timestamp: new Date('2026-03-23T10:00:00Z'),
    metadata: { author: 'trump' },
    ...overrides,
  };
}

function makeMockDb() {
  const insertedRows: Record<string, unknown>[] = [];
  const execute = vi.fn().mockResolvedValue([]);
  const returning = vi.fn().mockResolvedValue([
    { id: 'stored-event-1', createdAt: new Date('2026-03-23T10:00:00Z') },
  ]);
  const values = vi.fn().mockImplementation((row: Record<string, unknown>) => {
    insertedRows.push(row);
    return { returning };
  });
  const insert = vi.fn().mockReturnValue({ values });
  const tx = { insert, execute };
  const transaction = vi.fn(
    async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );

  return {
    db: { execute, transaction },
    insertedRows,
  };
}

function makeRuleResult(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    severity: 'MEDIUM',
    tags: ['political-market-impact', 'force-llm-classification'],
    priority: 12,
    matchedRules: ['trump-policy-postpone'],
    confidence: 0.95,
    confidenceLevel: 'high',
    ...overrides,
  };
}

function makeDeps(
  ruleResult: ClassificationResult,
  llmSeverity: 'LOW' | 'CRITICAL',
) {
  const eventBus = new InMemoryEventBus();
  const { db, insertedRows } = makeMockDb();
  const alertRouter = {
    enabled: true,
    route: vi.fn().mockResolvedValue({
      deliveries: [],
      decision: { tier: 'high', reason: 'test', pushMode: 'normal' },
    }),
  };
  const deliveryGate = {
    evaluate: vi.fn().mockReturnValue({ pass: true, tier: 'high', reason: 'test' }),
  };

  const deps: EventPipelineDeps = {
    server: {
      log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as never,
    eventBus,
    db: db as never,
    alertRouter: alertRouter as never,
    ruleEngine: {
      classify: vi.fn().mockReturnValue(ruleResult),
    } as never,
    llmClassifier: {
      classify: vi.fn().mockResolvedValue(ok({
        severity: llmSeverity,
        direction: 'NEUTRAL',
        eventType: 'geopolitical_event',
        confidence: llmSeverity === 'LOW' ? 0.41 : 0.93,
        reasoning: llmSeverity === 'LOW'
          ? 'Slogan-level rhetoric with no concrete market action.'
          : 'Concrete trade policy action with immediate market impact.',
        tags: llmSeverity === 'LOW' ? ['political'] : ['trade-policy', 'tariff'],
        priority: llmSeverity === 'LOW' ? 40 : 5,
        matchedRules: ruleResult.matchedRules,
      })),
    } as never,
    deduplicator: {
      check: vi.fn().mockResolvedValue({ isDuplicate: false }),
      activeStoryCount: 0,
      getStory: vi.fn(),
      reset: vi.fn(),
    } as never,
    alertFilter: {
      check: vi.fn().mockReturnValue({ pass: true, enrichWithLLM: false, reason: 'test' }),
      resetCooldowns: vi.fn(),
    } as never,
    llmEnricher: { enabled: false, enrich: vi.fn() } as never,
    historicalEnricher: undefined,
    llmGatekeeper: { enabled: false, isCircuitOpen: false } as never,
    deliveryGate: deliveryGate as never,
    auditLog: { record: vi.fn() } as never,
    pipelineLimiter: {
      enqueue: vi.fn().mockImplementation(({ run }: { run: () => Promise<void> }) => {
        void run();
        return true;
      }),
    } as never,
    marketRegimeService: {
      getRegimeSnapshot: vi.fn().mockResolvedValue({
        score: 0,
        label: 'neutral',
        factors: {},
        amplification: { bullish: 1, bearish: 1 },
        updatedAt: '2026-03-23T10:00:00Z',
      }),
      getAmplificationFactor: vi.fn().mockReturnValue(1),
    } as never,
    startTime: 0,
  };

  return { deps, insertedRows, alertRouter, deliveryGate };
}

describe('political LLM severity in event pipeline', () => {
  it('keeps forced political classifications rule-only when the rule severity is below HIGH', async () => {
    const ruleResult = makeRuleResult();
    const { deps, insertedRows, alertRouter, deliveryGate } = makeDeps(ruleResult, 'LOW');
    const payloads: Array<Record<string, unknown>> = [];
    const unsubscribe = deps.eventBus.subscribeTopic?.('event:classified', (payload) => {
      payloads.push(payload as Record<string, unknown>);
    });

    wireEventPipeline(deps);
    await deps.eventBus.publish(makePoliticalEvent());

    await vi.waitFor(() => {
      expect(insertedRows).toHaveLength(1);
      expect(payloads).toHaveLength(1);
    });

    expect(deps.llmClassifier?.classify).not.toHaveBeenCalled();
    expect(insertedRows[0]?.['severity']).toBe('MEDIUM');
    expect(payloads[0]?.['severity']).toBe('MEDIUM');
    expect(deliveryGate.evaluate).toHaveBeenCalledWith(expect.objectContaining({
      classifierSeverity: 'MEDIUM',
      classificationConfidence: 0.95,
      confidenceBucket: 'high',
    }));
    expect(alertRouter.route).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'MEDIUM',
      classificationConfidence: 0.95,
      confidenceBucket: 'high',
    }));

    unsubscribe?.();
  });

  it('keeps tariff posts at CRITICAL while still running LLM validation', async () => {
    const ruleResult = makeRuleResult({
      severity: 'CRITICAL',
      priority: 5,
      matchedRules: ['trump-tariff'],
      tags: ['political-market-impact', 'force-llm-classification', 'tariff', 'trade-policy'],
    });
    const { deps, insertedRows, alertRouter, deliveryGate } = makeDeps(ruleResult, 'LOW');
    const event = makePoliticalEvent({
      title: 'Tariffs on China are going up',
      body: 'We are imposing tariffs on China.',
    });

    wireEventPipeline(deps);
    await deps.eventBus.publish(event);

    await vi.waitFor(() => {
      expect(insertedRows).toHaveLength(1);
    });

    expect(deps.llmClassifier?.classify).toHaveBeenCalledOnce();
    expect(insertedRows[0]?.['severity']).toBe('CRITICAL');
    expect(deliveryGate.evaluate).toHaveBeenCalledWith(expect.objectContaining({
      classifierSeverity: 'CRITICAL',
    }));
    expect(alertRouter.route).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'CRITICAL',
    }));
  });
});
