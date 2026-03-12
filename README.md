# 🛰️ Event Radar

**AI-powered stock market intelligence for everyday investors.**

Event Radar monitors 15+ real-time data sources — SEC filings, congressional trades, Fed decisions, breaking news, social sentiment — and distills them into clear, actionable alerts that anyone can understand. No Bloomberg terminal needed.

> When Block filed its 8-K restructuring at 4:05 PM, CNBC didn't report it until 6 PM. By then, the stock had moved 23%. Event Radar catches these in seconds.

---

## What It Does

Most market-moving information follows a predictable chain: **official filing → financial media → social media → you**. Each hop adds hours. Event Radar removes the middlemen.

```
Traditional:  SEC filing → (2hr) → CNBC → (1hr) → Twitter → (next day) → You
Event Radar:  SEC filing → (30s) → AI analysis → Your phone 📱
```

But raw speed isn't enough. A flood of alerts is just noise. Event Radar's AI layer reads each event like an experienced swing trader would — weighing severity, historical patterns, sector impact, and your watchlist — then delivers a **clear verdict in plain language**.

### What You Receive

Instead of "8-K Filed: Item 2.05 — Costs Associated with Exit or Disposal Activities", you get:

> 🔴 **NVDA — Restructuring Alert**
>
> NVIDIA filed an 8-K announcing a $2.1B restructuring charge with 12% workforce reduction. Historically, tech restructurings of this scale lead to +15-25% moves over 2-4 weeks as the market prices in efficiency gains.
>
> **Suggested action:** Watch for entry on any initial dip. Similar events (META 2022, MSFT 2023) bottomed within 3 days.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    15+ Data Sources                     │
│  SEC · Congress · Fed · FDA · DOJ · White House · WARN  │
│  Breaking News · Reddit · StockTwits · Earnings · ...   │
└──────────────────────┬──────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │  Event Pipeline │
              │                 │
              │  Classify       │  ← 1100+ rules + AI
              │  Deduplicate    │  ← cross-source correlation
              │  Score & Filter │  ← severity + watchlist match
              │  Enrich         │  ← historical context + LLM
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │    Delivery     │
              │                 │
              │  🔴 CRITICAL    │ → Push + Discord (instant)
              │  🟠 HIGH        │ → Push + Discord (instant)
              │  🟡 MEDIUM      │ → Discord digest (hourly)
              │  ⚪ LOW         │ → Logged for backtesting
              └─────────────────┘
```

---

## Current Status

### ✅ Working Now

- **17 scanners** across 6 source tiers (regulatory, political, corporate, social, macro, smart money)
- **Unified event pipeline** — classify → deduplicate → store → filter → deliver
- **Rule engine** with 1100+ classification rules (SEC 8-K items, political posts, macro events)
- **Smart alert filter** — watchlist-aware, ticker cooldown, social engagement thresholds
- **Multi-strategy deduplication** — exact ID, ticker+window, content similarity, DB lookup
- **Delivery channels** — Discord webhooks, Bark push (iPhone), Telegram, generic webhooks
- **PostgreSQL storage** with full event history
- **Scanner auto-backoff** — exponential backoff on consecutive failures
- **Prometheus metrics** for observability
- **779 tests passing**, CI green

### 🚧 In Progress

- **LLM enrichment layer** — Claude-powered event analysis with plain-language summaries and trade suggestions (rule-based filter working, LLM layer ready but needs API key)
- **Historical backtesting** — validate event signals against price outcomes

### 📋 Planned

- **Morning briefing** — daily pre-market summary of overnight events
- **Prediction tracking** — record AI predictions, auto-review accuracy
- **Portfolio mode** — monitor your actual holdings, not just a watchlist
- **Mobile app** — dedicated push notification experience
- **Multi-signal correlation** — combine events from different sources for higher conviction signals

---

## Scanners

| Source | Type | What It Monitors |
|--------|------|-----------------|
| SEC EDGAR | 🏛️ Regulatory | 8-K filings, insider trades (Form 4) |
| Congress | 🏛️ Regulatory | Politician stock trades (STOCK Act) |
| White House | 🏛️ Regulatory | Executive orders, presidential memoranda |
| FDA | 🏛️ Regulatory | Drug approvals, PDUFA dates, warning letters |
| DOJ | 🏛️ Regulatory | Antitrust actions, merger decisions |
| WARN Act | 🏛️ Regulatory | Mass layoff notices (50+ employees) |
| Fed Watch | 📊 Macro | Rate decision probabilities, FOMC |
| Econ Calendar | 📊 Macro | CPI, jobs, GDP, and 30+ economic releases |
| Breaking News | 📰 Media | Reuters, AP, CNBC, MarketWatch, Yahoo Finance |
| Earnings | 💰 Corporate | Earnings dates, surprises, guidance |
| Analyst | 💰 Corporate | Upgrades, downgrades, price target changes |
| Reddit | 💬 Social | r/wallstreetbets, r/stocks, r/options |
| StockTwits | 💬 Social | Trending symbols, message volume spikes |
| Unusual Options | 🐋 Smart Money | Unusual options activity, large block trades |
| Short Interest | 🐋 Smart Money | Short interest changes, squeeze candidates |
| Truth Social | 🏛️ Political | Presidential posts (market-moving) |
| X (Twitter) | 💬 Social | Financial influencer posts |

---

## Tech Stack

- **Runtime:** Node.js 22 + TypeScript (strict, ESM)
- **Backend:** Fastify 5
- **Database:** PostgreSQL + Drizzle ORM
- **AI:** Anthropic Claude (event analysis + enrichment)
- **Delivery:** Discord webhooks, Bark push, Telegram, generic webhooks
- **Scraping:** Playwright + Crawlee (for JS-rendered sources)
- **Metrics:** Prometheus + prom-client
- **Testing:** Vitest (779 tests)
- **Monorepo:** pnpm workspaces + Turborepo
- **CI:** GitHub Actions (lint → build → test)
- **Deployment:** Docker Compose

---

## Project Structure

```
packages/
  backend/     Fastify API + 17 scanners + event pipeline
  delivery/    Discord, Bark, Telegram, webhook delivery
  shared/      Types, schemas, base classes
services/
  sec-scanner/ Python SEC EDGAR scanner (edgartools)
```

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/kaikezhang/event-radar.git
cd event-radar
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your database URL, Discord webhook, etc.

# Start with Docker (recommended)
docker compose up -d

# Or run locally
pnpm --filter @event-radar/backend dev
```

---

## Vision: Where We're Going

Event Radar started as a real-time event detection system. It's evolving into an **AI-powered investment intelligence platform** — think of it as having a tireless analyst who monitors everything, understands context, and explains what matters in plain language.

The key insight: **most retail investors don't need faster data — they need better interpretation.** A raw SEC filing is useless if you don't know what Item 2.05 means or how similar events played out historically.

Our north star:

1. **Collect** — Monitor every public data source that moves markets
2. **Understand** — AI reads each event with the context of an experienced trader
3. **Predict** — Historical pattern matching + outcome tracking builds a track record
4. **Advise** — Deliver clear, actionable suggestions — not data dumps
5. **Learn** — Track predictions, run post-mortems, improve over time

For the everyday investor who wants professional-grade market intelligence without the professional-grade complexity.

---

## License

MIT
