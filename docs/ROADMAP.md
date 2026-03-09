# Roadmap

## Overview

```
Phase 0: Foundation         [4 weeks]    ← You are here
Phase 1A: Pipeline Core     [3 weeks]
Phase 1B: Political + AI    [3 weeks]
Phase 1C: Newswires + Polish[2 weeks]
Phase 2: Dashboard MVP      [4 weeks]
Phase 3: Full Sources       [6 weeks]
Phase 4: Intelligence       [4 weeks]
Phase 5: Polish & Scale     [ongoing]
```

Total to usable MVP: ~14 weeks (Phase 0 through 2).
Total to full vision: ~26 weeks.

> **Design principle**: ship 5 scanners that work perfectly before adding 25 more that are flaky. The value isn't "30+ sources" — it's "every alert is trustworthy."

---

## Phase 0: Foundation 🏗️
*Weeks 1-4 · Goal: one scanner, one alert channel, end-to-end proof*

### Milestones

- [ ] **P0.1** — Project scaffold
  - TypeScript monorepo (turborepo)
  - Backend: Node.js + Fastify
  - Shared types package (Event schema, Scanner interface)
  - Docker Compose skeleton (app + PostgreSQL)
  - CI/CD (GitHub Actions: lint + test + build)

- [ ] **P0.2** — Scanner plugin framework
  - Base Scanner class with common interface (see [Architecture](ARCHITECTURE.md))
  - Scanner registry (enable/disable via config)
  - In-memory event bus behind a swappable interface (prep for Redis Streams later)

- [ ] **P0.3** — First scanner: SEC EDGAR 8-K
  - Python microservice wrapping [edgartools](REFERENCES.md#edgartools) (FastAPI)
  - RSS polling loop (30s interval)
  - Emit events in unified schema
  - Input validation + dedup (hash-based)

- [ ] **P0.4** — Delivery: Bark + Discord
  - Bark push with severity-based levels (critical/timeSensitive/active)
  - Discord webhook with rich embeds
  - **End-to-end proof**: SEC files 8-K → Bark push on iPhone in <60s

- [ ] **P0.5** — Testing foundation
  - Unit tests for scanner + parser + delivery
  - Mock SEC data for deterministic testing
  - >80% coverage for scanner and classification code

### Exit Criteria
✅ SEC 8-K scanner running, detecting real filings, pushing to Bark (iOS) + Discord. Tests passing in CI.

---

## Phase 1A: Pipeline Core 🔧
*Weeks 5-7 · Goal: storage + more Tier 1 scanners + rule-based classification*

### Milestones

- [ ] **P1A.1** — Storage layer
  - PostgreSQL schema: events, classifications, outcomes
  - Query API: by ticker, type, severity, date range
  - Retention policy (archive after 6 months)

- [ ] **P1A.2** — Rule-based classification engine (Stage 1)
  - Keyword matching for known patterns
  - 8-K item number mapping (2.05 → restructuring)
  - Severity and direction rules
  - Confidence scoring

- [ ] **P1A.3** — Additional Tier 1 scanners
  - SEC Form 4 (insider trading) — via edgartools microservice
  - Fed (FOMC statements, speeches) — RSS
  - BLS economic data (CPI, NFP, PPI) — calendar-driven

- [ ] **P1A.4** — Observability
  - Prometheus metrics (scanner polls, events detected, errors, latency)
  - Grafana dashboard (scanner health, event volume, classification distribution)
  - Health check endpoint (`/health`)

- [ ] **P1A.5** — Integration tests
  - Full pipeline tests: mock source → event → classification → storage → delivery
  - Delivery retry with exponential backoff (3 attempts)
  - Dead letter queue for failed deliveries

### Exit Criteria
✅ 4 scanners (8-K, Form 4, Fed, BLS). Rule-based classification. Events stored in PostgreSQL. Observability dashboard live.

---

## Phase 1B: Political + AI 🤖
*Weeks 8-10 · Goal: Tier 2 sources + LLM classification*

### Milestones

- [ ] **P1B.1** — LLM classification engine (Stage 2)
  - Event type, severity, direction with reasoning
  - Support API models (Claude/GPT) + optional local (Llama/Mistral)
  - FinBERT/SEC-BERT for fast financial sentiment (supplement LLM)
  - Backpressure: concurrency limit on LLM requests, priority queue (Tier 1 before Tier 4)

- [ ] **P1B.2** — Tier 2: Political figures
  - Trump Truth Social scanner (Crawlee-based scraping, 15s polling)
  - Fallback: 3rd-party aggregator if direct scraping breaks
  - Elon Musk X scanner (scraping for MVP, evaluate API later)
  - AI classification for political posts (tariff/trade/crypto/company-specific)

- [ ] **P1B.3** — Event deduplication
  - Cross-source dedup (same event from multiple sources → merge)
  - Content similarity matching (ticker + time window + keyword overlap)
  - "Developing story" grouping for related events within 30min window

- [ ] **P1B.4** — Delivery: Telegram + webhook
  - Telegram bot (free, rich formatting, large trading community)
  - Outbound webhook (HTTP POST event JSON to user-configured URL)
  - Per-ticker alert filtering (basic watchlist)
  - Cross-channel dedup (one event = max one push per channel)

### Exit Criteria
✅ 6+ scanners including Trump/Musk. AI classifying events. Telegram + webhook delivery. Deduplication working.

---

## Phase 1C: Newswires + Polish 📰
*Weeks 11-12 · Goal: Tier 3 + classification refinement*

### Milestones

- [ ] **P1C.1** — Tier 3: Corporate newswires
  - PR Newswire RSS scanner
  - BusinessWire RSS scanner
  - GlobeNewswire RSS scanner

- [ ] **P1C.2** — Classification refinement
  - Tune rule-based and LLM classifiers based on real data
  - Add confidence UX: "unconfirmed" badge for low-confidence events
  - Scraping reliability monitoring + auto-alert on scanner failure

- [ ] **P1C.3** — REST API v1
  - GET /events (filter by ticker, type, severity, date range)
  - GET /events/:id (full event detail)
  - GET /health (system status)
  - API key authentication

### Exit Criteria
✅ 9+ scanners across Tier 1-3. REST API live. Classification accuracy tracking begun.

---

## Phase 2: Dashboard MVP 🖥️
*Weeks 13-16 · Goal: usable web dashboard with live event feed*

### Milestones

- [ ] **P2.1** — Frontend scaffold
  - Next.js 15 project with App Router
  - shadcn/ui + Tailwind (dark + light theme)
  - react-grid-layout for draggable panels
  - Authentication (basic auth / API key)

- [ ] **P2.2** — Live Event Feed
  - WebSocket connection to backend
  - Virtual scrolling list (`@tanstack/virtual` or `react-virtuoso`)
  - Event cards (severity color, source icon, ticker, headline, direction, confidence)
  - Filter by tier, severity, type, ticker
  - Saved filter presets ("My Watchlist", "High Conviction", "Full Firehose")
  - Sound alerts (configurable per severity, volume, quiet hours)

- [ ] **P2.3** — Event Detail panel
  - Full classification with AI reasoning + confidence score
  - Source link to original filing/post
  - Historical similar events with outcomes
  - "Copy Event JSON" + "Export CSV" buttons

- [ ] **P2.4** — Chart panel
  - TradingView Lightweight Charts (candlestick)
  - Event markers overlay (green/red triangles)
  - Click marker → jump to event detail

- [ ] **P2.5** — System Health bar + Security
  - Per-scanner status indicators
  - Embedded Grafana link
  - CSP headers, HTTPS, input sanitization
  - Secrets in env vars (not config files)

- [ ] **P2.6** — Deployment + E2E tests
  - Docker Compose: backend + frontend + PostgreSQL + prometheus + grafana + bark-server
  - Cloudflare Tunnel for remote access
  - E2E tests for dashboard (Playwright)

### Exit Criteria
✅ Web dashboard with live events, charts, health monitoring. Saved filters + export. Accessible remotely with auth. E2E tests passing.

---

## Phase 3: Full Source Coverage 📡
*Weeks 17-22 · Goal: all 6 tiers operational*

### Milestones

- [ ] **P3.1** — Tier 4: Social media
  - X/Twitter $TICKER mention volume tracker (anomaly detection)
  - Reddit WSB scanner (hot posts, unusual mentions)
  - StockTwits sentiment tracker

- [ ] **P3.2** — Tier 5: Macro & Geopolitical
  - Economic calendar integration
  - CME FedWatch rate probability tracker
  - Reuters/AP breaking news RSS
  - OPEC decisions

- [ ] **P3.3** — Tier 6: Smart money
  - Unusual options activity scanner
  - Congress trades (STOCK Act disclosures)
  - Short interest changes
  - Dark pool prints

- [ ] **P3.4** — Additional Tier 1
  - FDA (PDUFA dates, approvals)
  - White House executive orders (Federal Register API)
  - DOJ/FTC antitrust actions
  - WARN Act mass layoff notices
  - Bankruptcy filings (PACER)

- [ ] **P3.5** — Analyst ratings + earnings
  - Upgrade/downgrade tracker
  - Price target changes
  - Earnings call transcript monitoring (real-time)

- [ ] **P3.6** — Scanner Plugin SDK
  - `create-scanner` CLI template generator
  - Plugin development guide + typed interface
  - Example community scanner

### Exit Criteria
✅ 25+ scanners across all 6 tiers. Scanner Plugin SDK documented. Full source coverage as described in [Sources](SOURCES.md).

---

## Phase 4: Intelligence Layer 🧠
*Weeks 23-26 · Goal: correlation engine + backtesting + accuracy tracking*

### Milestones

- [ ] **P4.1** — Multi-signal correlation engine
  - Cross-source event matching (ticker + time window + theme)
  - Confidence boosting for multi-source confirmation
  - Auto-upgrade severity when correlation detected

- [ ] **P4.2** — Backtesting framework
  - Historical event database (backfill from SEC, news archives)
  - Outcome tracking: price at T+1h, T+1d, T+1w, T+1m
  - Strategy evaluation: win rate by event type

- [ ] **P4.3** — Accuracy tracking & self-improvement
  - Classification accuracy over time
  - Direction signal accuracy
  - Feedback loop: adjust classification based on outcomes

- [ ] **P4.4** — Smart alerts & rules engine
  - Custom rules: `IF source=trump AND keyword=tariff AND severity>=HIGH THEN critical`
  - Alert budgeting (max N pushes/hour to prevent fatigue)
  - Progressive severity (escalate only if corroborated)

- [ ] **P4.5** — Advanced dashboard
  - Historical event explorer
  - Sector heatmap
  - Event impact chart
  - Multi-window support (BroadcastChannel API for detached panels)

### Exit Criteria
✅ Correlation engine live. Backtesting data proving strategy edges. Custom alert rules working.

---

## Phase 5: Polish & Scale ✨
*Ongoing · Goal: production-grade, community-ready*

- [ ] Performance: load testing, graceful degradation, auto-recovery
- [ ] PWA: installable, responsive, mobile-optimized
- [ ] Community: scanner marketplace, contributing guidelines, co-maintainer recruitment
- [ ] Multi-user: per-user watchlists + alert config
- [ ] Email digest: daily/weekly summary at market close
- [ ] Launch: documentation, video, Product Hunt, blog post

---

## Key Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Truth Social scraping breaks** | Lose highest-impact source | 3rd-party aggregator as primary, direct scraping as fallback; legal ToS review |
| **X API costs $200+/mo** | Budget constraint | Scrape for MVP; evaluate API ROI after launch |
| **SEC rate limits (10 req/s)** | Slower polling | RSS feed (single request for many filings) |
| **AI classification latency** | Delays alerts | Rule-based Stage 1 for instant alerts; LLM runs async |
| **Alert fatigue** | Users disable notifications | Alert budgeting, progressive severity, per-ticker filtering |
| **Legal liability for scraping** | C&D letters or lawsuits | ToS review per source; always have non-scraping fallback |
| **Data quality / false signals** | User loses trust or money | Validation layer, confidence thresholds, "unconfirmed" badge |
| **Single maintainer bus factor** | Project dies | Document decisions, write contributor guides early, recruit co-maintainers |
| **Python/TypeScript boundary** | Deployment complexity | Clean microservice boundary; consider all-Python backend if friction is high |

---

*See [Architecture](ARCHITECTURE.md) for technical design.*
*See [References](REFERENCES.md) for projects we build on.*
