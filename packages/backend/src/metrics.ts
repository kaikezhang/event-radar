import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

/** Counter: total events processed, by source and event type */
export const eventsProcessedTotal = new Counter({
  name: 'events_processed_total',
  help: 'Total number of events processed',
  labelNames: ['source', 'event_type'] as const,
  registers: [registry],
});

/** Counter: events by source */
export const eventsBySource = new Counter({
  name: 'events_by_source',
  help: 'Events broken down by source',
  labelNames: ['source'] as const,
  registers: [registry],
});

/** Counter: events by severity after classification */
export const eventsBySeverity = new Counter({
  name: 'events_by_severity',
  help: 'Events broken down by severity',
  labelNames: ['severity'] as const,
  registers: [registry],
});

/** Counter: total deliveries sent */
export const deliveriesSentTotal = new Counter({
  name: 'deliveries_sent_total',
  help: 'Total number of delivery attempts',
  labelNames: ['channel', 'status'] as const,
  registers: [registry],
});

/** Counter: deliveries by channel */
export const deliveriesByChannel = new Counter({
  name: 'deliveries_by_channel',
  help: 'Deliveries broken down by channel',
  labelNames: ['channel'] as const,
  registers: [registry],
});

/** Histogram: delivery latency by channel */
export const deliveryLatencySeconds = new Histogram({
  name: 'delivery_latency_seconds',
  help: 'Delivery latency in seconds by channel',
  labelNames: ['channel'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [registry],
});

/** Gauge: server uptime in seconds */
export const uptimeSeconds = new Gauge({
  name: 'uptime_seconds',
  help: 'Server uptime in seconds',
  registers: [registry],
  collect() {
    this.set(process.uptime());
  },
});

/** Counter: LLM classification attempts */
export const llmClassificationsTotal = new Counter({
  name: 'llm_classifications_total',
  help: 'Total LLM classification attempts',
  labelNames: ['status'] as const,
  registers: [registry],
});

/** Histogram: processing duration for pipeline operations */
export const processingDurationSeconds = new Histogram({
  name: 'processing_duration_seconds',
  help: 'Duration of pipeline processing operations in seconds',
  labelNames: ['operation'] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [registry],
});

/** Counter: events deduplicated, by match type */
export const eventsDeduplicatedTotal = new Counter({
  name: 'events_deduplicated_total',
  help: 'Total number of events identified as duplicates',
  labelNames: ['match_type'] as const,
  registers: [registry],
});

/** Gauge: number of active developing stories */
export const activeStories = new Gauge({
  name: 'active_stories',
  help: 'Number of currently active developing stories',
  registers: [registry],
});

/** Counter: historical enrichment timeouts */
export const historicalEnrichmentTimeoutsTotal = new Counter({
  name: 'historical_enrichment_timeouts_total',
  help: 'Total number of historical enrichment timeouts',
  registers: [registry],
});

// ============================================================
// Observability v2 — Pipeline funnel + filter + enrichment
// ============================================================

/** Counter: pipeline funnel (events reaching each stage) */
export const pipelineFunnelTotal = new Counter({
  name: 'pipeline_funnel_total',
  help: 'Events reaching each pipeline stage',
  labelNames: ['stage'] as const,
  registers: [registry],
});

/** Counter: alert filter decisions */
export const alertFilterTotal = new Counter({
  name: 'alert_filter_total',
  help: 'Alert filter decisions',
  labelNames: ['decision', 'source', 'reason_category'] as const,
  registers: [registry],
});

/** Counter: historical enrichment results */
export const historicalEnrichmentTotal = new Counter({
  name: 'historical_enrichment_total',
  help: 'Historical enrichment outcomes',
  labelNames: ['result'] as const,
  registers: [registry],
});

/** Histogram: historical enrichment duration */
export const historicalEnrichmentDurationSeconds = new Histogram({
  name: 'historical_enrichment_duration_seconds',
  help: 'Duration of historical enrichment queries in seconds',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

/** Counter: events suppressed during startup grace period */
export const gracePeriodSuppressedTotal = new Counter({
  name: 'grace_period_suppressed_total',
  help: 'Events suppressed during startup grace period',
  registers: [registry],
});

/** Counter: delivery errors by channel and error type */
export const deliveryErrorsTotal = new Counter({
  name: 'delivery_errors_total',
  help: 'Delivery errors by channel',
  labelNames: ['channel', 'error_type'] as const,
  registers: [registry],
});

/** Counter: LLM enrichment outcomes */
export const llmEnrichmentTotal = new Counter({
  name: 'llm_enrichment_total',
  help: 'LLM enrichment outcomes',
  labelNames: ['result'] as const,
  registers: [registry],
});

/** Counter: events dropped from the pipeline queue due to backpressure */
export const pipelineQueueDroppedTotal = new Counter({
  name: 'pipeline_queue_dropped_total',
  help: 'Events dropped from the pipeline queue due to backpressure',
  registers: [registry],
});

/** Histogram: LLM enrichment duration */
export const llmEnrichmentDurationSeconds = new Histogram({
  name: 'llm_enrichment_duration_seconds',
  help: 'Duration of LLM enrichment calls in seconds',
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

/** Counter: pushes suppressed during quiet hours */
export const pushQuietSuppressedTotal = new Counter({
  name: 'push_quiet_suppressed_total',
  help: 'Total push notifications suppressed by user quiet hours',
  registers: [registry],
});

/** Counter: pushes suppressed after hitting the daily cap */
export const pushCapSuppressedTotal = new Counter({
  name: 'push_cap_suppressed_total',
  help: 'Total push notifications suppressed by user daily cap',
  registers: [registry],
});

/** Counter: delivery gate decisions */
export const deliveryGateTotal = new Counter({
  name: 'delivery_gate_total',
  help: 'Delivery gate decisions',
  labelNames: ['result', 'tier', 'reason'] as const,
  registers: [registry],
});

/** Counter: delivery gate shadow mode decisions */
export const deliveryGateShadowTotal = new Counter({
  name: 'delivery_gate_shadow_total',
  help: 'Delivery gate shadow mode decisions',
  labelNames: ['result', 'tier'] as const,
  registers: [registry],
});

/** Reset all custom metrics (useful for tests) */
export function resetMetrics(): void {
  eventsProcessedTotal.reset();
  eventsBySource.reset();
  eventsBySeverity.reset();
  deliveriesSentTotal.reset();
  deliveriesByChannel.reset();
  deliveryLatencySeconds.reset();
  llmClassificationsTotal.reset();
  processingDurationSeconds.reset();
  eventsDeduplicatedTotal.reset();
  activeStories.reset();
  historicalEnrichmentTimeoutsTotal.reset();
  pipelineFunnelTotal.reset();
  alertFilterTotal.reset();
  historicalEnrichmentTotal.reset();
  historicalEnrichmentDurationSeconds.reset();
  gracePeriodSuppressedTotal.reset();
  deliveryErrorsTotal.reset();
  llmEnrichmentTotal.reset();
  llmEnrichmentDurationSeconds.reset();
  pipelineQueueDroppedTotal.reset();
  pushQuietSuppressedTotal.reset();
  pushCapSuppressedTotal.reset();
  deliveryGateTotal.reset();
  deliveryGateShadowTotal.reset();
}
