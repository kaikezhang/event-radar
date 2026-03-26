import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus, type ClassificationResult, type RawEvent } from '@event-radar/shared';
import { wireEventPipeline, type EventPipelineDeps } from '../event-pipeline.js';

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: 'evt-llm-gating-1',
    source: 'sec-edgar',
    type: '8-K',
    title: '8-K: material agreement',
    body: 'Material agreement filed.',
    timestamp: new Date('2026-03-24T10:00:00Z'),
    metadata: { ticker: 'AAPL' },
    ...overrides,
  };
}

function makeRuleResult(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    severity: 'HIGH',
    tags: [],
    priority: 10,
    matchedRules: ['rule-1'],
    confidence: 0.91,
    confidenceLevel: 'high',
    ...overrides,
  };
}

function makeDeps(
  event: RawEvent,
  ruleResult: ClassificationResult,
) {
  const llmClassifier = {
    classify: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        severity: 'HIGH',
        direction: 'BULLISH',
        eventType: 'sec_form_8k',
        confidence: 0.92,
        reasoning: 'Material filing.',
        tags: ['material'],
        priority: 8,
        matchedRules: ['rule-1'],
      },
    }),
  };

  const deps: EventPipelineDeps = {
    server: {
      log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as never,
    eventBus: new InMemoryEventBus(),
    db: undefined,
    alertRouter: { enabled: false, route: vi.fn() } as never,
    ruleEngine: {
      classify: vi.fn().mockReturnValue(ruleResult),
    } as never,
    llmClassifier: llmClassifier as never,
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

  wireEventPipeline(deps);

  return {
    deps,
    llmClassifier,
    publish: async () => {
      await deps.eventBus.publish(event);
      await new Promise((resolve) => setTimeout(resolve, 25));
    },
  };
}

describe('event pipeline LLM gating', () => {
  it('runs the LLM classifier for HIGH events', async () => {
    const event = makeEvent();
    const ruleResult = makeRuleResult({ severity: 'HIGH' });
    const { llmClassifier, publish } = makeDeps(event, ruleResult);

    await publish();

    expect(llmClassifier.classify).toHaveBeenCalledOnce();
  });

  it('skips the LLM classifier for MEDIUM events', async () => {
    const event = makeEvent();
    const ruleResult = makeRuleResult({ severity: 'MEDIUM' });
    const { llmClassifier, publish } = makeDeps(event, ruleResult);

    await publish();

    expect(llmClassifier.classify).not.toHaveBeenCalled();
  });

  it('runs the LLM classifier for high-severity social events with engagement metadata', async () => {
    const event = makeEvent({
      source: 'social-signal',
      type: 'social-post',
      title: 'AI chatter',
      body: 'Bullish crowding',
      metadata: {
        ticker: 'AAPL',
        upvotes: 1200,
        comments: 140,
      },
    });
    const { llmClassifier, publish } = makeDeps(event, makeRuleResult({ severity: 'HIGH' }));

    await publish();

    expect(llmClassifier.classify).toHaveBeenCalledOnce();
  });

  it('skips the LLM classifier for routine Form 4 events', async () => {
    const event = makeEvent({
      type: 'form-4',
      title: 'Form 4 - CEO sale under 10b5-1 plan',
      body: 'Routine planned insider sale.',
      metadata: {
        ticker: 'AAPL',
        shares: 10000,
        transactionValue: 2_500_000,
      },
    });
    const { llmClassifier, publish } = makeDeps(event, makeRuleResult({ severity: 'HIGH' }));

    await publish();

    expect(llmClassifier.classify).not.toHaveBeenCalled();
  });
});
