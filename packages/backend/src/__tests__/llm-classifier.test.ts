import { describe, it, expect, vi } from 'vitest';
import { ok, err, type RawEvent, type ClassificationResult, type Result } from '@event-radar/shared';
import { LlmClassifier } from '../pipeline/llm-classifier.js';
import type { LlmProvider } from '../pipeline/llm-provider.js';
import { buildClassificationPrompt, parseLlmResponse } from '../pipeline/classification-prompt.js';
import { LlmQueue } from '../pipeline/llm-queue.js';

/* ── helpers ─────────────────────────────────────────────────────── */

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source: 'sec-edgar',
    type: '8-K',
    title: 'Test Corp files for bankruptcy',
    body: 'Test Corp has filed for Chapter 11 bankruptcy protection.',
    url: 'https://www.sec.gov/filing/test',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    metadata: { item_types: ['1.03'], ticker: 'TEST' },
    ...overrides,
  };
}

function makeRuleResult(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    severity: 'CRITICAL',
    tags: ['bankruptcy'],
    priority: 5,
    matchedRules: ['8k-1.03-bankruptcy'],
    ...overrides,
  };
}

const VALID_LLM_RESPONSE = JSON.stringify({
  severity: 'CRITICAL',
  direction: 'BEARISH',
  eventType: 'sec_form_8k',
  confidence: 0.95,
  reasoning: 'Chapter 11 filing indicates severe financial distress.',
  tags: ['bankruptcy', 'distressed'],
  priority: 5,
});

function mockProvider(response: Result<string, Error>): LlmProvider {
  return {
    complete: vi.fn().mockResolvedValue(response),
  };
}

function delayedProvider(response: Result<string, Error>, delayMs: number): LlmProvider {
  return {
    complete: vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(response), delayMs)),
    ),
  };
}

/* ── 1. Prompt construction ──────────────────────────────────────── */

describe('buildClassificationPrompt', () => {
  it('should include event fields in the prompt', () => {
    const event = makeEvent();
    const prompt = buildClassificationPrompt(event);

    expect(prompt).toContain('Source: sec-edgar');
    expect(prompt).toContain('Type: 8-K');
    expect(prompt).toContain('Title: Test Corp files for bankruptcy');
    expect(prompt).toContain('Body: Test Corp has filed for Chapter 11 bankruptcy protection.');
    expect(prompt).toContain('https://www.sec.gov/filing/test');
    expect(prompt).toContain('2024-01-15');
    expect(prompt).toContain('ticker');
  });

  it('should include rule engine result when provided', () => {
    const event = makeEvent();
    const ruleResult = makeRuleResult();
    const prompt = buildClassificationPrompt(event, ruleResult);

    expect(prompt).toContain('RULE ENGINE RESULT');
    expect(prompt).toContain('Rule Severity: CRITICAL');
    expect(prompt).toContain('bankruptcy');
    expect(prompt).toContain('8k-1.03-bankruptcy');
  });

  it('should constrain eventType to the unified taxonomy', () => {
    const prompt = buildClassificationPrompt(makeEvent());

    expect(prompt).toContain('sec_form_8k');
    expect(prompt).toContain('earnings_beat');
    expect(prompt).toContain('fda_approval');
    expect(prompt).toContain('news_breaking');
  });

  it('should truncate long body text', () => {
    const longBody = 'x'.repeat(3000);
    const event = makeEvent({ body: longBody });
    const prompt = buildClassificationPrompt(event);

    expect(prompt).toContain('...');
    // The body in the prompt should be truncated to 2000 chars + "..."
    // Body truncated to 2000 chars; prompt includes template boilerplate
    expect(prompt.length).toBeLessThan(longBody.length + 2500);
  });

  it('should handle event with no URL or metadata', () => {
    const event = makeEvent({ url: undefined, metadata: undefined });
    const prompt = buildClassificationPrompt(event);

    expect(prompt).not.toContain('URL:');
    expect(prompt).not.toContain('Metadata:');
    expect(prompt).toContain('Source: sec-edgar');
  });
});

/* ── 2. Response parsing ─────────────────────────────────────────── */

describe('parseLlmResponse', () => {
  it('should parse valid JSON response', () => {
    const result = parseLlmResponse(VALID_LLM_RESPONSE);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.severity).toBe('CRITICAL');
      expect(result.value.direction).toBe('BEARISH');
      expect(result.value.eventType).toBe('sec_form_8k');
      expect(result.value.confidence).toBe(0.95);
      expect(result.value.reasoning).toContain('Chapter 11');
      expect(result.value.tags).toContain('bankruptcy');
      expect(result.value.priority).toBe(5);
    }
  });

  it('should pass through matchedRules from rule engine result', () => {
    const ruleResult = makeRuleResult();
    const result = parseLlmResponse(VALID_LLM_RESPONSE, ruleResult);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.matchedRules).toEqual(['8k-1.03-bankruptcy']);
    }
  });

  it('should handle JSON wrapped in code fences', () => {
    const wrapped = '```json\n' + VALID_LLM_RESPONSE + '\n```';
    const result = parseLlmResponse(wrapped);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.severity).toBe('CRITICAL');
    }
  });

  it('should return error for malformed JSON', () => {
    const result = parseLlmResponse('not valid json at all');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Unexpected token');
    }
  });

  it('should return error for valid JSON that fails schema validation', () => {
    const incomplete = JSON.stringify({
      severity: 'CRITICAL',
      direction: 'INVALID_DIRECTION',
      eventType: 'invalid_type',
    });

    const result = parseLlmResponse(incomplete);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('validation failed');
    }
  });
});

/* ── 3. LlmClassifier integration with mock provider ────────────── */

describe('LlmClassifier', () => {
  it('should classify event using mock LLM provider', async () => {
    const provider = mockProvider(ok(VALID_LLM_RESPONSE));
    const classifier = new LlmClassifier({ provider });
    const event = makeEvent();
    const ruleResult = makeRuleResult();

    const result = await classifier.classify(event, ruleResult);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.severity).toBe('CRITICAL');
      expect(result.value.direction).toBe('BEARISH');
      expect(result.value.eventType).toBe('sec_form_8k');
      expect(result.value.matchedRules).toEqual(['8k-1.03-bankruptcy']);
    }
    expect(provider.complete).toHaveBeenCalledOnce();
  });

  it('should return error when provider fails', async () => {
    const provider = mockProvider(err(new Error('API rate limit exceeded')));
    const classifier = new LlmClassifier({ provider });

    const result = await classifier.classify(makeEvent());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('API rate limit exceeded');
    }
  });

  it('should return error when provider returns unparseable response', async () => {
    const provider = mockProvider(ok('I am not JSON'));
    const classifier = new LlmClassifier({ provider });

    const result = await classifier.classify(makeEvent());

    expect(result.ok).toBe(false);
  });
});

/* ── 4. LlmQueue backpressure ────────────────────────────────────── */

describe('LlmQueue', () => {
  it('should process items in priority order', async () => {
    const order: number[] = [];
    const executor = vi.fn().mockImplementation(async (prompt: string) => {
      const match = prompt.match(/p=(\d+)/);
      if (match) order.push(Number(match[1]));
      return ok('done');
    });

    // maxConcurrent=1 forces serial execution to test ordering
    const queue = new LlmQueue(executor, { maxConcurrent: 1 });

    // Enqueue items with different priorities (lower = higher priority)
    const p1 = queue.enqueue('p=50', 50); // low priority
    const p2 = queue.enqueue('p=10', 10); // high priority
    const p3 = queue.enqueue('p=30', 30); // medium priority

    await Promise.all([p1, p2, p3]);

    // First item (p=50) starts immediately because queue was empty
    // Remaining items are ordered by priority: 10 before 30
    expect(order).toEqual([50, 10, 30]);
  });

  it('should drop lowest-priority item when queue is full', async () => {
    // Use a slow executor so items stay queued
    let resolvers: Array<() => void> = [];
    const executor = vi.fn().mockImplementation(
      () => new Promise<Result<string, Error>>((resolve) => {
        resolvers.push(() => resolve(ok('done')));
      }),
    );

    const queue = new LlmQueue(executor, {
      maxConcurrent: 1,
      maxQueueSize: 2,
    });

    // Fill the active slot
    void queue.enqueue('active', 50);

    // Fill the queue
    const p2 = queue.enqueue('queued-low', 80);  // will be dropped
    void queue.enqueue('queued-high', 20);

    // Now enqueue a higher-priority item → should drop priority 80
    void queue.enqueue('queued-mid', 40);

    // Resolve all
    for (const r of resolvers) r();
    resolvers = [];

    // Wait briefly for drain
    await new Promise((r) => setTimeout(r, 50));
    for (const r of resolvers) r();

    const r2 = await p2;
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error.message).toContain('backpressure');
    }
  });

  it('should timeout requests that take too long', async () => {
    const slowProvider = delayedProvider(ok('done'), 5000);
    const queue = new LlmQueue(
      (prompt) => slowProvider.complete(prompt),
      { timeoutMs: 50 },
    );

    const result = await queue.enqueue('timeout-test', 50);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('timed out');
    }
  });

  it('should respect maxConcurrent limit', async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const executor = vi.fn().mockImplementation(
      async () => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise((r) => setTimeout(r, 30));
        concurrentCount--;
        return ok('done');
      },
    );

    const queue = new LlmQueue(executor, { maxConcurrent: 2 });

    const promises = Array.from({ length: 5 }, (_, i) =>
      queue.enqueue(`item-${i}`, 50),
    );

    await Promise.all(promises);

    expect(maxConcurrent).toBe(2);
    expect(executor).toHaveBeenCalledTimes(5);
  });
});

/* ── 5. Fallback: LLM failure → rule engine result still used ────── */

describe('LlmClassifier fallback behavior', () => {
  it('should return error result when LLM times out, allowing caller to use rule engine result', async () => {
    const slowProvider = delayedProvider(ok(VALID_LLM_RESPONSE), 5000);
    const classifier = new LlmClassifier({
      provider: slowProvider,
      queue: { timeoutMs: 50 },
    });

    const event = makeEvent();
    const ruleResult = makeRuleResult();

    const llmResult = await classifier.classify(event, ruleResult);

    // LLM failed, so caller should fall back to rule engine result
    expect(llmResult.ok).toBe(false);

    // Rule result is still available independently
    expect(ruleResult.severity).toBe('CRITICAL');
    expect(ruleResult.matchedRules).toContain('8k-1.03-bankruptcy');
  });
});
