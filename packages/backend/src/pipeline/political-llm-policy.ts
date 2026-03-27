import {
  deriveConfidenceLevel,
  type ClassificationResult,
  type LlmClassificationResult,
} from '@event-radar/shared';

const POLITICAL_FORCE_TAGS = new Set([
  'political-market-impact',
  'force-llm-classification',
]);

const POLITICAL_RULE_SEVERITY_EXCEPTIONS = new Set([
  'trump-tariff',
  'trump-trade',
]);

export function shouldForcePoliticalLlmClassification(
  ruleResult: ClassificationResult,
): boolean {
  return ruleResult.tags.some((tag) => POLITICAL_FORCE_TAGS.has(tag));
}

export function shouldKeepPoliticalRuleSeverity(
  ruleResult: ClassificationResult,
): boolean {
  return ruleResult.matchedRules.some((ruleId) =>
    POLITICAL_RULE_SEVERITY_EXCEPTIONS.has(ruleId));
}

export function resolvePoliticalClassificationResult(
  ruleResult: ClassificationResult,
  llmResult?: LlmClassificationResult,
): ClassificationResult {
  if (!llmResult || !shouldForcePoliticalLlmClassification(ruleResult)) {
    return ruleResult;
  }

  const keepRuleSeverity = shouldKeepPoliticalRuleSeverity(ruleResult);
  const nextPriority = Math.min(ruleResult.priority, llmResult.priority);
  const shouldPreserveRuleConfidence = keepRuleSeverity || nextPriority === ruleResult.priority;
  const nextConfidence = shouldPreserveRuleConfidence
    ? Math.max(ruleResult.confidence, llmResult.confidence)
    : llmResult.confidence;

  return {
    ...ruleResult,
    severity: keepRuleSeverity
      ? ruleResult.severity
      : llmResult.severity,
    priority: nextPriority,
    confidence: nextConfidence,
    confidenceLevel: deriveConfidenceLevel(nextConfidence),
  };
}
