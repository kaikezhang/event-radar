import type { FastifyInstance } from 'fastify';
import type {
  EventBus,
  ClassificationResult,
  RawEvent,
} from '@event-radar/shared';
import type { AlertRouter as AlertRouterType } from '@event-radar/delivery';
import type { Database } from './db/connection.js';
import type { EventDeduplicator } from './pipeline/deduplicator.js';
import type { AlertFilter } from './pipeline/alert-filter.js';
import type { LLMEnricher } from './pipeline/llm-enricher.js';
import type { HistoricalEnricher } from './pipeline/historical-enricher.js';
import type { LlmClassifier } from './pipeline/llm-classifier.js';
import type { LLMGatekeeper } from './pipeline/llm-gatekeeper.js';
import type { DeliveryGate } from './pipeline/delivery-gate.js';
import type { AuditLog } from './pipeline/audit-log.js';
import type { PipelineLimiter } from './pipeline/pipeline-limiter.js';
import type { RuleEngine } from './pipeline/rule-engine.js';
import type { IDeliveryKillSwitch } from './services/delivery-kill-switch.js';
import type { ClassificationAccuracyService } from './services/classification-accuracy.js';
import type { AdaptiveClassifierService } from './services/adaptive-classifier.js';
import type { OutcomeTracker } from './services/outcome-tracker.js';
import type { IMarketRegimeService } from '@event-radar/shared';
import { storeEvent } from './db/event-store.js';
import { createUserWebhookDelivery } from './services/user-webhook-delivery.js';
import { sql } from 'drizzle-orm';
import { toLiveFeedEvent } from './plugins/websocket.js';
import { buildPredictionPayload } from './prediction-helpers.js';
import { resolvePoliticalClassificationResult } from './pipeline/political-llm-policy.js';
import { inferHighPriorityTicker, shouldInferTicker } from './pipeline/ticker-inference.js';
import { categorizeFilterReason, logTitle, PRIMARY_SOURCES_SET } from './pipeline-helpers.js';
import {
  eventsProcessedTotal,
  eventsBySource,
  eventsBySeverity,
  deliveriesSentTotal,
  deliveriesByChannel,
  deliveryLatencySeconds,
  processingDurationSeconds,
  llmClassificationsTotal,
  eventsDeduplicatedTotal,
  activeStories,
  pipelineFunnelTotal,
  alertFilterTotal,
  historicalEnrichmentTotal,
  historicalEnrichmentDurationSeconds,
  gracePeriodSuppressedTotal,
  deliveryErrorsTotal,
  llmEnrichmentTotal,
  llmEnrichmentDurationSeconds,
  deliveryGateTotal,
  deliveryGateShadowTotal,
} from './metrics.js';

type HistoricalEnricherLike = Pick<HistoricalEnricher, 'enrich'>;

function isRoutineSecForm4Event(
  event: RawEvent,
  ruleResult: ClassificationResult,
): boolean {
  if (event.source.toLowerCase() !== 'sec-edgar') {
    return false;
  }

  const normalizedType = event.type.toLowerCase();
  const titleAndBody = `${event.title} ${event.body}`.toLowerCase();

  return (
    normalizedType.includes('form-4')
    || normalizedType.includes('form_4')
    || titleAndBody.includes('form 4')
  ) && (
    titleAndBody.includes('10b5-1')
    || titleAndBody.includes('10b5 1')
    || ruleResult.matchedRules.includes('form4-routine-10b5-1')
    || ruleResult.tags.includes('10b5-1-plan')
  );
}

function shouldRunLlmClassification(
  event: RawEvent,
  ruleResult: ClassificationResult,
): boolean {
  if (event.source.toLowerCase() === 'stocktwits') {
    return false;
  }

  if (isRoutineSecForm4Event(event, ruleResult)) {
    return false;
  }

  return ruleResult.severity === 'HIGH' || ruleResult.severity === 'CRITICAL';
}

export interface EventPipelineDeps {
  server: FastifyInstance;
  eventBus: EventBus;
  db?: Database;
  alertRouter: AlertRouterType;
  ruleEngine: RuleEngine;
  llmClassifier?: LlmClassifier;
  deduplicator: EventDeduplicator;
  alertFilter: AlertFilter;
  llmEnricher: LLMEnricher;
  historicalEnricher?: HistoricalEnricherLike;
  llmGatekeeper: LLMGatekeeper;
  deliveryGate: DeliveryGate;
  auditLog: AuditLog;
  pipelineLimiter: PipelineLimiter;
  killSwitch?: IDeliveryKillSwitch;
  accuracyService?: ClassificationAccuracyService;
  adaptiveService?: AdaptiveClassifierService;
  outcomeTracker?: OutcomeTracker;
  marketRegimeService: IMarketRegimeService;
  startTime: number;
}

export function wireEventPipeline(deps: EventPipelineDeps): void {
  const {
    server,
    eventBus,
    db,
    alertRouter,
    ruleEngine,
    llmClassifier,
    deduplicator,
    alertFilter,
    llmEnricher,
    historicalEnricher,
    llmGatekeeper,
    deliveryGate,
    auditLog,
    pipelineLimiter,
    killSwitch,
    accuracyService,
    adaptiveService,
    outcomeTracker,
    marketRegimeService,
    startTime,
  } = deps;

  const userWebhookDelivery = db ? createUserWebhookDelivery(db) : undefined;

  const processPipelineEvent = async (
    event: RawEvent,
    ruleResult: ClassificationResult,
  ): Promise<void> => {
    pipelineFunnelTotal.inc({ stage: 'ingested' });
    pipelineFunnelTotal.inc({ stage: 'classified' });

    // Step 2: Track metrics (always, even for duplicates)
    eventsProcessedTotal.inc({ source: event.source, event_type: event.type });
    eventsBySource.inc({ source: event.source });

    // Step 3: Dedup check
    const dedupResult = await deduplicator.check(event);
    activeStories.set(deduplicator.activeStoryCount);

    if (dedupResult.isDuplicate) {
      eventsBySeverity.inc({ severity: ruleResult.severity });
      eventsDeduplicatedTotal.inc({ match_type: dedupResult.matchType });
      pipelineFunnelTotal.inc({ stage: 'deduped' });
      auditLog.record({
        eventId: event.id, source: event.source, title: event.title,
        outcome: 'deduped', stoppedAt: 'dedup',
        reason: `duplicate: ${dedupResult.matchType}`,
      });
      return; // Skip DB storage + delivery for duplicates
    }

    // Step 4: Enrich event metadata with story info
    if (dedupResult.storyId) {
      const storyInfo = deduplicator.getStory(event.id);
      if (storyInfo) {
        event.metadata = {
          ...event.metadata,
          storyId: storyInfo.storyId,
          storyEventCount: storyInfo.eventCount,
        };
        event.title = `Developing: ${event.title}`;
      }
    }

    // Step 5: LLM classification (once, shared by DB storage and delivery)
    const llmResult = llmClassifier && shouldRunLlmClassification(event, ruleResult)
      ? await llmClassifier.classify(event, ruleResult)
      : undefined;

    if (llmClassifier && llmResult) {
      llmClassificationsTotal.inc({ status: llmResult.ok ? 'success' : 'failure' });
    }

    const classificationResult = resolvePoliticalClassificationResult(
      ruleResult,
      llmResult?.ok ? llmResult.value : undefined,
    );

    eventsBySeverity.inc({ severity: classificationResult.severity });

    if (shouldInferTicker(event, classificationResult.severity, llmResult?.ok ? llmResult.value : undefined)) {
      const inferredTicker = inferHighPriorityTicker(event);
      const existingTickers = Array.isArray(event.metadata?.['tickers'])
        ? (event.metadata?.['tickers'] as unknown[]).filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0,
          ).map((value) => value.toUpperCase())
        : [];

      event.metadata = {
        ...(event.metadata ?? {}),
        ticker: inferredTicker.ticker,
        tickers: [inferredTicker.ticker, ...existingTickers.filter((value) => value !== inferredTicker.ticker)],
        ticker_inferred: true,
        ticker_inference_strategy: inferredTicker.strategy,
      };
    }

    // Step 6: Store to DB (if available)
    let eventId: string | undefined;

    if (db) {
      const ticker =
        event.metadata && typeof event.metadata['ticker'] === 'string'
          ? event.metadata['ticker']
          : undefined;
      const classifiedEventType =
        llmResult?.ok
          ? llmResult.value.eventType
          : event.metadata && typeof event.metadata['eventType'] === 'string'
            ? event.metadata['eventType']
            : undefined;

      if (ticker || classifiedEventType) {
        event.metadata = {
          ...(event.metadata ?? {}),
          ...(ticker ? { ticker } : {}),
          ...(classifiedEventType ? { eventType: classifiedEventType } : {}),
        };
      }

      eventId = await storeEvent(db, {
        event,
        severity: classificationResult.severity,
        ticker: typeof ticker === 'string' ? ticker : undefined,
        eventType: typeof classifiedEventType === 'string' ? classifiedEventType : undefined,
      });

      if (accuracyService) {
        const predictionPayload = await buildPredictionPayload(
          event,
          ruleResult,
          llmResult,
          adaptiveService,
        );
        await accuracyService.recordPrediction(
          eventId,
          predictionPayload,
        );

        if (adaptiveService) {
          await adaptiveService.enqueueEventIfNeeded({
            eventId,
            source: event.source,
            confidence: predictionPayload.confidence,
          });
        }
      }

      if (outcomeTracker) {
        await outcomeTracker.scheduleOutcomeTrackingForEvent(eventId, event);
      }
    }

    await eventBus.publishTopic?.(
      'event:classified',
      toLiveFeedEvent({
        id: eventId ?? event.id,
        source: event.source,
        title: event.title,
        summary: event.body,
        severity: classificationResult.severity,
        metadata: event.metadata,
        time: event.timestamp,
        llmReason: llmResult?.ok ? llmResult.value.reasoning : undefined,
      }),
    );

    pipelineFunnelTotal.inc({ stage: 'stored' });

    // Step 7: Alert filter + delivery (if alertRouter enabled)
    // Grace period: suppress delivery for first 90s after startup to let scanners
    // populate their seenIds buffers (prevents duplicate flood on restart)
    const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
    const uptimeMs = Date.now() - startTime;
    const DELIVERY_GRACE_MS = 90_000;
    if (!isTest && uptimeMs < DELIVERY_GRACE_MS) {
      gracePeriodSuppressedTotal.inc();
      auditLog.record({
        eventId: event.id, source: event.source, title: event.title,
        severity: classificationResult.severity, outcome: 'grace_period', stoppedAt: 'grace_period',
        reason: `startup grace period (${Math.round(uptimeMs / 1000)}s / ${DELIVERY_GRACE_MS / 1000}s)`,
      });
      return; // Still in startup grace period — store to DB but don't deliver
    }

    if (alertRouter.enabled) {
      const ticker =
        event.metadata && typeof event.metadata['ticker'] === 'string'
          ? (event.metadata['ticker'] as string)
          : undefined;
      const persistEventMetadata = async (metadataStage: string) => {
        if (!db || !eventId) {
          return;
        }

        try {
          const result = await db.execute(sql`
            UPDATE events
            SET metadata = ${JSON.stringify(event.metadata ?? {})}::jsonb
            WHERE id = ${eventId}
          `);

          const rowCount =
            typeof result === 'object'
            && result !== null
            && 'rowCount' in result
            && typeof result.rowCount === 'number'
              ? result.rowCount
              : undefined;

          if (rowCount === 0) {
            server.log.warn({
              pipeline: true,
              stage: 'metadata_persist',
              metadataStage,
              eventId,
              source: event.source,
            });
          }
        } catch (error) {
          server.log.error({
            pipeline: true,
            stage: 'metadata_persist',
            metadataStage,
            eventId,
            source: event.source,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      };

      const filterResult = alertFilter.check(
        event,
        llmResult?.ok ? llmResult.value : undefined,
      );

      // Categorize filter reason for metrics
      const reasonCat = categorizeFilterReason(filterResult.reason);
      alertFilterTotal.inc({
        decision: filterResult.pass ? 'pass' : 'block',
        source: event.source,
        reason_category: reasonCat,
      });

      if (!filterResult.pass) {
        pipelineFunnelTotal.inc({ stage: 'filtered_out' });
        server.log.debug({
          pipeline: true,
          stage: 'filter',
          source: event.source,
          title: logTitle(event.title),
          pass: false,
          reason: filterResult.reason,
        });
        auditLog.record({
          eventId: event.id, source: event.source, title: event.title,
          severity: classificationResult.severity, ticker,
          outcome: 'filtered', stoppedAt: 'alert_filter',
          reason: filterResult.reason, reasonCategory: reasonCat,
        });
        return; // Blocked by alert filter
      }

      pipelineFunnelTotal.inc({ stage: 'filter_passed' });
      server.log.info({
        pipeline: true,
        stage: 'filter',
        source: event.source,
        title: logTitle(event.title),
        severity: classificationResult.severity,
        pass: true,
        reason: filterResult.reason,
        ticker,
      });

      // L2 LLM Judge — quality check for ALL sources that pass L1
      if (llmGatekeeper.enabled) {
        // Circuit breaker fallback: pass primary sources, block secondary
        if (llmGatekeeper.isCircuitOpen) {
          const isPrimary = PRIMARY_SOURCES_SET.has(event.source.toLowerCase());
          if (!isPrimary) {
            event.metadata = {
              ...(event.metadata ?? {}),
              llm_judge: {
                decision: 'BLOCK',
                confidence: 0,
                reason: 'circuit breaker open — secondary source blocked',
              },
            };
            await persistEventMetadata('llm_judge');
            pipelineFunnelTotal.inc({ stage: 'llm_blocked' });
            alertFilterTotal.inc({ decision: 'block', source: event.source, reason_category: 'llm_circuit_breaker' });
            server.log.info({
              pipeline: true,
              stage: 'llm_judge',
              source: event.source,
              title: logTitle(event.title),
              pass: false,
              reason: 'circuit breaker open — secondary source blocked',
            });
            auditLog.record({
              eventId: event.id, source: event.source, title: event.title,
              severity: classificationResult.severity, ticker,
              outcome: 'filtered', stoppedAt: 'llm_judge',
              reason: 'circuit breaker open — secondary source blocked',
              reasonCategory: 'llm_circuit_breaker',
            });
            return;
          }
          // Primary source: pass through during circuit break
          server.log.info({
            pipeline: true,
            stage: 'llm_judge',
            source: event.source,
            title: logTitle(event.title),
            pass: true,
            reason: 'circuit breaker open — primary source pass-through',
          });
        } else {
          const gateResult = await llmGatekeeper.check(event);
          event.metadata = {
            ...(event.metadata ?? {}),
            llm_judge: {
              decision: gateResult.pass ? 'PASS' : 'BLOCK',
              confidence: gateResult.confidence,
              reason: gateResult.reason,
            },
          };
          await persistEventMetadata('llm_judge');
          if (!gateResult.pass) {
            pipelineFunnelTotal.inc({ stage: 'llm_blocked' });
            alertFilterTotal.inc({ decision: 'block', source: event.source, reason_category: 'llm_judge' });
            server.log.info({
              pipeline: true,
              stage: 'llm_judge',
              source: event.source,
              title: logTitle(event.title),
              pass: false,
              reason: gateResult.reason,
              confidence: gateResult.confidence,
            });
            auditLog.record({
              eventId: event.id, source: event.source, title: event.title,
              severity: classificationResult.severity, ticker,
              outcome: 'filtered', stoppedAt: 'llm_judge',
              reason: `LLM: ${gateResult.reason} (confidence: ${gateResult.confidence})`,
              reasonCategory: 'llm_judge',
              confidence: gateResult.confidence,
            });
            return;
          }
          server.log.info({
            pipeline: true,
            stage: 'llm_judge',
            source: event.source,
            title: logTitle(event.title),
            pass: true,
            reason: gateResult.reason,
            confidence: gateResult.confidence,
          });
        }
      }

      // LLM Enrichment (always force HIGH/CRITICAL events through when enabled)
      let enrichment: import('@event-radar/delivery').LLMEnrichment | undefined;
      const shouldForceEnrichment = classificationResult.severity === 'HIGH'
        || classificationResult.severity === 'CRITICAL';
      const shouldEnrich = llmEnricher.enabled
        && (filterResult.enrichWithLLM || shouldForceEnrichment);
      if (shouldEnrich) {
        const enrichStart = Date.now();
        try {
          const llmEnrichResult = await llmEnricher.enrich(
            event,
            llmResult?.ok ? llmResult.value : undefined,
          );
          const enrichDurationSec = (Date.now() - enrichStart) / 1000;
          llmEnrichmentDurationSeconds.observe(enrichDurationSec);
          if (llmEnrichResult) {
            enrichment = llmEnrichResult;
            const nextMetadata: Record<string, unknown> = {
              ...(event.metadata ?? {}),
              llm_enrichment: llmEnrichResult,
            };
            delete nextMetadata['enrichment_failed'];
            event.metadata = nextMetadata;
            await persistEventMetadata('llm_enrichment');
            llmEnrichmentTotal.inc({ result: 'success' });

            // If the event had no ticker before, try to extract one from LLM enrichment
            // and schedule outcome tracking (which was skipped earlier due to missing ticker)
            const currentTicker =
              event.metadata && typeof event.metadata['ticker'] === 'string'
                ? event.metadata['ticker'] as string
                : undefined;
            const currentTickerWasInferred = event.metadata?.['ticker_inferred'] === true;

            if ((!currentTicker || currentTickerWasInferred) && db && eventId && outcomeTracker) {
              const enrichTickers = llmEnrichResult.tickers;
              const enrichTicker = enrichTickers?.[0]?.symbol;
              if (typeof enrichTicker === 'string' && enrichTicker.length > 0) {
                const normalizedTicker = enrichTicker.toUpperCase();
                // Prefer the concrete LLM-enrichment ticker over a missing or inferred placeholder.
                const updateResult = await db.execute(sql`
                  UPDATE events
                  SET ticker = ${normalizedTicker}
                  WHERE id = ${eventId}
                    AND (
                      ticker IS NULL
                      OR ticker = ${currentTicker ?? null}
                    )
                  RETURNING id
                `);
                const rowCount = Array.isArray(updateResult)
                  ? updateResult.length
                  : (updateResult as { rowCount?: number }).rowCount ?? 0;

                if (rowCount > 0) {
                  const nextMetadata = { ...(event.metadata ?? {}) };
                  nextMetadata['ticker'] = normalizedTicker;
                  if (Array.isArray(nextMetadata['tickers'])) {
                    nextMetadata['tickers'] = [
                      normalizedTicker,
                      ...(nextMetadata['tickers'] as unknown[])
                        .filter((value): value is string => typeof value === 'string' && value.toUpperCase() !== normalizedTicker)
                        .map((value) => value.toUpperCase()),
                    ];
                  } else {
                    nextMetadata['tickers'] = [normalizedTicker];
                  }
                  delete nextMetadata['ticker_inferred'];
                  delete nextMetadata['ticker_inference_strategy'];
                  event.metadata = nextMetadata;
                  await persistEventMetadata('llm_enrichment_ticker');
                  // Schedule outcome tracking now that we have a ticker
                  await outcomeTracker.scheduleOutcomeTrackingForEvent(eventId, event);
                }
              }
            }
          } else {
            llmEnrichmentTotal.inc({ result: 'empty' });
          }
        } catch (enrichErr) {
          const enrichDurationSec = (Date.now() - enrichStart) / 1000;
          llmEnrichmentDurationSeconds.observe(enrichDurationSec);
          llmEnrichmentTotal.inc({ result: 'error' });
          const errorMessage = enrichErr instanceof Error ? enrichErr.message : String(enrichErr);
          if (shouldForceEnrichment) {
            event.metadata = {
              ...(event.metadata ?? {}),
              enrichment_failed: true,
            };
            await persistEventMetadata('llm_enrichment_failure');
            server.log.warn({
              pipeline: true,
              stage: 'llm_enrichment',
              source: event.source,
              severity: classificationResult.severity,
              error: errorMessage,
            });
          } else {
            server.log.error({
              pipeline: true,
              stage: 'llm_enrichment',
              source: event.source,
              error: errorMessage,
            });
          }
        }
      }

      // Delivery Gate — evaluate tier before historical enrichment
      const classifierDir = llmResult?.ok ? llmResult.value.direction : undefined;
      const gateClassifierDirection: import('@event-radar/shared').LLMDirection =
        classifierDir === 'BULLISH' ? 'bullish'
          : classifierDir === 'BEARISH' ? 'bearish'
            : 'neutral';
      const gateResult = deliveryGate.evaluate({
        event,
        enrichment: enrichment ?? null,
        classificationConfidence: classificationResult.confidence,
        confidenceBucket: classificationResult.confidenceLevel ?? 'unconfirmed',
        classifierDirection: gateClassifierDirection,
        classifierSeverity: classificationResult.severity,
      });

      const gateMode = process.env.DELIVERY_GATE_MODE ?? 'shadow';

      deliveryGateTotal.inc({
        result: gateResult.pass ? 'pass' : 'block',
        tier: gateResult.tier,
        reason: gateResult.reason,
      });

      if (gateMode === 'enforce' && !gateResult.pass) {
        pipelineFunnelTotal.inc({ stage: 'delivery_gate_blocked' });
        auditLog.record({
          eventId: event.id, source: event.source, title: event.title,
          severity: classificationResult.severity, ticker,
          outcome: 'filtered', stoppedAt: 'delivery_gate',
          reason: gateResult.reason, reasonCategory: 'delivery_gate',
        });
        server.log.info({
          pipeline: true, stage: 'delivery_gate', source: event.source,
          title: logTitle(event.title), pass: false,
          tier: gateResult.tier, reason: gateResult.reason,
          details: gateResult.gateDetails,
        });
        return;
      }

      if (gateMode === 'shadow') {
        deliveryGateShadowTotal.inc({
          result: gateResult.pass ? 'would_pass' : 'would_block',
          tier: gateResult.tier,
        });
      }

      server.log.info({
        pipeline: true, stage: 'delivery_gate', source: event.source,
        title: logTitle(event.title), pass: gateResult.pass,
        tier: gateResult.tier, reason: gateResult.reason, mode: gateMode,
      });

      event.metadata = { ...(event.metadata ?? {}), delivery_gate: {
        tier: gateResult.tier, reason: gateResult.reason, pass: gateResult.pass,
        details: gateResult.gateDetails,
      }};
      await persistEventMetadata('delivery_gate');

      // Historical enrichment (only after filter passes, before delivery)
      let historicalContext: import('@event-radar/delivery').HistoricalContext | undefined;
      if (historicalEnricher) {
        const histStart = Date.now();
        const histResult = await historicalEnricher.enrich(
          event,
          llmResult?.ok ? llmResult.value : undefined,
        );
        historicalContext = histResult ?? undefined;
        if (historicalContext) {
          event.metadata = {
            ...(event.metadata ?? {}),
            historical_context: historicalContext,
          };
          await persistEventMetadata('historical_enrichment');
        }
        const histDurationMs = Date.now() - histStart;
        const histDurationS = histDurationMs / 1000;
        historicalEnrichmentDurationSeconds.observe(histDurationS);

        if (historicalContext) {
          historicalEnrichmentTotal.inc({ result: 'hit' });
          server.log.info({
            pipeline: true,
            stage: 'historical',
            source: event.source,
            title: logTitle(event.title),
            confidence: historicalContext.confidence,
            matches: historicalContext.matchCount,
            duration_ms: histDurationMs,
          });
        } else {
          historicalEnrichmentTotal.inc({ result: 'miss' });
        }
      }

      let regimeSnapshot: import('@event-radar/shared').RegimeSnapshot | undefined;
      try {
        regimeSnapshot = await marketRegimeService.getRegimeSnapshot();
      } catch (error) {
        server.log.warn({
          pipeline: true,
          stage: 'market_regime',
          source: event.source,
          title: logTitle(event.title),
          error: error instanceof Error ? error.message : error,
        }, 'failed to load regime snapshot for delivery');
      }

      pipelineFunnelTotal.inc({ stage: 'enriched' });

      // Kill switch — skip delivery when active
      if (killSwitch && await killSwitch.isActive()) {
        pipelineFunnelTotal.inc({ stage: 'kill_switch_skipped' });
        server.log.info({
          pipeline: true,
          stage: 'kill_switch',
          source: event.source,
          title: logTitle(event.title),
          severity: classificationResult.severity,
          reason: 'delivery kill switch is active',
        });
        auditLog.record({
          eventId: event.id, source: event.source, title: event.title,
          severity: classificationResult.severity, ticker,
          outcome: 'filtered', stoppedAt: 'kill_switch',
          reason: 'delivery kill switch is active',
          reasonCategory: 'kill_switch',
        });
        return; // Event was processed and stored, just not delivered
      }

      const deliveryStart = Date.now();
      const routeResult = await alertRouter.route({
        storedEventId: eventId,
        event,
        severity: classificationResult.severity,
        ticker,
        confirmationCount:
          typeof event.metadata?.['confirmationCount'] === 'number'
            ? event.metadata['confirmationCount'] as number
            : undefined,
        confirmedSources: Array.isArray(event.metadata?.['confirmedSources'])
          ? (event.metadata['confirmedSources'] as string[])
          : undefined,
        classificationConfidence: classificationResult.confidence,
        confidenceBucket: classificationResult.confidenceLevel,
        enrichment,
        historicalContext,
        regimeSnapshot,
        deliveryTier: gateMode === 'enforce' && gateResult.pass ? gateResult.tier as 'critical' | 'high' | 'feed' : undefined,
      });
      const deliveryMs = Date.now() - deliveryStart;
      const results = routeResult.deliveries;

      const okCount = results.filter(r => r.ok).length;
      const failCount = results.filter(r => !r.ok).length;

      for (const r of results) {
        const status = r.ok ? 'success' : 'failure';
        deliveriesSentTotal.inc({ channel: r.channel, status });
        deliveriesByChannel.inc({ channel: r.channel });
        deliveryLatencySeconds.observe(
          { channel: r.channel },
          deliveryMs / 1000,
        );
        if (!r.ok && r.error) {
          deliveryErrorsTotal.inc({ channel: r.channel, error_type: r.error.message.slice(0, 50) });
        }
      }

      pipelineFunnelTotal.inc({ stage: 'delivered' });

      // Deliver to users with Discord webhook configured for matching watchlist tickers
      if (userWebhookDelivery && ticker) {
        const webhookStart = Date.now();
        try {
          const webhookResult = await userWebhookDelivery.deliverToMatchingUsers({
            title: event.title,
            description: enrichment?.impact ?? event.title,
            severity: classificationResult.severity,
            ticker,
            source: event.source,
            timestamp: event.timestamp ?? new Date(),
            url: typeof event.url === 'string' ? event.url : undefined,
          });

          const webhookMs = Date.now() - webhookStart;

          if (webhookResult.sent > 0) {
            deliveriesSentTotal.inc({ channel: 'user_discord_webhook', status: 'success' }, webhookResult.sent);
            deliveriesByChannel.inc({ channel: 'user_discord_webhook' }, webhookResult.sent);
            deliveryLatencySeconds.observe({ channel: 'user_discord_webhook' }, webhookMs / 1000);
          }
          if (webhookResult.errors > 0) {
            deliveriesSentTotal.inc({ channel: 'user_discord_webhook', status: 'failure' }, webhookResult.errors);
            deliveryErrorsTotal.inc({ channel: 'user_discord_webhook', error_type: 'webhook_delivery_failed' }, webhookResult.errors);
          }
        } catch (err) {
          deliveryErrorsTotal.inc({ channel: 'user_discord_webhook', error_type: 'webhook_delivery_exception' });
          server.log.warn({ err, ticker }, 'user webhook delivery failed');
        }
      }

      server.log.info({
        pipeline: true,
        stage: 'delivery',
        source: event.source,
        title: logTitle(event.title),
        severity: classificationResult.severity,
        channels: results.map(r => r.channel),
        routingTier: routeResult.decision.tier,
        pushMode: routeResult.decision.pushMode,
        routingReason: routeResult.decision.reason,
        ok: okCount,
        fail: failCount,
        duration_ms: deliveryMs,
        historical: !!historicalContext,
        ticker,
      });
      const judgeConfidence = typeof event.metadata?.['llm_judge'] === 'object'
        ? (event.metadata['llm_judge'] as Record<string, unknown>)?.['confidence']
        : undefined;
      auditLog.record({
        eventId: event.id, source: event.source, title: event.title,
        severity: classificationResult.severity, ticker,
        outcome: 'delivered', stoppedAt: 'delivery',
        reason: filterResult.reason,
        reasonCategory: reasonCat,
        deliveryChannels: results.map(r => ({ channel: r.channel, ok: r.ok })),
        historicalMatch: !!historicalContext,
        historicalConfidence: historicalContext?.confidence,
        durationMs: deliveryMs,
        confidence: typeof judgeConfidence === 'number' ? judgeConfidence : undefined,
      });
    }
  };

  // Unified event pipeline: classify → dedup → store → filter → deliver
  eventBus.subscribe((event) => {
    const end = processingDurationSeconds.startTimer({ operation: 'classify' });
    const result = ruleEngine.classify(event);
    end();

    const accepted = pipelineLimiter.enqueue({
      severity: result.severity,
      run: async () => {
        await processPipelineEvent(event, result);
      },
    });

    if (!accepted) {
      server.log.warn({
        pipeline: true,
        stage: 'pipeline_backpressure',
        source: event.source,
        severity: result.severity,
        title: logTitle(event.title),
      }, 'dropped event due to full pipeline queue');
    }
  });

  if (adaptiveService && eventBus.subscribeTopic) {
    eventBus.subscribeTopic('accuracy:updated', async (payload) => {
      const totalEvaluated =
        payload &&
        typeof payload === 'object' &&
        'totalEvaluated' in payload &&
        typeof payload.totalEvaluated === 'number'
          ? payload.totalEvaluated
          : null;

      if (totalEvaluated != null) {
        await adaptiveService.recalculateWeightsIfNeeded(totalEvaluated);
      }
    });
  }
}
