# 🛰️ Event Radar

**Not more alerts. Better setups.**

Event Radar detects market-moving events from 20+ sources, adds current market context and historical pattern data, then delivers only the setups that matter — with receipts.

> SEC files an 8-K at 4:05 PM. CNBC covers it at 6 PM.
> You had it at 4:05 — with AI analysis, 14 historical analogs, and a 67% win rate.

---

## What Makes This Different

Most alert services stop at "event happened." Event Radar answers the question that actually matters:

**"Should I care about this, right now, given everything else?"**

Every alert combines four dimensions:

| Dimension | What It Tells You |
|-----------|-------------------|
| 📰 **Timely Event** | What happened, from the primary source |
| 📉 **Current Context** | RSI, volume ratio, distance from 52w high/low, market regime |
| 📊 **Historical Pattern** | How similar events played out — avg move, win rate, best/worst case |
| 🧠 **AI Analysis** | Why this matters now, what to watch for, what would invalidate the setup |

### Example Alert

```
🔴 MRNA — High-Quality Setup

📉 Current: -28% over 3 weeks | RSI 22 (severely oversold) | Vol 2.3x avg

📰 FDA granted accelerated approval for Moderna's RSV vaccine.
   Expands TAM by ~$8B, addresses key bear thesis about pipeline depth.

📊 Historical (n=14): Oversold biotech + FDA catalyst
   → Avg move: +22.4% over 20 days
   → Win rate: 79% (11/14)
   → Best: VRTX +41% (2024) | Worst: BIIB -5% (2023)

🧠 Severely oversold + major catalyst = historically highest-conviction
   biotech setup. Key risk: broader market selloff overrides sector catalyst.
```

---

## We Show Our Receipts

Event Radar tracks every alert's outcome. The built-in **Scorecard** shows rolling accuracy so you can see exactly where the system is right, where it's wrong, and which sources and event types you can trust.

```
📊 90-Day Scorecard

Signal Level         | Alerts | Hit Rate | Avg T+20
🔴 High-Quality Setup |    23  |   78%    |  +11.2%
🟡 Monitor            |    67  |   61%    |   +4.8%
🟢 Background         |   142  |   52%    |   +1.3%

Source               | Alerts | Hit Rate
SEC EDGAR            |    34  |   74%
Federal Register     |    18  |   67%
Breaking News        |    89  |   58%
```

---

## Sources

20+ scanners covering government, regulatory, news, and social sources:

| Category | Sources |
|----------|---------|
| **Government** | White House, Federal Register, Congress trades |
| **Regulatory** | SEC EDGAR (8-K, Form 4), FDA, DOJ Antitrust |
| **Market** | Trading halts, earnings, economic calendar, Fed watch |
| **News** | PR Newswire, BusinessWire, GlobeNewswire, breaking news |
| **Social** | Reddit (WSB, r/stocks), StockTwits, X, Truth Social |
| **Quantitative** | Unusual options flow, short interest, IR monitors |

Each source has independent health monitoring, automatic backoff on failures, and configurable poll intervals.

---

## Smart Filtering

Three layers ensure only genuine breaking events reach you:

1. **Rule Engine** — 1,100+ rules classify severity, filter social noise, enforce insider trade minimums ($1M+), catch stale/retrospective articles
2. **Pattern Filter** — per-ticker cooldown (by event type), engagement thresholds for social sources, calendar-aware staleness
3. **LLM Gatekeeper** — GPT-4o-mini rejects generic commentary with 5s timeout and fail-open design

Result: ~95% noise reduction. When Event Radar pings you, you know it matters.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              20+ Data Scanners                   │
│  Gov · Regulatory · News · Social · Quantitative │
└────────────────────┬────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │   Event Pipeline    │
          │                     │
          │  Classify (rules)   │
          │  Deduplicate        │
          │  Filter (3-layer)   │
          │  LLM Enrich         │  ← market context + pattern stats
          │  Historical Match   │  ← T+5 / T+20 outcomes
          │  Confidence Gate    │
          └──────────┬──────────┘
                     │
          ┌──────────▼──────────┐
          │     Delivery        │
          │                     │
          │  📱 Web Push (PWA)  │  ← confidence-gated
          │  💬 Discord         │  ← rich embeds
          │  📱 Bark (iOS)      │
          │  ✈️ Telegram        │
          │  🔗 Webhooks        │
          └──────────┬──────────┘
                     │
          ┌──────────▼──────────┐
          │    Web App (PWA)    │
          │                     │
          │  Feed · Watchlist   │
          │  Event Detail       │
          │  Scorecard          │
          │  Ticker Profile     │
          └─────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 22 · Fastify 5 · TypeScript strict ESM |
| Database | PostgreSQL 17 · Drizzle ORM · 21 tables |
| AI | OpenAI GPT-4o-mini (classify + enrich + gatekeeper) |
| Market Data | Alpha Vantage (abstracted provider interface) |
| Web App | React 19 · Vite · Tailwind · TanStack Query (mobile-first PWA) |
| Dashboard | React 19 · Vite · Recharts (admin/observability) |
| Delivery | Discord · Bark · Telegram · Web Push · Webhooks |
| Metrics | Prometheus · prom-client |
| Testing | Vitest · 155 test files · 1,300+ test cases |
| Monorepo | pnpm workspaces · Turborepo |
| CI/CD | GitHub Actions |

---

## Quick Start (Self-Hosted)

```bash
git clone https://github.com/kaikezhang/event-radar.git
cd event-radar
pnpm install

# Configure
cp .env.example .env
# Required: DATABASE_URL, OPENAI_API_KEY
# Optional: DISCORD_WEBHOOK_URL, BARK_SERVER_URL, TELEGRAM_BOT_TOKEN

# Start
docker compose up -d postgres
pnpm --filter @event-radar/backend dev

# Web app (separate terminal)
pnpm --filter @event-radar/web dev
# → http://localhost:5173

# Optional: generate VAPID keys for browser push
pnpm generate:vapid
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `OPENAI_API_KEY` | ✅ | For LLM classification + enrichment |
| `ALPHA_VANTAGE_API_KEY` | Recommended | Per-ticker market context |
| `DISCORD_WEBHOOK_URL` | Optional | Discord alert delivery |
| `BARK_SERVER_URL` + `BARK_KEY` | Optional | iOS push via Bark |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Optional | Telegram delivery |
| `WEB_PUSH_VAPID_SUBJECT` + `WEB_PUSH_VAPID_PUBLIC_KEY` + `WEB_PUSH_VAPID_PRIVATE_KEY` | Optional | Browser push delivery |
| `VITE_WEB_PUSH_PUBLIC_KEY` | Optional | Public browser push key for the web app |
| `API_KEY` | Auto-generated | API authentication key |

---

## Project Structure

```
packages/
  backend/      Fastify API · 20+ scanners · event pipeline · observability
  delivery/     Discord · Bark · Telegram · Web Push · confidence-gated routing
  shared/       Types · schemas · base classes · scanner utilities
  web/          User-facing PWA (Feed · Watchlist · Scorecard · Event Detail)
  dashboard/    Admin dashboard (pipeline audit · scanner health · AI observability)
  e2e/          End-to-end tests
docs/
  plans/        Product vision · implementation plans
  reviews/      Architecture & plan reviews
  ARCHITECTURE.md
```

---

## Observability

Built-in AI observability APIs for monitoring system health:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/ai/pulse` | Real-time system health score, anomalies, pipeline funnel |
| `GET /api/v1/ai/daily-report` | Daily intelligence report with signal validation |
| `GET /api/v1/ai/trace/:eventId` | Single event pipeline trace |
| `GET /api/v1/ai/scanner/:name` | Scanner deep dive analytics |
| `GET /api/v1/scorecards/summary` | Rolling accuracy scorecard |

---

## Roadmap

- [x] **Phase 0–2**: Core pipeline, 20+ scanners, AI enrichment, historical patterns, outcome tracking
- [x] **Phase 3 (in progress)**: Product language, scanner hardening, auth system, watchlist-first UX
- [ ] **Phase 4**: External historical data import, story grouping, premium sources
- [ ] **Phase 5**: Cloud hosted service, landing page, onboarding flow

---

## Contributing

Event Radar is open source. PRs welcome.

```bash
# Run tests
pnpm test

# Lint
pnpm lint

# Build all packages
pnpm build
```

---

## License

MIT
