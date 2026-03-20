import type {
  AccuracyDirection,
  ClassificationPrediction,
  ClassificationResult,
  LlmClassificationResult,
  Result,
  RawEvent,
} from '@event-radar/shared';
import type { AdaptiveClassifierService } from './services/adaptive-classifier.js';

export async function buildPredictionPayload(
  event: RawEvent,
  ruleResult: ClassificationResult,
  llmResult?: Result<LlmClassificationResult, Error>,
  adaptiveService?: AdaptiveClassifierService,
): Promise<Omit<ClassificationPrediction, 'eventId'>> {
  const sourceWeight = adaptiveService
    ? await adaptiveService.getSourceWeight(event.source)
    : 1;

  if (llmResult?.ok) {
    return {
      predictedSeverity: llmResult.value.severity,
      predictedDirection: normalizeLlmDirection(llmResult.value.direction),
      confidence: applySourceWeight(llmResult.value.confidence, sourceWeight),
      classifiedBy: 'hybrid',
      classifiedAt: new Date().toISOString(),
    };
  }

  return {
    predictedSeverity: ruleResult.severity,
    predictedDirection: extractFallbackDirection(event),
    confidence: applySourceWeight(ruleResult.confidence, sourceWeight),
    classifiedBy: 'rule-engine',
    classifiedAt: new Date().toISOString(),
  };
}

export function applySourceWeight(confidence: number, sourceWeight: number): number {
  return Math.min(1, Math.max(0, Number((confidence * sourceWeight).toFixed(4))));
}

export function extractFallbackDirection(event: RawEvent): AccuracyDirection {
  const direction = event.metadata?.['direction'];
  if (typeof direction === 'string') {
    const normalized = direction.toLowerCase();
    if (
      normalized === 'bullish' ||
      normalized === 'bearish' ||
      normalized === 'neutral'
    ) {
      return normalized;
    }
  }

  // TODO: Revisit rule-engine fallback direction. Defaulting to neutral when
  // metadata is missing reduces the binary sample size and can inflate
  // aggregate direction metrics.
  return 'neutral';
}

export function normalizeLlmDirection(direction: LlmClassificationResult['direction']): AccuracyDirection {
  if (direction === 'BULLISH') {
    return 'bullish';
  }
  if (direction === 'BEARISH') {
    return 'bearish';
  }
  return 'neutral';
}
