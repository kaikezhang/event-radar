import { registry } from '../metrics.js';
import { Counter, Gauge } from 'prom-client';

/**
 * Classification metrics tracking for analysis and debugging.
 * Tracks classification decisions including confidence, severity, source, etc.
 */

let classificationCount = 0;
const EVENT_LOG_INTERVAL = 100; // Log summary every 100 events

// ── Counters ───────────────────────────────────────────────────────────

/** Counter: total classified events */
export const classificationTotal = new Counter({
  name: 'classification_total',
  help: 'Total number of classified events',
  labelNames: ['severity', 'source', 'confidence_level'] as const,
  registers: [registry],
});

/** Counter: events by confidence threshold */
export const classificationByConfidence = new Counter({
  name: 'classification_by_confidence',
  help: 'Events grouped by confidence level',
  labelNames: ['confidence_level'] as const,
  registers: [registry],
});

/** Counter: events matched by rule */
export const classificationByRule = new Counter({
  name: 'classification_by_rule',
  help: 'Events matched by each rule',
  labelNames: ['rule_id'] as const,
  registers: [registry],
});

// ── Gauges ───────────────────────────────────────────────────────────

/** Gauge: average confidence score */
export const averageConfidence = new Gauge({
  name: 'classification_average_confidence',
  help: 'Average confidence score across all classifications',
  registers: [registry],
});

// ── Tracking State ──────────────────────────────────────────────────

let totalConfidence = 0;
let eventCount = 0;

interface ClassificationMetrics {
  totalClassified: number;
  bySeverity: Record<string, number>;
  bySource: Record<string, number>;
  byConfidenceLevel: Record<string, number>;
  averageConfidence: number;
}

/**
 * Record a classification decision for metrics tracking.
 */
export function trackClassification(params: {
  severity: string;
  source: string;
  confidence: number;
  confidenceLevel: string;
  matchedRules: string[];
}): void {
  const { severity, source, confidence, confidenceLevel, matchedRules } = params;

  // Increment counters
  classificationTotal.inc({ severity, source, confidence_level: confidenceLevel });
  classificationByConfidence.inc({ confidence_level: confidenceLevel });

  for (const ruleId of matchedRules) {
    classificationByRule.inc({ rule_id: ruleId });
  }

  // Track for average calculation
  totalConfidence += confidence;
  eventCount++;
  classificationCount++;

  // Log summary every EVENT_LOG_INTERVAL events
  if (classificationCount % EVENT_LOG_INTERVAL === 0) {
    logClassificationSummary();
  }
}

/**
 * Log classification summary to console.
 */
function logClassificationSummary(): void {
  const avg = eventCount > 0 ? totalConfidence / eventCount : 0;
  averageConfidence.set(avg);

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              CLASSIFICATION METRICS SUMMARY                   ║
║              (Last ${EVENT_LOG_INTERVAL} events)                       ║
╠══════════════════════════════════════════════════════════════╣
║  Total Classified: ${eventCount}
║  Average Confidence: ${(avg * 100).toFixed(1)}%
╚══════════════════════════════════════════════════════════════╝
  `);
}

/**
 * Get current classification metrics.
 */
export function getClassificationMetrics(): ClassificationMetrics {
  const avg = eventCount > 0 ? totalConfidence / eventCount : 0;

  // Query metrics from registry
  const metrics = registry.getSingleMetric('classification_total');
  const bySeverity: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byConfidenceLevel: Record<string, number> = {};

  if (metrics) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const counter = metrics as any;
    if (counter.hashMap) {
      for (const label of counter.hashMap.values()) {
        bySeverity[label.labels.severity] = (bySeverity[label.labels.severity] || 0) + label.value;
        bySource[label.labels.source] = (bySource[label.labels.source] || 0) + label.value;
        byConfidenceLevel[label.labels.confidence_level] = (byConfidenceLevel[label.labels.confidence_level] || 0) + label.value;
      }
    }
  }

  return {
    totalClassified: eventCount,
    bySeverity,
    bySource,
    byConfidenceLevel,
    averageConfidence: avg,
  };
}

/**
 * Reset classification metrics (useful for tests).
 */
export function resetClassificationMetrics(): void {
  classificationTotal.reset();
  classificationByConfidence.reset();
  classificationByRule.reset();
  averageConfidence.reset();
  totalConfidence = 0;
  eventCount = 0;
  classificationCount = 0;
}
