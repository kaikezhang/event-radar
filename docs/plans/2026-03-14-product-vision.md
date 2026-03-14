# Event Radar — Product Vision v3

> Last updated: 2026-03-14 | Status: CEO reviewed ✅, Eng reviewed ✅, pending Codex deep review

## One-Liner

Real-time market event intelligence with current market context, historical quantification, and AI-powered decision support.

## Core Value Formula

```
Timely Event × Current Market Context × Historical Probability × AI Analysis = Trading Edge
```

### 1. Timely Event
Capture market-moving events (SEC filings, FDA actions, executive orders, earnings surprises) seconds after they happen, before mainstream media covers them.

### 2. Current Market Context
Understand the stock's current state when the event hits:
- **Price action**: Recent trend, % change (1d/5d/20d), oversold/overbought
- **Technicals**: RSI(14), volume vs 20d average, distance from 52w high/low, key support/resistance
- **Market regime**: Risk-on/risk-off, VIX level, sector rotation (existing module)
- *(v2)* **Recent catalysts**: Why did this stock move recently? (from our own event history)

**Technical decisions:**
- Market data provider: abstracted interface (like BaseScanner pattern). MVP: Alpha Vantage or Twelve Data (free tier). Production: Polygon.io ($29/mo). **Not yfinance** (no SLA, rate limit issues).
- `market-data-cache` service: batch-update watchlist + active tickers every 5 min. Events read from cache, not real-time fetch per event (avoids rate limit blowout on high-frequency events).
- RSI/technicals computed from cached OHLCV, not fetched per event.

### 3. Historical Probability
Quantify what happened in similar past events:
- Match by event type + severity + optional market condition filter (oversold/overbought)
- Stats: avg move, median, win rate, best/worst case at T+5 and T+20
- **Sample size guard**: n < 10 → "Insufficient data, monitoring"; n ≥ 10 → full stats; n ≥ 30 → "High confidence"
- v1 data: Own accumulated events (outcome backfill already running — confirm T+5/T+20 windows are tracked)
- v2 data: Import SEC EDGAR archives + news archives for 3-5 year cold start

**Technical decisions:**
- Event classification taxonomy: ~20 top-level types (Zod enum in `packages/shared/src/schemas/`), each with 2-3 subtypes. Examples: `earnings_beat`, `earnings_miss`, `fda_approval`, `fda_rejection`, `insider_buy_large`, `restructuring`, `executive_order_trade`, etc.
- Taxonomy must be defined BEFORE building matching engine — it's the foundation.
- Outcome backfill: verify `processOutcomes()` tracks T+1, T+5, AND T+20 price changes.

### 4. AI Analysis
Synthesize all three dimensions into an analyst note:
- Plain-language summary of event + why it matters NOW (given current context)
- Probability-weighted action recommendation (Act Now / Watch / FYI)
- Key risk factors and stop-loss suggestion
- Receives: event data + market context snapshot + historical match stats

## Target Users

### Primary: Swing Trader / Event-Driven Investor
- Holds positions days to weeks, trades around catalysts
- Needs deep analysis > speed; wants probability before entering
- Alert frequency: 5-15 high-quality alerts/day

### Secondary: Day Trader
- Needs sub-minute push notifications
- Acts first, reads analysis later
- Alert frequency: real-time stream

## Differentiation

| Product | Events | Context | Historical | AI | Price |
|---------|--------|---------|-----------|-----|-------|
| Bloomberg Terminal | ✅ | ✅ | ❌ | ❌ | $24K/yr |
| Benzinga Pro | ✅ | ❌ | ❌ | ❌ | $177/mo |
| Unusual Whales | ✅ (options) | ❌ | ❌ | ❌ | $48/mo |
| TradeAlgo | ✅ | ❌ | ❌ | ❌ | $65/mo |
| TradingView | ❌ | ✅ | ❌ | ❌ | $15-60/mo |
| **Event Radar** | **✅** | **✅** | **✅** | **✅** | **OSS + $19-29/mo** |

### Moat
1. **Data flywheel** — Every event gets outcome-tracked. More data → better patterns → better predictions → more users.
2. **Historical event-outcome database** — Compounds with time. Cannot be replicated overnight.
3. **Open source trust** — Code, prompts, classification logic all transparent and auditable.

## Example Alert

```
🔴 MRNA — FDA Accelerated Approval for RSV Vaccine

📉 Current State: -28% over 3 weeks (earnings miss + sector rotation)
   RSI 22 (severely oversold) | $85 key support | Vol 2.3x avg
   Market: risk-off, but biotech showing relative strength

💊 Event: FDA granted accelerated approval for Moderna's RSV vaccine.
   Expands TAM by ~$8B, addresses key bear thesis about pipeline depth.

📊 Historical (n=14): Oversold biotech + FDA catalyst
   → Avg rebound: +22.4% over 20 days
   → Win rate: 79% (11/14)
   → Best: VRTX +41% (2024) | Worst: BIIB -5% (2023)

🎯 Action: STRONG BUY
   Oversold + major catalyst = historically highest-conviction biotech setup.
   Stop loss: below $82 support (-3.5%)
```

## Verification Feedback Loop

Automatically follow up on past alerts with actual outcomes:

```
📊 Alert Scorecard: MRNA (14 days ago)

Alert said: STRONG BUY at $85, target +22%
Actual: MRNA at $103.40 → +21.6% ✅

Rolling 90-day accuracy:
  All alerts: 71% directional hit rate
  "Act Now" alerts: 82% hit rate, avg +14.3%
```

Uses rolling 90-day window (not 30) for stable sample sizes.

## Confidence-Gated Push

| Signal Confidence | Criteria | Delivery |
|---|---|---|
| 🔥 High | Event + oversold/overbought + historical win rate >70% + n≥15 | Push with sound + vibrate |
| 📱 Medium | Event + some historical support | Silent push |
| 📋 Low | Routine event, no special context | Feed only |

When Event Radar pings you at 2am, you KNOW it matters.

## Product Architecture

### Mobile-First PWA
- Push notification → tap → full analysis page
- Add to home screen for native-like experience
- Web Push API (iOS 16.4+, Android full support)
- **⚠️ Week 1 PoC**: Validate iOS push reliability/latency. If unacceptable → Capacitor wrapper or React Native.
- Service Worker caching: `NetworkFirst` for API data (never serve stale financial data), `CacheFirst` for UI shell + static assets. Use Workbox.
- URL structure: `/events/:shortId` (8-char hash prefix for sharing)

### Backend (Existing ✅)
- 13+ scanners: SEC EDGAR, Federal Register, White House, Reddit, StockTwits, breaking news, etc.
- Three-layer filtering: Rule Engine (1,100+ rules) → Pattern Filter → LLM Gatekeeper (GPT-4o-mini, 5s timeout, fail-open)
- LLM enrichment pipeline: classify → enrich → historical match → deliver
- PostgreSQL with Drizzle ORM, outcome backfill every 15 min
- AI Observability APIs (pulse, daily report, event trace, scanner deep dive)
- Market regime module
- Delivery: Discord webhook, Bark push, Telegram, generic webhook

### New: Market Data Service
- Provider-abstracted interface (like `BaseScanner` pattern)
- `MarketDataProvider` interface: `getQuote(ticker)`, `getIndicators(ticker)`, `getOHLCV(ticker, days)`
- Implementations: `AlphaVantageProvider`, `TwelveDataProvider`, `PolygonProvider`
- `MarketDataCache`: batch-updates active tickers every 5 min, serves from cache
- Returns: `{ price, change1d, change5d, change20d, rsi14, volumeRatio, high52w, low52w, support, resistance }`

### New: Historical Pattern Engine
- Event type taxonomy: ~20 Zod enum types in `packages/shared/`
- `PatternMatcher.findSimilar(event, options?)` → returns historical matches + stats
- Stats: `{ count, avgMove, medianMove, winRate, best, worst, examples[] }`
- Sample size gates: n < 10 suppressed, n ≥ 10 shown, n ≥ 30 high confidence badge
- Integrates with LLM enrichment prompt (historical stats injected as context)

### New: Web Push Delivery Channel
- `web-push-channel.ts` in `packages/delivery/`
- DB table: `push_subscriptions` (endpoint, p256dh key, auth key, user_id, created_at)
- Service worker handles `push` event → show notification → `notificationclick` → open event detail page
- Backend uses `web-push` npm package (VAPID keys)
- Confidence-gated: only high/medium confidence events trigger push

### New: PWA Frontend
- React + Vite + Tailwind (same stack as existing dashboard)
- Pages: Event feed, Event detail, Watchlist, Scorecard
- PWA manifest + icons + service worker (Workbox)
- Responsive: mobile-first, works on desktop
- Auth: simple email/password or magic link (lightweight, no OAuth complexity for MVP)

## Business Model

### Open Source + Hosted Service
- **Self-hosted**: Docker Compose, free forever. Bring your own API keys.
- **Hosted SaaS (Event Radar Cloud)**:
  - Pre-built historical database
  - Managed infrastructure, <30s latency
  - Premium data sources (options flow, congress trades)
  - Web Push infrastructure

### Pricing (Directional)
- **Free**: All alerts in feed, basic AI analysis. No historical stats. 1 push/day (highest confidence only, upgrade bait).
- **Pro ($19-29/mo)**: Full historical intelligence, unlimited push, watchlist, scorecard.
- **API ($99/mo)**: Programmatic access to event stream + historical database.

## Implementation Phases

### Phase A: Foundation (Week 1-2)
1. Define event type taxonomy (Zod enum, ~20 types)
2. Market data provider interface + Alpha Vantage implementation
3. Market data cache service (5-min batch update)
4. Confirm outcome backfill tracks T+1, T+5, T+20
5. PWA push PoC on iOS + Android (go/no-go for PWA approach)

### Phase B: Historical Intelligence (Week 3-4)
1. Pattern matcher: find similar events by type + severity
2. Stats computation with sample size guards
3. Modify LLM enrichment prompt: inject market context + historical stats
4. Verification feedback: auto-scorecard generation

### Phase C: PWA Frontend (Week 5-6)
1. PWA scaffold: manifest, service worker, Workbox
2. Event feed page (filterable by severity/ticker/type)
3. Event detail page (full analysis with all 4 dimensions)
4. Web Push delivery channel + subscription management

### Phase D: Polish & Soft Launch (Week 7-8)
1. Watchlist + user preferences
2. Confidence-gated push tiers
3. Scorecard page (rolling 90-day accuracy)
4. Landing page + self-host docs
5. README rewrite reflecting new vision

**Total: ~8 weeks to MVP** (backend largely exists)

## Success Metrics
- **Alert precision**: >80% of "Act Now" alerts show positive returns at T+5
- **Latency**: Event → push < 60 seconds
- **Historical accuracy**: Predicted win rate within ±10% of actual
- **User activation**: >50% add PWA to home screen
- **Retention**: >40% weekly active at day 30
- **Scorecard effect**: Users who view scorecard 3x → 2x higher retention
