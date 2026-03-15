# 🛰️ Event Radar

**AI-powered market intelligence — right events, right time, right context.**

Event Radar monitors real-time data sources across government filings, news, and social sentiment, then uses AI to filter noise, enrich context, and deliver only what matters — as clear, contextual intelligence on your phone.

> SEC files an 8-K at 4:05 PM. CNBC covers it at 6 PM. You had it at 4:05 with AI analysis and historical context.

---

## How It Works

```
SEC filing → 30s → AI Analysis + Historical Pattern → Your Phone 📱
```

Instead of raw data dumps, you get:

> 🔴 **NVDA — Restructuring Alert**
>
> NVIDIA filed an 8-K announcing a $2.1B restructuring charge with 12% workforce reduction.
> Historically, tech restructurings of this scale lead to +15-25% moves over 2-4 weeks.
>
> 📊 12 similar events: +8.3% avg alpha T+20, 67% win rate
>
> **Signal:** 🔴 High-Quality Setup — Similar events (META 2022, MSFT 2023) bottomed within 3 days.

---

## Features

### 📱 Alert Feed
Real-time event stream on mobile. Each alert shows severity, source, AI summary, and affected tickers. Tap for full analysis with historical pattern data.

### 🧠 AI Enrichment
GPT-4o-mini reads every event and produces:
- **Summary** — what happened in plain language
- **Impact** — why it matters for the market
- **Signal** — 🔴 High-Quality Setup / 🟡 Monitor / 🟢 Background
- **Tickers** — affected symbols + direction (bullish/bearish)

### 📊 Historical Intelligence
2,400+ past events with price outcomes. For every new alert:
- How many similar events occurred before?
- What was the average stock move?
- Best and worst case scenarios
- Win rate at T+5 and T+20

### 🎯 Smart Filtering
Three-layer filter ensures only genuine breaking events reach you:
1. **Rule Engine** — 1,100+ rules classify severity, filter social noise
2. **Pattern Filter** — catches clickbait, retrospective articles, stale news
3. **LLM Gatekeeper** — GPT-4o-mini rejects generic commentary with 95% accuracy

### 📋 Watchlist
Set your tickers. Alerts matching your watchlist get priority and custom notification levels.

### 🔔 Multi-Channel Delivery
- **Push** — Bark (iOS) for instant mobile alerts
- **Discord** — Rich embeds with full AI analysis
- **Email** — Daily digest (coming soon)

---

## Data Sources

| Source | Coverage |
|--------|----------|
| White House | Executive orders, presidential actions |
| Federal Register | DOJ, FDA, SEC, FTC, Fed, Treasury rules & notices |
| SEC EDGAR | 8-K filings, insider trades (Form 4) |
| Econ Calendar | CPI, jobs, GDP, 30+ macro releases |
| Breaking News | Reuters, AP, CNBC, MarketWatch |
| Reddit | r/wallstreetbets, r/stocks, r/options |
| StockTwits | Trending symbols, volume spikes |

More sources available with API keys: Congress trades, unusual options flow, short interest, analyst ratings, earnings.

---

## Architecture

```
┌──────────────────────────────────────────┐
│            6+ Data Sources               │
│  Gov · Regulatory · News · Social · Macro│
└─────────────────┬────────────────────────┘
                  │
         ┌────────▼────────┐
         │  Event Pipeline │
         │  Classify       │ ← 1,100+ rules
         │  Deduplicate    │ ← cross-source
         │  Filter         │ ← 3-layer smart filter
         │  LLM Enrich     │ ← GPT-4o-mini
         │  Historical     │ ← 2,400+ past events
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │    Delivery     │
         │  📱 Push (Bark) │
         │  💬 Discord     │
         │  📧 Email       │
         │  🌐 Web App     │
         └─────────────────┘
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js 22 + Fastify 5 + TypeScript (strict ESM) |
| Database | PostgreSQL 17 + Drizzle ORM |
| AI | OpenAI GPT-4o-mini (classify + enrich + gatekeeper) |
| Web App | React 19 + Vite + Tailwind (mobile-first PWA) |
| Admin Dashboard | React 19 + Vite + Recharts |
| Delivery | Discord webhooks, Bark push, Telegram, webhooks |
| Metrics | Prometheus + prom-client |
| Testing | Vitest (900+ tests) |
| Monorepo | pnpm workspaces + Turborepo |
| CI/CD | GitHub Actions |
| Deploy | Docker Compose |

---

## Quick Start

```bash
git clone https://github.com/kaikezhang/event-radar.git
cd event-radar
pnpm install

cp .env.example .env
# Edit .env: database URL, Discord webhook, OpenAI key

docker compose up -d
# Backend: http://localhost:3001
# Dashboard: http://localhost:5173 (dev)
```

---

## Project Structure

```
packages/
  backend/      Fastify API + scanners + event pipeline
  delivery/     Discord, Bark, Telegram delivery
  shared/       Types, schemas, base classes
  dashboard/    Admin dashboard (React + Vite)
  web/          User-facing app (React + Vite, mobile-first)
docs/
  USER-APP-SPEC.md    User app design spec
  OBSERVABILITY.md    Metrics & monitoring
  ARCHITECTURE.md     System architecture
  ROADMAP.md          Feature roadmap
```

---

## License

MIT
