# Technical Feasibility Rethink — CrowdTest User-Needs Report

**Author:** Codex  
**Input:** `docs/reviews/crowdtest-user-needs-2026-03-23.md`  
**Date:** 2026-03-23  
**Method:** read the report, inspect backend/frontend/runtime code, hit live local APIs at `127.0.0.1:3001` and `127.0.0.1:3002`, and run direct upstream health checks against scanner sources where practical.

## Executive Summary

The report is directionally useful, but several of its core premises are technically wrong as of **March 23, 2026**:

- The live app is **not running 23 scanners**. `/api/scanners/status` reported **12 registered scanners**, all healthy, at audit time.
- The report mixes **live event volume** with **historical backtest corpus**. Live `/api/stats` reported **24,564 total events** and `/api/v1/scorecards/summary` reported **6,438 alerts with usable verdicts**. But `/api/historical/stats` reported only **2,423 historical events** with **2,421 returns**.
- “Audio squawk” is **already shipped**, but only as **browser `speechSynthesis` while the page is open and visible**. It is not a server-side or mobile/off-page squawk system.
- “Options flow exists in code” is true, but the current upstream URL in `options-scanner.ts` returned **404** during audit, so this is not production-grade.
- “Catalyst calendar” is partially present only for **static macro events** and a fragile earnings scanner. There is no calendar product surface, no durable source for FDA PDUFA dates, and no lockup-expiration pipeline.
- “Historical pattern backtesting” is currently **cohort lookup + outcome aggregation**, not a true strategy backtester.

If the question is “can we build the report’s roadmap with the current codebase?”, the answer is:

- **Yes** for scanner hardening, feed quality, plain-English summaries, and incremental calendar work.
- **Partially** for options flow and historical pattern stats.
- **Already partly shipped** for audio squawk.
- **No, not without a new subsystem** for broker trading, advisor mode, entitlements/free tier, or portfolio overlay.

## Current System Reality

### Live runtime snapshot

Observed from the running local services during this audit:

- `GET /api/scanners/status`: **12 registered scanners**, all healthy.
- `GET /api/stats`: **24,564 total events**, **17 sources**.
- `GET /api/v1/scorecards/summary`: **12,283 tracked alerts**, **6,438 alerts with usable verdicts**.
- `GET /api/historical/stats`: **2,423 historical events**, **2,421 returns**, **50 unique tickers**.
- `GET /api/v1/story-groups`: empty.
- `GET /api/regime`: all-zero neutral snapshot.
- `GET http://127.0.0.1:3002/health`: Python SEC microservice healthy.

### Architectural reality

Relevant modules already in place:

- Scanner wiring: `packages/backend/src/scanner-registry-setup.ts`
- Runtime health/status: `packages/backend/src/app.ts`, `packages/backend/src/routes/scanners.ts`
- Live feed API: `packages/backend/src/routes/dashboard.ts`
- Event detail: `packages/backend/src/routes/events.ts`
- Outcome tracking: `packages/backend/src/services/outcome-tracker.ts`
- Similarity/pattern matching: `packages/backend/src/services/pattern-matcher.ts`, `packages/backend/src/services/similarity.ts`, `packages/backend/src/services/outcome-similarity.ts`
- Historical corpus API: `packages/backend/src/routes/historical.ts`
- Web squawk: `packages/web/src/hooks/useAudioSquawk.ts`, `packages/web/src/hooks/useAlerts.ts`
- Web push caps/quiet hours: `packages/delivery/src/web-push-channel.ts`, `packages/backend/src/services/user-preferences-store.ts`

### Biggest technical mismatches with the report

1. “23 scanners” is not the current runtime truth.
   `registerScanners()` contains **22 scanner classes including `DummyScanner`**, and `warn-scanner.ts` exists but is **not registered at all**.

2. Historical depth is overstated.
   The historical subsystem is currently a **2.4k-event corpus**, not a 23k-event research warehouse.

3. Several “missing” features are actually “partial and fragile”.
   Audio squawk, API access, catalyst data, charts, and similar-event analytics already exist in partial form.

4. SEC exists twice.
   There is both a TypeScript `sec-edgar-scanner.ts` and a Python `services/sec-scanner` service. That is technical debt and operational ambiguity.

## Recommendation-by-Recommendation Rethink

### 1. Activate All 23 Scanners

| Question | Answer |
|---|---|
| Can we build it with current codebase? | **Partially.** The code structure exists, but multiple scanners point to stale or fragile upstreams, one scanner is unregistered, and one source family is misrepresented. |
| Files/modules to change | `packages/backend/src/scanner-registry-setup.ts`, individual scanner files under `packages/backend/src/scanners/`, `packages/backend/src/routes/dashboard.ts`, `packages/web/src/components/AlertCard.tsx`, `packages/web/src/pages/Feed/useFeedState.ts`, `.env.example`, possibly `services/sec-scanner/` if SEC is consolidated. |
| External APIs/data needed | Depends on scanner. Some are free/public; some need paid or replacement sources. Details in scanner matrix below. |
| Realistic dev time | **4-6 weeks for one developer** to make the scanner layer reliable enough to market, not counting new commercial contracts. **1-2 weeks** if scope is narrowed to the scanners that already have live paths. |
| Infrastructure cost | Low for public RSS/API scanners. Medium once paid data is added. Main cost is maintenance time, not compute. |
| Technical debt/risk | High. Upstream fragility, duplicate SEC implementations, inconsistent env defaults, and runtime-vs-doc drift. |

#### Rethink

“Activate all 23 scanners” should not be treated as one feature. It should be split into:

- **Already viable with current code**: `sec-edgar`, `breaking-news`, `stocktwits`, `truth-social`, `whitehouse`, `federal-register`, `trading-halt`, `dilution-monitor`
- **Exists but needs source replacement or bug fix**: `analyst`, `congress`, `unusual-options`, `short-interest`, `earnings`, `fda`, `doj-antitrust`, `fedwatch`, `reddit`, `ir-monitor`
- **Not actually wired**: `warn-act`
- **Not product-relevant**: `dummy`

The faster path is not “23/23 live”. It is:

1. Collapse duplicate SEC implementations.
2. Fix or replace stale upstreams.
3. Add per-scanner event visibility in the feed/dashboard so “healthy but silent” is obvious.
4. Ship a narrower, trustworthy scanner set before expanding.

### 2. Catalyst Calendar

| Question | Answer |
|---|---|
| Can we build it with current codebase? | **Yes, partially.** Macro events and earnings scaffolding exist, but there is no calendar product or durable FDA/lockup source. |
| Files/modules to change | `packages/backend/src/scanners/econ-calendar-scanner.ts`, `packages/backend/src/config/econ-calendar.json`, `packages/backend/src/scanners/earnings-scanner.ts`, add new backend route(s) under `packages/backend/src/routes/`, add new page/route in `packages/web/src/App.tsx` plus calendar UI under `packages/web/src/pages/`. |
| External APIs/data needed | Macro: current static JSON or official calendars. Earnings: Alpha Vantage is viable; Yahoo fallback is broken. FDA PDUFA: no clean official API found; would need third-party or manual ingestion. Lockups: would require SEC S-1 parsing or paid data. |
| Realistic dev time | **5 days** for macro + earnings-only MVP. **2-3 weeks** for a real catalyst calendar with earnings, macro, and basic biotech catalysts. **4-6 weeks** if lockups are included. |
| Infrastructure cost | Macro-only: near zero. Earnings via Alpha Vantage: low. FDA/lockups likely require a commercial dataset or maintenance burden. |
| Technical debt/risk | Medium-high. Static schedules rot, timezone logic is hand-rolled, and data completeness will be uneven by catalyst type. |

#### What already exists

- `econ-calendar-scanner.ts` reads `packages/backend/src/config/econ-calendar.json` and emits pre-release/post-release alerts.
- `earnings-scanner.ts` exists and is registered when enabled.
- Event detail already has source cards that can render econ/earnings metadata.

#### What is missing

- No `/calendar` route or page.
- No persistent calendar table.
- The macro schedule is static and ends in mid-2026.
- `earnings-scanner.ts` falls back to a Yahoo HTML URL but still calls `response.json()`, so the fallback path is broken.
- No reliable FDA PDUFA dataset in the repo.

#### Recommendation

Ship this in two phases:

- **Phase A**: macro + earnings only
- **Phase B**: biotech catalysts only after a data-source decision

Do **not** promise lockup expirations in the first pass.

### 3. Historical Pattern Backtesting

| Question | Answer |
|---|---|
| Can we build it with current codebase? | **Only a narrow MVP.** Cohort lookup and outcome stats exist. True backtesting does not. |
| Files/modules to change | `packages/backend/src/routes/historical.ts`, `packages/backend/src/routes/outcomes.ts`, `packages/backend/src/services/pattern-matcher.ts`, `packages/backend/src/services/similarity.ts`, `packages/backend/src/services/outcome-similarity.ts`, `packages/backend/src/services/outcome-tracker.ts`, likely new tables/materialized views in `packages/backend/src/db/historical-schema.ts` or `schema.ts`, plus UI work under `packages/web/src/pages/History.tsx` and event detail screens. |
| External APIs/data needed | None for a narrow MVP using existing data. For a serious backtester, more historical event coverage and better price data depth would be needed. |
| Realistic dev time | **3-4 weeks** for a credible “query historical cohorts and show distributions” MVP. **6-8 weeks** for a true strategy backtester with rules, entry/exit logic, slippage, and confidence reporting. |
| Infrastructure cost | Low today, because the historical corpus is small. Costs rise once the corpus is expanded and patterns are precomputed. |
| Technical debt/risk | High. Current stats are not fully trustworthy, taxonomy mismatches exist, and the algorithm assumes a small dataset. |

#### Hard constraints from the current code

- Historical corpus size at audit time: **2,423 events**.
- `similarity.ts` caps candidate fetch at **1,000** and scores in JavaScript.
- `outcome-similarity.ts` caps candidate fetch at **100**.
- `/api/historical/similar` on the current dataset responded in about **88 ms** locally.
- `/api/historical/events?eventType=earnings&limit=50` responded in about **61 ms** locally.

That is fine for the **current** corpus. It is not proof that the design scales.

#### Data quality blockers already visible

- `backfill-outcomes.ts` can create `event_outcomes` rows without `event_price`, which prevents usable return calculations later.
- Historical earnings taxonomy and live event taxonomy are mismatched, so some seeded history does not line up with live similarity lookups.
- `/api/v1/outcomes/stats` has filtering issues and can mislead if used as a backtest surrogate.
- `event_type_patterns` is not broadly populated.

#### Recommendation

Reframe this feature as:

- **Near term**: “historical cohort analysis”
- **Later**: “strategy backtesting”

The current codebase can support the first label, not the second.

### 4. Audio Squawk for CRITICAL Alerts

| Question | Answer |
|---|---|
| Can we build it with current codebase? | **Already built, but only in-browser.** |
| Files/modules to change | Existing code is in `packages/web/src/hooks/useAudioSquawk.ts` and `packages/web/src/hooks/useAlerts.ts`. For off-page or server-rendered audio, add backend routes/services and possibly a service worker or native shell. |
| External APIs/data needed | None for the current browser implementation. If server-generated TTS is desired, a TTS provider would be needed. |
| Realistic dev time | **0 days** for basic web squawk because it already exists. **1-2 days** to harden UX and expose more settings. **1-2 weeks** to build a server-generated audio pipeline. |
| Infrastructure cost | Current implementation is effectively zero. Server-side TTS would add small per-audio costs plus object storage/bandwidth. |
| Technical debt/risk | Medium. It only works when the tab is open and visible; hidden tabs are intentionally suppressed. |

#### Important correction to the report

The report says audio squawk does not exist. That is inaccurate.

Current behavior:

- Preferences stored in local storage
- `speechSynthesis` used for playback
- Severity threshold supported
- Invoked on live websocket/feed updates
- Speaking status shown in the app header

Current limitation:

- `useAudioSquawk.ts` exits early when `document.hidden` is true
- This is not mobile push audio
- This is not server-side TTS
- There is no evidence of MiniMax TTS or Edge TTS in this repo

#### Recommendation

Do not build a backend TTS subsystem first. First decide whether the real user need is:

- **web squawk while the tab is open**: already solved
- **mobile/off-page audio alerts**: requires a different architecture and probably a native shell

### 5. Advisor Mode / Client Portfolio Overlay

| Question | Answer |
|---|---|
| Can we build it with current codebase? | **No, not as an incremental feature.** It needs a new domain model and compliance posture. |
| Files/modules to change | New portfolio/client/account tables in `packages/backend/src/db/schema.ts`, new authenticated routes, new advisor UI in `packages/web/src/App.tsx` and new pages, likely delivery/reporting logic in `packages/delivery/`, and new compliance wording across `Terms.tsx` and event views. |
| External APIs/data needed | Portfolio/CRM integrations if this is meant to be real, not demo-only. |
| Realistic dev time | **4-6 weeks** for a fake/manual portfolio overlay MVP. **8-12 weeks** for anything integrating with real advisory workflows. |
| Infrastructure cost | Low for a manual overlay, much higher once CRM or portfolio sync is added. |
| Technical debt/risk | Very high. Compliance, legal review, client data handling, and user-trust risk. |

#### Why this is not “just another page”

Current repo has:

- user watchlists
- notification preferences
- event/ticker detail

Current repo does **not** have:

- positions
- holdings
- portfolios
- clients
- households
- audit trail for recommendations
- advisor-safe templating workflow

Also, the product currently leans away from advice:

- `Terms.tsx` contains non-advisory language
- event-detail components present analysis, not recommendations
- alert filters explicitly avoid advisory/listicle content

#### Recommendation

Do not build “Advisor Mode” before the core trader product is technically reliable.

### 6. Broker API Integration (Alpaca / IBKR)

| Question | Answer |
|---|---|
| Can we build it with current codebase? | **No, not yet.** There is no broker auth, no holdings model, no order model, and no execution UI. |
| Files/modules to change | Add plan/account/connection models in `packages/backend/src/db/schema.ts`, broker auth routes/plugins, portfolio routes, new web pages/components, probably extend `watchlist` into holdings or add a new holdings table, and add audit logging around order intents. |
| External APIs/data needed | Alpaca Connect/OAuth2 or IBKR Web API / Client Portal plus market-data entitlements. |
| Realistic dev time | **7-10 days** for Alpaca read-only account/positions sync. **3-4 weeks** for Alpaca one-click order placement. **4-6 weeks** for IBKR read-only. **6-8 weeks** for IBKR trading. |
| Infrastructure cost | API access itself is not the main issue. Market-data subscriptions, support burden, and legal/compliance review dominate. |
| Technical debt/risk | Very high. Orders change the liability profile of the app. |

#### What Alpaca would actually look like

Based on Alpaca’s official OAuth2 docs:

- user clicks “Connect Alpaca”
- redirect to Alpaca authorization URL
- backend exchanges auth code for bearer token
- backend stores token securely
- use `/v2/account`, `/v2/positions`, `/v2/orders`
- websocket auth can also use the OAuth token

That is feasible and clean.

#### What IBKR would actually look like

IBKR is feasible, but more operationally awkward:

- market-data subscriptions are account-scoped and separately billed
- snapshot and streaming entitlements are modular
- account/session handling is more complex than Alpaca

#### Liability

Today the app is informational. One-click trade moves it toward:

- order-entry UX
- order-status reconciliation
- failed-order handling
- support burden
- compliance and disclosure review

If this is ever shipped, start with **read-only sync**, not trade execution.

### 7. TradingView Widget Embed

| Question | Answer |
|---|---|
| Can we build it with current codebase? | **Yes, but it is not necessary to solve the current gap.** |
| Files/modules to change | `packages/web/src/components/EventChart.tsx`, `packages/web/src/pages/TickerProfile.tsx`, maybe event detail chart components. |
| External APIs/data needed | TradingView widget/license considerations, depending on integration choice. |
| Realistic dev time | **1-2 days** for a simple widget embed. |
| Infrastructure cost | Low. Mostly frontend dependency cost. |
| Technical debt/risk | Medium. Adds third-party UI dependency without fixing the underlying data-quality gaps. |

#### Important context

The app already has charting via `lightweight-charts` and Yahoo-backed price APIs. This is not a “no charts” product. The real issue is **data availability and reliability**, not widget absence.

### 8. Enhanced Discord Bot

| Question | Answer |
|---|---|
| Can we build it with current codebase? | **Partially.** Outbound Discord webhook delivery already exists, but there is no bot. |
| Files/modules to change | `packages/delivery/src/discord-webhook.ts`, `packages/delivery/src/alert-router.ts`, plus a new Discord bot service/module and command routes. |
| External APIs/data needed | Discord bot token, slash-command setup, OAuth or guild-install flow. |
| Realistic dev time | **1-2 weeks** for a useful read/query bot. |
| Infrastructure cost | Low. Mostly a lightweight bot process and Discord API calls. |
| Technical debt/risk | Medium. Another surface to maintain, but less risky than broker work. |

#### Recommendation

This is a reasonable secondary feature after feed reliability is fixed.

### 9. Fix AI Enrichment Reliability

| Question | Answer |
|---|---|
| Can we build it with current codebase? | **Yes.** The persistence path already exists; the issue is coverage/reliability, not missing storage primitives. |
| Files/modules to change | `packages/backend/src/event-pipeline.ts`, `packages/backend/src/pipeline/llm-enricher.ts`, `packages/backend/src/routes/events.ts`, `packages/backend/src/routes/dashboard.ts`, possibly model/provider config. |
| External APIs/data needed | OpenAI or Anthropic provider keys if real enrichment is enabled. |
| Realistic dev time | **2-4 days** to instrument, verify, and fix obvious gaps. **1-2 weeks** to drive reliability higher. |
| Infrastructure cost | Low. `gpt-4o-mini` class enrichment is cheap relative to market-data costs. |
| Technical debt/risk | Medium. LLM failure paths and shadow/enforce gating interactions can create user-visible trust breaks. |

#### Important correction to the report

The code already persists enrichment into `events.metadata.llm_enrichment` in `event-pipeline.ts`, and multiple routes read it back. The report’s “verify that it is actually saved” question was valid, but the storage path is present.

The real problem is likely one of:

- enrichment disabled operationally
- upstream provider not configured
- poor coverage for certain event classes
- frontend not surfacing fallback states well

### 10. Add “Why This Matters” Plain-English Summary

| Question | Answer |
|---|---|
| Can we build it with current codebase? | **Yes, easily.** Most of the underlying enrichment data already exists. |
| Files/modules to change | `packages/backend/src/pipeline/llm-enricher.ts`, `packages/web/src/pages/EventDetail/EventEnrichment.tsx`, feed-card/event-detail components. |
| External APIs/data needed | None beyond the existing enrichment provider if LLM-backed. Could also be done heuristically for known event types. |
| Realistic dev time | **1-2 days**. |
| Infrastructure cost | Near zero incremental cost. |
| Technical debt/risk | Low. |

#### Recommendation

This is one of the highest ROI changes in the report.

### 11. Fix Trending Tickers Data Quality

| Question | Answer |
|---|---|
| Can we build it with current codebase? | **Yes.** |
| Files/modules to change | `packages/backend/src/scanners/ticker-extractor.ts`, `packages/backend/src/routes/tickers.ts`, maybe keyword/ticker filtering helpers and tests. |
| External APIs/data needed | None. |
| Realistic dev time | **1-3 days**. |
| Infrastructure cost | None. |
| Technical debt/risk | Low. |

#### Recommendation

This is a cleanup task, not a roadmap item. It should be done before adding more user-facing discovery surfaces.

### 12. Free Tier / Productized API Tier

| Question | Answer |
|---|---|
| Can we build it with current codebase? | **Not yet.** The app has rate limits and preferences, but no entitlement system. |
| Files/modules to change | Add plan/tier fields in `packages/backend/src/db/schema.ts`, entitlement checks in `packages/backend/src/routes/` and `packages/backend/src/plugins/`, probably adjust `packages/web/src/lib/api.ts`, `packages/web/src/App.tsx`, and websocket auth/limits. |
| External APIs/data needed | Billing provider only if monetized; not needed for a hardcoded beta tier system. |
| Realistic dev time | **1-2 weeks** for a hardcoded free/pro entitlement layer. **2-3 weeks** if billing is included. |
| Infrastructure cost | Current marginal user cost is mostly DB + bandwidth, not LLM. |
| Technical debt/risk | Medium. Without per-user quotas, free users share the same public feed and global limits as everyone else. |

#### Concrete cost observations from the current app

Current web feed behavior is not free-tier efficient:

- `useAlerts()` polls `/api/v1/feed` every **30 seconds**
- default payload with `limit=10` was about **9,716 bytes**
- that is about **28 MB/day** or roughly **0.84 GB/month** per always-open client
- each poll also triggers a **count query + data query** in `routes/dashboard.ts`

At `limit=50`, one feed response was about **44,901 bytes**.

So the current product can support free users technically, but only if:

- free tier disables websocket or lowers poll rate
- feed is delayed or cached
- per-user or per-IP quotas are added

#### Can we rate-limit cheaply?

Yes, but not with the current product model.

What exists today:

- global Fastify rate limit in `app.ts`
- websocket connection/message limits
- push quiet hours and daily caps

What is missing:

- per-user plan enforcement
- per-user API keys
- per-tier websocket rules
- delayed-feed logic

## Scanner Activation Audit

### What the codebase actually has

- **22 scanner classes** wired in `registerScanners()`, including `DummyScanner`
- **1 additional scanner file** (`warn-scanner.ts`) that is **not registered**
- **1 separate Python SEC microservice** also running

That is the closest technical reading of the report’s “23 scanners” claim.

### Scanner matrix

`Live runtime` below refers to the local app at audit time.  
`Upstream check` is a direct network check from this audit host, not from inside the backend container.

| Scanner | Code exists | Registered live | Latest visible events | Source / auth | Upstream check | Reality |
|---|---|---:|---:|---|---|---|
| `dummy` | yes | no | 0 | none | n/a | test-only |
| `truth-social` | yes | yes | yes | `trumpstruth.org/feed`, no key | `200` | viable and live |
| `x-scanner` | yes | no | 0 | `twitterapi.io`, `TWITTER_API_KEY` | `401` | viable only with paid key |
| `reddit` | yes | yes | 0 visible now | Reddit JSON, no key | `403` | fragile/public endpoint |
| `stocktwits` | yes | yes | yes | StockTwits public API | `200` | viable and live |
| `econ-calendar` | yes | yes | yes | local `econ-calendar.json` | n/a | live, but static schedule only |
| `fedwatch` | yes | no | 0 | CME endpoint, no key | `403/000` | source access fragile |
| `breaking-news` | yes | yes | yes | Reuters/AP/MarketWatch/CNBC/Yahoo feeds | mixed: Reuters `404`, RSSHub AP `403`, MW/CNBC/Yahoo `200` | works because some feeds are live, but composition is brittle |
| `congress` | yes | no | 0 | Capitol Trades endpoint, no key | `404` | current URL appears stale |
| `unusual-options` | yes | no | 0 | `phx.unusualwhales.com`, no key in code | `404` | current URL is not usable |
| `short-interest` | yes | no | 0 | Finviz endpoint, no key | `404` | current endpoint appears stale |
| `fda` | yes | no | yes historically | FDA RSS landing page, no key | `403` | implementation is weak and likely not trustworthy |
| `whitehouse` | yes | yes | yes | Federal Register API | `200` | viable and live |
| `doj-antitrust` | yes | no | 0 | DOJ ATR RSS | `404` | current URL appears stale |
| `analyst` | yes | no | 0 | Benzinga endpoint, no key in code | `404` | current URL appears stale |
| `earnings` | yes | no | 0 | Alpha Vantage key or broken Yahoo fallback | Alpha Vantage `200`, Yahoo `200` HTML | source exists; fallback path is buggy |
| `federal-register` | yes | yes | yes | Federal Register API | `200` | viable and live |
| `newswire` | yes | yes | source rows exist | GlobeNewswire RSS only by default | `200` | narrower than docs claim |
| `sec-edgar` | yes | yes | yes | SEC Atom feeds | `200` with proper SEC user-agent | viable and live |
| `ir-monitor` | yes | yes | 0 visible now | company IR pages / RSS | Apple page `403` | source mix is fragile; per-company tuning needed |
| `trading-halt` | yes | yes | yes | Nasdaq Trader RSS + JSON | `200` / `200` | viable and live |
| `dilution-monitor` | yes | yes | 0 visible now | SEC Atom feeds | same SEC status as above | viable, but event rate is naturally low |
| `warn-act` | yes | no | 0 | layoffs.fyi endpoint | `404` | not registered and source appears stale |

### Scanner conclusions

1. The scanner layer is **not dead**, but it is not marketable as “23 live scanners”.
2. The live local system proves a good subset is working.
3. The riskiest scanners are the ones the report most wants for monetization:
   `unusual-options`, `analyst`, `congress`, `short-interest`, `warn-act`.
4. `newswire` is overstated in docs; default code only pulls GlobeNewswire.
5. `warn-act` is pure configuration drift: file exists, env exists, registry wiring missing.
6. SEC is duplicated across TypeScript and Python.

## Specific Technical Questions

### Options flow: what source should we use?

#### Current state

- Current code uses `https://phx.unusualwhales.com/api/option_activity?limit=25` in `packages/backend/src/scanners/options-scanner.ts`.
- That URL returned **404** during this audit.
- The code does not send any API token.

#### Can we use Unusual Whales?

Maybe, but not the way the current code does.

- The current implementation uses what looks like an undocumented or legacy endpoint.
- Official Unusual Whales API documentation now exists at `https://api.unusualwhales.com/`, which suggests the production path is authenticated and productized.
- Public pricing for the API was not cleanly exposed in fetched docs during this audit, which is itself a procurement risk.

#### Can we use CBOE directly?

Yes for **raw options market data**, no for “unusual flow” out of the box.

- CBOE/OPRA data gives quotes/trades.
- It does **not** give ready-made “unusual sweep/block sentiment” events.
- To replicate Unusual Whales-style flow, we would need our own analytics layer over raw options prints.

#### Is there a free alternative?

Not a good one.

- Alpaca’s official market data page says the free/basic plan offers **indicative** options data, not real-time OPRA flow.
- Yahoo and similar retail sources can give chains, not flow analytics.
- So the answer is: **no credible free source for real unusual-options flow**.

#### Recommendation

Do one of these:

1. Buy/authenticate a real unusual-options source and keep the existing event type.
2. Re-scope the feature to “options activity” and build on a cheaper market-data feed.
3. Do not sell this feature yet.

### Catalyst calendar: do we have earnings and FDA dates?

#### Earnings dates

Partially.

- `earnings-scanner.ts` can use Alpha Vantage when `ALPHA_VANTAGE_API_KEY` is set.
- The Yahoo fallback path is not technically valid as written.
- So yes, earnings dates are feasible with a small amount of work.

#### FDA PDUFA dates

Not really.

- The repo has an `fda-scanner.ts`, but it is an event scanner, not a forward-looking PDUFA calendar.
- I did not find an official FDA upcoming PDUFA API integrated here.
- The live codebase has no biotech-calendar table or route.

#### Recommendation

- Earnings calendar: **yes**
- FDA catalyst calendar: **not without a new source decision**
- Lockup expirations: **not with current code**

### Audio squawk: how would real-time audio work architecturally?

#### Current architecture

- websocket/live feed event arrives in the browser
- `useAlerts()` calls `announceEvent(alert)`
- `useAudioSquawk()` uses browser `speechSynthesis`

This is cheap and simple, but only works when:

- the app tab is open
- the document is visible
- browser audio is allowed

#### If we wanted “real” off-page audio

We would need:

1. backend TTS generation route/service
2. audio asset delivery
3. client playback model that survives background state
4. probably a native shell or different platform assumptions

Current repo has none of that.

#### About MiniMax TTS / Edge TTS

I found **no references** to either in this repo. The current system is browser-native speech only.

### Historical pattern backtesting: is 23k enough?

For the current codebase, the better question is: **which 23k?**

- Live event store: yes, about **24.5k total events**
- Usable live verdicts: **6,438**
- Historical curated corpus: **2,423**

That means:

- enough for by-source and broad-category scorecards
- enough for simple cohort stats on common event types
- **not enough** for statistically serious niche-pattern research

And even before sample size, the code has quality issues:

- outcome backfill gaps
- taxonomy mismatch
- incomplete pattern tables
- JS-side scoring with small-dataset assumptions

### Broker API: what does Alpaca / IBKR integration really mean?

#### Alpaca

Technically cleanest path:

- OAuth2 connect flow
- store bearer token
- fetch positions and balances
- optional order placement via `/orders`

The docs explicitly describe third-party OAuth2 for Trading API access.

#### IBKR

Technically possible, but operationally heavier:

- more fragmented data entitlements
- more complex account/session expectations
- higher user-support burden

#### Liability

Read-only portfolio sync is mostly an engineering problem.  
One-click trading is also a:

- product-policy problem
- support problem
- legal/disclosure problem

### Free tier: what is the actual infra cost per free user?

#### Current marginal cost drivers

- repeated feed polling against Postgres
- websocket connection load
- bandwidth from feed JSON
- almost no incremental LLM cost, since free users mainly consume already-ingested data

#### Concrete current behavior

- default feed poll every **30s**
- about **9.7 KB** per `limit=10` response
- about **28 MB/day** of feed bandwidth per always-open client
- about **2,880 feed requests/day** per always-open client
- each feed request currently does a **count query and a data query**

#### Cheap rate limiting?

Yes, if we build the entitlement layer.

Cheap controls:

- delayed feed for free users
- lower poll interval
- no websocket for free users
- page-cache hot feed
- per-user/API-key quotas

Without those, a free tier is operationally sloppy even if not ruinously expensive.

## What I Would Actually Build Next

### Tier 1: worth doing immediately

1. Fix scanner truthfulness.
   Wire `warn-act` or delete it from docs. Mark stale scanners honestly.

2. Fix enrichment UX and reliability.
   The storage path exists; make coverage and fallback trustworthy.

3. Ship a real macro + earnings calendar page.
   Do not wait for FDA/lockup perfection.

4. Fix trending ticker extraction.
   Cheap credibility win.

5. Keep browser squawk, do not overbuild TTS.

### Tier 2: do only after the above

1. Productized API access
2. Read-only broker sync
3. Historical cohort query UI
4. Discord bot

### Tier 3: do not pretend these are “near-term”

1. Real options-flow product
2. True backtesting engine
3. Advisor mode
4. One-click trading

## Bottom Line

The report’s best instincts are:

- more visible scanners
- more trust-building summaries
- a forward-looking catalyst surface
- better historical context

Its weakest assumptions are:

- that the scanner layer is one switch-flip away from 23-source coverage
- that historical backtesting is already mostly built
- that audio squawk is missing
- that broker/advisor features are incremental

The codebase today is strong enough to ship a better **trader-focused event intelligence app**.  
It is not yet strong enough to ship a reliable **options-flow platform**, **portfolio-integrated terminal**, or **advisor operating system**.

## External Source Notes

Official sources checked during this audit:

- Alpha Vantage pricing: https://www.alphavantage.co/premium/
- Alpaca OAuth2 + Trading API: https://docs.alpaca.markets/docs/using-oauth2-and-trading-api
- Alpaca market data docs/pricing overview: https://docs.alpaca.markets/docs/about-market-data-api
- Alpaca public market-data plan summary: https://alpaca.markets/data
- Interactive Brokers market-data pricing: https://www.interactivebrokers.com/en/pricing/market-data-pricing.php
- Unusual Whales API docs root: https://api.unusualwhales.com/

What I did **not** find cleanly:

- a reliable free unusual-options-flow source
- an integrated official FDA PDUFA calendar API already usable from this repo
- any existing MiniMax TTS or Edge TTS integration in this codebase
