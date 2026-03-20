import { formatPercent } from '../../lib/format.js';
import type { EventDetailData, LlmEnrichment } from '../../types/index.js';

export function formatTrustLabel(value: string | null | undefined, fallback = 'Not available') {
  if (!value) return fallback;
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatTrustMove(value: number | null) {
  return value == null ? 'Pending' : formatPercent(value, 2);
}

export function formatSignedPercent(value: number | null): string {
  if (value == null) return 'N/A';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}

export function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

export function getPrimaryDirection(data: EventDetailData): string {
  const enrichDir = data.enrichment?.tickers[0]?.direction;
  if (enrichDir) return enrichDir;
  const aiDir = data.aiAnalysis.tickerDirections[0]?.direction;
  if (aiDir) return aiDir;
  return 'neutral';
}

export function getPrimaryConfidence(data: EventDetailData): number | null {
  return data.audit?.confidence ?? data.scorecard?.originalAlert.confidence ?? null;
}

export function getDirectionContextLine(direction: string, enrichment: LlmEnrichment | null): string | null {
  if (direction === 'neutral' && enrichment?.regimeContext) {
    return `Direction: ${enrichment.regimeContext}`;
  }
  if (direction === 'mixed' || direction === 'unclear') {
    return 'Direction: Awaiting market reaction';
  }
  return null;
}

export function deriveBullBear(enrichment: LlmEnrichment | null, direction: string) {
  if (!enrichment) return { bullPoints: [], bearPoints: [] };

  const isBearish = direction === 'bearish';
  const bullPoints: string[] = [];
  const bearPoints: string[] = [];

  if (enrichment.impact) {
    (isBearish ? bearPoints : bullPoints).push(enrichment.impact);
  }
  if (enrichment.currentSetup) {
    (isBearish ? bearPoints : bullPoints).push(enrichment.currentSetup);
  }
  if (enrichment.risks) {
    bearPoints.push(enrichment.risks);
  }
  if (enrichment.historicalContext) {
    (isBearish ? bullPoints : bearPoints).push(enrichment.historicalContext);
  }

  return { bullPoints, bearPoints };
}
