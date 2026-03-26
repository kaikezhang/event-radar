# CrowdTest: Feature Value Audit — Round 2 (Post-Sprint 1)
**Date:** 2026-03-26
**Context:** After Round 1 we removed 23,239 lines. Now re-evaluating the remaining 76k lines to find more fat.
**Product Vision:** Real-time event intelligence for traders. The catalyst before the crowd.

---

## Remaining Feature Inventory (Post-Round 1)

### PACKAGES (code distribution)
| Package | Lines | Purpose |
|---------|-------|---------|
| backend | ~43k | API, pipeline, scanners, services |
| web | ~19k | Consumer-facing SPA |
| shared | ~4k | Shared types/schemas |
| delivery | ~6k | Discord, Telegram, Bark, Web Push, Webhook delivery |
| dashboard | ~4k | Internal ops dashboard (Overview, Audit Trail, Historical) |

### REMAINING FEATURES TO EVALUATE

| # | Feature | Location | Lines | Description |
|---|---------|----------|-------|-------------|
| R1 | **Dashboard package** | packages/dashboard/ | 3,676 | Internal ops dashboard — Overview, Audit Trail, Historical pages. NOT user-facing |
| R2 | **Telegram delivery** | delivery/telegram.ts | 194 | Telegram bot delivery channel. No users on Telegram |
| R3 | **Bark delivery** | delivery/bark-pusher.ts | 155 | iOS Bark push app delivery. No users |
| R4 | **Webhook delivery** | delivery/webhook.ts | 139 | Generic webhook delivery. No users |
| R5 | **Auth system** | routes/auth.ts | 403 | Magic link email auth, JWT, refresh tokens, sessions |
| R6 | **Alert Scorecard** | services/alert-scorecard.ts + route | 285+39 | Per-event accuracy scorecard API |
| R7 | **Weight History** | services/weight-history.ts | 132 | Tracks rule weight changes over time |
| R8 | **Market Calendar** | pipeline/market-calendar.ts | 235 | NYSE holiday/close time awareness for gatekeeper |
| R9 | **Political Rules** | pipeline/political-rules.ts | 215 | Hardcoded political classification rules |
| R10 | **Macro Rules** | pipeline/macro-rules.ts | 303 | Hardcoded macro event classification rules |
| R11 | **Default Rules** | pipeline/default-rules.ts | 818 | Hardcoded SEC 8-K classification rules |
| R12 | **Rule Engine** | pipeline/rule-engine.ts | 135 | Executes classification rules |
| R13 | **Alert Filter** | pipeline/alert-filter.ts | 534 | Post-classification severity filtering |
| R14 | **LLM Gatekeeper** | pipeline/llm-gatekeeper.ts | 355 | GPT-4o-mini quality gate for second-hand sources |
| R15 | **Story Tracker** | pipeline/story-tracker.ts | 91 | Groups related events into "stories" |
| R16 | **Pipeline Limiter** | pipeline/pipeline-limiter.ts | 196 | Rate limits pipeline throughput |
| R17 | **Ticker Inference** | pipeline/ticker-inference.ts | 234 | Infer tickers from event text |
| R18 | **Ticker Candidate** | pipeline/ticker-candidate.ts | 210 | Candidate ticker validation |
| R19 | **Event Type Mapper** | pipeline/event-type-mapper.ts | 319 | Maps raw events to typed categories |
| R20 | **Delivery Gate** | pipeline/delivery-gate.ts | 226 | Decides if event should be delivered |
| R21 | **Company Ticker Map** | pipeline/company-ticker-map.ts | ? | Maps company names to tickers |
| R22 | **Historical Enricher** | pipeline/historical-enricher.ts | ? | Adds historical context to events |
| R23 | **Notification Settings Store** | services/notification-settings-store.ts | ? | Per-user notification preferences (no users!) |
| R24 | **User Preferences Store** | services/user-preferences-store.ts | ? | Per-user preferences (no users!) |
| R25 | **User Webhook Delivery** | services/user-webhook-delivery.ts | 195 | Per-user Discord webhook delivery (no users!) |
| R26 | **Market Data Cache** | services/market-data-cache.ts | 198 | Caches Yahoo Finance data |
| R27 | **Market Context Cache** | services/market-context-cache.ts | 182 | Caches market context for enrichment |
| R28 | **Econ Calendar Scanner** | scanners/econ-calendar-scanner.ts | ~200 | Still in code but disabled in prod |
| R29 | **Newswire Scanner** | scanners/newswire-scanner.ts | ~193 | Still in code but disabled in prod |
| R30 | **FDA Scanner** | scanners/fda-scanner.ts | ? | Disabled in prod (FDA_ENABLED=false) |
| R31 | **Audit Cleanup** | services/audit-cleanup.ts | ? | Cleans old audit trail entries |
| R32 | **EventChart component** | components/EventChart.tsx | ? | Price chart on event detail |
| R33 | **Footer component** | components/Footer.tsx | ? | Page footer |
| R34 | **PillBanner component** | components/PillBanner.tsx | ? | Banner notification component |
| R35 | **StatCard/StatMini** | components/StatCard.tsx + StatMini.tsx | ? | Stats display cards |
| R36 | **Preferences route** | routes/preferences.ts | 88 | User preferences API |
| R37 | **Outcomes route** | routes/outcomes.ts | 100 | Price outcome API |
| R38 | **Push Subscriptions** | routes/push-subscriptions.ts | 83 | Web push subscription management |

---

## 10-Persona Feature Value Ratings (Round 2)

**Question: "How critical is this to why I'd use/pay for Event Radar?"**

| Feature | Sarah | Marcus | Jordan | David | Maria | Ray | Chen Wei | Lisa | Mike | Priya | **AVG** | **Verdict** |
|---------|-------|--------|--------|-------|-------|-----|----------|------|------|-------|---------|-------------|
| R1: Dashboard pkg | 1 | 2 | 1 | 1 | 1 | 1 | 2 | 1 | 1 | 1 | **1.2** | 🔴 CUT |
| R2: Telegram delivery | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | **1.0** | 🔴 CUT |
| R3: Bark delivery | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | **1.0** | 🔴 CUT |
| R4: Webhook delivery | 1 | 3 | 1 | 1 | 1 | 1 | 4 | 3 | 1 | 2 | **1.8** | 🔴 CUT |
| R5: Auth (magic link) | 5 | 7 | 4 | 5 | 6 | 5 | 8 | 7 | 4 | 6 | **5.7** | ⚠️ SIMPLIFY |
| R6: Alert Scorecard | 4 | 6 | 2 | 5 | 3 | 2 | 5 | 4 | 3 | 3 | **3.7** | 🔴 CUT |
| R7: Weight History | 1 | 2 | 1 | 1 | 1 | 1 | 2 | 1 | 1 | 1 | **1.2** | 🔴 CUT |
| R8: Market Calendar | 3 | 4 | 1 | 3 | 3 | 1 | 3 | 2 | 2 | 2 | **2.4** | 🔴 CUT |
| R9: Political Rules | 4 | 4 | 2 | 3 | 3 | 2 | 2 | 3 | 7 | 3 | **3.3** | 🔴 MERGE into default-rules |
| R10: Macro Rules | 4 | 5 | 2 | 4 | 5 | 2 | 3 | 3 | 5 | 4 | **3.7** | 🔴 MERGE into default-rules |
| R11: Default Rules | 7 | 8 | 4 | 6 | 7 | 5 | 6 | 6 | 5 | 7 | **6.1** | ✅ KEEP (simplify) |
| R12: Rule Engine | 7 | 8 | 4 | 6 | 7 | 5 | 6 | 6 | 5 | 7 | **6.1** | ✅ KEEP |
| R13: Alert Filter | 7 | 8 | 5 | 7 | 7 | 6 | 7 | 7 | 7 | 7 | **6.8** | ✅ KEEP |
| R14: LLM Gatekeeper | 6 | 7 | 3 | 5 | 5 | 3 | 6 | 5 | 5 | 5 | **5.0** | ⚠️ REVIEW |
| R15: Story Tracker | 5 | 6 | 3 | 5 | 4 | 3 | 5 | 4 | 5 | 4 | **4.4** | ⚠️ REVIEW (91 lines, keep) |
| R16: Pipeline Limiter | 5 | 6 | 2 | 4 | 4 | 2 | 6 | 5 | 4 | 4 | **4.2** | ✅ KEEP (safety) |
| R17: Ticker Inference | 8 | 9 | 6 | 8 | 7 | 5 | 8 | 7 | 8 | 8 | **7.4** | ✅ KEEP |
| R18: Ticker Candidate | 8 | 9 | 6 | 8 | 7 | 5 | 8 | 7 | 8 | 8 | **7.4** | ✅ KEEP |
| R19: Event Type Mapper | 6 | 7 | 4 | 6 | 6 | 4 | 6 | 5 | 5 | 6 | **5.5** | ✅ KEEP |
| R20: Delivery Gate | 8 | 8 | 5 | 7 | 7 | 5 | 7 | 7 | 8 | 7 | **6.9** | ✅ KEEP |
| R21: Company Ticker Map | 8 | 9 | 6 | 8 | 7 | 5 | 8 | 7 | 8 | 8 | **7.4** | ✅ KEEP |
| R22: Historical Enricher | 6 | 7 | 4 | 7 | 6 | 4 | 6 | 6 | 5 | 6 | **5.7** | ✅ KEEP |
| R23: Notification Settings Store | 1 | 1 | 1 | 1 | 2 | 1 | 1 | 1 | 1 | 1 | **1.1** | 🔴 CUT |
| R24: User Preferences Store | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 2 | **1.9** | 🔴 CUT |
| R25: User Webhook Delivery | 1 | 2 | 1 | 1 | 1 | 1 | 2 | 1 | 1 | 1 | **1.2** | 🔴 CUT |
| R26: Market Data Cache | 7 | 7 | 4 | 7 | 5 | 4 | 7 | 6 | 6 | 5 | **5.8** | ✅ KEEP |
| R27: Market Context Cache | 5 | 5 | 3 | 5 | 4 | 3 | 5 | 4 | 4 | 4 | **4.2** | ⚠️ REVIEW |
| R28: Econ Calendar Scanner | 2 | 3 | 1 | 2 | 3 | 1 | 2 | 2 | 2 | 2 | **2.0** | 🔴 CUT (disabled anyway) |
| R29: Newswire Scanner | 3 | 4 | 1 | 2 | 3 | 1 | 3 | 3 | 2 | 3 | **2.5** | 🔴 CUT (disabled anyway) |
| R30: FDA Scanner | 3 | 4 | 1 | 3 | 4 | 2 | 3 | 3 | 1 | 5 | **2.9** | 🔴 CUT (disabled anyway) |
| R31: Audit Cleanup | 3 | 4 | 1 | 2 | 2 | 1 | 4 | 3 | 2 | 2 | **2.4** | ✅ KEEP (tiny, necessary) |
| R32: EventChart | 7 | 6 | 5 | 8 | 5 | 5 | 6 | 5 | 6 | 5 | **5.8** | ✅ KEEP |
| R33: Footer | 3 | 2 | 3 | 2 | 3 | 3 | 1 | 4 | 2 | 3 | **2.6** | 🔴 CUT |
| R34: PillBanner | 2 | 1 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 2 | **1.8** | 🔴 CUT (if unused) |
| R35: StatCard/StatMini | 3 | 4 | 2 | 3 | 3 | 2 | 3 | 3 | 2 | 3 | **2.8** | 🔴 CUT (if unused) |
| R36: Preferences route | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 2 | **1.9** | 🔴 CUT |
| R37: Outcomes route | 5 | 7 | 3 | 7 | 4 | 3 | 7 | 5 | 4 | 4 | **4.9** | ✅ KEEP |
| R38: Push Subscriptions | 5 | 3 | 4 | 4 | 4 | 3 | 2 | 3 | 4 | 2 | **3.4** | ✅ KEEP (settings page uses it) |

---

## Round 2 Cut List

### Sprint 4: Kill entire packages + delivery channels (~10,000+ lines)

**DELETE `packages/dashboard/` entirely (3,676 lines)**
- Internal ops dashboard nobody uses
- We have the AI Observability API endpoints for ops — curl is enough
- 3 pages, 7+ components, tests — all dead weight

**DELETE delivery channels we don't use:**
- `telegram.ts` (194 lines) — no Telegram users
- `bark-pusher.ts` (155 lines) — no Bark users
- `webhook.ts` (139 lines) — no webhook users
- Keep: `discord-webhook.ts` (core delivery) + `web-push-channel.ts` (settings page)

**DELETE disabled scanners still in code:**
- `econ-calendar-scanner.ts` + tests (~800 lines) — disabled, redundant
- `newswire-scanner.ts` + tests (~800 lines) — disabled, silent
- `fda-scanner.ts` + tests — disabled, only 11 events ever

### Sprint 5: Kill dead user features + simplify pipeline (~3,000+ lines)

**DELETE dead user-facing services (no users to use them!):**
- `notification-settings-store.ts` — no users configuring notifications
- `user-preferences-store.ts` — no users setting preferences
- `user-webhook-delivery.ts` (195 lines) — no users with webhooks
- `routes/preferences.ts` (88 lines) — no users
- `alert-scorecard.ts` + route (324 lines) — nobody views scorecards
- `weight-history.ts` (132 lines) — nobody tracks weight changes

**MERGE rules into single file:**
- `political-rules.ts` (215 lines) + `macro-rules.ts` (303 lines) → inline into `default-rules.ts`
- Reduces 3 files to 1, eliminates cross-file imports

**DELETE market-calendar.ts (235 lines):**
- NYSE holiday awareness for LLM gatekeeper
- The gatekeeper can work without knowing if NYSE is closed
- Over-engineered for current product state

**DELETE footer component** (not needed for beta)

### Expected Impact

| Metric | Before Sprint 4-5 | After (est.) |
|--------|-------------------|-------------|
| Total lines | ~76k | **~60k** |
| Packages | 5 | **4** (remove dashboard) |
| Delivery channels | 5 | **2** (Discord + Web Push) |
| Scanners (in code) | 8 | **5** (sec-edgar, breaking-news, truth-social, halt, federal-register) |
| Services | 22 | **~15** |
| Pipeline files | 24 | **~20** |
| Estimated lines removed | — | **~13,000-16,000** |

---

## What Stays After Round 2

### Core Pipeline (the product's engine)
- Ingest → Dedup → Classify (LLM + Rules) → Golden Judge → Deliver
- Price tracking + Outcome tracking
- Ticker inference + Extraction

### Core UI (the product's face)
- Feed (real-time WebSocket)
- Event Detail (AI analysis + evidence + price outcome)
- Search (text + ticker)
- Watchlist (personal ticker tracking)
- Ticker Profile (per-ticker history)
- Settings (push toggle + about)
- Login (simplified)

### Core Infrastructure
- 5 scanners (SEC EDGAR, Breaking News, Truth Social, Trading Halt, Federal Register)
- Discord webhook delivery + Web Push
- REST API with auth + rate limits
- Golden Judge quality gate
- LLM Classifier (GPT-4o-mini)

**Everything else is noise.**

---

## Persona Validation Round 2

| Persona | Still pay $39/mo? | Impact of further cuts? |
|---------|------------------|----------------------|
| Sarah | **Yes** | Dashboard/Telegram/Bark removal invisible to her |
| Marcus | **Yes** | Webhook removal is minor — API is his interface |
| Jordan | **No** | Price, not features |
| David | **Yes** | Scorecard removal is OK — he uses price outcomes |
| Maria | **Yes** | Notification settings removal is fine — she uses feed |
| Ray | **Maybe→Yes** | Simpler = better |
| Chen Wei | **Yes** | Leaner API, fewer unused endpoints |
| Lisa | **Yes** | Cleaner product for partnership eval |
| Mike | **Yes** | Truth Social + breaking news is all he needs |
| Priya | **No** | Still needs ESG tagging |

**7 Yes, 1 Maybe, 2 No — unchanged, stronger conviction**
