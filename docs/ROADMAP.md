# Roadmap

## Overview

```
Phase 0: Foundation         [2 weeks]    ← You are here
Phase 1: Core Pipeline      [4 weeks]
Phase 2: Dashboard MVP      [3 weeks]
Phase 3: Full Sources       [4 weeks]
Phase 4: Intelligence       [3 weeks]
Phase 5: Polish & Scale     [ongoing]
```

Total to usable MVP: ~6 weeks (Phase 0-2).
Total to full vision: ~16 weeks.

---

## Phase 0: Foundation 🏗️
*Weeks 1-2 · Goal: project skeleton + first scanner working end-to-end*

### Milestones

- [ ] **P0.1** — Project scaffold
  - TypeScript monorepo (turborepo or nx)
  - Backend: Node.js + Express/Fastify
  - Shared types package (Event schema, Scanner interface)
  - Docker Compose skeleton (app + prometheus + grafana)
  - CI/CD (GitHub Actions: lint + test + build)

- [ ] **P0.2** — Scanner plugin framework
  - Base Scanner class with common interface (see [Architecture](ARCHITECTURE.md))
  - Scanner registry (auto-discover, enable/disable via config)
  - Health reporting per scanner
  - Prometheus metrics integration

- [ ] **P0.3** — First scanner: SEC EDGAR 8-K
  - Integrate [edgartools](REFERENCES.md#edgartools) for parsing
  - RSS polling loop (30s interval)
  - Emit events in unified schema
  - Log all detected filings

- [ ] **P0.4** — Delivery: Discord webhook
  - Format events as Discord embeds
  - Severity-based color coding
  - Send to configured webhook URL
  - **End-to-end proof**: SEC files 8-K → Discord alert in <60s

### Exit Criteria
✅ SEC 8-K scanner running, detecting real filings, pushing to Discord.

---

## Phase 1: Core Pipeline 🔧
*Weeks 3-6 · Goal: AI classification + multiple Tier 1-2 sources*

### Milestones

- [ ] **P1.1** — AI Classification engine
  - Stage 1: Rule-based pre-filter (keyword matching, 8-K item mapping)
  - Stage 2: LLM classification (event type, severity, direction)
  - Support both local model (Llama/Mistral) and API (Claude/GPT)
  - Confidence scoring

- [ ] **P1.2** — Storage layer
  - SQLite schema: events, classifications, outcomes
  - Query API: by ticker, type, severity, date range
  - Retention policy (archive old events)

- [ ] **P1.3** — Additional Tier 1 scanners
  - SEC Form 4 (insider trading) — using edgartools
  - Fed (FOMC statements, speeches) — RSS
  - FDA (PDUFA dates, approvals) — RSS + calendar

- [ ] **P1.4** — Tier 2: Political figures
  - Trump Truth Social scanner (web scrape, 15s polling)
  - Elon Musk X scanner (API or scrape, 30s polling)
  - AI classification for political posts (tariff/trade/crypto/company-specific)

- [ ] **P1.5** — Tier 3: Corporate newswires
  - PR Newswire RSS scanner
  - BusinessWire RSS scanner
  - GlobeNewswire RSS scanner

- [ ] **P1.6** — Event deduplication
  - Same event from multiple sources → merge, not duplicate
  - Similarity matching (ticker + time window + keyword overlap)

### Exit Criteria
✅ 8+ scanners running. AI classifying events with type + severity + direction. All events stored and queryable. Discord alerts working for all sources.

---

## Phase 2: Dashboard MVP 🖥️
*Weeks 7-9 · Goal: usable web dashboard with live event feed*

### Milestones

- [ ] **P2.1** — Frontend scaffold
  - Next.js 15 project with App Router
  - shadcn/ui + Tailwind dark theme
  - Basic layout: sidebar + main content area

- [ ] **P2.2** — Live Event Feed
  - WebSocket connection to backend
  - Real-time event cards (severity color, source icon, ticker, headline)
  - Filter by tier, severity, type, ticker
  - Auto-scroll with manual override

- [ ] **P2.3** — Event Detail panel
  - Click event → expand with full classification
  - Source link, AI reasoning, confidence
  - Historical similar events (if data available)

- [ ] **P2.4** — Chart panel
  - TradingView Lightweight Charts integration
  - Load ticker chart when event is selected
  - Event markers overlay on price data

- [ ] **P2.5** — System Health bar
  - Per-scanner status indicators
  - Last poll time, error count
  - Link to Grafana for detailed metrics

- [ ] **P2.6** — Deployment
  - Docker Compose: backend + frontend + prometheus + grafana
  - Cloudflare Tunnel for remote access
  - Basic auth or API key protection

### Exit Criteria
✅ Web dashboard showing live events from all active scanners. Charts with event markers. Health monitoring visible. Accessible remotely.

---

## Phase 3: Full Source Coverage 📡
*Weeks 10-13 · Goal: all 6 tiers operational*

### Milestones

- [ ] **P3.1** — Tier 4: Social media
  - X/Twitter $TICKER mention volume tracker
  - Reddit WSB scanner (hot posts, unusual mentions)
  - StockTwits sentiment tracker
  - Anomaly detection (volume spike vs 7-day baseline)

- [ ] **P3.2** — Tier 5: Macro & Geopolitical
  - BLS economic data releases (CPI, NFP, PPI)
  - Economic calendar integration
  - CME FedWatch rate probability tracker
  - Reuters/AP breaking news RSS

- [ ] **P3.3** — Tier 6: Smart money
  - Unusual options activity scanner
  - Congress trades (STOCK Act disclosures)
  - 13F institutional holdings (quarterly, from SEC scanner)
  - Short interest changes

- [ ] **P3.4** — White House & Congress
  - Executive orders (Federal Register API)
  - DOJ/FTC antitrust actions
  - WARN Act mass layoff notices

- [ ] **P3.5** — Analyst ratings
  - Upgrade/downgrade tracker
  - Price target changes
  - Coverage initiations

### Exit Criteria
✅ 25+ scanners across all 6 tiers. Full source coverage as described in [Sources](SOURCES.md).

---

## Phase 4: Intelligence Layer 🧠
*Weeks 14-16 · Goal: correlation engine + backtesting + accuracy tracking*

### Milestones

- [ ] **P4.1** — Multi-signal correlation engine
  - Cross-source event matching (ticker + time window + theme)
  - Confidence boosting for multi-source confirmation
  - Auto-upgrade severity when correlation detected
  - Correlation visualization in dashboard

- [ ] **P4.2** — Backtesting framework
  - Historical event database (backfill from SEC, news archives)
  - Outcome tracking: price at T+1h, T+1d, T+1w, T+1m
  - Strategy evaluation: "buy on restructuring 8-K" → historical win rate
  - Export backtest results

- [ ] **P4.3** — Accuracy tracking & self-improvement
  - Track AI classification accuracy over time
  - Track direction signal accuracy (predicted bullish → actually went up?)
  - Dashboard: accuracy by event type, by source, by severity
  - Feedback loop: retrain/adjust classification based on outcomes

- [ ] **P4.4** — Smart alerts & rules engine
  - Custom alert rules: `IF source=trump AND keyword=tariff AND severity>=HIGH THEN sound+push`
  - Watchlist-based filtering (only alert for tickers I own/watch)
  - Alert fatigue management (cooldown periods, digest mode)

- [ ] **P4.5** — Dashboard analytics upgrade
  - Historical event explorer (search + filter past events)
  - Sector heatmap (which sectors seeing most events)
  - Event impact chart (avg % move by event type)
  - Scanner performance ranking

### Exit Criteria
✅ Correlation engine finding multi-source events. Historical backtest data proving strategy edges. Accuracy dashboard showing classification quality. Custom alert rules working.

---

## Phase 5: Polish & Scale ✨
*Ongoing · Goal: production-grade, community-ready*

### Milestones

- [ ] **P5.1** — Performance & reliability
  - Load testing (1000+ events/hour throughput)
  - Graceful degradation (scanner failure doesn't crash system)
  - Automatic recovery + reconnection
  - Rate limit management for all APIs

- [ ] **P5.2** — Mobile experience
  - PWA support (installable, push notifications)
  - Responsive layout optimized for phone
  - Native push via web-push protocol

- [ ] **P5.3** — Community & extensibility
  - Scanner plugin development guide
  - Scanner template/generator CLI
  - Community scanner marketplace concept
  - Contributing guidelines

- [ ] **P5.4** — Advanced features
  - Email digest (daily/weekly summary)
  - Slack/Telegram notification channels
  - API for programmatic access
  - Webhook output (for algo trading integration)
  - Multi-user support with per-user watchlists

- [ ] **P5.5** — Documentation & launch
  - Full user documentation
  - Video walkthrough
  - Blog post / Product Hunt launch
  - Open-source community building

---

## Dependency Graph

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3
  │              │            │           │
  │              │            │           ▼
  │              │            │      Phase 4
  │              │            │           │
  │              │            │           ▼
  │              │            └──→ Phase 5 (ongoing)
  │              │
  │              └── P1.1 (AI) needed before P1.4 (political classification)
  │
  └── P0.2 (scanner framework) is the foundation for everything
```

## Key Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Truth Social has no API | Can't monitor Trump | Web scraping + headless browser; fallback to 3rd-party aggregators |
| X API costs $200+/mo | Budget constraint | Use scraping for MVP; evaluate if API value justifies cost |
| SEC rate limits (10 req/s) | Slower polling | Respect rate limits, use RSS feed (single request gets many filings) |
| AI classification latency | Delays alerts | Rule-based pre-filter for instant alerts; AI classification runs async |
| Too many alerts (noise) | User fatigue | Smart filtering, severity thresholds, digest mode, cooldown |

---

*See [Architecture](ARCHITECTURE.md) for technical design.*
*See [References](REFERENCES.md) for projects we build on.*
