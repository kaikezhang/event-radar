import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RuleEngine } from '../pipeline/rule-engine.js';
import {
  DEFAULT_RULES,
} from '../pipeline/default-rules.js';
import type { RawEvent } from '@event-radar/shared';
import {
  deriveConfidenceLevel,
  ConfidenceLevelSchema,
} from '@event-radar/shared';

// Mock metrics to avoid prom-client issues in tests
vi.mock('../metrics.js', () => ({
  registry: {
    getSingleMetric: vi.fn(() => null),
    metrics: vi.fn(() => Promise.resolve('')),
  },
  Counter: vi.fn().mockImplementation(() => ({
    inc: vi.fn(),
  })),
  Gauge: vi.fn().mockImplementation(() => ({
    set: vi.fn(),
  })),
  collectDefaultMetrics: vi.fn(),
}));

describe('Confidence Score System', () => {
  let ruleEngine: RuleEngine;

  beforeEach(() => {
    ruleEngine = new RuleEngine();
    ruleEngine.loadRules(DEFAULT_RULES);
  });

  describe('deriveConfidenceLevel', () => {
    it('should return high for confidence >= 0.7', () => {
      expect(deriveConfidenceLevel(0.7)).toBe('high');
      expect(deriveConfidenceLevel(0.85)).toBe('high');
      expect(deriveConfidenceLevel(1.0)).toBe('high');
    });

    it('should return medium for confidence >= 0.5 and < 0.7', () => {
      expect(deriveConfidenceLevel(0.5)).toBe('medium');
      expect(deriveConfidenceLevel(0.6)).toBe('medium');
      expect(deriveConfidenceLevel(0.69)).toBe('medium');
    });

    it('should return low for confidence >= 0.3 and < 0.5', () => {
      expect(deriveConfidenceLevel(0.3)).toBe('low');
      expect(deriveConfidenceLevel(0.4)).toBe('low');
      expect(deriveConfidenceLevel(0.49)).toBe('low');
    });

    it('should return unconfirmed for confidence < 0.3', () => {
      expect(deriveConfidenceLevel(0.0)).toBe('unconfirmed');
      expect(deriveConfidenceLevel(0.1)).toBe('unconfirmed');
      expect(deriveConfidenceLevel(0.29)).toBe('unconfirmed');
    });
  });

  describe('ConfidenceLevelSchema', () => {
    it('should validate valid confidence levels', () => {
      expect(ConfidenceLevelSchema.parse('high')).toBe('high');
      expect(ConfidenceLevelSchema.parse('medium')).toBe('medium');
      expect(ConfidenceLevelSchema.parse('low')).toBe('low');
      expect(ConfidenceLevelSchema.parse('unconfirmed')).toBe('unconfirmed');
    });

    it('should reject invalid confidence levels', () => {
      expect(() => ConfidenceLevelSchema.parse('invalid')).toThrow();
      expect(() => ConfidenceLevelSchema.parse('HIGH')).toThrow();
      expect(() => ConfidenceLevelSchema.parse('')).toThrow();
    });
  });

  describe('Rule Engine Confidence', () => {
    const createMockEvent = (overrides: Partial<RawEvent> = {}): RawEvent => ({
      id: 'test-event-1',
      source: 'breaking-news',
      title: 'Test Event Title',
      type: 'test',
      timestamp: new Date(),
      url: 'https://example.com',
      ...overrides,
    });

    it('should return default confidence when no rules set confidence', () => {
      const event = createMockEvent({
        source: 'sec-edgar',
        title: 'Form 4 - Purchase',
        metadata: { item_types: ['4.01'] },
      });
      const result = ruleEngine.classify(event);

      // Should have default confidence from RuleEngine
      expect(result.confidence).toBe(0.8);
      expect(result.confidenceLevel).toBe('high');
    });

    it('should apply confidence from matched rule with setConfidence action', () => {
      const event = createMockEvent({
        title: 'Company announces acquisition of startup',
      });
      const result = ruleEngine.classify(event);

      // Should match acquisition rule
      expect(result.matchedRules).toContain('breaking-news-ma-announces-acquisition');
      // breaking-news-ma-announces-acquisition has confidence 0.9
      expect(result.confidence).toBe(0.9);
      expect(result.confidenceLevel).toBe('high');
    });

    it('should use lowest confidence when multiple rules match with different confidence values', () => {
      const event = createMockEvent({
        title: 'CEO announces acquisition and Q1 earnings',
      });
      const result = ruleEngine.classify(event);

      // Both M&A and earnings rules should match
      // Should use lowest confidence
      expect(result.confidence).toBeLessThanOrEqual(0.9);
    });

    it('should include confidenceLevel in classification result', () => {
      const event = createMockEvent({ title: 'test' });
      const result = ruleEngine.classify(event);

      expect(result).toHaveProperty('confidenceLevel');
      expect(result.confidenceLevel).toMatch(/^(high|medium|low|unconfirmed)$/);
    });
  });
});

describe('Confidence Rules', () => {
  let ruleEngine: RuleEngine;

  beforeEach(() => {
    ruleEngine = new RuleEngine();
    ruleEngine.loadRules(DEFAULT_RULES);
  });

  const createEvent = (title: string): RawEvent => ({
    id: `test-${Date.now()}`,
    source: 'breaking-news',
    title,
    type: 'press-release',
    timestamp: new Date(),
    url: 'https://example.com',
  });

  describe('M&A Rules', () => {
    it('should classify acquisition announcements as CRITICAL with 0.9 confidence', () => {
      const event = createEvent('Company announces acquisition of rival firm');
      const result = ruleEngine.classify(event);

      expect(result.severity).toBe('CRITICAL');
      expect(result.tags).toContain('acquisition');
      expect(result.confidence).toBe(0.9);
    });

    it('should classify merger agreements as CRITICAL with 0.9 confidence', () => {
      const event = createEvent('Two companies announce merger agreement');
      const result = ruleEngine.classify(event);

      expect(result.severity).toBe('CRITICAL');
      expect(result.tags).toContain('merger');
      expect(result.confidence).toBe(0.9);
    });

    it('should classify buyout as HIGH with 0.85 confidence', () => {
      const event = createEvent('Private equity announces buyout');
      const result = ruleEngine.classify(event);

      expect(result.severity).toBe('HIGH');
      expect(result.tags).toContain('buyout');
      expect(result.confidence).toBe(0.85);
    });
  });

  describe('Earnings Rules', () => {
    it('should classify Q1 earnings as HIGH', () => {
      const event = createEvent('Company reports Q1 earnings beat');
      const result = ruleEngine.classify(event);

      expect(result.severity).toBe('HIGH');
      expect(result.tags).toContain('earnings');
      expect(result.confidence).toBe(0.9);
    });

    it('should classify EPS as HIGH', () => {
      const event = createEvent('Company announces EPS of $1.50');
      const result = ruleEngine.classify(event);

      expect(result.severity).toBe('HIGH');
      expect(result.tags).toContain('eps');
    });

    it('should classify revenue beat as HIGH', () => {
      const event = createEvent('Company reports revenue beat');
      const result = ruleEngine.classify(event);

      expect(result.severity).toBe('HIGH');
      expect(result.tags).toContain('revenue-beat');
    });
  });

  describe('FDA Rules', () => {
    it('should classify FDA approval as CRITICAL', () => {
      const event = createEvent('FDA approved a new oncology treatment');
      const result = ruleEngine.classify(event);

      expect(result.severity).toBe('CRITICAL');
      expect(result.tags).toContain('fda');
      expect(result.tags).toContain('approval');
    });

    it('should classify clinical trial as HIGH', () => {
      const event = createEvent('Company announces clinical trial results');
      const result = ruleEngine.classify(event);

      expect(result.severity).toBe('HIGH');
      expect(result.tags).toContain('clinical-trial');
    });

    it('should classify Phase 3 trial as HIGH with 0.9 confidence', () => {
      const event = createEvent('Phase 3 trial shows positive results');
      const result = ruleEngine.classify(event);

      expect(result.severity).toBe('HIGH');
      expect(result.tags).toContain('phase-3');
      expect(result.confidence).toBe(0.9);
    });
  });

  describe('Executive Rules', () => {
    it('should classify executive appointment as MEDIUM', () => {
      const event = createEvent('Company appoints new CFO');
      const result = ruleEngine.classify(event);

      expect(result.severity).toBe('MEDIUM');
      expect(result.tags).toContain('executive');
    });

    it('should classify CEO change as MEDIUM', () => {
      const event = createEvent('Company announces new CEO');
      const result = ruleEngine.classify(event);

      expect(result.severity).toBe('MEDIUM');
      expect(result.tags).toContain('ceo');
    });

    it('should classify resignation as MEDIUM', () => {
      const event = createEvent('CFO resigns from company');
      const result = ruleEngine.classify(event);

      expect(result.severity).toBe('MEDIUM');
      expect(result.tags).toContain('resignation');
    });
  });

  describe('Partnership Rules', () => {
    it('should classify partnership as MEDIUM', () => {
      const event = createEvent('Company partner with tech giant');
      const result = ruleEngine.classify(event);

      expect(result.severity).toBe('MEDIUM');
      expect(result.tags).toContain('partnership');
    });

    it('should classify joint venture as MEDIUM', () => {
      const event = createEvent('Companies form joint venture');
      const result = ruleEngine.classify(event);

      expect(result.severity).toBe('MEDIUM');
      expect(result.tags).toContain('joint-venture');
    });
  });
});
