import type { ConfidenceLevel, LLMEnrichmentAction } from '@event-radar/shared';
import type { AlertEvent } from './types.js';

export type AlertPushTier = 'high' | 'medium' | 'low';
export type PushMode = 'loud' | 'silent' | 'none';

export interface AlertRoutingDecision {
  tier: AlertPushTier;
  shouldPush: boolean;
  pushMode: PushMode;
  reason: string;
}

const STRONG_SUPPORT_MATCH_COUNT = 15;
const MEANINGFUL_SUPPORT_MATCH_COUNT = 10;

export function decideAlertRouting(alert: AlertEvent): AlertRoutingDecision {
  const action = alert.enrichment?.action;
  const confidenceBucket = resolveConfidenceBucket(alert);
  const supportCount = alert.historicalContext?.matchCount ?? 0;
  const hasMeaningfulSupport = supportCount >= MEANINGFUL_SUPPORT_MATCH_COUNT;
  const hasStrongSupport = supportCount >= STRONG_SUPPORT_MATCH_COUNT;

  if (
    action?.startsWith('🔴')
    && confidenceBucket === 'high'
    && hasStrongSupport
  ) {
    return {
      tier: 'high',
      shouldPush: true,
      pushMode: 'loud',
      reason: 'act_now_high_confidence_strong_support',
    };
  }

  if (
    isActionable(action)
    && isActionableConfidence(confidenceBucket)
    && hasMeaningfulSupport
  ) {
    return {
      tier: 'medium',
      shouldPush: true,
      pushMode: 'silent',
      reason: action?.startsWith('🟡')
        ? 'watch_meaningful_support'
        : 'act_now_meaningful_support',
    };
  }

  if (isActionable(action) && isActionableConfidence(confidenceBucket)) {
    return {
      tier: 'low',
      shouldPush: false,
      pushMode: 'none',
      reason: 'insufficient_historical_support',
    };
  }

  return {
    tier: 'low',
    shouldPush: false,
    pushMode: 'none',
    reason: 'routine_or_low_confidence',
  };
}

function resolveConfidenceBucket(alert: AlertEvent): ConfidenceLevel {
  if (alert.confidenceBucket) {
    return alert.confidenceBucket;
  }

  if (typeof alert.classificationConfidence === 'number') {
    return deriveConfidenceBucket(alert.classificationConfidence);
  }

  return 'unconfirmed';
}

function isActionable(action: LLMEnrichmentAction | undefined): boolean {
  return action?.startsWith('🔴') === true || action?.startsWith('🟡') === true;
}

function isActionableConfidence(confidenceBucket: ConfidenceLevel): boolean {
  return confidenceBucket === 'high' || confidenceBucket === 'medium';
}

function deriveConfidenceBucket(confidence: number): ConfidenceLevel {
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.5) return 'medium';
  if (confidence >= 0.3) return 'low';
  return 'unconfirmed';
}
