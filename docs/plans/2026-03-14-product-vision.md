# Event Radar — Product Vision v4

> Last updated: 2026-03-14 | Status: CEO reviewed ✅, Eng reviewed ✅, Codex reviewed ✅
>
> **Note from review:** The original 8-week timeline is overly optimistic. See "Revised Implementation Plan" below for a more realistic scope.

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

---

# Revised Implementation Plan (v4)

*Based on Codex deep review findings*

## Key Technical Debt to Address First

| Debt | Severity | Fix |
|------|----------|-----|
| Event taxonomy inconsistent | 🔴 Critical | Unify `eventType` across scanners, LLM outputs, historical matching |
| T+5/T+20 not tracked | 🔴 Critical | Fix outcome tracker to actually track T+5 and T+20 windows |
| Per-ticker market context missing | 🔴 Critical | Build new subsystem (not just adapter) |
| User model incomplete | 🔴 Critical | Add user_id to watchlist, create push_subscription table |
| Scanner latency varies wildly | 🟠 Major | Some sources 30min, some 15s — document and manage expectations |
| LLM outputs in Chinese | 🟠 Major | Fix enrichment prompt to output English for US traders |

## Revised MVP Scope

**Target: Swing Trader / Event-Driven Investor Only**
- No day-trader latency promise
- No sub-minute push requirement
- Focus on context, analogs, and follow-up

### MVP Definition (10-12 weeks)

**Phase 0: Cleanup (Week 1-2)**
1. Fix event taxonomy: unify event type naming across scanners, LLM outputs, and schema
2. Fix outcome tracker: add real T+5 and T+20 window tracking
3. Fix LLM enrichment: output English, not Chinese
4. Document scanner latency: know which sources are fast vs slow

**Phase 1: Core Infrastructure (Week 3-5)**
1. Market data provider interface + Alpha Vantage implementation
2. Market data cache: batch-update active tickers every 5 min
3. User model: add user_id to watchlist, create push_subscriptions table
4. Reuse `packages/web` (not new frontend): add service worker + PWA manifest

**Phase 2: Historical Intelligence (Week 6-8)**
1. Pattern matcher: find similar events by type + severity
2. Stats computation with sample size guards
3. Inject market context + historical stats into LLM prompt
4. Verification scorecard: auto-generate accuracy report for past alerts

**Phase 3: Polish & Launch (Week 9-10)**
1. Web Push delivery channel (if PoC passes)
2. Confidence-gated push tiers
3. Scorecard page
4. Landing page + README update

**Phase 4 (Post-MVP):**
- External historical data import for cold start
- Story grouping / multi-source confirmation
- Premium data sources (options flow, congress trades)

## What's NOT in MVP

- Day-trader latency (sub-minute)
- Real-time price on every event (use cache, not real-time fetch)
- New frontend framework (reuse packages/web)
- Full auth system (email/password or magic link)
- Bloomberg-competitive source coverage

## Product Language Updates

| Before | After |
|--------|-------|
| "STRONG BUY" | "High-Quality Setup" |
| "BUY / SELL" | "Watch for Confirmation" |
| "Bearish / Bullish" | "Catalyst favors downside / upside" |
| Advice language | Intelligence language |

---

# Deep Review: Event Radar Product Vision v3

Reviewed:
- `docs/plans/2026-03-14-product-vision.md`
- `AGENTS.md`
- `CLAUDE.md`
- `.claude/skills/er-review/SKILL.md`
- `.claude/skills/er-eng-review/SKILL.md`
- Existing backend/shared/web code, especially `packages/backend/src/pipeline/`, `packages/backend/src/scanners/`, `packages/shared/src/`, and the current web app in `packages/web/`

## Bottom Line

This is the strongest product framing I have seen for Event Radar so far. The core equation is right:

`Timely Event × Current Market Context × Historical Probability × AI Analysis`

That is a real product, not a feature list.

But the document is too optimistic about how close the current codebase is to that product. The repo already has a lot more than the vision gives it credit for on ingestion, routing, enrichment, analytics, and web UI. At the same time, the hardest parts of the promised experience are still missing or only partially real:

- per-ticker market context is mostly not built
- the event taxonomy is not stable enough to anchor historical matching
- the user model for PWA push/watchlists is not there
- source latency and reliability do not support the day-trader promise
- some of the most important catalyst sources are explicitly excluded from the current historical matcher

My blunt view: this can be an excellent 8-week private beta for swing traders if you narrow scope hard. It is not an honest 8-week path to the full vision as written.

## CEO Lens

### Verdict

`BUILD THE CORE, RETHINK THE WEDGE`

The product direction is good. The product packaging is not sharp enough yet.

### What Is Compelling

1. The vision has a real trader job-to-be-done.
   It is not just "aggregate events faster." It is "help me decide whether this event matters right now, in this market, for this ticker, with evidence."

2. The scorecard / accountability loop is potentially the trust engine.
   The best part of the doc is the idea that Event Radar comes back later and says whether it was right. That is how you stop being "another AI feed" and become a system traders actually trust.

3. Confidence-gated push is exactly the right instinct.
   A serious product wins by deciding when not to ping. "When Event Radar pings you at 2am, you KNOW it matters" is strong positioning.

4. The 4-part composition is better than most trading tools.
   Most products stop at event capture or charts. Event Radar can plausibly combine event provenance, market regime, analog history, and analyst narrative.

### What Is Missing Or Weak

1. The wedge is still split between two different users.
   The vision says primary user is the swing trader, but the product language still chases day-trader latency and sub-minute push. Those are different products.
   A swing-trader product can win on context, analogs, and confidence.
   A day-trader product wins on feed latency, exchange-grade reliability, and first-party source speed.
   The current codebase is much closer to the first one.

2. The "10-star moment" is not defined tightly enough.
   The example alert is good, but the product still reads like a dashboard plus alerts, not a signature workflow.
   The real magic moment should be:
   "I got a push, I opened it, and in 5 seconds I understood what happened, why it matters now, what past analogs did, and what would invalidate the setup."

3. "STRONG BUY" and stop-loss suggestions are the wrong product posture for this stage.
   That language makes the product sound more confident than the current data and infrastructure deserve.
   It also drifts toward advice rather than intelligence.
   A stronger version is:
   - `Act Now`
   - `High-Quality Setup`
   - `Watch For Confirmation`
   - `Low Signal / FYI`
   Then explain the setup, not the trade.

4. The moat is described too generously.
   "Open source trust" is not a moat. It is a distribution and credibility lever.
   The actual moat, if this works, is:
   - labeled event-outcome history
   - source-specific accuracy reputation
   - accumulated feedback loops
   - tuning of what gets through at 2am
   Competitors can copy open code and public RSS ingestion. They cannot instantly copy a well-calibrated event-quality engine plus a trusted scorecard.

5. The pricing/competitive table is not persuasive enough for serious traders.
   Comparing yourself to Bloomberg on price is not how you win.
   A trader does not care that you are cheap if they suspect you are noisy or late.
   Better positioning:
   - "Bloomberg for independent event-driven traders"
   - "Not more alerts. Better setups."
   - "Transparent signal accountability."

6. The user-experience blind spots are still material.
   The doc does not say enough about:
   - watchlist-first onboarding
   - quiet hours / notification budget controls
   - premarket vs postmarket semantics
   - source freshness/provenance display
   - why these analogs were chosen
   - how users override or disagree with the system

### What Would Make This A 10-Star Product

1. Pick swing traders as the first and only wedge.
   That aligns with what the codebase can actually support: context, analogs, follow-up, scorecards.

2. Make the product watchlist-first, not firehose-first.
   The first premium experience should not be "everything happening."
   It should be "the few things that matter for my names."

3. Make provenance a first-class UX object.
   Every alert should show:
   - source
   - source freshness
   - whether it is primary or derivative
   - why it passed filters
   - why these historical matches qualify

4. Turn scorecards into the brand.
   Not just "accuracy page."
   Show:
   - source hit rates
   - event family hit rates
   - confidence calibration
   - how often "Act Now" really worked

5. Replace generic AI voice with trader-operational voice.
   The winning voice is not "AI says strong buy."
   It is:
   - what changed
   - what matters
   - what historically followed
   - what would negate the thesis

## Engineering Lens

### What Already Exists And Can Be Reused

There is more reusable infrastructure here than the vision acknowledges.

1. The core event pipeline already exists end-to-end.
   `packages/backend/src/app.ts:450-866` wires rule classification, dedup, DB storage, alert filtering, LLM judge, LLM enrichment, historical enrichment, regime lookup, and delivery.
   Important nuance: the live delivery path still takes severity from the rule engine. The LLM classifier is present, but it is not the primary decision-maker for delivery severity today. See `packages/backend/src/app.ts:454-456`, `packages/backend/src/app.ts:493-500`, and `packages/backend/src/app.ts:815-822`.

2. The delivery layer already supports the vision's richer alert payloads.
   `packages/delivery/src/discord-webhook.ts:131-197` renders historical context and market regime.
   `packages/delivery/src/bark-pusher.ts:77-92` already adds regime and historical summary lines.
   `packages/delivery/src/telegram.ts:86-128` also includes AI, historical context, and regime.
   This is not a blank-slate alert stack.

3. Historical matching already exists in two forms.
   - Recent event similarity: `packages/backend/src/routes/events.ts:328-364` and `packages/backend/src/services/event-similarity.ts:129-205`
   - Historical warehouse similarity: `packages/backend/src/routes/historical.ts:227-242` and `packages/backend/src/services/similarity.ts:27-112`
   The product should build on this instead of pretending historical intelligence starts in Phase B from zero.

4. Outcome tracking and accuracy plumbing already exist.
   `packages/backend/src/services/outcome-tracker.ts:16-22` tracks post-event windows.
   `packages/backend/src/app.ts:1040-1065` already starts the periodic outcome processing loop.
   `packages/backend/src/routes/accuracy.ts:42-125` exposes accuracy APIs.
   `packages/backend/src/routes/win-rate.ts:30-107` exposes win-rate analytics.

5. Audit/observability infrastructure already exists.
   `packages/backend/src/pipeline/audit-log.ts:35-58` writes pipeline decisions to DB.
   `packages/backend/src/db/schema.ts:22-52` defines `pipeline_audit`.
   `packages/backend/src/routes/dashboard.ts` and `packages/backend/src/routes/ai-observability.ts` already expose review surfaces.

6. The current web app already has much of the navigation shell.
   `packages/web/src/App.tsx:50-61` already routes `Feed`, `EventDetail`, `Watchlist`, `Search`, `Settings`, and `TickerProfile`.
   This matters because the vision's "new PWA frontend" is not really greenfield page design work. It is extension/refinement work on `packages/web`.

7. Scanner lifecycle basics are good.
   `packages/shared/src/base-scanner.ts:43-50` gives bounded exponential backoff.
   `packages/shared/src/base-scanner.ts:124-143` gives health reporting.
   `packages/backend/src/scanners/scraping/scrape-utils.ts:65-143` gives bounded seen-ID dedup with restart persistence.

### The Biggest Underestimated Risks

#### 1. The Taxonomy Problem Is Bigger Than The Vision Admits

The doc says "define taxonomy first" as if that is a small foundation task. In this repo it is a cross-cutting refactor.

Why:

- `packages/shared/src/schemas/llm-classification.ts:10-19` defines `eventType` as a free-form string.
- `packages/shared/src/schemas/llm-types.ts:4-12` separately defines a 7-value enum for `LLMEventType`.
- Scanner-emitted `event.type` values are already all over the place, for example:
  - `8-K` / `form-4` in `packages/backend/src/scanners/sec-edgar-scanner.ts`
  - `halt` / `resume` in `packages/backend/src/scanners/halt-scanner.ts`
  - `social-volume` in `packages/backend/src/scanners/stocktwits-scanner.ts:234-249`
  - `economic-release` in `packages/backend/src/scanners/econ-calendar-scanner.ts:179`
- `packages/backend/src/pipeline/event-type-mapper.ts:20-49` only recognizes a narrow set of historical types.

The most important red flag:

- `packages/backend/src/pipeline/event-type-mapper.ts:51-60` explicitly skips `fda`, `congress`, `doj-antitrust`, and `whitehouse`.

That means several flagship product catalysts in the vision are not even eligible for the current historical matching path.

This is not "Phase A task 1."
This is "make event semantics coherent across scanners, LLM outputs, historical matching, analytics, and UI."

There is also already duplicate grouping logic in the codebase:

- in-memory duplicate story tracking in `packages/backend/src/pipeline/story-tracker.ts:16-91`
- DB-backed story groups in `packages/backend/src/services/story-group.ts:40-186`

The live pipeline appears to rely on the former, not the latter. That means the roadmap is not starting from a clean semantic baseline.

#### 2. Per-Ticker Market Context Is Mostly Net New

The vision talks about price action, RSI, volume ratio, 52-week distance, support/resistance, and cached provider-backed quote data.

What exists today is much thinner:

- `packages/backend/src/services/market-context-cache.ts:20-27` only models a global market snapshot
- `packages/backend/src/services/market-context-cache.ts:147-174` fetches `SPY` and `^VIX`
- `packages/backend/src/services/market-regime.ts` computes market regime, not ticker context

So yes, a "market context module" exists, but it is global regime context, not per-ticker state.

The proposed `MarketDataProvider` and `MarketDataCache` are not minor additions. They are a new subsystem:

- provider abstraction
- batching
- storage/caching strategy
- indicator calculation
- failure/rate-limit behavior
- API exposure to UI and pipeline

Also, the free-tier provider plan is weak. A 5-minute refresh loop across watchlists + active tickers will hit free-tier limits quickly. This should be designed around production economics immediately, not treated as an implementation detail.

#### 3. The Historical Windows Do Not Match The Product Promise

The vision centers T+5 and T+20.
The live outcome tracker does not track those windows.

Current tracker:

- `packages/backend/src/services/outcome-tracker.ts:16-22`
  - `1h`
  - `1d`
  - `1w`
  - `1m`

Worse, the enrichment layer partially remaps these into the product language:

- `packages/backend/src/pipeline/historical-enricher.ts:260-267`
  assigns `avgAlphaT5` from `avgChange1d`
  and `avgAlphaT20` from `avgChange1w`

That is a semantic footgun.
If the product says T+5/T+20, the data model must actually track T+5/T+20.

There is a second issue here:

- `packages/backend/src/pipeline/historical-enricher.ts:262-265`

The output fields `avgAlphaT5/avgAlphaT20` are sometimes populated from raw `change1d/change1w`, so the names can overstate what the numbers really mean.

#### 4. The Frontend/PWA/Auth Story Is More Broken Than The Vision Suggests

The vision says:
- "PWA frontend"
- "email/password or magic link"
- "web push"
- "watchlist + preferences"

Current reality:

- There is no `packages/frontend`; the repo has `packages/web` and `packages/dashboard`, both Vite apps.
  - `packages/web/package.json:6-12`
  - `packages/dashboard/package.json:6-12`
- There is no service worker / manifest / push implementation in the current app. A repo search shows no real PWA substrate in `packages/web`.
- `packages/web/src/lib/api.ts:11` hardcodes `API_KEY = 'er-dev-2026'`
- `packages/backend/src/db/schema.ts:376-387` defines a global `watchlist` table with no `user_id`
- I do not see a `push_subscriptions` table or any web-push delivery channel in the codebase

That means the user/account model for the vision barely exists.
It also means the current watchlist is application-wide, not user-specific.

This is the sharpest product-vs-code contradiction in the document:

the current web app is a single-tenant/dev-style companion app, not the base of a multi-user cloud PWA business.

#### 5. Latency Claims Are Source-By-Source Unrealistic

The doc repeatedly leans on "seconds after they happen" and "event to push <60 seconds."
That is not true across the current scanner fleet.

Examples:

- `packages/backend/src/scanners/congress-scanner.ts:12` polls every 30 minutes
- `packages/backend/src/scanners/whitehouse-scanner.ts:13` polls every 15 minutes
- `packages/backend/src/scanners/fda-scanner.ts:14` polls every 5 minutes
- `packages/backend/src/scanners/newswire-scanner.ts:14` polls every 2 minutes
- `packages/backend/src/scanners/reddit-scanner.ts:13` polls every 60 seconds
- `packages/backend/src/scanners/truth-social-scanner.ts:21` polls every 15 seconds
- `packages/backend/src/scanners/x-scanner.ts:19` polls every 30 seconds

And there is another hidden latency issue:

- `packages/shared/src/base-scanner.ts:52-55`
- `packages/shared/src/base-scanner.ts:105-108`

`start()` does not do an immediate first poll. It waits one full `pollIntervalMs` before the first scan.

So after a restart, the system can be blind for:
- 30 minutes on Congress
- 15 minutes on White House
- 5 minutes on FDA

This is not a theoretical nit. It matters if the vision is positioning around speed.

There is also a product-critical date bug waiting to happen:

- `packages/backend/src/pipeline/llm-gatekeeper.ts:16-26`

NYSE holidays are hard-coded for 2026.

#### 6. Reliability Hardening Is Still Light In The Scanner Layer

Most scanners use plain `fetch` with headers and happy-path parsing.
I do not see a consistent explicit timeout or 429/backoff strategy per request.

Examples:

- `packages/backend/src/scanners/reddit-scanner.ts:116-123`
- `packages/backend/src/scanners/stocktwits-scanner.ts:136-139`
- `packages/backend/src/scanners/congress-scanner.ts:94-102`
- `packages/backend/src/scanners/newswire-scanner.ts:108-115`
- `packages/backend/src/scanners/fda-scanner.ts:132-137`

`BaseScanner` does back off after repeated failures, which is good, but if a `fetch()` hangs, that is a different failure mode than "HTTP 429" or "slow dependency." The scanner layer still needs more production-grade request wrappers.

The browser-scraped sources are especially brittle:

- `packages/backend/src/scanners/x-scanner.ts:216-224`
- `packages/backend/src/scanners/truth-social-scanner.ts:154-162`

And the "browser pool" is not really a long-lived pool:

- `packages/backend/src/scanners/scraping/browser-pool.ts:24-63`

Every `scrape()` creates a new `PlaywrightCrawler`. That is fine for a utility, but it is not a high-confidence low-latency scraping backbone.

Another reliability nuance: several multi-feed scanners swallow per-feed failures and still return `ok(events)`, so scanner health can remain "healthy" while part of the source surface is degraded. You can see that pattern in `packages/backend/src/scanners/newswire-scanner.ts:108-181` and `packages/backend/src/scanners/breaking-news-scanner.ts:197-229`.

#### 7. Backpressure Is Not Real Yet

The event bus contract looks async, but it does not give actual queueing or acknowledgement.

- `packages/shared/src/in-memory-event-bus.ts:15-17` just calls `EventEmitter.emit`
- `packages/shared/src/in-memory-event-bus.ts:20-23` subscribes handlers directly
- `packages/shared/src/schemas/event-bus.ts:3-10` suggests async publish semantics

This is an inference from the implementation plus Node `EventEmitter` semantics:

the pipeline can fan out many async handler executions without backpressure.

That matters because the pipeline body in `packages/backend/src/app.ts:450-866` does real work:

- DB inserts
- LLM judge
- LLM enrichment
- historical enrichment
- delivery

So the statement "Redis Streams later" is fine architecturally, but the current product vision should not assume robust burst behavior.

#### 8. Dedup And Source Identity Need Cleanup Before You Build A Stronger Product On Top

One subtle but important issue:

- `packages/backend/src/db/event-store.ts:16-27` stores `sourceEventId: event.id`
- but some scanners generate a new random event UUID and put the native upstream ID in metadata instead
- for example `packages/backend/src/scanners/newswire-scanner.ts:154-169` uses `id: randomUUID()` and stores the upstream `dedupKey` in `metadata.sourceEventId`

That weakens restart-safe dedup and source traceability. You are not consistently persisting the upstream source identity into the canonical event row.

This matters to the product because provenance and de-dup confidence are part of the user trust model.

There is a second dedup/product gap:

- duplicate events return before storage in `packages/backend/src/app.ts:469-477`
- but the schema already has `mergedFrom`, `sourceUrls`, `confirmedSources`, and `confirmationCount` in `packages/backend/src/db/schema.ts:69-76`
- `packages/backend/src/db/event-store.ts:16-27` does not populate those fields

So the multi-source confirmation story is directionally planned in schema, but not actually wired into the live path.

#### 9. The Current Filtering Logic Can Suppress Exactly The Multi-Catalyst Cases Traders Care About

`packages/backend/src/pipeline/alert-filter.ts:361-377` applies a global per-ticker cooldown.

That means:
- one alert on `NVDA`
- then another unrelated but important `NVDA` catalyst shortly after
- second event can be suppressed simply because the ticker is hot

This is a reasonable anti-noise heuristic for a feed.
It is dangerous if the product wants to become a high-conviction event terminal.

At minimum, cooldown should become source-aware or event-family-aware before the product markets itself as decision support.

#### 10. The LLM Stack Is Fragmented

The classification path is provider-abstracted:

- `packages/backend/src/pipeline/llm-classifier.ts:17-27`

The enrichment path is not:

- `packages/backend/src/pipeline/llm-enricher.ts:1`
- `packages/backend/src/pipeline/llm-enricher.ts:17-24`

It directly uses OpenAI and currently asks for Chinese summaries and Chinese action labels:

- `"summary": "1-2 sentence Chinese summary"`
- `"impact": "1-2 sentences ... (Chinese)"`
- actions like `🔴 立即关注`

That is a real contradiction with the English product vision and US trader positioning.
It also means the AI system is not internally coherent yet.

#### 11. There Are Source-Naming Inconsistencies That Leak Into Product Behavior

The X scanner emits source `x`:

- `packages/backend/src/scanners/x-scanner.ts:251-269`

But several downstream mappings expect `x-scanner`:

- `packages/backend/src/pipeline/llm-gatekeeper.ts:88-90`
- `packages/backend/src/app.ts:116-123`
- `packages/web/src/lib/api.ts:227-246`
- `packages/delivery/src/discord-webhook.ts:42-48`

This is not cosmetic. It affects:
- source reliability tiering
- frontend labels
- delivery formatting
- potentially filter behavior

A product that wants traders to trust provenance cannot afford this class of semantic drift.

### Phase-By-Phase Feasibility

#### Phase A: Foundation

1. Define event taxonomy
   Feasibility: medium-hard, not easy
   Why: shared schema drift, scanner event diversity, historical mapper gaps, LLM output mismatch

2. Market data provider interface + implementation
   Feasibility: hard
   Why: mostly net new subsystem, not just an adapter

3. Market data cache service
   Feasibility: hard
   Why: batching, persistence, rate limits, per-ticker refresh logic, API wiring

4. Confirm outcome backfill
   Feasibility: easy, but with caveat
   Why: the loop already runs in `packages/backend/src/app.ts:1040-1065`
   Caveat: tracked windows do not match the product windows

5. PWA push PoC
   Feasibility: medium-hard
   Why: no service worker, no web-push channel, no subscription table, no real auth/user model

My assessment:
Phase A is not a 1-2 week "foundation sprint" unless you cut scope aggressively.

#### Phase B: Historical Intelligence

1. Pattern matcher
   Feasibility: medium
   Why: there is reusable infrastructure already in `historical-enricher.ts`, `similarity.ts`, and `routes/historical.ts`

2. Stats computation
   Feasibility: medium
   Why: much of it already exists, but sample semantics need cleanup

3. Inject context + historical stats into LLM prompt
   Feasibility: easy once taxonomy/context are fixed

4. Verification feedback / scorecard generation
   Feasibility: medium
   Why: data exists, user-facing productization does not

My assessment:
Phase B is the most reusable part of the roadmap, but only after Phase A is cleaned up.

#### Phase C: PWA Frontend

1. Feed page
   Feasibility: already exists in rough form
   - `packages/web/src/pages/Feed.tsx`

2. Event detail page
   Feasibility: already exists in rough form
   - `packages/web/src/pages/EventDetail.tsx`
   But the data layer is still thin or placeholder in places:
   - `packages/web/src/lib/api.ts:64-103`

3. Watchlist page
   Feasibility: already exists
   - `packages/web/src/pages/Watchlist.tsx`
   But it is not user-scoped because the backend watchlist is global.

4. Web push delivery channel
   Feasibility: net new

My assessment:
If you reuse `packages/web`, this phase is refinement + PWA + auth + push.
If you try to create a new frontend as the doc implies, the timeline breaks immediately.

#### Phase D: Polish & Soft Launch

1. Watchlist + prefs
   Feasibility: medium
   Why: watchlist exists, but user scoping and preferences do not

2. Confidence-gated push
   Feasibility: medium
   Why: routing is severity-based today
   - `packages/delivery/src/alert-router.ts:14-25`

3. Scorecard page
   Feasibility: medium-easy
   Why: backend accuracy APIs already exist

4. Landing page / docs
   Feasibility: easy

My assessment:
Phase D is realistic only if the earlier phases do not overrun. Right now they likely will.

## Cross-Cutting Contradictions

### 1. Product Ambition vs Current Technical Reality

The vision wants:
- a trusted event terminal
- a probabilistic historical engine
- a mobile PWA product
- a SaaS user system
- confidence-calibrated push

The codebase today is strongest on:
- ingestion
- filtering
- enrichment plumbing
- historical APIs
- delivery formatting

It is weakest on:
- user/account model
- per-ticker market context
- taxonomy coherence
- scanner reliability hardening
- PWA/push/auth substrate

That is not fatal.
But the vision should describe the repo honestly: "strong event/pipeline foundation, incomplete product shell," not "backend largely exists" in a blanket sense.

### 2. Swing-Trader Product vs Day-Trader Promise

The current system can plausibly become very useful for swing traders.
It does not yet justify a day-trader promise for two reasons:

- many sources are not sub-minute
- some critical sources are heuristic or browser-scraped
- the live delivery path is still rule-engine-led rather than driven by a calibrated learned model

If you keep both audiences in the same MVP, you will overbuild and underdeliver.

### 3. Historical Intelligence vs Event-Type Reality

The product's key differentiator is historical probability.
That only works if event types are stable and meaningful.

Today they are not stable enough.

This is the single most important engineering truth the vision needs to internalize.

### 4. "Open Source Trust" vs Actual Trust

Open source code can help trust.
It does not create trader trust on its own.
Trader trust comes from:
- being early enough
- not being noisy
- being right often enough
- being honest when uncertain
- showing receipts afterward

The scorecard loop is the trust engine. The code transparency is secondary.

Also, some audit/observability routes are currently configured as public routes in `packages/backend/src/app.ts:349-361`. That is fine for internal tooling, but it is a reminder that internal review surfaces and external product surfaces are not yet cleanly separated.

## Is The 8-Week Timeline Realistic?

### Short Answer

For the full doc as written: no.

For a narrowed beta: yes, maybe.

### My Real Estimate

#### 8 weeks is plausible only for this narrower MVP

- target only swing traders / event-driven investors
- keep `packages/web` as the PWA base
- do not introduce a new frontend architecture
- no "STRONG BUY" language
- watchlist-first, not universal firehose-first
- support only one serious market data provider
- make FDA / White House / Congress / SEC taxonomy consistent enough for analog matching
- ship push only if the PoC passes immediately
- use scorecards and provenance as the premium story

#### The full written vision is more like 12-16 weeks

Why:

- taxonomy refactor
- per-ticker market data subsystem
- user/auth/preferences model
- web push infra
- source reliability hardening
- story grouping / confirmation wiring
- frontend data-model cleanup
- historical window correction
- product calibration/testing

## Concrete Recommendation

1. Rewrite the roadmap around one wedge: swing traders.

2. Treat `packages/web` as the product base.
   Do not create a third frontend while `packages/web` already has `Feed`, `EventDetail`, `Watchlist`, and `TickerProfile`.

3. Make Phase A about the real blockers:
   - canonical event taxonomy
   - source identity cleanup
   - per-user model for watchlists/push
   - market data provider/caching for watchlist tickers only
   - PWA push PoC

4. Fix the historical semantics before marketing the feature.
   T+5 and T+20 need to be real windows, not relabeled 1-day / 1-week proxies.

5. Make FDA, White House, Congress, and DOJ eligible for historical matching before you claim "historical probability" as the main differentiator.

6. Reframe the product language from advice to intelligence.
   Less "STRONG BUY."
   More "high-conviction setup with these analogs and this invalidation."

7. Build the brand around accountable signal quality.
   The real 10-star version of Event Radar is not "AI writes a note."
   It is "the system earns the right to interrupt me."

## Final Verdict

The vision is directionally right and commercially interesting.
The repo is stronger than the doc implies on event plumbing, delivery, and analytics.
But the repo is weaker than the doc implies on semantics, user productization, and source reliability.

If you narrow this to:
- swing trader
- watchlist-first
- provenance-first
- scorecard-first

then you have the outline of a very good product.

If you keep the full ambition and the 8-week claim unchanged, the document is overselling readiness.
