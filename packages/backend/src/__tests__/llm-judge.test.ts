import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMGatekeeper, getMarketSession } from '../pipeline/llm-gatekeeper.js';
import type { RawEvent } from '@event-radar/shared';
import type { LLMProvider } from '../services/llm-provider.js';
import { ok, err } from '@event-radar/shared';
import { LLMError } from '../services/llm-provider.js';

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: crypto.randomUUID(),
    source: 'breaking-news',
    type: 'breaking-news',
    title: 'Test headline',
    body: 'Test body',
    timestamp: new Date(),
    metadata: {},
    ...overrides,
  };
}

function mockProvider(response: string): LLMProvider {
  return {
    name: 'test',
    classify: vi.fn().mockResolvedValue(ok(response)),
  };
}

function failingProvider(error?: Error): LLMProvider {
  return {
    name: 'test',
    classify: vi.fn().mockResolvedValue(err(error ?? new LLMError('API error', 'api_error'))),
  };
}

// --- getMarketSession tests ---

describe('getMarketSession', () => {
  // Helper: create a Date in ET timezone at specific day/time
  // We build a UTC date that corresponds to the desired ET time
  function etDate(year: number, month: number, day: number, hour: number, minute: number): Date {
    // Create the date string as if it's ET, then find the UTC equivalent
    // Use toLocaleString round-trip to handle DST correctly
    const etStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    // Parse as ET by creating a date and adjusting
    // Simple approach: create Date with explicit timezone offset
    const tempDate = new Date(etStr);
    const utcStr = tempDate.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const utcDate = new Date(utcStr);
    const offset = utcDate.getTime() - tempDate.getTime();
    return new Date(tempDate.getTime() - offset);
  }

  it('should return RTH during regular trading hours (Mon-Fri 9:30-16:00 ET)', () => {
    // Wednesday 2026-03-11 at 10:00 ET
    const d = etDate(2026, 3, 11, 10, 0);
    expect(getMarketSession(d)).toBe('RTH');
  });

  it('should return RTH at exactly 9:30 ET', () => {
    // Wednesday at 9:30 ET
    const d = etDate(2026, 3, 11, 9, 30);
    expect(getMarketSession(d)).toBe('RTH');
  });

  it('should return PRE at 9:29 ET (one minute before RTH)', () => {
    const d = etDate(2026, 3, 11, 9, 29);
    expect(getMarketSession(d)).toBe('PRE');
  });

  it('should return POST at exactly 16:00 ET', () => {
    const d = etDate(2026, 3, 11, 16, 0);
    expect(getMarketSession(d)).toBe('POST');
  });

  it('should return RTH at 15:59 ET', () => {
    const d = etDate(2026, 3, 11, 15, 59);
    expect(getMarketSession(d)).toBe('RTH');
  });

  it('should return POST at 16:01 ET', () => {
    const d = etDate(2026, 3, 11, 16, 1);
    expect(getMarketSession(d)).toBe('POST');
  });

  it('should return PRE at 4:00 ET', () => {
    const d = etDate(2026, 3, 11, 4, 0);
    expect(getMarketSession(d)).toBe('PRE');
  });

  it('should return CLOSED at 3:59 ET', () => {
    const d = etDate(2026, 3, 11, 3, 59);
    expect(getMarketSession(d)).toBe('CLOSED');
  });

  it('should return CLOSED at 20:00 ET', () => {
    const d = etDate(2026, 3, 11, 20, 0);
    expect(getMarketSession(d)).toBe('CLOSED');
  });

  it('should return POST at 19:59 ET', () => {
    const d = etDate(2026, 3, 11, 19, 59);
    expect(getMarketSession(d)).toBe('POST');
  });

  it('should return CLOSED on Saturday', () => {
    // Saturday 2026-03-14
    const d = etDate(2026, 3, 14, 12, 0);
    expect(getMarketSession(d)).toBe('CLOSED');
  });

  it('should return CLOSED on Sunday', () => {
    // Sunday 2026-03-15
    const d = etDate(2026, 3, 15, 10, 0);
    expect(getMarketSession(d)).toBe('CLOSED');
  });

  it('should return CLOSED at midnight on a weekday', () => {
    const d = etDate(2026, 3, 11, 0, 0);
    expect(getMarketSession(d)).toBe('CLOSED');
  });
});

// --- Circuit breaker tests ---

describe('LLMGatekeeper circuit breaker', () => {
  it('should open circuit after 3 consecutive failures', async () => {
    const provider = failingProvider();
    const gatekeeper = new LLMGatekeeper({
      provider,
      enabled: true,
      circuitBreakThreshold: 3,
      circuitBreakDurationMs: 60_000,
    });

    const event = makeEvent();

    // 3 failures should trigger circuit break
    await gatekeeper.check(event);
    await gatekeeper.check(event);
    await gatekeeper.check(event);

    expect(gatekeeper.isCircuitOpen).toBe(true);
  });

  it('should not open circuit after fewer than threshold failures', async () => {
    const provider = failingProvider();
    const gatekeeper = new LLMGatekeeper({
      provider,
      enabled: true,
      circuitBreakThreshold: 3,
      circuitBreakDurationMs: 60_000,
    });

    const event = makeEvent();

    await gatekeeper.check(event);
    await gatekeeper.check(event);

    expect(gatekeeper.isCircuitOpen).toBe(false);
  });

  it('should return fallback result when circuit is open', async () => {
    const provider = failingProvider();
    const gatekeeper = new LLMGatekeeper({
      provider,
      enabled: true,
      circuitBreakThreshold: 3,
      circuitBreakDurationMs: 60_000,
    });

    const event = makeEvent();

    // Trip the circuit
    await gatekeeper.check(event);
    await gatekeeper.check(event);
    await gatekeeper.check(event);

    // Next check should use fallback
    const result = await gatekeeper.check(event);
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('circuit breaker');
    // LLM should NOT be called (circuit is open)
    expect(provider.classify).toHaveBeenCalledTimes(3);
  });

  it('should reset circuit after duration expires', async () => {
    const provider = failingProvider();
    const gatekeeper = new LLMGatekeeper({
      provider,
      enabled: true,
      circuitBreakThreshold: 3,
      circuitBreakDurationMs: 100, // 100ms for testing
    });

    const event = makeEvent();

    // Trip the circuit
    await gatekeeper.check(event);
    await gatekeeper.check(event);
    await gatekeeper.check(event);
    expect(gatekeeper.isCircuitOpen).toBe(true);

    // Wait for circuit to close
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(gatekeeper.isCircuitOpen).toBe(false);
  });

  it('should reset failure count on successful call', async () => {
    let callCount = 0;
    const provider: LLMProvider = {
      name: 'test',
      classify: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) return err(new LLMError('fail', 'api_error'));
        return ok('PASS 0.90 good event');
      }),
    };

    const gatekeeper = new LLMGatekeeper({
      provider,
      enabled: true,
      circuitBreakThreshold: 3,
    });

    const event = makeEvent();

    await gatekeeper.check(event); // fail 1
    await gatekeeper.check(event); // fail 2
    await gatekeeper.check(event); // success — resets counter

    expect(gatekeeper.isCircuitOpen).toBe(false);
  });
});

// --- Rate limiter tests ---

describe('LLMGatekeeper rate limiter', () => {
  it('should allow calls within rate limit', async () => {
    const provider = mockProvider('PASS 0.90 good event');
    const gatekeeper = new LLMGatekeeper({
      provider,
      enabled: true,
      rateLimitMaxCalls: 5,
      rateLimitWindowMs: 60_000,
    });

    const event = makeEvent({ source: 'breaking-news' });

    for (let i = 0; i < 5; i++) {
      const result = await gatekeeper.check(event);
      expect(result.reason).not.toContain('rate limited');
    }
  });

  it('should rate limit after max calls per source', async () => {
    const provider = mockProvider('PASS 0.90 good event');
    const gatekeeper = new LLMGatekeeper({
      provider,
      enabled: true,
      rateLimitMaxCalls: 3,
      rateLimitWindowMs: 60_000,
    });

    const event = makeEvent({ source: 'reddit' });

    // First 3 calls should succeed
    await gatekeeper.check(event);
    await gatekeeper.check(event);
    await gatekeeper.check(event);

    // 4th call should be rate limited (fallback pass)
    const result = await gatekeeper.check(event);
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('rate limited');
  });

  it('should track rate limits per source independently', async () => {
    const provider = mockProvider('PASS 0.90 good event');
    const gatekeeper = new LLMGatekeeper({
      provider,
      enabled: true,
      rateLimitMaxCalls: 2,
      rateLimitWindowMs: 60_000,
    });

    const redditEvent = makeEvent({ source: 'reddit' });
    const newsEvent = makeEvent({ source: 'breaking-news' });

    // 2 reddit calls
    await gatekeeper.check(redditEvent);
    await gatekeeper.check(redditEvent);

    // Reddit should be rate limited now
    const redditResult = await gatekeeper.check(redditEvent);
    expect(redditResult.reason).toContain('rate limited');

    // But breaking-news should still work
    const newsResult = await gatekeeper.check(newsEvent);
    expect(newsResult.reason).not.toContain('rate limited');
  });
});

// --- Response parsing tests ---

describe('LLMGatekeeper response parsing', () => {
  it('should parse PASS response correctly', async () => {
    const provider = mockProvider('PASS 0.95 FDA approves new drug');
    const gatekeeper = new LLMGatekeeper({ provider, enabled: true });

    const result = await gatekeeper.check(makeEvent());
    expect(result.pass).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.reason).toBe('FDA approves new drug');
  });

  it('should parse BLOCK response correctly', async () => {
    const provider = mockProvider('BLOCK 0.88 retrospective article');
    const gatekeeper = new LLMGatekeeper({ provider, enabled: true });

    const result = await gatekeeper.check(makeEvent());
    expect(result.pass).toBe(false);
    expect(result.confidence).toBe(0.88);
    expect(result.reason).toBe('retrospective article');
  });

  it('should handle unparseable response as pass (fail-open)', async () => {
    const provider = mockProvider('I think this is interesting');
    const gatekeeper = new LLMGatekeeper({ provider, enabled: true });

    const result = await gatekeeper.check(makeEvent());
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('unparseable');
  });

  it('should pass when disabled', async () => {
    const gatekeeper = new LLMGatekeeper({ enabled: false });
    const result = await gatekeeper.check(makeEvent());
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('gatekeeper disabled');
  });
});
