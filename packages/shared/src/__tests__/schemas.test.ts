import { describe, it, expect } from 'vitest';
import {
  RawEventSchema,
  ScannerHealthSchema,
  RuleSchema,
  ConditionSchema,
  ActionSchema,
  ok,
  err,
} from '../index.js';

describe('RawEventSchema', () => {
  it('should parse a valid raw event', () => {
    const event = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      source: 'sec-edgar',
      type: '8-K',
      title: 'Apple Inc. files 8-K',
      body: 'Item 2.02 Results of Operations',
      url: 'https://sec.gov/filing/123',
      timestamp: '2024-01-15T10:30:00Z',
      metadata: { cik: '0000320193' },
    };
    const result = RawEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('should reject an event with missing required fields', () => {
    const result = RawEventSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('ScannerHealthSchema', () => {
  it('should parse valid scanner health', () => {
    const health = {
      scanner: 'sec-edgar',
      status: 'healthy',
      lastScanAt: new Date().toISOString(),
      errorCount: 0,
    };
    const result = ScannerHealthSchema.safeParse(health);
    expect(result.success).toBe(true);
  });
});

describe('RuleSchema', () => {
  it('should parse a valid rule', () => {
    const rule = {
      id: 'test-rule',
      name: 'Test Rule',
      conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
      actions: [{ type: 'setSeverity', value: 'HIGH' }],
      priority: 10,
      enabled: true,
    };
    const result = RuleSchema.safeParse(rule);
    expect(result.success).toBe(true);
  });

  it('should apply defaults for priority and enabled', () => {
    const rule = {
      id: 'test-rule',
      name: 'Test Rule',
      conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
      actions: [{ type: 'setSeverity', value: 'HIGH' }],
    };
    const result = RuleSchema.safeParse(rule);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe(50);
      expect(result.data.enabled).toBe(true);
    }
  });

  it('should reject a rule with no conditions', () => {
    const rule = {
      id: 'test-rule',
      name: 'Test Rule',
      conditions: [],
      actions: [{ type: 'setSeverity', value: 'HIGH' }],
    };
    const result = RuleSchema.safeParse(rule);
    expect(result.success).toBe(false);
  });

  it('should reject a rule with no actions', () => {
    const rule = {
      id: 'test-rule',
      name: 'Test Rule',
      conditions: [{ type: 'sourceEquals', value: 'sec-edgar' }],
      actions: [],
    };
    const result = RuleSchema.safeParse(rule);
    expect(result.success).toBe(false);
  });
});

describe('ConditionSchema', () => {
  it('should parse sourceEquals condition', () => {
    const result = ConditionSchema.safeParse({
      type: 'sourceEquals',
      value: 'sec-edgar',
    });
    expect(result.success).toBe(true);
  });

  it('should parse itemTypeContains condition', () => {
    const result = ConditionSchema.safeParse({
      type: 'itemTypeContains',
      value: '1.03',
    });
    expect(result.success).toBe(true);
  });

  it('should parse titleContains condition', () => {
    const result = ConditionSchema.safeParse({
      type: 'titleContains',
      value: 'bankruptcy',
    });
    expect(result.success).toBe(true);
  });

  it('should parse tickerInList condition', () => {
    const result = ConditionSchema.safeParse({
      type: 'tickerInList',
      values: ['AAPL', 'TSLA'],
    });
    expect(result.success).toBe(true);
  });

  it('should reject unknown condition type', () => {
    const result = ConditionSchema.safeParse({
      type: 'unknownType',
      value: 'test',
    });
    expect(result.success).toBe(false);
  });
});

describe('ActionSchema', () => {
  it('should parse setSeverity action', () => {
    const result = ActionSchema.safeParse({
      type: 'setSeverity',
      value: 'CRITICAL',
    });
    expect(result.success).toBe(true);
  });

  it('should parse addTags action', () => {
    const result = ActionSchema.safeParse({
      type: 'addTags',
      values: ['tag1', 'tag2'],
    });
    expect(result.success).toBe(true);
  });

  it('should parse setPriority action', () => {
    const result = ActionSchema.safeParse({
      type: 'setPriority',
      value: 25,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid severity value', () => {
    const result = ActionSchema.safeParse({
      type: 'setSeverity',
      value: 'INVALID',
    });
    expect(result.success).toBe(false);
  });

  it('should reject priority out of range', () => {
    const result = ActionSchema.safeParse({
      type: 'setPriority',
      value: 200,
    });
    expect(result.success).toBe(false);
  });
});

describe('Result', () => {
  it('should create ok result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('should create err result', () => {
    const result = err(new Error('failed'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('failed');
    }
  });
});
