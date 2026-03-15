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

Scanners emit events into the event bus. They are:
- **Independent** — each runs its own polling loop, crash-isolated
- **Configurable** — enable/disable per source, adjust intervals via config
- **Observable** — each scanner exposes health + metrics
- **Pluggable** — community can contribute new scanners via the Scanner Plugin SDK

### 2. Event Bus

The event bus is the central nervous system connecting scanners to the processing pipeline.

**Phase 0**: In-memory `EventEmitter` behind a `EventBus` interface. Simple, zero dependencies, fine for single-process.

**Phase 1+**: Swap to **Redis Streams** when durability matters:
- Persistent — events survive process crashes
- Consumer groups — multiple pipeline stages can read independently
- Replay — re-process historical events for debugging or backfill
- Backpressure — bounded streams with `MAXLEN` prevent memory exhaustion

The interface stays the same:
```
EventBus {
  publish(event: RawEvent): Promise<void>
  subscribe(handler: (event: RawEvent) => Promise<void>): void
  replay(from: string, handler: ...): Promise<void>  // Redis Streams only
}
```

### 3. Backpressure & Rate Limiting

What happens during a market crash when all 30+ sources fire simultaneously:

- **Priority queue**: Tier 1 events are processed before Tier 4, always
- **Bounded event bus**: Redis `MAXLEN` or in-memory ring buffer prevents OOM
- **AI concurrency limit**: Max 5 concurrent LLM classification requests
- **Delivery rate limiting**: Per-channel rate limits (Discord: 5/s, Bark: 10/s)
- **Alert budgeting**: Max N push notifications per hour per user to prevent fatigue

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

### 5. Python/TypeScript Boundary

The SEC parsing library (edgartools) is Python. The backend is TypeScript. This is resolved via a **clean microservice boundary**:

```
┌─────────────────────┐     HTTP/JSON     ┌─────────────────────┐
│  Node.js Backend    │ ←──────────────── │  Python SEC Service │
│  (scanners, pipeline│                   │  (FastAPI + edgartools│
│   delivery, API)    │                   │   + FinBERT)         │
└─────────────────────┘                   └─────────────────────┘
```

- Python microservice handles: SEC filing parsing, financial NLP (FinBERT/SEC-BERT)
- Node.js handles: polling loops, event bus, pipeline orchestration, WebSocket, API
- Communication: simple HTTP/JSON between services
- If the language boundary creates too much friction, the fallback plan is migrating the entire backend to Python (FastAPI + asyncio handles polling workloads well)

### 6. Storage

**Primary**: PostgreSQL (via Docker Compose — one container, zero extra complexity)
- All events with full classification
- JSONB columns for flexible event metadata
- Full-text search for event content
- Real concurrency (unlike SQLite)
- Query by ticker, type, severity, date range
- Outcome tracking (price at T+1h, T+1d, T+1w for backtesting)

**Time Series**: Prometheus for operational metrics (scanner polls, latencies, event volume)

### 7. Authentication & Security

Authentication uses magic link email + httpOnly cookie-based JWT tokens.

**Architecture**:
- Magic link: email → 15-min token → verify → JWT + refresh token in httpOnly cookies
- Access token: 7-day expiry, httpOnly Secure SameSite=Strict cookie
- Refresh token: 30-day expiry, family rotation (replay attack detection)
- CSRF: double-submit cookie pattern
- API key: retained as fallback for self-hosted single-user deployments

**Self-hosted mode** (`AUTH_REQUIRED=false`, default):
- All routes accessible with API key authentication
- Single-user mode, no login required
- JWT secret auto-generated per boot

**Cloud mode** (`AUTH_REQUIRED=true`):
- JWT required for protected routes
- Magic link signup (optionally invite-only via `SIGNUP_ALLOWLIST`)
- Rate limiting on auth endpoints (3 magic links per email per hour)

**Public routes** (no auth required):
- `/health`, `/api/health/ping`, `/metrics` — infrastructure
- `/api/v1/feed`, `/api/v1/feed/watchlist-summary` — delayed public feed
- `/api/auth/magic-link`, `/api/auth/verify` — auth flow
- `/ws/events` — WebSocket event stream

**Security measures**:
- JWT in httpOnly cookies (not localStorage) — prevents XSS token theft
- Refresh token family rotation — detects replay attacks
- Secrets in environment variables, never in config files
- HTTPS everywhere (Cloudflare Tunnel provides this)
- Rate limiting on REST API and auth endpoints
- Input sanitization for user-provided filter values

**Threat model**: Unauthorized access could expose: trading signals (competitive advantage leak), API keys (financial cost), and system config (infrastructure mapping)

### 8. Observability

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
| Virtual list | @tanstack/virtual or react-virtuoso | Lightweight virtual scrolling for event feed |
| Charts | TradingView Lightweight Charts | Professional K-line + event markers |
| Real-time | WebSocket (Socket.io) | Backend → Frontend live push |
| Database | PostgreSQL | JSONB, full-text search, real concurrency |
| Event bus | EventEmitter → Redis Streams | Durable, replayable event pipeline |
| SEC parsing | Python (FastAPI + edgartools) | Best-in-class SEC library |
| Financial NLP | FinBERT / SEC-BERT | Fast, domain-specific sentiment analysis |
| Scraping | Crawlee (Playwright-based) | Anti-detection, proxy rotation, queue management |
| Metrics | Prometheus | Industry standard observability |
| Dashboards | Grafana | Visualization + alerting |
| Containerization | Docker Compose | One-command deployment |

---

*See [Frontend](FRONTEND.md) for the dashboard UI design.*
*See [Sources](SOURCES.md) for the complete data source catalog.*
