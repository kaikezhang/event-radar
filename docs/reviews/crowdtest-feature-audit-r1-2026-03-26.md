# CrowdTest: Feature Value Audit — Round 1 (Subtraction Sprint)
**Date:** 2026-03-26
**Goal:** Identify features that are NOT core to the product's value proposition. Each persona rates every feature 1-10 on "How critical is this to why I'd pay for Event Radar?" — features scoring low across personas get cut.
**Product Vision:** Real-time event intelligence for traders who want the catalyst before the crowd.

---

## Complete Feature Inventory

### PAGES (Frontend)
| # | Feature | Description | Lines |
|---|---------|-------------|-------|
| F1 | **Feed** (/) | Main event feed with real-time WebSocket, severity filters, push-only filter | ~500 |
| F2 | **Event Detail** (/event/:id) | Full event page: Summary tab, Evidence tab, "What Happened Next" price outcome, market data, event history | ~600 |
| F3 | **Search** (/search) | Full-text search + ticker filter | 156 |
| F4 | **Watchlist** (/watchlist) | Save tickers, filter feed by watched tickers | 402 |
| F5 | **Calendar** (/calendar) | Scheduled events: earnings, SEC filings, FDA dates. This-week/next-week/this-month views | 246 |
| F6 | **Ticker Profile** (/ticker/:symbol) | Per-ticker page: recent events, price chart | 126 |
| F7 | **Settings** (/settings) | Font size, notification preferences, Discord webhook, web push, quiet hours, daily push cap | 735 |
| F8 | **Onboarding** (/onboarding) | 2-step wizard: pick watchlist tickers from packs, enable notifications | 415 |
| F9 | **Login** (/login) | Magic link email auth | 109 |
| F10 | **Landing** (/) | Marketing page: "Real-time event intelligence for traders" → Sign in CTA | 24 |
| F11 | **Privacy/Terms** (/privacy, /terms) | Legal pages | 72 |

### BACKEND SERVICES
| # | Feature | Description | Lines |
|---|---------|-------------|-------|
| F12 | **LLM Classifier** | GPT-4o-mini classifies events (BULLISH/BEARISH/NEUTRAL) + confidence | 147+190 |
| F13 | **Golden Judge** | Rules + confidence-based filter deciding what gets delivered | 762 |
| F14 | **Price Service** | Fetches priceAtEvent + outcome tracking (T+1h, T+1d, T+1w, T+1m) | 366+535 |
| F15 | **Alert Scorecard** | Backend accuracy metrics: direction verdict, setup-worked rate | 285+403+155 |
| F16 | **Market Regime** | Detects bull/bear/sideways market via VIX + 50/200 DMA | 549 |
| F17 | **Pattern Matcher** | Rule-based pattern matching engine for event classification | 772 |
| F18 | **Rule Parser** | DSL for custom event classification rules | 775 |
| F19 | **Adaptive Classifier** | Adjusts classification thresholds based on accuracy feedback | 335 |
| F20 | **Similarity/Dedup** | Event deduplication via text similarity | 536+205 |
| F21 | **Classification Accuracy** | Tracks whether LLM classifications were correct vs. price movement | 490 |
| F22 | **Notification Settings** | Per-user Discord webhook + email notification preferences | backend route |
| F23 | **Web Push** | Browser push notifications for events | backend+frontend |
| F24 | **User Feedback** | UI for users to rate event quality | 148 (service) |
| F25 | **Delivery Kill Switch** | Emergency halt on delivery if error rate spikes | backend |

### SCANNERS (Data Sources)
| # | Feature | Description | Status |
|---|---------|-------------|--------|
| F26 | **SEC EDGAR** | 8-K/10-K/Form 4 filings | ✅ Active (13,124 events) |
| F27 | **Breaking News** | Bloomberg, CNBC, Reuters headlines | ✅ Active |
| F28 | **StockTwits** | Trending tickers + sentiment | ✅ Active |
| F29 | **Truth Social** | Trump posts with ticker extraction | ✅ Active |
| F30 | **Trading Halt** | NYSE/NASDAQ trading halts | ✅ Active |
| F31 | **Federal Register** | Government regulations | ✅ Active (69 events) |
| F32 | **Econ Calendar** | Scheduled economic data releases | ✅ Active |
| F33 | **Whitehouse** | Presidential press releases | ✅ Active (61 events) |
| F34 | **FDA** | Drug approvals/denials | ✅ Active (11 events) |
| F35 | **SEC Regulatory** | SEC enforcement actions | ✅ Active (7 events) |
| F36 | **Reddit** | r/wallstreetbets, r/stocks mentions | ⚠️ Registered but silent |
| F37 | **Newswire** | PR Newswire / BusinessWire | ⚠️ Registered but silent |
| F38 | **IR Monitor** | Investor relations page changes | ⚠️ Registered but silent |
| F39 | **Dilution Monitor** | Share offering/dilution detection | ⚠️ Registered but silent |
| F40 | **FTC** | Federal Trade Commission actions | ✅ Active (1 event) |
| F41 | **CFPB** | Consumer Financial Protection Bureau | ✅ Active (2 events) |

### FRONTEND COMPONENTS
| # | Feature | Description |
|---|---------|-------------|
| F42 | **Bottom Nav** | 5-tab mobile nav: Feed, Watchlist, Calendar, Search, Settings |
| F43 | **Alert Sound** | Audio notification on new events |
| F44 | **Dark Mode** | Enforced dark theme |
| F45 | **Font Size Control** | Small/Medium/Large text |
| F46 | **Swipeable Cards** | Swipe gesture on event cards |
| F47 | **Event Chart** | Price chart on event detail |
| F48 | **Daily Briefing** | Collapsible daily summary panel |

### API FEATURES
| # | Feature | Description |
|---|---------|-------------|
| F49 | **REST API** | Full API with auth, rate limits, filters |
| F50 | **API Docs** (/api-docs) | Self-documenting API endpoint |
| F51 | **AI Observability** | /ai/pulse, /ai/daily-report, /ai/trace, /ai/scanner |
| F52 | **WebSocket** | Real-time event streaming |

---

## Persona Evaluation Matrix

Each persona rates: **"On a 1-10 scale, how critical is this feature to why I'd use/pay for Event Radar?"**

- **10** = Core — I wouldn't use the product without this
- **7-9** = Important — Adds significant value
- **4-6** = Nice-to-have — I can live without it
- **1-3** = Unnecessary — Adds complexity/distraction, remove it

### 10-Persona Feature Value Ratings

| Feature | Sarah (Day) | Marcus (HF) | Jordan (Student) | David (Swing) | Maria (RIA) | Ray (Retired) | Chen Wei (Quant) | Lisa (PM) | Mike (Crypto) | Priya (ESG) | **AVG** | **Verdict** |
|---------|------------|-------------|-----------------|--------------|-------------|--------------|-----------------|----------|--------------|-------------|---------|-------------|
| **F1: Feed** | 10 | 8 | 10 | 10 | 9 | 10 | 6 | 8 | 10 | 8 | **8.9** | ✅ CORE |
| **F2: Event Detail** | 10 | 10 | 7 | 9 | 10 | 9 | 9 | 9 | 9 | 10 | **9.2** | ✅ CORE |
| **F3: Search** | 8 | 9 | 7 | 8 | 8 | 6 | 8 | 7 | 9 | 9 | **7.9** | ✅ KEEP |
| **F4: Watchlist** | 7 | 5 | 8 | 9 | 7 | 7 | 3 | 5 | 7 | 6 | **6.4** | ⚠️ REVIEW |
| **F5: Calendar** | 5 | 4 | 3 | 6 | 5 | 4 | 2 | 4 | 2 | 5 | **4.0** | 🔴 CUT |
| **F6: Ticker Profile** | 7 | 6 | 6 | 8 | 6 | 5 | 5 | 5 | 6 | 7 | **6.1** | ⚠️ REVIEW |
| **F7: Settings (full)** | 4 | 3 | 3 | 4 | 5 | 6 | 2 | 3 | 3 | 3 | **3.6** | 🔴 CUT (simplify) |
| **F8: Onboarding** | 3 | 2 | 5 | 3 | 3 | 4 | 1 | 4 | 3 | 3 | **3.1** | 🔴 CUT |
| **F9: Login/Auth** | 5 | 7 | 4 | 5 | 6 | 5 | 8 | 7 | 4 | 6 | **5.7** | ⚠️ REVIEW |
| **F10: Landing** | 2 | 2 | 3 | 2 | 2 | 2 | 1 | 5 | 2 | 2 | **2.3** | 🔴 CUT |
| **F11: Privacy/Terms** | 1 | 3 | 1 | 1 | 4 | 2 | 1 | 6 | 1 | 5 | **2.5** | 🔴 CUT (until launch) |
| **F12: LLM Classifier** | 10 | 9 | 8 | 9 | 9 | 8 | 9 | 9 | 10 | 9 | **9.0** | ✅ CORE |
| **F13: Golden Judge** | 9 | 9 | 6 | 8 | 8 | 7 | 8 | 8 | 8 | 8 | **7.9** | ✅ KEEP |
| **F14: Price Service** | 10 | 10 | 8 | 10 | 8 | 7 | 10 | 9 | 9 | 8 | **8.9** | ✅ CORE |
| **F15: Alert Scorecard** | 6 | 8 | 3 | 7 | 5 | 3 | 7 | 6 | 4 | 5 | **5.4** | ⚠️ REVIEW |
| **F16: Market Regime** | 4 | 5 | 2 | 5 | 4 | 2 | 4 | 3 | 3 | 3 | **3.5** | 🔴 CUT |
| **F17: Pattern Matcher** | 3 | 4 | 1 | 3 | 2 | 1 | 4 | 3 | 2 | 2 | **2.5** | 🔴 CUT |
| **F18: Rule Parser** | 2 | 4 | 1 | 2 | 1 | 1 | 5 | 3 | 1 | 2 | **2.2** | 🔴 CUT |
| **F19: Adaptive Classifier** | 3 | 5 | 1 | 3 | 2 | 1 | 5 | 4 | 2 | 3 | **2.9** | 🔴 CUT |
| **F20: Similarity/Dedup** | 8 | 9 | 6 | 7 | 7 | 7 | 8 | 8 | 9 | 7 | **7.6** | ✅ KEEP |
| **F21: Classification Accuracy** | 5 | 7 | 2 | 5 | 4 | 2 | 7 | 5 | 3 | 4 | **4.4** | 🔴 CUT |
| **F22: Notification Settings** | 5 | 3 | 3 | 4 | 5 | 4 | 2 | 3 | 4 | 3 | **3.6** | 🔴 CUT (simplify) |
| **F23: Web Push** | 7 | 4 | 6 | 6 | 6 | 5 | 2 | 4 | 6 | 3 | **4.9** | ⚠️ REVIEW |
| **F24: User Feedback** | 3 | 4 | 2 | 3 | 2 | 2 | 3 | 4 | 2 | 2 | **2.7** | 🔴 CUT |
| **F25: Kill Switch** | 6 | 7 | 1 | 4 | 5 | 3 | 7 | 6 | 3 | 5 | **4.7** | ⚠️ KEEP (ops safety) |
| **F26: SEC EDGAR** | 7 | 10 | 3 | 6 | 9 | 6 | 9 | 8 | 4 | 10 | **7.2** | ✅ KEEP |
| **F27: Breaking News** | 10 | 9 | 9 | 9 | 10 | 9 | 7 | 8 | 10 | 8 | **8.9** | ✅ CORE |
| **F28: StockTwits** | 5 | 3 | 7 | 4 | 2 | 3 | 2 | 3 | 5 | 2 | **3.6** | 🔴 CUT |
| **F29: Truth Social** | 6 | 5 | 5 | 6 | 5 | 4 | 3 | 5 | 10 | 4 | **5.3** | ⚠️ REVIEW |
| **F30: Trading Halt** | 9 | 8 | 4 | 9 | 6 | 5 | 7 | 7 | 7 | 5 | **6.7** | ✅ KEEP |
| **F31: Federal Register** | 3 | 5 | 1 | 2 | 4 | 2 | 3 | 4 | 2 | 8 | **3.4** | 🔴 CUT |
| **F32: Econ Calendar** | 6 | 7 | 3 | 6 | 7 | 4 | 5 | 5 | 6 | 5 | **5.4** | ⚠️ REVIEW |
| **F33: Whitehouse** | 3 | 4 | 2 | 3 | 4 | 3 | 2 | 3 | 7 | 4 | **3.5** | 🔴 CUT (merge into Truth Social/Breaking News) |
| **F34: FDA** | 4 | 5 | 2 | 4 | 5 | 3 | 4 | 4 | 2 | 6 | **3.9** | 🔴 CUT (only 11 events) |
| **F35: SEC Regulatory** | 3 | 6 | 1 | 3 | 5 | 2 | 4 | 4 | 2 | 7 | **3.7** | 🔴 CUT (only 7 events) |
| **F36: Reddit** | 4 | 2 | 8 | 3 | 1 | 2 | 1 | 2 | 5 | 1 | **2.9** | 🔴 CUT (silent) |
| **F37: Newswire** | 5 | 6 | 2 | 4 | 5 | 3 | 4 | 5 | 3 | 5 | **4.2** | 🔴 CUT (silent) |
| **F38: IR Monitor** | 3 | 5 | 1 | 4 | 3 | 2 | 4 | 3 | 1 | 4 | **3.0** | 🔴 CUT (silent) |
| **F39: Dilution Monitor** | 4 | 4 | 2 | 5 | 2 | 2 | 3 | 3 | 3 | 3 | **3.1** | 🔴 CUT (silent) |
| **F40: FTC** | 2 | 3 | 1 | 2 | 3 | 2 | 2 | 3 | 1 | 5 | **2.4** | 🔴 CUT (1 event) |
| **F41: CFPB** | 2 | 3 | 1 | 2 | 3 | 2 | 2 | 3 | 1 | 5 | **2.4** | 🔴 CUT (2 events) |
| **F42: Bottom Nav** | 8 | 5 | 9 | 8 | 7 | 8 | 3 | 6 | 8 | 6 | **6.8** | ✅ KEEP (simplify) |
| **F43: Alert Sound** | 6 | 3 | 5 | 6 | 4 | 4 | 1 | 3 | 5 | 2 | **3.9** | 🔴 CUT |
| **F44: Dark Mode** | 7 | 6 | 8 | 7 | 5 | 6 | 7 | 6 | 8 | 5 | **6.5** | ✅ KEEP |
| **F45: Font Size** | 2 | 2 | 2 | 2 | 2 | 8 | 1 | 3 | 2 | 2 | **2.6** | 🔴 CUT |
| **F46: Swipeable Cards** | 4 | 2 | 5 | 4 | 3 | 3 | 1 | 3 | 4 | 2 | **3.1** | 🔴 CUT |
| **F47: Event Chart** | 7 | 6 | 5 | 8 | 5 | 5 | 6 | 5 | 6 | 5 | **5.8** | ⚠️ REVIEW |
| **F48: Daily Briefing** | 5 | 6 | 4 | 5 | 7 | 5 | 3 | 5 | 5 | 5 | **5.0** | ⚠️ REVIEW |
| **F49: REST API** | 5 | 10 | 2 | 4 | 3 | 1 | 10 | 9 | 3 | 7 | **5.4** | ✅ KEEP (core for quant/PM) |
| **F50: API Docs** | 2 | 8 | 1 | 2 | 1 | 1 | 9 | 8 | 1 | 4 | **3.7** | ⚠️ REVIEW |
| **F51: AI Observability** | 1 | 3 | 1 | 1 | 1 | 1 | 3 | 2 | 1 | 1 | **1.5** | 🔴 CUT (ops only, not user-facing) |
| **F52: WebSocket** | 9 | 7 | 7 | 8 | 6 | 5 | 8 | 7 | 9 | 5 | **7.1** | ✅ KEEP |

---

## Analysis: What to Cut (Sorted by Average Score)

### 🔴 DEFINITELY CUT (avg ≤ 4.0) — 20 features

| Rank | Feature | Avg | Rationale |
|------|---------|-----|-----------|
| 1 | F51: AI Observability (user-facing) | 1.5 | Internal ops tool, NOT a user feature. Keep backend but remove from nav/UI |
| 2 | F18: Rule Parser DSL | 2.2 | Over-engineered. Nobody wants to write DSL rules. LLM classifier does the job |
| 3 | F10: Landing Page | 2.3 | 24 lines. A login page IS the landing page. Unnecessary extra route |
| 4 | F40: FTC Scanner | 2.4 | 1 event total. Dead weight |
| 5 | F41: CFPB Scanner | 2.4 | 2 events total. Dead weight |
| 6 | F17: Pattern Matcher | 2.5 | 772 lines for rule-based classification that LLM does better |
| 7 | F11: Privacy/Terms | 2.5 | Not needed until actual launch |
| 8 | F45: Font Size Control | 2.6 | Browser zoom exists. One user (Ray) cares. Not worth 735-line Settings page |
| 9 | F24: User Feedback | 2.7 | No users yet. Premature feature |
| 10 | F19: Adaptive Classifier | 2.9 | Adjusting thresholds with no users = optimizing for nothing |
| 11 | F36: Reddit Scanner | 2.9 | Silent. No data flowing |
| 12 | F8: Onboarding Wizard | 3.1 | 415 lines. Users can add tickers from Feed. Skip-to-feed is fine |
| 13 | F39: Dilution Monitor | 3.1 | Silent. No data flowing |
| 14 | F46: Swipeable Cards | 3.1 | Mobile gimmick. Tap works fine |
| 15 | F38: IR Monitor | 3.0 | Silent. No data flowing |
| 16 | F31: Federal Register | 3.4 | 69 events in months. Too infrequent to matter |
| 17 | F33: Whitehouse | 3.5 | 61 events. Truth Social + Breaking News already cover presidential actions |
| 18 | F16: Market Regime | 3.5 | 549 lines. Adds complexity without clear user value |
| 19 | F28: StockTwits | 3.6 | "XLE entered StockTwits trending" ×3. Pure noise. Worst signal-to-noise ratio |
| 20 | F7: Settings (full complexity) | 3.6 | 735 lines! Quiet hours, push caps, discord webhooks — no users to configure |

### ⚠️ REVIEW (avg 4.0-6.5) — Need deeper analysis

| Feature | Avg | Decision |
|---------|-----|----------|
| F5: Calendar | 4.0 | **CUT** — Econ calendar is just API data, Calendar UI adds little. Events show in Feed already |
| F37: Newswire | 4.2 | **CUT** — Silent scanner, no data |
| F21: Classification Accuracy | 4.4 | **CUT** — Internal metric, not user value |
| F25: Kill Switch | 4.7 | **KEEP** — Tiny code, critical safety net |
| F23: Web Push | 4.9 | **SIMPLIFY** — Keep basic push, cut the complex settings UI |
| F48: Daily Briefing | 5.0 | **KEEP (slim)** — Maria (RIA) values it. But simplify |
| F29: Truth Social | 5.3 | **KEEP** — Mike's #1 unique feature. Fix dedup instead |
| F15: Alert Scorecard | 5.4 | **CUT UI, KEEP backend** — The data is valuable but no user looks at scorecard stats |
| F32: Econ Calendar | 5.4 | **CUT scanner** — Data exists in Breaking News already |
| F9: Login/Auth | 5.7 | **SIMPLIFY** — Magic link is over-engineered for beta. API key or basic auth |
| F47: Event Chart | 5.8 | **KEEP** — David (swing trader) values price visualization |
| F6: Ticker Profile | 6.1 | **KEEP (slim)** — Useful but keep minimal |
| F4: Watchlist | 6.4 | **KEEP** — Core personalization. But simplify onboarding around it |

---

## Round 1 Cut List — Recommended Removals

### Sprint 1: Dead Scanners + Dead Services (~3,000+ lines)
**Remove these scanners entirely** (code + registration + config):
- Reddit scanner (silent)
- Newswire scanner (silent)  
- IR Monitor scanner (silent)
- Dilution Monitor scanner (silent)
- FTC scanner (1 event)
- CFPB scanner (2 events)
- Federal Register scanner (69 events — too slow to matter)
- Whitehouse scanner (redundant with Truth Social + Breaking News)
- StockTwits scanner (worst signal-to-noise)
- Econ Calendar scanner (redundant with Breaking News)

**Remove these backend services:**
- Pattern Matcher (772 lines) — LLM classifier does this
- Rule Parser DSL (775 lines) — LLM classifier does this  
- Adaptive Classifier (335 lines) — premature optimization
- Market Regime (549 lines) — no visible user value
- Classification Accuracy (490 lines) — internal metric
- User Feedback (148 lines) — no users

### Sprint 2: Dead UI (~2,500+ lines)
**Remove these pages/routes:**
- Landing page (24 lines) — Login IS the landing
- Onboarding wizard (415 lines + 351 test) — Just show Feed
- Calendar page (246 lines + 112 test) — Events show in Feed
- Privacy/Terms pages (72 lines) — Not needed for beta
- Settings: Strip to JUST dark mode toggle (cut 700+ lines of notification config, font size, quiet hours)

**Remove these components:**
- Swipeable Cards — tap is fine
- Alert Sound — unnecessary complexity
- Font Size Control — browser zoom
- AI Observability UI exposure (keep backend for ops)

### Sprint 3: Simplify Auth + API Surface
- Simplify Login to API-key only (cut magic link email flow)
- Remove onboarding API routes
- Remove notification-settings routes (complex webhook config)
- Keep: push-subscriptions (basic web push)

---

## Expected Impact

| Metric | Before | After (est.) |
|--------|--------|-------------|
| Scanners | 12 active + ~6 dead | **5 active** (SEC EDGAR, Breaking News, Truth Social, Trading Halt, FDA) |
| Frontend pages | 13 routes | **7 routes** (Feed, Event Detail, Search, Watchlist, Ticker Profile, Settings-slim, Login-slim) |
| Backend services | ~30 | **~15** |
| Settings page | 735 lines | **~50 lines** (dark mode toggle only) |
| Estimated lines removed | — | **~8,000-10,000** |
| Bottom nav tabs | 5 | **3** (Feed, Search, Watchlist) |

## What Stays (The Laser-Focused Product)

1. **Feed** — Real-time event stream with severity filters
2. **Event Detail** — AI analysis + evidence + price outcome
3. **Search** — Find events by text or ticker
4. **Watchlist** — Track your tickers
5. **Ticker Profile** — Per-ticker event history
6. **5 Scanners** — SEC EDGAR, Breaking News, Truth Social, Trading Halt, FDA
7. **LLM Classification** — BULLISH/BEARISH/NEUTRAL with confidence
8. **Golden Judge** — Quality filter
9. **Price Tracking** — priceAtEvent + outcomes
10. **Dedup** — No duplicate events
11. **WebSocket** — Real-time streaming
12. **REST API** — For quant/developer users
13. **Web Push** — Basic browser notifications (no complex settings)
14. **Dark Mode** — The only theme
15. **Kill Switch** — Safety net

**That's it.** Everything else is fat.

---

## Persona Validation: "Would you still pay $39/mo with ONLY these features?"

| Persona | Answer | Why |
|---------|--------|-----|
| Sarah (Day Trader) | **YES** | Feed + real-time + LLM classification + price = her core workflow |
| Marcus (Hedge Fund) | **YES** | API + SEC EDGAR + classification = his use case. Less noise is better |
| Jordan (Student) | **Still No** | $39 is too much regardless of features |
| David (Swing Trader) | **YES** | Price outcomes + search + watchlist = his workflow |
| Maria (RIA) | **YES** | Breaking news + analysis for client calls |
| Ray (Retired) | **Maybe→Yes** | Simpler UI is actually better for him |
| Chen Wei (Quant) | **YES** | Cleaner API, fewer fields to parse, better DX |
| Lisa (PM) | **YES** | Leaner product = clearer value prop for partnership evaluation |
| Mike (Crypto/Macro) | **YES** | Truth Social + breaking news = his core need. Less noise helps |
| Priya (ESG) | **Still No** | Needs ESG tagging regardless |

**Result: 7 Yes + 1 Maybe + 2 No (same ratio but stronger conviction)**

---

## Next Steps

1. **Validate with main**: Present this cut list to 主人
2. **Sprint 1**: Dead scanners + dead services (biggest code reduction, zero user impact)
3. **Sprint 2**: Dead UI pages + simplify settings
4. **Sprint 3**: Auth simplification
5. **Re-run CrowdTest** after each sprint to measure focus improvement
