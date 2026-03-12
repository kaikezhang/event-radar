import { describe, it, expect, vi } from 'vitest';
import {
  ok,
  type RawEvent,
  type ClassificationResult,
} from '@event-radar/shared';
import { LLMClassifierService } from '../services/llm-classifier.js';
import { MockProvider, type LLMProvider } from '../services/llm-provider.js';
import {
  buildClassifyPrompt,
  parseLLMClassification,
} from '../services/classification-prompt.js';
import { buildApp, type AppContext } from '../app.js';

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

function makeRuleResult(
  overrides: Partial<ClassificationResult> = {},
): ClassificationResult {
  return {
    severity: 'CRITICAL',
    tags: ['bankruptcy'],
    priority: 5,
    matchedRules: ['8k-1.03-bankruptcy'],
    confidence: 0.8,
    ...overrides,
  };
}

const VALID_LLM_JSON = JSON.stringify({
  eventType: 'filing',
  severity: 'CRITICAL',
  direction: 'bearish',
  confidence: 0.92,
  reasoning: 'Chapter 11 filing indicates severe financial distress.',
});

function mockLLMProvider(
  response: ReturnType<LLMProvider['classify']> extends Promise<infer R>
    ? R
    : never,
): LLMProvider {
  return {
    name: 'test-mock',
    classify: vi.fn().mockResolvedValue(response),
  };
}

/* ── 1. shouldUseLLM ─────────────────────────────────────────────── */

describe('LLMClassifierService.shouldUseLLM', () => {
  const service = new LLMClassifierService({ provider: new MockProvider() });

  it('returns true when rule confidence < 0.6', () => {
    const event = makeEvent();
    const ruleResult = makeRuleResult({ confidence: 0.4 });

    expect(service.shouldUseLLM(event, ruleResult)).toBe(true);
  });

  it('returns false when rule confidence >= 0.6', () => {
    const event = makeEvent();
    const ruleResult = makeRuleResult({ confidence: 0.8 });

    expect(service.shouldUseLLM(event, ruleResult)).toBe(false);
  });

  it('returns true when event is from reclassification queue', () => {
    const event = makeEvent({ metadata: { reclassification: true } });
    const ruleResult = makeRuleResult({ confidence: 0.9 });

    expect(service.shouldUseLLM(event, ruleResult)).toBe(true);
  });

  it('returns true when rule engine returns UNKNOWN (no matched rules)', () => {
    const event = makeEvent();
    const ruleResult = makeRuleResult({
      confidence: 0.8,
      matchedRules: [],
    });

    expect(service.shouldUseLLM(event, ruleResult)).toBe(true);
  });
});

/* ── 2. LLM classify ─────────────────────────────────────────────── */

describe('LLMClassifierService.classify', () => {
  it('parses valid LLM response correctly', async () => {
    const provider = mockLLMProvider(ok(VALID_LLM_JSON));
    const service = new LLMClassifierService({ provider });

    const result = await service.classify({ headline: 'Test Corp bankruptcy' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.eventType).toBe('filing');
      expect(result.value.severity).toBe('CRITICAL');
      expect(result.value.direction).toBe('bearish');
      expect(result.value.confidence).toBe(0.92);
      expect(result.value.reasoning).toContain('Chapter 11');
    }
  });

  it('returns error on invalid JSON from LLM', async () => {
    const provider = mockLLMProvider(ok('Not valid JSON'));
    const service = new LLMClassifierService({ provider });

    const result = await service.classify({ headline: 'Test event' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('parse_error');
    }
  });

  it('returns error on timeout', async () => {
    const slowProvider: LLMProvider = {
      name: 'slow',
      classify: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(ok(VALID_LLM_JSON)), 5000),
          ),
      ),
    };
    const service = new LLMClassifierService({
      provider: slowProvider,
      timeoutMs: 50,
    });

    const result = await service.classify({ headline: 'Slow event' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('timeout');
    }
  });

  it('returns error when rate limited', async () => {
    const provider = mockLLMProvider(ok(VALID_LLM_JSON));
    const service = new LLMClassifierService({
      provider,
      maxRequestsPerMinute: 2,
    });

    // Use up the rate limit
    await service.classify({ headline: 'Event 1' });
    await service.classify({ headline: 'Event 2' });

    // Third call should be rate limited
    const result = await service.classify({ headline: 'Event 3' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('rate_limit');
    }
  });
});

/* ── 3. MockProvider ─────────────────────────────────────────────── */

describe('MockProvider', () => {
  it('returns preset results', async () => {
    const provider = new MockProvider();
    const result = await provider.classify('any prompt');

    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = JSON.parse(result.value) as Record<string, unknown>;
      expect(parsed).toHaveProperty('eventType');
      expect(parsed).toHaveProperty('severity');
      expect(parsed).toHaveProperty('direction');
      expect(parsed).toHaveProperty('confidence');
      expect(parsed).toHaveProperty('reasoning');
    }
  });

  it('returns custom preset response', async () => {
    const customResponse = ok(
      JSON.stringify({
        eventType: 'earnings',
        severity: 'HIGH',
        direction: 'bullish',
        confidence: 0.88,
        reasoning: 'Beat earnings estimates.',
      }),
    );
    const provider = new MockProvider(customResponse);
    const result = await provider.classify('test');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.value)).toHaveProperty('eventType', 'earnings');
    }
  });
});

/* ── 4. Prompt construction ──────────────────────────────────────── */

describe('buildClassifyPrompt', () => {
  it('includes few-shot examples', () => {
    const prompt = buildClassifyPrompt({
      headline: 'AAPL reports Q4 earnings',
    });

    expect(prompt).toContain('Example 1:');
    expect(prompt).toContain('Example 2:');
    expect(prompt).toContain('Example 3:');
  });

  it('includes all input fields', () => {
    const prompt = buildClassifyPrompt({
      headline: 'Test headline',
      content: 'Test content',
      source: 'sec-edgar',
      ticker: 'AAPL',
    });

    expect(prompt).toContain('Headline: Test headline');
    expect(prompt).toContain('Content: Test content');
    expect(prompt).toContain('Source: sec-edgar');
    expect(prompt).toContain('Ticker: AAPL');
  });

  it('truncates long content', () => {
    const longContent = 'x'.repeat(3000);
    const prompt = buildClassifyPrompt({
      headline: 'Test',
      content: longContent,
    });

    expect(prompt).toContain('...');
    expect(prompt.length).toBeLessThan(longContent.length);
  });
});

/* ── 5. parseLLMClassification ───────────────────────────────────── */

describe('parseLLMClassification', () => {
  it('parses valid JSON', () => {
    const result = parseLLMClassification(VALID_LLM_JSON);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.eventType).toBe('filing');
      expect(result.value.severity).toBe('CRITICAL');
    }
  });

  it('handles code fences', () => {
    const wrapped = '```json\n' + VALID_LLM_JSON + '\n```';
    const result = parseLLMClassification(wrapped);

    expect(result.ok).toBe(true);
  });

  it('returns error for invalid JSON', () => {
    const result = parseLLMClassification('garbage');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('parse_error');
    }
  });
});

/* ── 6. Pipeline integration: skip LLM on high confidence ────────── */

describe('Pipeline: rule high confidence → skip LLM', () => {
  it('does not call LLM when rule confidence is high', () => {
    const provider = mockLLMProvider(ok(VALID_LLM_JSON));
    const service = new LLMClassifierService({ provider });
    const event = makeEvent();
    const ruleResult = makeRuleResult({ confidence: 0.9 });

    const useLLM = service.shouldUseLLM(event, ruleResult);

    expect(useLLM).toBe(false);
    expect(provider.classify).not.toHaveBeenCalled();
  });
});

/* ── 7. Pipeline integration: use LLM on low confidence ──────────── */

describe('Pipeline: rule low confidence → use LLM', () => {
  it('calls LLM when rule confidence is low', async () => {
    const provider = mockLLMProvider(ok(VALID_LLM_JSON));
    const service = new LLMClassifierService({ provider });
    const event = makeEvent();
    const ruleResult = makeRuleResult({ confidence: 0.3 });

    const useLLM = service.shouldUseLLM(event, ruleResult);
    expect(useLLM).toBe(true);

    const result = await service.classify({
      headline: event.title,
      source: event.source,
    });

    expect(result.ok).toBe(true);
    expect(provider.classify).toHaveBeenCalledOnce();
  });
});

/* ── 8. API endpoint: classify returns correct format ────────────── */

describe('POST /api/v1/classify', () => {
  const TEST_API_KEY = 'test-key-123';
  let ctx: AppContext;

  it('returns correct format with rule + method fields', async () => {
    ctx = buildApp({ logger: false, apiKey: TEST_API_KEY });

    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/v1/classify',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: {
        headline: 'AAPL announces stock split',
        source: 'sec-edgar',
        ticker: 'AAPL',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;

    expect(body).toHaveProperty('rule');
    expect(body).toHaveProperty('final');
    expect(body).toHaveProperty('method');

    const rule = body.rule as Record<string, unknown>;
    expect(rule).toHaveProperty('severity');
    expect(rule).toHaveProperty('tags');
    expect(rule).toHaveProperty('priority');
    expect(rule).toHaveProperty('matchedRules');

    await ctx.server.close();
  });

  it('returns 401 without API key', async () => {
    ctx = buildApp({ logger: false, apiKey: TEST_API_KEY });

    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/v1/classify',
      payload: { headline: 'test' },
    });

    expect(response.statusCode).toBe(401);

    await ctx.server.close();
  });
});
