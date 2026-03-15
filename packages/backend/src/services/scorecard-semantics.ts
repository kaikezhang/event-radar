import {
  AccuracyDirectionSchema,
  LLMEnrichmentSchema,
  deriveConfidenceLevel,
  type AccuracyDirection,
  type ConfidenceLevel,
  type LLMEnrichment,
} from '@event-radar/shared';

export type ScorecardDirectionVerdict = 'correct' | 'incorrect' | 'unclear';
export type ScorecardSetupVerdict = 'worked' | 'failed' | 'insufficient-data';
export type ScorecardVerdictWindowLabel = 'T+5' | 'T+20';

export interface SelectedScorecardWindow {
  label: ScorecardVerdictWindowLabel;
  movePercent: number;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export function toNumber(value: string | number | null): number | null {
  if (value == null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getEnrichment(value: unknown): LLMEnrichment | null {
  const parsed = LLMEnrichmentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function normalizeDirection(value: unknown): AccuracyDirection | null {
  if (typeof value !== 'string') {
    return null;
  }

  const lowered = value.trim().toLowerCase();
  const parsed = AccuracyDirectionSchema.safeParse(lowered);
  return parsed.success ? parsed.data : null;
}

export function resolveScorecardDirection(input: {
  predictedDirection: unknown;
  metadata: Record<string, unknown> | null;
  enrichment: LLMEnrichment | null;
}): AccuracyDirection | null {
  return (
    normalizeDirection(input.predictedDirection)
    ?? normalizeDirection(input.metadata?.['direction'])
    ?? normalizeDirection(input.enrichment?.tickers[0]?.direction)
  );
}

export function resolveConfidenceBucket(
  confidence: string | number | null,
): ConfidenceLevel | null {
  const numericConfidence = toNumber(confidence);
  return numericConfidence != null ? deriveConfidenceLevel(numericConfidence) : null;
}

export function selectVerdictWindow(
  changeT5: number | null,
  changeT20: number | null,
): SelectedScorecardWindow | null {
  if (changeT20 != null) {
    return { label: 'T+20', movePercent: changeT20 };
  }

  if (changeT5 != null) {
    return { label: 'T+5', movePercent: changeT5 };
  }

  return null;
}

export function buildDirectionVerdict(
  direction: AccuracyDirection | null,
  movePercent: number | null,
): ScorecardDirectionVerdict {
  if (direction == null || direction === 'neutral' || movePercent == null) {
    return 'unclear';
  }

  if (direction === 'bullish') {
    return movePercent > 0 ? 'correct' : 'incorrect';
  }

  return movePercent < 0 ? 'correct' : 'incorrect';
}

export function buildSetupVerdict(
  direction: AccuracyDirection | null,
  movePercent: number | null,
): ScorecardSetupVerdict {
  if (direction == null || direction === 'neutral' || movePercent == null) {
    return 'insufficient-data';
  }

  if (direction === 'bullish') {
    return movePercent > 0 ? 'worked' : 'failed';
  }

  return movePercent < 0 ? 'worked' : 'failed';
}

export function extractTicker(
  metadata: Record<string, unknown> | null,
  enrichment: LLMEnrichment | null,
): string | null {
  const directTicker = metadata?.['ticker'];
  if (typeof directTicker === 'string' && directTicker.trim().length > 0) {
    return directTicker.trim().toUpperCase();
  }

  const tickers = metadata?.['tickers'];
  if (Array.isArray(tickers)) {
    const first = tickers.find((value) => typeof value === 'string' && value.trim().length > 0);
    if (typeof first === 'string') {
      return first.trim().toUpperCase();
    }
  }

  const enrichmentTicker = enrichment?.tickers[0]?.symbol;
  return typeof enrichmentTicker === 'string' && enrichmentTicker.trim().length > 0
    ? enrichmentTicker.trim().toUpperCase()
    : null;
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatMove(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
