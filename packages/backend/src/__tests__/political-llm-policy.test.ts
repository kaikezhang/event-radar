import { describe, expect, it } from 'vitest';
import type { ClassificationResult, LlmClassificationResult } from '@event-radar/shared';
import {
  resolvePoliticalClassificationResult,
  shouldForcePoliticalLlmClassification,
} from '../pipeline/political-llm-policy.js';

function makeRuleResult(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    severity: 'MEDIUM',
    tags: [],
    priority: 20,
    matchedRules: [],
    confidence: 0.88,
    confidenceLevel: 'high',
    ...overrides,
  };
}

function makeLlmResult(overrides: Partial<LlmClassificationResult> = {}): LlmClassificationResult {
  return {
    severity: 'CRITICAL',
    direction: 'NEUTRAL',
    eventType: 'geopolitical_event',
    confidence: 0.93,
    reasoning: 'Concrete geopolitical action with immediate market implications.',
    tags: ['geopolitics', 'ceasefire'],
    priority: 5,
    matchedRules: [],
    ...overrides,
  };
}

describe('political LLM policy', () => {
  it('forces LLM classification when political-market-impact tag is present', () => {
    const ruleResult = makeRuleResult({
      tags: ['political-market-impact'],
    });

    expect(shouldForcePoliticalLlmClassification(ruleResult)).toBe(true);
  });

  it('forces LLM classification when force-llm-classification tag is present', () => {
    const ruleResult = makeRuleResult({
      tags: ['force-llm-classification'],
    });

    expect(shouldForcePoliticalLlmClassification(ruleResult)).toBe(true);
  });

  it('does not force LLM classification without political override tags', () => {
    const ruleResult = makeRuleResult({
      tags: ['macro'],
    });

    expect(shouldForcePoliticalLlmClassification(ruleResult)).toBe(false);
  });

  it('uses LLM severity for forced political classifications by default', () => {
    const ruleResult = makeRuleResult({
      severity: 'MEDIUM',
      tags: ['political-market-impact', 'ceasefire'],
      matchedRules: ['trump-geopolitical-ceasefire'],
      priority: 12,
    });
    const llmResult = makeLlmResult({
      severity: 'CRITICAL',
      priority: 4,
      confidence: 0.94,
    });

    const result = resolvePoliticalClassificationResult(ruleResult, llmResult);

    expect(result.severity).toBe('CRITICAL');
    expect(result.priority).toBe(4);
    expect(result.confidence).toBe(0.94);
    expect(result.confidenceLevel).toBe('high');
  });

  it('keeps rule severity for tariff exceptions while preserving the stronger rule confidence', () => {
    const ruleResult = makeRuleResult({
      severity: 'CRITICAL',
      tags: ['political-market-impact', 'force-llm-classification', 'tariff'],
      matchedRules: ['trump-tariff'],
      priority: 5,
    });
    const llmResult = makeLlmResult({
      severity: 'LOW',
      confidence: 0.41,
      priority: 40,
    });

    const result = resolvePoliticalClassificationResult(ruleResult, llmResult);

    expect(result.severity).toBe('CRITICAL');
    expect(result.priority).toBe(5);
    expect(result.confidence).toBe(0.88);
    expect(result.confidenceLevel).toBe('high');
  });

  it('preserves the stronger rule confidence when rule priority wins the aggregation', () => {
    const ruleResult = makeRuleResult({
      severity: 'HIGH',
      tags: ['political-market-impact', 'force-llm-classification'],
      priority: 8,
      confidence: 0.91,
    });
    const llmResult = makeLlmResult({
      severity: 'CRITICAL',
      confidence: 0.52,
      priority: 20,
    });

    const result = resolvePoliticalClassificationResult(ruleResult, llmResult);

    expect(result.severity).toBe('CRITICAL');
    expect(result.priority).toBe(8);
    expect(result.confidence).toBe(0.91);
    expect(result.confidenceLevel).toBe('high');
  });
});
