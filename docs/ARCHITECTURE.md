# Architecture

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                             │
│  SEC  Trump  Fed  X  PR Wire  Reddit  BLS  Options  ...        │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SCANNER LAYER                               │
│                                                                 │
│  Each source has a dedicated scanner plugin.                    │
│  Scanners run on independent polling loops.                     │
│  Output: raw events in a unified schema.                        │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ SEC      │ │ Truth    │ │ PR Wire  │ │ X/Social │  ...      │
│  │ Scanner  │ │ Scanner  │ │ Scanner  │ │ Scanner  │          │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘          │
└───────┼─────────────┼───────────┼─────────────┼────────────────┘
        │             │           │             │
        ▼             ▼           ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PROCESSING PIPELINE                          │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Ingest   │→ │ Classify │→ │ Enrich   │→ │Correlate │       │
│  │ + Dedup  │  │ (AI)     │  │ (price,  │  │ (multi-  │       │
│  │          │  │          │  │  context) │  │  signal)  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                    │            │
│                                                    ▼            │
│                                             ┌──────────┐       │
│                                             │  Score   │       │
│                                             │ + Signal │       │
│                                             └────┬─────┘       │
└──────────────────────────────────────────────────┼──────────────┘
                                                   │
                    ┌──────────────────────────────┤
                    ▼                              ▼
┌───────────────────────────┐  ┌───────────────────────────────┐
│       STORAGE             │  │        DELIVERY                │
│                           │  │                               │
│  ┌─────────┐ ┌─────────┐ │  │  ┌──────────┐ ┌──────────┐   │
│  │ SQLite/ │ │ Time    │ │  │  │ WebSocket│ │ Discord  │   │
│  │ Postgres│ │ Series  │ │  │  │ (live UI)│ │ Webhook  │   │
│  └─────────┘ └─────────┘ │  │  └──────────┘ └──────────┘   │
│                           │  │  ┌──────────┐ ┌──────────┐   │
│                           │  │  │ Bark     │ │ ntfy     │   │
│                           │  │  │ (iOS)    │ │ (cross)  │   │
│                           │  │  └──────────┘ └──────────┘   │
│                           │  │  ┌──────────┐                │
│                           │  │  │ Email    │                │
│                           │  │  │ (digest) │                │
│                           │  │  └──────────┘                │
└───────────────────────────┘  └───────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND DASHBOARD                          │
│                                                                 │
│  Next.js + WebSocket ← live event stream                       │
│  See FRONTEND.md for UI design                                  │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OBSERVABILITY                               │
│                                                                 │
│  Prometheus (metrics) → Grafana (dashboards + alerts)           │
│  Structured logging (JSON) → queryable                          │
│  Health check endpoint → auto-alerting on failure               │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Scanner Plugin Architecture

Inspired by [OpenBB's Provider system](REFERENCES.md#openbb).

Every data source is a **scanner plugin** that implements a common interface:

```
Scanner {
  id: string              // "sec-edgar-8k"
  tier: 1-6
  pollIntervalMs: number
  start(): void
  stop(): void
  health(): ScannerHealth
}
```

Scanners emit events into a shared event bus. They are:
- **Independent** — each runs its own polling loop, crash-isolated
- **Configurable** — enable/disable per source, adjust intervals via config
- **Observable** — each scanner exposes health + metrics
- **Pluggable** — community can contribute new scanners

### 2. Unified Event Schema

All sources produce events in a single schema:

```
Event {
  id: string
  source: string          // "sec-edgar", "truth-social", "x-vip"
  tier: 1-6
  timestamp: ISO8601
  detectedAt: ISO8601
  
  // Content
  ticker?: string[]       // Affected tickers (if identifiable)
  headline: string        // Human-readable summary
  body?: string           // Full text / filing content
  url?: string            // Link to original source
  
  // Classification (filled by AI pipeline)
  eventType?: string      // "restructuring", "insider-buy", "tariff", etc.
  severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  direction?: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN"
  confidence?: number     // 0-100
  
  // Enrichment
  priceAtDetection?: number
  historicalAvgMove?: number  // Avg % move for similar events
  relatedEvents?: string[]    // IDs of correlated events
}
```

### 3. AI Classification Pipeline

Two-stage classification:

**Stage 1: Rule-Based Pre-Filter** (instant, zero cost)
- Keyword matching for known patterns ("layoff", "restructuring", "tariff")
- SEC Item number mapping (2.05 → restructuring)
- Filters out obvious noise before hitting the AI

**Stage 2: LLM Classification** (only for events that pass Stage 1)
- Event type classification
- Severity assessment
- Direction signal with reasoning
- Can use local model (Llama) for cost=0 or API (Claude/GPT) for accuracy

### 4. Multi-Signal Correlation

The highest-conviction alerts come from **multiple sources confirming the same event**:

```
Signal 1: Trump posts "tariffs on China" (Truth Social)
Signal 2: $SPY put volume spikes 5x (options flow)
Signal 3: Reuters confirms tariff announcement (news wire)

→ Correlation engine: 3 sources, same theme, < 30 min window
→ Severity: CRITICAL (auto-upgraded from HIGH)
→ Confidence: 95%
```

Correlation uses:
- Ticker matching across events
- Theme/keyword similarity
- Time window (configurable, default 30 min)
- Source diversity bonus (3 different tiers > 3 same-tier)

### 5. Storage

**Primary**: SQLite (single-node simplicity) or PostgreSQL (if scaling needed)
- All events with full classification
- Query by ticker, type, severity, date range
- Outcome tracking (price at T+1h, T+1d, T+1w for backtesting)

**Time Series** (optional): For high-frequency metrics
- Scanner poll counts, latencies
- Event volume over time

### 6. Observability

Not an afterthought. Baked in from day one.

**Metrics (Prometheus)**:
- `scanner_polls_total{source}` — poll count per source
- `scanner_poll_duration_seconds{source}` — latency histogram
- `scanner_errors_total{source}` — error count
- `events_detected_total{source, type, severity}` — event counts
- `events_notified_total{channel}` — delivery counts

**Logging (structured JSON)**:
- Every poll: source, duration, items found
- Every event: full classification details
- Every error: stack trace + context

**Health Endpoint**: `/health`
- Per-scanner last success time + status
- Pipeline throughput
- Alert if any scanner is > 5 min stale

**Grafana Dashboards**:
- Live event feed
- Scanner health matrix
- Event volume trends
- Classification distribution
- Latency percentiles

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Backend runtime | Node.js (TypeScript) | Async I/O, good for polling workloads |
| Frontend | Next.js 15 + React | SSR + API routes + WebSocket |
| UI components | shadcn/ui + Tailwind | Dark theme, financial aesthetic |
| Data grid | AG Grid | Industry standard for financial data |
| Charts | TradingView Lightweight Charts | Professional K-line + event markers |
| Real-time | WebSocket (Socket.io) | Backend → Frontend live push |
| Database | SQLite → PostgreSQL | Start simple, scale when needed |
| Metrics | Prometheus | Industry standard observability |
| Dashboards | Grafana | Visualization + alerting |
| Containerization | Docker Compose | One-command deployment |

---

*See [Frontend](FRONTEND.md) for the dashboard UI design.*
*See [Sources](SOURCES.md) for the complete data source catalog.*
