# Event Radar — Comprehensive Project Analysis & Future Roadmap

**Author:** CC (Claude Code)
**Date:** 2026-03-20

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Assessment](#2-project-assessment)
3. [Competitive Landscape](#3-competitive-landscape)
4. [Feature Comparison Matrix](#4-feature-comparison-matrix)
5. [Future Enhancement Roadmap](#5-future-enhancement-roadmap)
6. [Technical Architecture Changes](#6-technical-architecture-changes)

---

## 1. Executive Summary

Event Radar is a **production-grade, self-hostable stock market event detection platform** with AI-powered historical analysis. It occupies a unique position in the market: the only open-source system that combines real-time multi-source event scanning with LLM-powered enrichment, outcome tracking, and historical pattern matching.

**Key Strengths:**
- 20+ active scanners covering government, regulatory, market, news, and social sources
- Sophisticated 5-stage pipeline (ingest → classify → enrich → filter → deliver)
- Outcome tracking with T+1h/T+5d/T+20d price movement data for accuracy measurement
- Self-hostable with Docker Compose — no vendor lock-in
- Mobile-first PWA with live WebSocket updates

**Key Weaknesses:**
- Single-process Node.js architecture limits horizontal scaling
- In-memory EventBus loses events on crash
- Large monolithic files (app.ts: 1418 lines, Feed.tsx: 990 lines)
- E2E tests disabled in CI
- No monetization infrastructure

**Market Position:** Event Radar sits between expensive institutional tools (Hammerstone $329/mo, Sentifi $20K+/yr) and limited retail platforms (Unusual Whales $48/mo, Benzinga Pro $37-177/mo). Its open-source, self-hostable nature is a genuine differentiator — no competitor offers this.

---

## 2. Project Assessment

### 2.1 Architecture Quality

**Monorepo Structure (pnpm workspaces + Turbo):**

```
packages/
  backend/     — Fastify 5 API + 20+ scanners + pipeline (252 TS files)
  shared/      — Types, schemas, BaseScanner, EventBus, RuleEngine
  delivery/    — Discord, Bark, Telegram, Web Push, Webhooks
  web/         — React 19 PWA (mobile-first, TanStack Query, Tailwind)
  dashboard/   — Admin observability (Recharts)
  e2e/         — End-to-end tests (currently disabled)
services/
  sec-scanner/ — Python FastAPI microservice (8-K + Form 4 parsing)
```

**Strengths:**
- Clean separation of concerns across packages
- Scanner plugin architecture (BaseScanner with automatic exponential backoff) is well-designed and extensible
- Result<T, E> pattern for error handling avoids exception-based control flow
- Config-driven scanner registration via ScannerRegistry
- Zod schema validation at boundaries

**Weaknesses:**
- `app.ts` at 1418 lines is the pipeline monolith — scanner registration, pipeline stages, route setup, and WebSocket handling are all co-located. This should be decomposed into separate modules.
- EventBus is in-memory only. A crash loses all in-flight events. Redis Streams or similar would provide durability.
- Scanner polling intervals are hardcoded (e.g., 60_000ms). Should be configurable via env vars for operational flexibility.

**Tech Stack:**
| Layer | Technology | Version | Assessment |
|-------|-----------|---------|------------|
| Runtime | Node.js | 22 | Current LTS, good choice |
| Framework | Fastify | 5 | High-performance, schema-first — excellent |
| ORM | Drizzle | Latest | Type-safe, lightweight — good fit |
| Database | PostgreSQL | 17 | Solid choice for event data |
| Frontend | React | 19 | Latest, using new features |
| Build | Vite + Turbo | Latest | Fast builds, good DX |
| LLM | OpenAI (GPT-4o-mini) | — | Cost-effective for classification |
| Python | FastAPI | — | Right tool for SEC parsing |

### 2.2 Scanner Coverage & Data Source Health

**20+ Active Scanners:**

| Category | Scanners | Polling Interval | Assessment |
|----------|----------|-----------------|------------|
| Government | White House, Federal Register, Congress, FDA, DOJ | 60-120s | Excellent coverage |
| Regulatory | SEC EDGAR (8-K, Form 4), WARN Act, FedWatch | 60-120s | Strong, Python microservice for SEC |
| Market | Trading halts, earnings, econ calendar, options, short interest, dilution | 60s | Good breadth |
| News | PR Newswire, BusinessWire, GlobeNewswire, Breaking News | 60s | Covers major wires |
| Social | Reddit, StockTwits, X/Twitter, Truth Social | 120s | Broad social coverage |

**Health Architecture:**
- Each scanner tracks consecutive errors with automatic exponential backoff (5 errors → 2x, 4x, 8x... capped at 30 min)
- Timeout backoff after 3 consecutive timeouts
- `/api/v1/scanners/health` endpoint exposes per-scanner status
- Prometheus metrics: `polls_total`, `poll_duration`, `errors_total`

**Gaps:**
- No international market coverage (EU regulatory, Asian markets)
- No cryptocurrency-native sources (on-chain data, DEX activity)
- No earnings whisper/guidance revision tracking
- Social scanners use scraping (X, Truth Social) — fragile and rate-limit-prone
- No Bloomberg/Reuters integration (cost barrier, but notable gap)

### 2.3 Pipeline Reliability

The 5-stage pipeline is well-architected:

```
Scanner → Ingest/Dedup → Classify → Enrich → Filter → Deliver
```

**Stage 1 — Ingest + Dedup:**
- In-memory sliding window (30 min) + DB lookup (24h)
- Story tracking for multi-source event correlation
- Persistent dedup state survives restarts (recent improvement)
- **Risk:** In-memory window can lose recent state on OOM kill

**Stage 2 — Classification (Rule + LLM):**
- 1100+ deterministic rules from YAML (Rule Engine)
- LLM classifier (GPT-4o-mini) for nuanced cases
- Fallback: rule-only classification if LLM fails
- **Strength:** Deterministic rules ensure baseline without LLM dependency

**Stage 3 — Enrichment:**
- LLM enrichment generates trader-actionable summary, impact analysis, risk factors
- Market regime service (RSI, moving averages, VIX z-score, yield curve)
- Historical pattern matching finds similar past events
- Circuit breaker: opens after 3 LLM failures, 60s recovery window
- **Risk:** LLM enrichment is the bottleneck (2-5s per event, concurrency limit = 5)

**Stage 4 — Alert Filter (3-layer):**
- L1: Deterministic (freshness, ticker cooldown 60min, social engagement thresholds)
- L2: Retrospective article detection (30+ regex patterns to filter non-news)
- L3: LLM Gatekeeper with 5s timeout, **fail-open design** (events pass if LLM times out)
- **Strength:** Fail-open is the right default — better to over-deliver than miss signals

**Stage 5 — Delivery Gate:**
- Confidence-based routing (high → push, lower → feed only)
- Kill switch for emergency delivery halt (events still processed, just not sent)
- Per-channel rate limiting (Discord 5/s, Bark 10/s)
- Alert budgeting (max 20 push/day per user)

**Pipeline Audit:** Every event's journey is recorded in `pipeline_audit` table with outcome, stoppedAt stage, reason, duration, and LLM confidence. This is excellent for debugging and signal validation.

### 2.4 Dashboard/Web App UX

**Web App (PWA)** — packages/web/

| Page | Lines | Features |
|------|-------|----------|
| Feed | 990 | Tabs (Watchlist/All), filters (severity/source/ticker/date), sort, saved presets, swipeable cards, live WebSocket |
| EventDetail | 1206 | Full enrichment display, historical similar events with outcome stats, inline chart, verdict/feedback, source-specific cards |
| Watchlist | — | Drag-and-drop reorder, edit mode, keyboard shortcuts |
| Scorecard | — | Rolling accuracy by severity and source, confidence intervals |
| TickerProfile | — | Per-ticker event history + context |
| Settings | — | Timezone, quiet hours, daily push cap |
| Search | — | Full-text event search |
| Login | — | Magic link authentication |
| Onboarding | — | First-run setup flow |

**Strengths:**
- Mobile-first design (Tailwind responsive classes)
- Swipeable cards with gesture support
- Live updates via WebSocket — no manual refresh needed
- Source-specific card templates for contextual display
- Trust cues from scorecard (source hit rate displayed inline)
- TanStack Query for efficient data fetching and caching

**Weaknesses:**
- Feed.tsx (990 lines) and EventDetail.tsx (1206 lines) are too large — should be decomposed into sub-components
- No dark mode (common request for trading apps)
- No desktop-optimized layout (mobile-first is good, but desktop could use multi-column)
- No keyboard shortcuts for power users on desktop
- Charts use lightweight-charts but no advanced technical analysis

**Admin Dashboard** — packages/dashboard/
- Pipeline audit trail with per-event tracing
- Scanner health matrix
- Event volume trends by source/type/severity
- AI observability: LLM latency, classification distribution, gatekeeper pass rate
- Delivery metrics by channel

### 2.5 Test Coverage & CI/CD

**Testing:**
- **156 test files** across the monorepo
- Backend: 111 test files covering dedup, pipeline, scanners, routes
- Web: Component and page tests (Vitest + Testing Library)
- Shared/Delivery: Unit tests for core modules
- Pattern: Mock fixtures, in-memory event bus, PGlite for SQL testing

**CI/CD (GitHub Actions):**
```yaml
Trigger: push to main + PRs
Steps: Install → Build → Lint → Test (shared, delivery, backend)
Backend test timeout: 120s (known PGlite cleanup issue)
E2E tests: DISABLED (TODO: Docker issues)
```

**Gaps:**
- E2E tests disabled in CI — major gap for pipeline confidence
- No test coverage reporting or thresholds
- No performance/load testing
- Backend test timeout workaround (120s + fallback echo) masks real failures
- No staging environment or canary deployments

### 2.6 Security Posture

**Authentication:**
- Magic link email flow (15-min token validity) via Resend
- JWT in httpOnly cookies (Secure, SameSite=Strict)
- Refresh token family rotation with replay attack detection
- `AUTH_REQUIRED` flag (false for local dev, true for production)

**Rate Limiting:**
- Auth: 5 magic links per email per hour
- API: Fastify rate limiter (@fastify/rate-limit)
- Delivery: per-channel rate limits

**Input Validation:**
- Zod schemas for all API inputs
- Ticker sanitization (uppercase normalization)

**Secrets:**
- All API keys via environment variables
- No hardcoded credentials found in codebase
- Auto-generated JWT secret when AUTH_REQUIRED=false

**Gaps:**
- No TOTP/2FA option
- No API key scoping (single API_KEY for all access)
- No RBAC — all authenticated users have equal access
- No CSP headers configured
- No rate limiting on WebSocket connections
- No audit log for admin actions (only pipeline events are audited)

### 2.7 Performance & Scalability

**Current Performance:**
- Scanner polls: 60-120s cycles
- Rule classification: <10ms
- LLM enrichment: 2-5s (bottleneck, concurrency limit = 5)
- LLM gatekeeper: <5s timeout
- Discord delivery: <1s
- DB queries: indexed on created_at, ticker, source

**Scalability Concerns:**
- **Single Node.js process** — no clustering, no horizontal scaling
- **In-memory EventBus** — cannot distribute across processes
- **Single PostgreSQL instance** — no read replicas, no connection pooling
- **LLM concurrency limit of 5** — at high event volume, enrichment queue backs up
- **No message queue** — no backpressure mechanism between pipeline stages

**Estimated Capacity:** Handles ~100-200 events/minute comfortably. Beyond that, LLM enrichment becomes the bottleneck. For 1000+ users with push notifications, delivery rate limits become a concern.

---

## 3. Competitive Landscape

### 3.1 Retail Trading Platforms

#### Unusual Whales — $48/mo
- **Focus:** Options flow tracking, dark pool data, congressional trading
- **Strengths:** Granular options flow filters, unique congressional tracker, Discord bot
- **Weaknesses:** No AI-driven analysis, US-only, options-centric (misses macro events)
- **vs. Event Radar:** Unusual Whales is deeper on options flow; Event Radar is broader in event coverage (government, regulatory, news, social) and has historical pattern matching. UW has no outcome tracking.

#### Benzinga Pro — $37-177/mo
- **Focus:** Real-time news feed with editorial filtering
- **Strengths:** Audio Squawk (live voice reading headlines), WIIM ("Why Is It Moving"), strong editorial team, AI research assistant
- **Weaknesses:** Expensive Essential tier ($177/mo), information overload, less useful for longer-term investors
- **vs. Event Radar:** Benzinga has superior news speed and editorial quality (human team). Event Radar has broader non-news sources (government, regulatory, social) and automated enrichment. Benzinga lacks outcome tracking or historical pattern matching.

#### MarketBeat — $17-33/mo
- **Focus:** Analyst ratings, institutional ownership, dividend tracking
- **Strengths:** Comprehensive fundamental data at reasonable price, good for dividend investors
- **Weaknesses:** No real-time feed, no AI, not for active trading
- **vs. Event Radar:** Different segments. MarketBeat is research/investor-focused; Event Radar is event/trader-focused.

#### Stocktwits — $8-23/mo
- **Focus:** Social sentiment and community discussion
- **Strengths:** Largest stock-focused social platform, real-time crowd sentiment per ticker
- **Weaknesses:** Poor signal-to-noise, spam/pump-and-dump risk, not a research tool
- **vs. Event Radar:** Event Radar already scans Stocktwits as a data source. ER adds structured event detection and AI analysis on top of raw social sentiment.

#### TipRanks — $30-50/mo
- **Focus:** Analyst accountability and performance tracking
- **Strengths:** Unique Financial Accountability Engine ranking 96K+ experts, Smart Score (1-10 composite)
- **Weaknesses:** Research tool, not real-time trading tool, most features paywalled
- **vs. Event Radar:** TipRanks' analyst ranking is genuinely unique — Event Radar could integrate TipRanks-style outcome tracking for its own sources (partially done via Scorecard).

### 3.2 Professional/Institutional Tools

#### Hammerstone Markets — $299-329/mo
- **Focus:** Event-driven trading news for professional desks
- **Strengths:** FINRA-compliant, 20+ years Wall Street credibility, fast human-curated news
- **Weaknesses:** Very expensive, no AI/ML, dated interface, not accessible to retail
- **vs. Event Radar:** Hammerstone is the closest direct competitor in concept. Event Radar offers comparable event detection at zero cost (self-hosted), with AI enrichment Hammerstone lacks. Hammerstone has superior editorial speed and institutional trust.

#### The Fly — $45-75/mo
- **Focus:** Fast financial news with editorial filtering
- **Strengths:** Excellent editorial team, fast delivery, good IPO analysis
- **Weaknesses:** Expensive, no scanning/screening, no AI
- **vs. Event Radar:** The Fly has faster, higher-quality editorial news. Event Radar has broader automated coverage, historical analysis, and outcome tracking.

### 3.3 AI-Powered Platforms

#### Trade Ideas — $127-254/mo
- **Focus:** AI-powered stock scanning (Holly AI)
- **Strengths:** Holly AI generates specific trade ideas with entry/exit/stop-loss levels, 500+ scan filters, backtesting
- **Weaknesses:** US equities only, expensive, steep learning curve
- **vs. Event Radar:** Trade Ideas is scanner-focused (price/volume patterns), Event Radar is event-focused (catalysts). Holly AI provides actionable trade setups; Event Radar provides event context and historical pattern matching. Complementary rather than competing.

#### Kavout — $20+/mo
- **Focus:** AI stock ratings and research assistant
- **Strengths:** Global market coverage (20+ markets), InvestGPT conversational research, affordable
- **Weaknesses:** Smaller company, credit-based pricing, less established
- **vs. Event Radar:** Kavout is research-oriented; Event Radar is event-detection-oriented. Kavout's global coverage is a differentiator Event Radar lacks.

### 3.4 Enterprise/Institutional AI

#### Sentifi — $20,000+/yr
- Monitors 14M+ financial influencers, 500M tweets/day, classifies 45,000 event types
- Institutional-only pricing makes this inaccessible to retail

#### Accern — $7,500+/mo per feature
- No-code NLP platform for financial institutions (Allianz, Mizuho, etc.)
- Enterprise sales cycle, no retail product

#### AlphaSense — $12,000-51,000/yr
- AI search across 500M+ premium documents (earnings transcripts, broker research)
- Used by 85%+ of S&P 100, but pure research tool — no real-time trading

### 3.5 Open-Source Alternatives

| Project | Focus | Comparison to Event Radar |
|---------|-------|--------------------------|
| StockSharp | Algorithmic trading platform (C#) | Trading execution, not event detection |
| Tickermind | Stock scanner + local LLM sentiment | Academic project, limited scope |
| Stock-Alerts | Unusual price/volume detection | Simple alerting, no enrichment |
| SEC-Filing-Analysis | SEC filing sentiment analysis | Single source, no real-time |

**No open-source project combines real-time multi-source event detection with AI enrichment and historical pattern matching.** Event Radar is unique in this space.

---

## 4. Feature Comparison Matrix

| Feature | Event Radar | Unusual Whales | Benzinga Pro | Hammerstone | Trade Ideas | Sentifi |
|---------|:-----------:|:--------------:|:------------:|:-----------:|:-----------:|:-------:|
| **Price** | Free (self-host) | $48/mo | $37-177/mo | $299/mo | $127-254/mo | $20K+/yr |
| Real-time event detection | ✅ | ✅ (options) | ✅ (news) | ✅ | ✅ (scanner) | ✅ |
| Government source scanning | ✅ | ❌ | ❌ | ❌ | ❌ | Partial |
| SEC filing parsing | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Congressional trading | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Options flow | ✅ | ✅✅ | ❌ | ❌ | ❌ | ❌ |
| Social sentiment scanning | ✅ | ❌ | ❌ | ❌ | ❌ | ✅✅ |
| AI/LLM enrichment | ✅ | ❌ | Partial | ❌ | ✅ (Holly) | ✅ |
| Historical pattern matching | ✅ | ❌ | ❌ | ❌ | Backtesting | ❌ |
| Outcome tracking (accuracy) | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Multi-source correlation | ✅ | ❌ | ❌ | Partial | ❌ | ✅ |
| Push notifications | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Self-hostable | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Open source | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Mobile app | PWA | iOS/Android | Web | Web | Desktop | No retail |
| Audio squawk | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| API access | ✅ | ✅ (paid) | ❌ | ❌ | ❌ | ✅ |
| Dark mode | ❌ | ✅ | ✅ | ❌ | ✅ | N/A |
| International markets | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 5. Future Enhancement Roadmap

### 5.1 Short-Term (1-2 Months) — Quick Wins & Reliability

| # | Enhancement | Effort | Impact | Details |
|---|------------|--------|--------|---------|
| 1 | **Decompose app.ts** | 3 days | High | Split 1418-line monolith into: `pipeline/index.ts`, `scanner-registry.ts`, `websocket-manager.ts`, `route-loader.ts`. Improves testability and readability. |
| 2 | **Re-enable E2E tests in CI** | 2 days | High | Fix Docker issues, add Docker Compose to CI workflow. Pipeline confidence depends on this. |
| 3 | **Add Redis EventBus** | 3 days | High | Replace in-memory EventBus with Redis Streams. Prevents event loss on crash. Already referenced in code comments as planned. |
| 4 | **Dark mode** | 2 days | Medium | Tailwind `dark:` variants + system preference detection. High-demand feature for trading apps. |
| 5 | **Configurable scanner intervals** | 1 day | Medium | Move all hardcoded polling intervals to env vars. Operational flexibility without code changes. |
| 6 | **Test coverage reporting** | 1 day | Medium | Add `@vitest/coverage-v8` to CI, set minimum threshold (e.g., 70%). Track coverage trends. |
| 7 | **Decompose Feed.tsx + EventDetail.tsx** | 3 days | Medium | Break into sub-components: `FeedFilters`, `FeedList`, `FeedCard`, `EventHeader`, `EventEnrichment`, `EventHistory`, `EventChart`. |
| 8 | **Fix PGlite test timeout** | 1 day | Low | Investigate and fix the cleanup issue instead of masking with `timeout 120`. |
| 9 | **Add CSP headers** | 0.5 days | Low | Content-Security-Policy headers via Fastify plugin for XSS protection. |
| 10 | **WebSocket rate limiting** | 1 day | Low | Add connection limits and message rate limiting to prevent abuse. |

### 5.2 Medium-Term (3-6 Months) — Major Features & Monetization Prep

| # | Enhancement | Effort | Impact | Details |
|---|------------|--------|--------|---------|
| 1 | **Historical event backfill** | 2 weeks | Critical | Seed database with 2-3 years of historical events from SEC, government sources. Pattern matching quality depends on historical depth. Currently starts from scratch each deploy. |
| 2 | **Multi-user RBAC** | 1 week | High | Role-based access control (admin, analyst, viewer). Foundation for hosted/SaaS offering. Scoped API keys per user. |
| 3 | **Hosted SaaS offering** | 3 weeks | High | Deploy a managed instance. Freemium model: free feed (delayed), paid real-time + push + API. Requires user management, billing (Stripe), usage metering. |
| 4 | **Desktop-optimized layout** | 1 week | High | Multi-column layout for desktop (feed + detail panel side-by-side). Keyboard shortcuts for power users (j/k navigation, s to save, f to filter). |
| 5 | **Audio squawk** | 2 weeks | High | Text-to-speech for critical/high severity events using browser SpeechSynthesis API or ElevenLabs. Benzinga's Audio Squawk is their killer feature — Event Radar should have an equivalent. |
| 6 | **LLM enrichment caching** | 3 days | Medium | Cache enrichment results by event type + market context. Reduces API costs and improves throughput. |
| 7 | **Grafana dashboard templates** | 3 days | Medium | Include Grafana JSON dashboards in repo for Prometheus metrics visualization. Currently, metrics are exported but no dashboards ship. |
| 8 | **Native mobile app (React Native)** | 4 weeks | Medium | True native push notifications, background refresh, offline support. PWA has limitations on iOS (no background sync). |
| 9 | **Analyst performance tracking** | 2 weeks | Medium | TipRanks-style source accountability — track which sources/scanners produce the most profitable signals over time. Extends existing Scorecard. |
| 10 | **Watchlist-based scanner prioritization** | 3 days | Medium | Prioritize pipeline processing for tickers on user watchlists. Reduces latency for tickers users care about. |

### 5.3 Long-Term (6-12 Months) — Scale, ML/AI, Enterprise

| # | Enhancement | Effort | Impact | Details |
|---|------------|--------|--------|---------|
| 1 | **Custom ML classifier** | 6 weeks | Critical | Train a custom classification model on accumulated event + outcome data. Replace GPT-4o-mini dependency for classification. Lower latency, lower cost, custom to Event Radar's domain. Use the `classificationPredictions` + `classificationOutcomes` tables — the data collection infrastructure is already in place. |
| 2 | **Horizontal scaling** | 4 weeks | High | Node.js clustering, Redis-backed EventBus, read replicas for PostgreSQL, stateless backend design. Target: 10K+ concurrent users. |
| 3 | **International market coverage** | 6 weeks | High | EU regulatory sources (ESMA, ECB), Asian markets (HKEX, TSE announcements), UK (FCA, Bank of England). Each market needs localized scanners. |
| 4 | **Enterprise API tier** | 3 weeks | High | REST + WebSocket API with rate-limited tiers, webhook delivery, custom filtering DSL. Sell to fintech platforms, trading bots, research firms. |
| 5 | **Backtesting engine** | 4 weeks | High | Allow users to define event-based strategies and backtest against historical data. "If a CRITICAL SEC 8-K filing for an S&P 500 stock was detected, what was the median 1-day move?" Uses existing `eventOutcomes` table. |
| 6 | **Portfolio integration** | 3 weeks | Medium | Connect to brokerage APIs (Alpaca, Interactive Brokers) for portfolio-aware alerting: only alert on events that affect user's holdings. |
| 7 | **Crypto/DeFi scanner** | 4 weeks | Medium | On-chain event detection (whale transfers, DEX liquidity changes, governance votes). New scanner category for crypto-native users. |
| 8 | **Multi-language support** | 2 weeks | Medium | i18n for web app. Start with Mandarin (Chinese retail trader market is massive and underserved by English-only tools). |
| 9 | **Event correlation graph** | 3 weeks | Medium | Visualize how events relate to each other (e.g., FDA approval → options flow spike → price movement). Graph-based UI for multi-source correlation stories. |
| 10 | **Slack/Teams integration** | 1 week | Low | Enterprise collaboration tool delivery. Slack Bot for channel-based alerting with interactive buttons. |

### 5.4 Priority Matrix

```
                    HIGH IMPACT
                        │
    Historical Backfill ●│● Custom ML Classifier
         Redis EventBus ●│● Horizontal Scaling
       Re-enable E2E   ●│● SaaS Offering
         Audio Squawk   ●│● Multi-user RBAC
        Decompose app.ts│● Enterprise API
                        │● Desktop Layout
    ────────────────────┼────────────────────
         LOW EFFORT     │     HIGH EFFORT
                        │
           Dark Mode   ●│● International Markets
    Scanner Intervals  ●│● Native Mobile App
        CSP Headers    ●│● Backtesting Engine
    Coverage Reports   ●│● Portfolio Integration
                        │● Crypto Scanner
                        │
                    LOW IMPACT
```

---

## 6. Technical Architecture Changes

### 6.1 Near-Term: Pipeline Decomposition

Current `app.ts` should be split:

```
packages/backend/src/
  pipeline/
    index.ts            — Pipeline orchestrator (wire stages together)
    ingest.ts           — Dedup + story tracking
    classifier.ts       — Rule engine + LLM classification
    enricher.ts         — LLM enrichment + market context
    alert-filter.ts     — 3-layer filtering (already partially extracted)
    delivery-gate.ts    — Channel routing + rate limiting
  scanner-manager.ts    — Scanner registration + health monitoring
  websocket-manager.ts  — WebSocket connection handling
  route-loader.ts       — Dynamic route registration
  app.ts                — Slim composition root (~200 lines)
```

### 6.2 Medium-Term: Redis Integration

```
Current:  Scanner → In-Memory EventBus → Pipeline (single process)
Target:   Scanner → Redis Streams → Pipeline Workers (N processes)

Benefits:
- Event durability (survives crashes)
- Horizontal scaling (multiple pipeline workers)
- Backpressure (Redis consumer groups)
- Cross-service communication (Python SEC scanner → Redis → Node.js pipeline)
```

### 6.3 Long-Term: Microservice Evolution

```
                    ┌─────────────┐
                    │   API GW    │ ← Rate limiting, auth, routing
                    │  (Fastify)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼───┐ ┌─────▼─────┐ ┌───▼────────┐
     │  Scanner   │ │  Pipeline  │ │  Web API   │
     │  Manager   │ │  Workers   │ │  (Feed,    │
     │ (20+ scnr) │ │ (classify, │ │  Search,   │
     │            │ │  enrich,   │ │  Auth)     │
     └─────┬──────┘ │  filter)   │ └───┬────────┘
           │        └─────┬──────┘     │
           │              │            │
     ┌─────▼──────────────▼────────────▼──────┐
     │            Redis Streams                │
     │     (event bus + job queue + cache)      │
     └─────────────────┬──────────────────────┘
                       │
              ┌────────▼────────┐
              │   PostgreSQL    │
              │  (+ read replica)│
              └─────────────────┘
```

This evolution preserves the current monolith for small deployments (Docker Compose) while enabling scale-out for hosted/SaaS deployment.

---

## Appendix: Pricing Strategy Recommendation

Based on competitive analysis, a freemium SaaS model:

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Feed (5-min delay), 3 watchlist tickers, web only, basic filters |
| **Pro** | $29/mo | Real-time feed, unlimited watchlist, push notifications (20/day), all filters, API (100 req/hr) |
| **Trader** | $79/mo | Everything in Pro + audio squawk, API (1000 req/hr), custom alert rules DSL, priority processing |
| **Enterprise** | Custom | Dedicated instance, SLA, WebSocket firehose, custom scanners, on-prem deployment option |

This undercuts Benzinga Pro ($37-177), Unusual Whales ($48), and The Fly ($45-75) while offering comparable or superior features. The self-hosted option remains free forever, maintaining open-source credibility.

---

*Analysis generated by CC (Claude Code) on 2026-03-20. Based on thorough codebase review and web-based competitor research.*
