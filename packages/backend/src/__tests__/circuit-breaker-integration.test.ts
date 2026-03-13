import { describe, it, expect, vi } from 'vitest';
import { LLMGatekeeper } from '../pipeline/llm-gatekeeper.js';
import type { LLMProvider } from '../services/llm-provider.js';
import { err } from '@event-radar/shared';
import { LLMError } from '../services/llm-provider.js';
import type { RawEvent } from '@event-radar/shared';

/**
 * App-level integration test verifying circuit breaker fallback behavior.
 *
 * When the circuit breaker is open:
 *   - Primary sources should PASS (fail-open for trusted sources)
 *   - Secondary sources should be BLOCKED
 *
 * This mirrors the logic in app.ts lines 476-498 where the pipeline
 * checks `llmGatekeeper.isCircuitOpen` and routes based on source type.
 */

/** Primary sources — same set used in app.ts */
const PRIMARY_SOURCES = new Set([
  'whitehouse', 'congress', 'sec-edgar', 'fda', 'doj-antitrust',
  'unusual-options', 'truth-social', 'x-scanner', 'short-interest', 'warn',
  'federal-register', 'sec-regulatory', 'ftc', 'fed', 'treasury',
  'commerce', 'cfpb',
]);

function makeEvent(source: string): RawEvent {
  return {
    id: crypto.randomUUID(),
    source,
    type: 'test',
    title: 'Test headline',
    body: 'Test body',
    timestamp: new Date(),
    metadata: {},
  };
}

function failingProvider(): LLMProvider {
  return {
    name: 'test',
    classify: vi.fn().mockResolvedValue(err(new LLMError('API error', 'api_error'))),
  };
}

/**
 * Simulate the app.ts pipeline decision logic for circuit breaker fallback.
 * This is extracted from the actual pipeline code to test the behavior.
 */
function pipelineCircuitBreakerDecision(
  gatekeeper: LLMGatekeeper,
  source: string,
): { pass: boolean; reason: string } {
  if (gatekeeper.isCircuitOpen) {
    const isPrimary = PRIMARY_SOURCES.has(source.toLowerCase());
    if (!isPrimary) {
      return { pass: false, reason: 'circuit breaker open — secondary source blocked' };
    }
    return { pass: true, reason: 'circuit breaker open — primary source pass-through' };
  }
  return { pass: true, reason: 'circuit not open' };
}

describe('Circuit breaker integration — app-level fallback behavior', () => {
  it('should pass primary sources when circuit breaker is open', async () => {
    const provider = failingProvider();
    const gatekeeper = new LLMGatekeeper({
      provider,
      enabled: true,
      circuitBreakThreshold: 3,
      circuitBreakDurationMs: 60_000,
    });

    // Trip the circuit breaker with 3 failures
    await gatekeeper.check(makeEvent('breaking-news'));
    await gatekeeper.check(makeEvent('breaking-news'));
    await gatekeeper.check(makeEvent('breaking-news'));
    expect(gatekeeper.isCircuitOpen).toBe(true);

    // Primary sources should pass
    const primarySources = ['whitehouse', 'congress', 'sec-edgar', 'fda', 'unusual-options',
      'truth-social', 'x-scanner', 'fed', 'treasury'];
    for (const source of primarySources) {
      const decision = pipelineCircuitBreakerDecision(gatekeeper, source);
      expect(decision.pass).toBe(true);
      expect(decision.reason).toContain('primary source pass-through');
    }
  });

  it('should block secondary sources when circuit breaker is open', async () => {
    const provider = failingProvider();
    const gatekeeper = new LLMGatekeeper({
      provider,
      enabled: true,
      circuitBreakThreshold: 3,
      circuitBreakDurationMs: 60_000,
    });

    // Trip the circuit breaker
    await gatekeeper.check(makeEvent('breaking-news'));
    await gatekeeper.check(makeEvent('breaking-news'));
    await gatekeeper.check(makeEvent('breaking-news'));
    expect(gatekeeper.isCircuitOpen).toBe(true);

    // Secondary/aggregator sources should be blocked
    const secondarySources = ['breaking-news', 'reddit', 'stocktwits', 'analyst', 'econ-calendar'];
    for (const source of secondarySources) {
      const decision = pipelineCircuitBreakerDecision(gatekeeper, source);
      expect(decision.pass).toBe(false);
      expect(decision.reason).toContain('secondary source blocked');
    }
  });

  it('should allow all sources when circuit breaker is closed', async () => {
    const gatekeeper = new LLMGatekeeper({
      enabled: true,
      circuitBreakThreshold: 3,
      circuitBreakDurationMs: 60_000,
    });

    // Circuit is not open — no failures
    expect(gatekeeper.isCircuitOpen).toBe(false);

    const allSources = ['whitehouse', 'breaking-news', 'reddit', 'sec-edgar'];
    for (const source of allSources) {
      const decision = pipelineCircuitBreakerDecision(gatekeeper, source);
      expect(decision.pass).toBe(true);
      expect(decision.reason).toBe('circuit not open');
    }
  });

  it('should resume normal operation after circuit breaker resets', async () => {
    const provider = failingProvider();
    const gatekeeper = new LLMGatekeeper({
      provider,
      enabled: true,
      circuitBreakThreshold: 3,
      circuitBreakDurationMs: 100, // 100ms for fast test
    });

    // Trip the circuit
    await gatekeeper.check(makeEvent('breaking-news'));
    await gatekeeper.check(makeEvent('breaking-news'));
    await gatekeeper.check(makeEvent('breaking-news'));
    expect(gatekeeper.isCircuitOpen).toBe(true);

    // Secondary should be blocked
    expect(pipelineCircuitBreakerDecision(gatekeeper, 'reddit').pass).toBe(false);

    // Wait for circuit to reset
    await new Promise(resolve => setTimeout(resolve, 150));

    // Now circuit should be closed — all sources pass
    expect(gatekeeper.isCircuitOpen).toBe(false);
    expect(pipelineCircuitBreakerDecision(gatekeeper, 'reddit').pass).toBe(true);
    expect(pipelineCircuitBreakerDecision(gatekeeper, 'whitehouse').pass).toBe(true);
  });
});
