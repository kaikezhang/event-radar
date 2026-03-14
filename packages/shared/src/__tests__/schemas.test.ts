import { describe, it, expect } from 'vitest';
import {
  RawEventSchema,
  ScannerHealthSchema,
  RuleSchema,
  ConditionSchema,
  ActionSchema,
  ClassificationPredictionSchema,
  AccuracyStatsSchema,
  LLMEnrichmentActionSchema,
  LLMEnrichmentSchema,
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

describe('Accuracy schemas', () => {
  it('should parse a valid classification prediction', () => {
    const result = ClassificationPredictionSchema.safeParse({
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      predictedSeverity: 'HIGH',
      predictedDirection: 'bullish',
      confidence: 0.82,
      classifiedBy: 'hybrid',
      classifiedAt: '2026-03-11T12:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('should parse accuracy stats payloads', () => {
    const result = AccuracyStatsSchema.safeParse({
      totalEvaluated: 4,
      severityAccuracy: 0.75,
      directionAccuracy: 0.5,
      truePositives: 1,
      trueNegatives: 1,
      falsePositives: 1,
      falseNegatives: 1,
      precision: 0.5,
      recall: 0.5,
      f1Score: 0.5,
      bySource: {
        'sec-edgar': { accuracy: 0.75, count: 4 },
      },
      byEventType: {
        '8-K': { accuracy: 0.75, count: 4 },
      },
      period: '30d',
    });

    expect(result.success).toBe(true);
  });
});

describe('LLM enrichment schemas', () => {
  it('accepts the structured enrichment fields alongside the legacy ones', () => {
    const result = LLMEnrichmentSchema.safeParse({
      summary: 'Summary',
      impact: 'Impact',
      whyNow: 'Fresh catalyst is hitting the tape now.',
      currentSetup: 'Ticker is stretched into resistance with elevated volume.',
      historicalContext: 'Historical analogs skew constructive over 20 days.',
      risks: 'Management commentary can reverse the first reaction.',
      action: '🟡 WATCH',
      tickers: [{ symbol: 'NVDA', direction: 'bullish' }],
      regimeContext: 'Risk-on tape can cushion the downside reaction.',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.whyNow).toContain('Fresh catalyst');
      expect(result.data.currentSetup).toContain('resistance');
      expect(result.data.historicalContext).toContain('Historical analogs');
      expect(result.data.risks).toContain('reverse');
    }
  });

  it('accepts the English action labels', () => {
    expect(LLMEnrichmentActionSchema.safeParse('🔴 ACT NOW').success).toBe(true);
    expect(LLMEnrichmentActionSchema.safeParse('🟡 WATCH').success).toBe(true);
    expect(LLMEnrichmentActionSchema.safeParse('🟢 FYI').success).toBe(true);
  });

  it('falls back invalid actions to the English FYI label', () => {
    const result = LLMEnrichmentSchema.safeParse({
      summary: 'Summary',
      impact: 'Impact',
      action: 'INVALID',
      tickers: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe('🟢 FYI');
      expect(result.data.tickers).toEqual([]);
    }
  });

  it('drops blank structured fields instead of failing validation', () => {
    const result = LLMEnrichmentSchema.safeParse({
      summary: 'Summary',
      impact: 'Impact',
      whyNow: '   ',
      currentSetup: '',
      historicalContext: '\n',
      risks: '\t',
      action: '🟢 FYI',
      tickers: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.whyNow).toBeUndefined();
      expect(result.data.currentSetup).toBeUndefined();
      expect(result.data.historicalContext).toBeUndefined();
      expect(result.data.risks).toBeUndefined();
    }
  });
});
