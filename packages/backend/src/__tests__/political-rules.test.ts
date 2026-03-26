import { describe, it, expect, beforeEach } from 'vitest';
import { RuleEngine } from '../pipeline/rule-engine.js';
import { DEFAULT_RULES } from '../pipeline/default-rules.js';
import type { RawEvent } from '@event-radar/shared';

function makePoliticalEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source: 'truth-social',
    type: 'political-post',
    title: 'Test political post',
    body: 'Test body',
    timestamp: new Date('2025-06-15T14:00:00Z'),
    metadata: { author: 'trump' },
    ...overrides,
  };
}

describe('Political Classification Rules', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
    engine.loadRules(DEFAULT_RULES);
  });

  describe('Trump — Truth Social rules', () => {
    it('should classify tariff posts as CRITICAL', () => {
      const event = makePoliticalEvent({
        title: 'TARIFFS on China are going UP!',
      });
      const result = engine.classify(event);

      expect(result.severity).toBe('CRITICAL');
      expect(result.tags).toContain('trump');
      expect(result.tags).toContain('tariff');
      expect(result.matchedRules).toContain('trump-tariff');
    });

    it('should classify trade posts as CRITICAL', () => {
      const event = makePoliticalEvent({
        title: 'New trade deal with EU is massive!',
      });
      const result = engine.classify(event);

      expect(result.severity).toBe('CRITICAL');
      expect(result.tags).toContain('political-market-impact');
      expect(result.tags).toContain('force-llm-classification');
      expect(result.tags).toContain('trade-policy');
      expect(result.matchedRules).toContain('trump-trade');
    });

    it('should tag crypto posts for LLM classification instead of setting HIGH severity', () => {
      const event = makePoliticalEvent({
        title: 'Crypto is the future of America!',
      });
      const result = engine.classify(event);

      expect(result.severity).toBe('MEDIUM');
      expect(result.tags).toContain('political-market-impact');
      expect(result.tags).toContain('force-llm-classification');
      expect(result.tags).toContain('crypto');
      expect(result.matchedRules).toContain('trump-crypto');
    });

    it('should tag bitcoin posts for LLM classification instead of setting HIGH severity', () => {
      const event = makePoliticalEvent({
        title: 'Bitcoin strategic reserve is happening!',
      });
      const result = engine.classify(event);

      expect(result.severity).toBe('MEDIUM');
      expect(result.tags).toContain('political-market-impact');
      expect(result.tags).toContain('force-llm-classification');
      expect(result.tags).toContain('bitcoin');
    });

    it('should tag company mention posts for LLM classification instead of setting HIGH severity', () => {
      const event = makePoliticalEvent({
        title: 'This company is doing great things for America!',
      });
      const result = engine.classify(event);

      expect(result.severity).toBe('MEDIUM');
      expect(result.tags).toContain('political-market-impact');
      expect(result.tags).toContain('force-llm-classification');
      expect(result.tags).toContain('company-mention');
    });

    it('should tag Iran posts for LLM classification instead of boosting severity', () => {
      const event = makePoliticalEvent({
        title: 'Iran must choose peace now.',
      });
      const result = engine.classify(event);

      expect(result.severity).toBe('MEDIUM');
      expect(result.tags).toContain('political-market-impact');
      expect(result.tags).toContain('force-llm-classification');
      expect(result.matchedRules).toContain('trump-geopolitical-iran');
    });

    it('should tag executive order posts for LLM classification instead of boosting severity', () => {
      const event = makePoliticalEvent({
        title: 'An executive order is coming soon.',
      });
      const result = engine.classify(event);

      expect(result.severity).toBe('MEDIUM');
      expect(result.tags).toContain('political-market-impact');
      expect(result.tags).toContain('force-llm-classification');
      expect(result.matchedRules).toContain('trump-policy-executive-order');
    });

    it('should tag ceasefire posts for LLM classification', () => {
      const event = makePoliticalEvent({
        title: 'A COMPLETE AND TOTAL CEASEFIRE has been agreed to.',
      });
      const result = engine.classify(event);

      expect(result.severity).toBe('MEDIUM');
      expect(result.tags).toContain('political-market-impact');
      expect(result.tags).toContain('force-llm-classification');
      expect(result.tags).toContain('ceasefire');
      expect(result.matchedRules).toContain('trump-geopolitical-ceasefire');
    });

    it('should keep tariff posts at CRITICAL and still force LLM validation', () => {
      const event = makePoliticalEvent({
        title: 'Tariff and China policy updates are coming today.',
      });
      const result = engine.classify(event);

      expect(result.severity).toBe('CRITICAL');
      expect(result.tags).toContain('political-market-impact');
      expect(result.tags).toContain('force-llm-classification');
      expect(result.matchedRules).toContain('trump-tariff');
    });
  });

  describe('non-matching events', () => {
    it('should return default MEDIUM for unmatched truth-social posts', () => {
      const event = makePoliticalEvent({
        title: 'Happy Fourth of July!',
      });
      const result = engine.classify(event);

      expect(result.severity).toBe('MEDIUM');
      expect(result.matchedRules).toEqual([]);
    });

    it('should not match political rules for SEC events', () => {
      const event = makePoliticalEvent({
        source: 'sec-edgar',
        type: '8-K',
        title: 'Trade agreement filing',
      });
      const result = engine.classify(event);

      // source doesn't match any political rule
      expect(result.matchedRules).toEqual([]);
    });
  });
});
