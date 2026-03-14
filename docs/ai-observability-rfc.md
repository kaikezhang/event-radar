# RFC: AI Observability System for Event Radar

## Status: DRAFT
## Author: 晚晚 (AI Operations)
## Date: 2026-03-14

---

## Problem Statement

Event Radar has rich operational data across 40 DB tables, Prometheus metrics, and 11 scanner sources. However, the AI operator (晚晚) currently lacks structured access to digest this data for decision-making. Understanding system health, diagnosing issues, and identifying optimization opportunities requires ad-hoc SQL queries and manual investigation.

### Current Pain Points

1. **No unified health view**: `/health` shows scanner alive/dead, but not event flow rates, quality trends, or anomalies
2. **No feedback loop**: Events get delivered but there's no automated way to check if delivered events actually moved prices (signal validation)
3. **No false negative detection**: When LLM Judge blocks an event, we never learn if that was a mistake (the stock moved 8% the next day)
4. **No trend analysis**: We know "3346 filtered today" but not "filter rate increased 15% this week"
5. **No anomaly detection**: Scanner goes silent for 6 hours — nobody notices until manually checked
6. **Fragmented diagnostics**: Tracing a single event through the pipeline requires 4+ SQL queries across different tables

### Current Data Assets (underutilized)

| Table | Rows | Usage |
|-------|------|-------|
| events | 10,800+ | Stored but not analyzed for patterns |
| pipeline_audit | 5,200+ | Used for feed display only |
| event_outcomes | 4,900+ | Has event_price but change_1d/1w/1m all NULL |
| classification_predictions | 10,800+ | Not connected to outcomes |
| classification_outcomes | 0 | Empty — never populated |
| user_feedback | 0 | Schema exists, no collection mechanism |
| deliveries | 0 | Old events lost in DB rebuild |
| source_weights | 0 | Adaptive system not activated |

---

## Design Principles

1. **One call = full situational awareness** — No 20-query assembly required
2. **Decision-oriented, not display-oriented** — Every data point must suggest an action
3. **Trends over snapshots** — "filter rate went from 60% to 75%" beats "filter rate is 75%"
4. **Exception-driven** — Normal state is silent; anomalies are surfaced proactively
5. **No new tables** — All endpoints aggregate existing data via SQL + Prometheus metrics
6. **AI-consumable JSON** — Structured for programmatic analysis, not human dashboards

---

## Architecture: Three-Layer Observability

```
┌─────────────────────────────────────────────────┐
│ Layer 1: System Pulse (real-time)                │
│ GET /api/v1/ai/pulse                             │
│ Called every heartbeat (~30min)                   │
│ Returns: health score, pipeline funnel,           │
│          anomalies, questionable blocks           │
├─────────────────────────────────────────────────┤
│ Layer 2: Daily Intelligence Report               │
│ GET /api/v1/ai/daily-report?date=YYYY-MM-DD      │
│ Generated once per day via cron                   │
│ Returns: full-day analysis, false negatives,      │
│          signal validation, recommendations       │
├─────────────────────────────────────────────────┤
│ Layer 3: Deep Diagnostics (on-demand)            │
│ GET /api/v1/ai/trace/:eventId                    │
│ GET /api/v1/ai/compare?from=...&to=...           │
│ GET /api/v1/ai/scanner/:name                     │
│ Called when investigating specific issues         │
└─────────────────────────────────────────────────┘
```

---

## Layer 1: System Pulse

### Endpoint: `GET /api/v1/ai/pulse?window=30m`

**Purpose**: Give the AI operator complete situational awareness in a single API call. Designed to be called during heartbeat checks.

**Query Parameters**:
- `window`: Time window for metrics aggregation. Default `30m`. Accepts: `5m`, `15m`, `30m`, `1h`, `6h`, `24h`.

### Response Schema

```typescript
interface PulseResponse {
  timestamp: string;           // ISO timestamp of this pulse
  window: string;              // e.g., "30m"
  windowStart: string;         // ISO start of window

  health: {
    score: number;             // 0-100 composite health score
    status: 'healthy' | 'degraded' | 'unhealthy';
    alerts: string[];          // Human-readable alert strings
  };

  scanners: {
    total: number;
    active: number;            // Produced events in window
    silent: string[];          // Scanner names with 0 events in window
    eventRates: Record<string, number>;  // Events per scanner in window
    lastSeen: Record<string, string>;    // ISO timestamp of last event per scanner
  };

  pipeline: {
    ingested: number;          // Total events ingested in window
    deduped: number;           // Removed as duplicates
    filtered: number;          // Blocked by filters/judge
    gracePeriod: number;       // Blocked by startup grace period
    delivered: number;         // Successfully delivered
    conversionRate: number;    // delivered / ingested as percentage
    trend: 'increasing' | 'stable' | 'decreasing';  // vs previous window
    trendDetail: string;       // e.g., "+23% vs previous 30m"
  };

  judge: {
    totalJudged: number;       // Events that went through LLM judge
    passRate: number;          // Percentage
    avgConfidence: number;     // Average judge confidence score
    topBlockReasons: Array<{   // Top 3 block reasons
      reason: string;
      count: number;
      percentage: number;
    }>;
    questionableBlocks: Array<{  // Low-confidence blocks worth reviewing
      eventId: string;
      title: string;
      source: string;
      ticker: string | null;
      severity: string;
      confidence: number;      // Judge confidence (low = uncertain)
      reason: string;
      blockedAt: string;       // ISO timestamp
    }>;
  };

  enrichment: {
    llmSuccessRate: number;    // Percentage of successful LLM enrichments
    llmAvgLatencyMs: number;
    historicalMatchRate: number;  // % of delivered events with historical context
    outcomeTracker: {
      pendingPriceUpdates: number;  // Events awaiting 1d/1w price fill
      eventsWithPriceData: number;
    };
  };

  anomalies: Array<{
    type: 'volume_spike' | 'scanner_silent' | 'filter_rate_change'
        | 'judge_confidence_drop' | 'delivery_error_spike'
        | 'enrichment_timeout_spike';
    severity: 'info' | 'warning' | 'critical';
    scanner?: string;
    detail: string;
    detectedAt: string;
  }>;
}
```

### Health Score Calculation

```
score = 100
- (silent_scanners / total_scanners) * 30    // Scanner coverage
- (grace_period_active ? 10 : 0)             // Startup penalty
- (anomaly_count * 5)                         // Per anomaly
- (delivery_error_rate * 20)                  // Delivery reliability
- min(enrichment_timeout_rate * 15, 15)       // Enrichment health
```

### Anomaly Detection Rules

| Anomaly | Detection Logic | Severity |
|---------|----------------|----------|
| `volume_spike` | Window count > 3× 24h average for that scanner | warning |
| `scanner_silent` | No events in 3× average interval for that scanner | warning (6h+ = critical) |
| `filter_rate_change` | Filter rate diff > 10% vs previous window | info (>20% = warning) |
| `judge_confidence_drop` | Avg confidence drop > 0.1 vs 24h average | warning |
| `delivery_error_spike` | >2 delivery errors in window | warning |
| `enrichment_timeout_spike` | >3 enrichment timeouts in window | warning |

### Questionable Blocks Selection

```sql
SELECT pa.event_id, pa.title, pa.source, pa.ticker, pa.severity,
       -- Extract confidence from reason field
       -- e.g., "LLM: routine activity (confidence: 0.52)"
       pa.reason, pa.created_at
FROM pipeline_audit pa
WHERE pa.outcome = 'filtered'
  AND pa.stopped_at = 'llm_judge'
  AND pa.created_at > NOW() - INTERVAL :window
  AND pa.severity IN ('HIGH', 'CRITICAL')
  -- Low confidence = uncertain decision = worth reviewing
  AND pa.reason LIKE '%confidence:%'
  AND CAST(
    SUBSTRING(pa.reason FROM 'confidence: ([0-9.]+)')
    AS NUMERIC
  ) < 0.7
ORDER BY pa.created_at DESC
LIMIT 5;
```

---

## Layer 2: Daily Intelligence Report

### Endpoint: `GET /api/v1/ai/daily-report?date=2026-03-14`

**Purpose**: Generate a comprehensive daily analysis of system performance, with particular focus on signal validation (were delivered events actually meaningful?) and false negative detection (did we miss something important?).

### Response Schema

```typescript
interface DailyReportResponse {
  date: string;              // YYYY-MM-DD
  generatedAt: string;       // ISO timestamp

  summary: {
    eventsTotal: number;
    delivered: number;
    conversionRate: number;
    vsYesterday: string;     // e.g., "+15% events, +40% deliveries"
    vsPrevWeekAvg: string;   // e.g., "-5% events, +10% deliveries"
  };

  scannerBreakdown: Array<{
    name: string;
    events: number;
    delivered: number;
    deliveryRate: number;
    avgSeverity: string;
    status: 'healthy' | 'degraded' | 'dead';
    lastEvent: string;       // ISO timestamp
  }>;

  judgeAnalysis: {
    totalJudged: number;
    passRate: number;
    avgConfidence: number;
    confidenceDistribution: {
      high: number;          // > 0.8
      medium: number;        // 0.5 - 0.8
      low: number;           // < 0.5
    };
    topBlockReasons: Array<{
      reason: string;
      count: number;
    }>;
    // Blocked events where actual price moved significantly
    falseNegativeCandidates: Array<{
      eventId: string;
      title: string;
      ticker: string;
      source: string;
      severity: string;
      blockedReason: string;
      confidence: number;
      priceAtEvent: number | null;
      priceChange1d: number | null;   // Actual price change
      priceChange1w: number | null;
      verdict: string;       // "likely false negative" | "correctly blocked"
    }>;
  };

  signalValidation: {
    // Compare delivered vs filtered events' actual price impact
    deliveredEvents: {
      count: number;
      avgAbsChange1d: number | null;   // Average |price change| at T+1d
      avgAbsChange1w: number | null;
      medianAbsChange1d: number | null;
    };
    filteredEvents: {
      count: number;
      avgAbsChange1d: number | null;
      avgAbsChange1w: number | null;
      medianAbsChange1d: number | null;
    };
    signalStrength: 'strong' | 'moderate' | 'weak' | 'insufficient_data';
    // "strong" = delivered events have 2x+ price impact vs filtered
    interpretation: string;  // Human-readable explanation
  };

  outcomeTracker: {
    eventsWithFullPriceData: number;  // Has 1d + 1w
    eventsPending1d: number;
    eventsPending1w: number;
    eventsPending1m: number;
    backfillHealth: string;  // "healthy" | "stale" | "not_running"
  };

  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    action: string;          // Machine-readable action type
    reason: string;          // Human-readable explanation
    data: Record<string, unknown>;  // Supporting data
  }>;
}
```

### False Negative Detection Logic

```sql
-- Events blocked by judge/filter where the stock moved >3% within 24h
SELECT
  pa.event_id,
  pa.title,
  pa.ticker,
  pa.source,
  pa.severity,
  pa.reason AS blocked_reason,
  eo.event_price,
  eo.change_1d,
  eo.change_1w
FROM pipeline_audit pa
JOIN events e ON e.source_event_id = pa.event_id
JOIN event_outcomes eo ON eo.event_id = e.id
WHERE pa.outcome = 'filtered'
  AND pa.created_at >= :dayStart
  AND pa.created_at < :dayEnd
  AND eo.change_1d IS NOT NULL
  AND ABS(eo.change_1d) > 0.03  -- >3% move
ORDER BY ABS(eo.change_1d) DESC
LIMIT 10;
```

### Signal Strength Calculation

```
ratio = avg_abs_change_delivered / avg_abs_change_filtered

if ratio >= 2.0: "strong"
if ratio >= 1.5: "moderate"  
if ratio >= 1.0: "weak"
else: "negative" (filtered events moved MORE than delivered — system is wrong)
```

### Recommendation Engine

| Condition | Recommendation |
|-----------|---------------|
| ≥3 false negatives with >5% price move | `lower_judge_threshold` — Judge is too aggressive |
| Scanner dead >24h | `investigate_scanner` — May need API key refresh or source URL fix |
| Filter rate >70% | `review_filter_rules` — Too many events being discarded |
| Filter rate <30% | `tighten_filters` — Too much noise reaching judge |
| Dedup rate >50% for one scanner | `tune_dedup_window` — Scanner producing too many duplicates |
| Historical match rate <5% | `expand_historical_data` — Need more seed data or broader matching |
| event_outcomes backfill stale >24h | `fix_outcome_tracker` — Price data not being collected |
| Signal strength "weak" or "negative" | `review_classification` — System not adding alpha |

---

## Layer 3: Deep Diagnostics

### 3a. Event Trace: `GET /api/v1/ai/trace/:eventId`

Provides full pipeline lifecycle for a single event.

```typescript
interface EventTraceResponse {
  eventId: string;           // Source event ID (raw)
  dbId: string;              // Database UUID
  title: string;
  source: string;
  timestamp: string;

  timeline: Array<{
    stage: 'ingested' | 'classified' | 'dedup_check' | 'judge'
         | 'enriched' | 'historical_match' | 'delivered' | 'blocked';
    at: string;              // ISO timestamp
    durationMs?: number;     // Time spent at this stage
    details: Record<string, unknown>;  // Stage-specific data
  }>;

  classification: {
    severity: string;
    method: string;          // 'rule' | 'llm' | 'hybrid'
    confidence: number;
    reasoning: string;
  } | null;

  judgeDecision: {
    decision: 'PASS' | 'BLOCK';
    confidence: number;
    reason: string;
  } | null;

  enrichment: {
    summary: string | null;
    impact: string | null;
    action: string | null;
    tickers: Array<{ symbol: string; direction: string }>;
    historicalMatch: boolean;
    similarEventsCount: number;
  } | null;

  delivery: {
    channels: Array<{ name: string; ok: boolean; error?: string }>;
    totalLatencyMs: number;
  } | null;

  outcome: {
    priceAtEvent: number | null;
    price1h: number | null;
    price1d: number | null;
    price1w: number | null;
    change1d: number | null;
    change1w: number | null;
  } | null;
}
```

### 3b. Period Comparison: `GET /api/v1/ai/compare?periodA=2026-03-07..2026-03-10&periodB=2026-03-11..2026-03-14`

Compares two time periods to identify what changed.

```typescript
interface CompareResponse {
  periodA: { start: string; end: string };
  periodB: { start: string; end: string };

  metrics: Array<{
    name: string;
    periodA: number;
    periodB: number;
    change: number;          // Absolute change
    changePercent: number;   // Percentage change
    significance: 'significant' | 'minor' | 'stable';
  }>;

  // Metrics compared:
  // - total_events, delivered_count, conversion_rate
  // - filter_rate, dedup_rate, grace_period_rate
  // - judge_pass_rate, avg_judge_confidence
  // - llm_enrichment_success_rate, historical_match_rate
  // - avg_delivery_latency_ms
  // - per-scanner event counts

  explanation: string;       // AI-generated summary of what changed and why
}
```

### 3c. Scanner Deep Dive: `GET /api/v1/ai/scanner/:name?days=7`

```typescript
interface ScannerDeepDiveResponse {
  scanner: string;
  period: { start: string; end: string };

  stats: {
    totalEvents: number;
    deliveredEvents: number;
    deliveryRate: number;
    avgSeverityScore: number;   // CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1
    dedupRate: number;
    filterRate: number;
  };

  timeline: Array<{
    hour: string;            // ISO hour bucket
    events: number;
    delivered: number;
  }>;

  topTickers: Array<{
    ticker: string;
    count: number;
    deliveredCount: number;
  }>;

  errors: Array<{
    at: string;
    message: string;
  }>;

  comparison: {
    vsPrevPeriod: string;    // e.g., "-20% events vs previous 7d"
  };
}
```

---

## Implementation Plan

### Phase 1: Pulse API (Priority: Critical)

**Files to create/modify:**
- `packages/backend/src/routes/ai-observability.ts` (new) — All AI observability routes
- `packages/backend/src/services/anomaly-detector.ts` (new) — Anomaly detection logic
- `packages/backend/src/services/health-scorer.ts` (new) — Health score computation
- `packages/backend/src/app.ts` — Register new routes

**SQL queries needed:**
- Pipeline funnel aggregation (window-based)
- Scanner event rates (window-based)
- Judge decision breakdown with confidence extraction
- Questionable blocks query

**Estimated complexity:** ~500 lines of code + ~200 lines of tests

**Dependencies:** None — uses existing tables only

### Phase 2: Daily Report (Priority: High)

**Additional files:**
- `packages/backend/src/services/signal-validator.ts` (new) — Signal strength analysis
- `packages/backend/src/services/recommendation-engine.ts` (new) — Recommendation generation

**Prerequisites:**
- Outcome tracker must be running and backfilling `change_1d`/`change_1w` data
- If outcome tracker is not running, Phase 2 still works but `signalValidation` and `falseNegativeCandidates` return `insufficient_data`

**Estimated complexity:** ~600 lines + ~300 lines of tests

### Phase 3: Deep Diagnostics (Priority: Medium)

**Additional routes in `ai-observability.ts`**

**Estimated complexity:** ~400 lines + ~200 lines of tests

---

## Integration with AI Operations

### Heartbeat Integration

```markdown
# HEARTBEAT.md addition
- Every 4 hours: Call GET /api/v1/ai/pulse
  - If anomalies present → notify #event-radar-project
  - If health score < 80 → investigate + notify
  - If questionable_blocks found → log for daily review
```

### Daily Cron

```json
{
  "schedule": "0 1 * * *",  // 01:00 UTC = 9pm ET
  "task": "Call /api/v1/ai/daily-report, format results, send to #event-radar-project"
}
```

### On-Demand Usage

When 主人 asks questions like:
- "为什么今天 delivery 少了?" → `/ai/compare` + `/ai/pulse`
- "这个事件为什么被拦了?" → `/ai/trace/:id`
- "breaking-news scanner 最近怎么样?" → `/ai/scanner/breaking-news`

---

## Non-Goals (Explicitly Out of Scope)

1. **No new database tables** — All queries aggregate existing data
2. **No real-time streaming** — Pulse is polled, not pushed
3. **No auto-tuning** — Recommendations are surfaced, not auto-applied (human-in-the-loop)
4. **No external dependencies** — No Grafana, DataDog, etc. Everything is self-contained
5. **No UI changes** — These are API-only endpoints consumed by the AI operator

---

## Security

- All `/api/v1/ai/*` endpoints require the same `x-api-key` as existing dashboard endpoints
- No write operations — all endpoints are read-only
- Anomaly detection runs in-process, no external calls

---

## Open Questions

1. **Outcome tracker**: `event_outcomes.change_1d` is currently all NULL. Is the outcome backfill job running? If not, Phase 2's signal validation will return `insufficient_data` until it's fixed.

2. **Questionable blocks confidence parsing**: Judge confidence is embedded in the `reason` text field (e.g., "LLM: routine activity (confidence: 0.52)"). Should we add a dedicated `confidence` column to `pipeline_audit` for cleaner queries?

3. **Scanner baseline intervals**: Anomaly detection needs "normal" event rates per scanner. Should we hardcode initial baselines or compute them from the last 7 days of data?

4. **Alert delivery for anomalies**: Should critical anomalies trigger immediate Discord notifications via the existing delivery infrastructure, or only surface through pulse polling?
