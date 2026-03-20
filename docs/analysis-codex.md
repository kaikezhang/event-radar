# Event Radar Analysis

Author: Codex
Date: 2026-03-20

## Scope And Method

This document is based on:

- direct codebase review across `packages/backend`, `packages/web`, `packages/dashboard`, `packages/shared`, `packages/delivery`, and `services/sec-scanner`
- direct command-line validation of repository shape, test/build tooling, and selected test runs
- competitor research from public web sources, prioritizing official product and pricing pages

I am separating:

- **code-confirmed facts**: directly supported by the repository
- **market-confirmed facts**: directly supported by vendor websites
- **inferences**: judgment calls based on those two inputs

## Executive Summary

Event Radar is already more than a prototype. The repository contains a real multi-source event ingestion system, a non-trivial Fastify backend, persistent PostgreSQL models for outcomes and auditability, two separate React frontends, a delivery package, and a Python SEC microservice.

The strongest part of the product is the **backend event pipeline plus observability layer**. The weakest part is **operational maturity and consistency**: architecture docs are partly stale, the system is still single-process and heavily in-memory, frontend tests are not stable, and some advertised capabilities are only partially wired in the live path.

My top-level conclusion:

- **As a self-hosted event intelligence stack, Event Radar is differentiated and promising.**
- **As a reliable commercial market terminal, it is not yet hardened enough.**
- **The best path forward is not “more sources first”; it is reliability, consistent identity/auth, durable pipeline state, and sharper product packaging.**

## Codebase Reality Snapshot

### What the repo actually is

Code-confirmed:

- Root monorepo uses `pnpm` workspaces and Turborepo.
- Active product packages are `packages/backend`, `packages/web`, `packages/dashboard`, `packages/shared`, and `packages/delivery`.
- There is also a Python SEC service in `services/sec-scanner`.
- The live frontend is **not** Next.js. Both `packages/web` and `packages/dashboard` are Vite + React apps.

Important drift:

- `AGENTS.md`, `tasks.md`, `docs/ARCHITECTURE.md`, and `docs/FRONTEND.md` still describe a Next.js 15 frontend and a slightly different package layout.
- The codebase itself says otherwise. This documentation drift is now material enough to create planning risk.

### Rough size

Code-confirmed:

- `packages/backend/src`: 292 files
- `packages/web/src`: 78 files
- `packages/dashboard/src`: 28 files
- `packages/shared/src`: 37 files
- `services/sec-scanner`: 6 Python tests and a working FastAPI service

Large files worth calling out:

- `packages/backend/src/app.ts`: 1418 lines
- `packages/backend/src/routes/ai-observability.ts`: 1453 lines
- `packages/backend/src/routes/dashboard.ts`: 1007 lines
- `packages/web/src/pages/Feed.tsx`: 989 lines
- `packages/web/src/pages/EventDetail.tsx`: 1206 lines

Inference:

- The system has enough feature depth to justify the current size, but maintainability is being carried by discipline rather than module boundaries.

## Project Assessment

### 1. Architecture Quality

#### What is good

Code-confirmed:

- Backend composition is coherent: scanners publish raw events, the pipeline classifies and filters them, events are persisted, and delivery is handled through a separate package.
- `packages/shared` gives the repo a real contract layer with schemas for rules, feedback, outcomes, similarity, history, delivery, and alert budgets.
- `BaseScanner` implements a solid common runtime model: polling loop, health state, timeout/error backoff, and event publication.
- Delivery is reasonably decoupled through `AlertRouter` and channel abstractions.
- Observability is first-class, not bolted on later: Prometheus metrics, health endpoints, pipeline audit tables, dashboard routes, and AI observability routes all exist.

#### What is weak

Code-confirmed:

- The system still runs as a **single Fastify process** built in `packages/backend/src/app.ts`.
- The event bus is an in-process `EventEmitter` wrapper in `packages/shared/src/in-memory-event-bus.ts`.
- Dedup window state, some story state, and parts of filter cooldown logic remain process-local.
- A plugin loader exists, but startup still statically wires scanners; the plugin system is not the actual production entry path.

Inference:

- This is good application architecture for a self-hosted v1, but not yet good distributed systems architecture.
- The main risk is not raw throughput first. The main risk is **consistency across restarts and future horizontal scale**.

#### Biggest architectural gap

The repo documents “Redis Streams later,” but the current live behavior still depends on local memory for:

- event transport
- recent dedup memory
- story tracking
- parts of rate/cooldown behavior

That means:

- no replay
- no durable queue
- no cross-instance coordination
- restart behavior can change alert quality

### 2. Scanner Coverage And Source Health

Code-confirmed:

- There are 23 `*Scanner extends BaseScanner` implementations under `packages/backend/src/scanners`.
- 22 scanners are registered in `app.ts`; `WarnScanner` exists but is not registered in the live startup path.

Current implemented scanner families include:

- regulatory/government: SEC EDGAR, FDA, DOJ, White House, Federal Register, Congress
- market/macro: FedWatch, economic calendar, earnings, halts, short interest, dilution, unusual options
- news: breaking news RSS, PR Newswire, BusinessWire, GlobeNewswire via `NewswireScanner`, IR monitor
- social: Reddit, Stocktwits, X, Truth Social

What is strong:

- breadth is already real, not aspirational
- SEC coverage is deeper than most retail products because it includes dedicated parsing logic and a separate Python service
- scanner runtime health and backoff are implemented centrally instead of ad hoc

What is weak:

- the marketed “30+ sources” story is ahead of the code
- some scanners rely on scraping or brittle upstream interfaces
- IR monitor coverage is narrow by default
- not every implemented scanner is clearly production-enabled in `.env.example`

Inference:

- Coverage is strong for a small open-source product, but source quality is mixed. Event Radar’s edge is not simply “we have more sources”; it is “we have a better shape of source mix for event-driven trading than most open tools.”

### 3. Pipeline Reliability

The live path in `app.ts` is:

1. ingest raw event
2. rule classification
3. dedup
4. DB store
5. live-feed publish
6. alert filter
7. LLM judge
8. LLM enrichment
9. delivery gate
10. historical enrichment
11. channel routing

#### What is strong

Code-confirmed:

- pipeline audit records are persisted in `pipeline_audit`
- outcomes, predictions, source weights, story groups, push subscriptions, and preferences all have schema support
- there is a bounded `PipelineLimiter`
- there is a delivery kill switch
- there is a startup grace period to reduce duplicate floods after restart
- delivered alerts can be read back through `delivery-feed` routes

#### What is weak

Code-confirmed:

- the pipeline LLM classifier is optional and is **not enabled by the default server boot path** because `index.ts` does not pass an `llmProvider` into `buildApp`
- story-group read APIs exist, but ingest-time assignment is not part of the live pipeline
- source naming is inconsistent enough to create policy errors during LLM gatekeeper fallback
- `DeliveryGate` can sharply reduce alert throughput when enrichment is missing or disabled

Inference:

- The product feels architected for high-quality alerts, but some of its quality logic is now fragile because the system relies on side effects from several optional subsystems at once.
- The right near-term move is simplification and contract tightening, not more complex filtering.

### 4. Dashboard And Web UX

#### End-user app (`packages/web`)

Code-confirmed:

- route surface already includes feed, event detail, ticker profile, onboarding, watchlist, search, settings, login, auth verify, and scorecard
- feed supports watchlist/all modes, URL-backed filters, filter presets, trust cues, swipe interactions, inline detail behavior, and websocket updates
- event detail is unusually rich for this stage: provenance, charting, historical analogs, trust/confidence framing, and feedback capture
- settings include push-related user preferences

Strengths:

- mobile-first design is intentional rather than incidental
- event detail is a credible product surface, not a placeholder
- watchlist workflow is meaningfully developed
- scorecard and trust cues align with the product’s “show receipts” thesis

Weaknesses:

- page components are too large
- client-side types are duplicated instead of reusing `@event-radar/shared`
- there is a navigation/discoverability mismatch: `/scorecard` exists, but bottom navigation omits it while the test still expects it

#### Operator dashboard (`packages/dashboard`)

Code-confirmed:

- overview, alert feed, audit trail, and historical summary exist
- data is polled every 15 seconds
- admin controls depend on API key handling in the client

Weaknesses:

- navigation is local tab state, not route-based
- deep linking is weak
- auth is operator-oriented but not productized

Inference:

- The user app is approaching “usable product.”
- The operator dashboard is useful internally, but still feels like an internal tool rather than a polished admin console.

### 5. Test Coverage And CI/CD Maturity

#### Coverage breadth

Code-confirmed:

- 110 backend test files
- 24 web tests
- 9 delivery tests
- 6 Python SEC-service tests
- 133 total `*.test.*` or Playwright spec files found in the repo

#### Coverage quality

Strengths:

- backend coverage is broad across routes, scanners, outcome tracking, rules, delivery, and observability
- shared package has schema and primitive coverage
- dashboard has mocked page tests
- there is at least one Playwright flow for auth verify in `packages/web/e2e`

#### Stability reality

Code-confirmed from direct run on 2026-03-20:

- `pnpm --filter @event-radar/web test` is not stable
- failures include:
  - `Maximum update depth exceeded` in `src/hooks/useAlerts.test.tsx`
  - `window.matchMedia is not a function` in feed-related tests
  - `lightweight-charts` / jsdom failures in `src/pages/EventDetail.test.tsx`

CI reality:

- `.github/workflows/ci.yml` runs build, lint, and selected tests
- E2E is explicitly disabled in CI
- backend CI test step uses a timeout workaround and echoes a message about PGlite cleanup issues

Inference:

- The repo has good **test intent** and decent **test breadth**, but test reliability is not yet at release-gating quality.
- The build pipeline is adequate for open-source iteration and inadequate for commercial confidence.

### 6. Security Posture

#### What is good

Code-confirmed:

- magic-link auth exists
- JWT access and refresh flow exists
- CSRF cookie/header check exists for state-changing JWT-authenticated requests
- rate limiting is present
- secrets are env-based
- `validateJwtConfig()` fails fast when `AUTH_REQUIRED=true` but `JWT_SECRET` is missing

#### What is risky

Code-confirmed:

- default posture is effectively open/shared when `AUTH_REQUIRED` is not explicitly `true`
- unauthenticated requests can be treated as user `default`
- watchlist, preferences, and push-subscription behavior therefore collapse toward single-user semantics unless operators configure auth correctly
- websocket auth allows API key in query string
- auth rate limiting is in-memory, not durable or distributed
- push subscription material is stored directly in DB

Inference:

- Security is acceptable for self-hosted single-user deployment.
- It is not acceptable yet for a serious multi-user hosted product without hardening defaults, key handling, and identity isolation.

### 7. Performance And Scalability

Code-confirmed:

- `PIPELINE_MAX_CONCURRENT` defaults to 5
- enrichment and gatekeeping depend on network calls and optional third-party APIs
- metrics and audit routes are extensive enough to expose bottlenecks

Likely bottlenecks:

- enrichment latency
- single-process scheduling pressure
- process-local queueing during burst events
- DB hot paths on event/audit tables as history grows

Inference:

- The current architecture should be fine for one self-hosted operator and modest traffic.
- It is not ready for “many tenants + always-on alerts + bursty market open” without durable queues, tighter indexing strategy, and clearer worker separation.

## Competitive Landscape

### Market segmentation

The named competitors split into four groups:

1. **Retail alert/news terminals**
   Unusual Whales, Benzinga Pro, MarketBeat, Stocktwits subscriptions, TipRanks, The Fly, Hammerstone, Trade Ideas

2. **AI or quant retail products**
   Kavout

3. **Enterprise market intelligence / alt-data platforms**
   AlphaSense, Accern, Sentifi

4. **Open-source / build-it-yourself**
   OpenBB and adjacent OSS finance tooling

Event Radar is not a direct 1:1 substitute for all of them. Its closest strategic position today is:

- **retail-terminal feature mix**
- with **open-source self-hosting economics**
- and **enterprise-style internal observability**

### Comparison matrix

Pricing is “as visible publicly on 2026-03-20.” Enterprise vendors often hide exact commercial terms.

| Product | Core angle | Public pricing visibility | What they do better | Where Event Radar is stronger |
|---|---|---:|---|---|
| Unusual Whales | options flow, congressional data, alerts, retail trader community | Official docs still show older tiers; current public pricing is not clearly exposed in the docs snippet | cleaner retail packaging around options flow and congressional signals | broader event-source mix, self-hosting, pipeline auditability, historical context layer |
| Benzinga Pro | fast newsfeed, squawk, scanners, calendars, AI research | Basic $37/mo, Streamlined $147/mo, Essential $197/mo on official pricing page | polished real-time news workflow, strong trader UX, audio and scanner packaging | richer open event pipeline, better internal observability, more transparent outcome-tracking architecture |
| MarketBeat All Access | investor alerts, ratings, insider/institutional data, screeners | $249/year on official comparison page | low-friction consumer packaging, alerts, portfolio monitoring, analyst/insider content density | better real-time event architecture and delivery logic |
| Stocktwits subscriptions | social sentiment and market community | Ad Free $85/year, Edge $229.50/year, Enterprise API contact on official subscriptions page | social graph, distribution, native community data | much stronger event classification, non-social sources, trust/audit framing |
| TipRanks | analyst rankings, insider and hedge-fund aggregation, expert center | pricing is promo-heavy and not cleanly exposed in public official pages searched | stronger analyst/expert packaging and retail trust branding | stronger real-time event ingestion and alert-routing logic |
| Trade Ideas | scanner-first active trading platform with AI signals | Basic $89/mo, Premium $178/mo on official pricing page | mature scanner UX, execution-oriented workflow, backtesting and AI signals | wider catalyst-source coverage and richer event provenance |
| The Fly | curated breaking market intelligence and event calendar | Basic $44.99/mo, Full Access $74.99/mo on official rates page | highly focused institutional-style news curation and faster “headline desk” feel | broader source automation, delivery options, self-hosting, scorecard direction |
| Hammerstone | curated news/chat/newsfeed for traders and desks | Individual $39-$69/mo, institutional $299-$329/mo, enterprise tiers public | clearer desk-style curation and professional chat/newsfeed positioning | more software-native pipeline design, richer persistence, broader programmable architecture |
| Kavout | AI investing assistant, smart signals, watchlist alerts | Free, Pro $16/mo annualized, Premium $39/mo annualized | cheaper AI-first packaging, broader global market coverage, simpler consumer story | deeper event-driven architecture and source-specific ingestion |
| AlphaSense | enterprise search, transcripts, expert calls, alerts | no simple public seat price; free trial and enterprise motion | unmatched research corpus, transcript depth, enterprise search UX | real-time trading-event focus and lower deployment cost |
| Accern | no-code AI research/monitoring workflows | public product pages, but no straightforward public pricing found | stronger no-code AI workflow framing and general-purpose enterprise data research | better event-driven trading specialization and user-facing alert productization |
| OpenBB | open platform for financial data apps and workspace | Community free; Pro seat-based; ODP open-source | much stronger OSS platform/community story and enterprise deployment packaging | more opinionated event-alert pipeline and built-in delivery stack |

### What competitors do better

#### Better product packaging

Market-confirmed/inference:

- Benzinga Pro, Trade Ideas, The Fly, and Hammerstone each communicate a very clear value proposition in one sentence.
- Event Radar still reads like a powerful system rather than a crisp product.

#### Better speed-to-trust

- TipRanks and MarketBeat are better at answering “why should I trust this signal?” for mainstream retail investors.
- Event Radar has better raw ingredients for trust, but the message is more technical than user-centered.

#### Better workflow polish

- Trade Ideas is stronger as a trader workstation.
- Benzinga Pro is stronger as a real-time news desk.
- AlphaSense is vastly stronger for search and research workflow depth.

#### Better GTM focus

- OpenBB has a cleaner split between free/open and commercial tiers.
- Hammerstone and The Fly have clearer professional-vs-individual packaging.
- Event Radar currently tries to be self-hosted software, trader app, and intelligence platform at once.

### What Event Radar does uniquely

Event Radar’s best differentiated claims are:

1. **Open-source, self-hostable event-driven trading intelligence**
2. **Multi-source alert pipeline with auditability**
3. **Built-in outcome tracking and scorecard direction**
4. **Configurable delivery stack across Discord, Bark, Telegram, webhook, web push**
5. **A real bridge between scanner ingestion and user-facing trust cues**

That is a meaningful niche. None of the better-known retail terminals combine those attributes cleanly.

### Missing or weakly verifiable competitors

I could verify current official pages for Benzinga Pro, MarketBeat, Stocktwits, The Fly, Trade Ideas, Hammerstone, OpenBB, Kavout, AlphaSense, and Accern.

I could not confidently verify clean current public pricing for:

- TipRanks
- Sentifi
- current Unusual Whales pricing beyond older official docs that explicitly point readers to a separate pricing page

That itself is informative:

- enterprise vendors often hide pricing by design
- promo-heavy retail vendors often obscure stable list pricing

## Strategic Positioning

My current positioning take:

- **Do not try to beat Benzinga Pro at being Benzinga Pro.**
- **Do not try to beat AlphaSense at enterprise search.**
- **Do not try to beat Trade Ideas at execution-centric scanners.**

Instead, Event Radar should own:

> self-hosted, event-driven, AI-assisted alert intelligence with visible receipts

That is where the codebase already has authentic substance.

## Roadmap

### Short Term: 1-2 Months

Priority order favors reliability over expansion.

| Priority | Work | Effort | Why it matters |
|---|---|---:|---|
| P0 | Fix auth defaults and multi-user isolation | 3-5 days | Current default-open behavior blocks serious hosted use |
| P1 | Stabilize web tests and re-enable meaningful CI gating | 4-6 days | Product confidence is currently overstated by test-file count |
| P2 | Eliminate source-name drift and pipeline contract mismatches | 2-3 days | Prevents silent policy errors in gatekeeping and routing |
| P3 | Wire story-group assignment into the live ingest path or remove the claim | 2-4 days | Reduces product/doc drift and dead-surface risk |
| P4 | Decompose `app.ts`, `Feed.tsx`, and `EventDetail.tsx` | 4-7 days | Maintainability now depends on senior attention |
| P5 | Update docs to match the codebase reality | 1-2 days | Current architecture docs are materially stale |

Short-term product improvements worth doing only after reliability:

- add scorecard to persistent primary navigation
- tighten onboarding around watchlist + push + trust explanation
- clarify “feed only” vs “push-worthy” signal tiers in UI language

### Medium Term: 3-6 Months

| Priority | Work | Effort | Why it matters |
|---|---|---:|---|
| P6 | Move from in-memory bus to durable queue/event log | 2-4 weeks | Biggest structural upgrade in the whole system |
| P7 | Split scanners, pipeline workers, and API into separate runtime roles | 2-4 weeks | Enables sane scaling and restart behavior |
| P8 | Unify frontend types with shared contracts | 1 week | Reduces drift and client/server mismatch |
| P9 | Add proper history browser, sector/event explorer, and operator deep links | 2-3 weeks | Converts strong backend data into stronger user value |
| P10 | Add team/admin roles and operator auth for dashboard | 1-2 weeks | Needed for any commercial or hosted deployment |
| P11 | Expand source quality, not just count | ongoing | Better IR/watchlist coverage, better corporate event quality, better false-positive control |

Monetization-prep ideas:

- hosted single-user pro tier
- hosted small-team tier with shared workspaces and role-based access
- premium source packs or higher-frequency source packs
- alert templates for biotech, macro, policy, and small-cap event desks

### Long Term: 6-12 Months

| Priority | Work | Effort | Why it matters |
|---|---|---:|---|
| P12 | Learn-to-rank alert quality from historical outcomes and user feedback | 4-8 weeks | This is the most defendable intelligence moat available to the product |
| P13 | Build source- and regime-aware alert personalization | 3-5 weeks | Better than blunt severity-based routing |
| P14 | Add enterprise deployment modes, audit exports, SSO, and tenancy boundaries | 4-8 weeks | Required for serious teams |
| P15 | Add replay/backfill/simulation tooling on top of durable event storage | 3-6 weeks | Makes the platform researchable, not just operational |
| P16 | Add external data connectors and user-authored source packs | ongoing | Broadens ecosystem and defensibility |

## Recommended Technical Architecture Changes

### A. Durable event transport

Move from in-process `EventEmitter` semantics to a durable queue or stream.

Practical options:

- Redis Streams
- Postgres-backed queue as an interim step
- Kafka/Redpanda only if scale actually justifies it later

For this repo, Redis Streams is the most natural next step.

### B. Separate runtime roles

Split into:

- scanner workers
- pipeline/enrichment workers
- API/websocket server
- scheduled jobs for outcomes and cleanup

This reduces blast radius and makes scale behavior clearer.

### C. Normalize domain contracts

Tighten:

- source identifiers
- event type naming
- delivery-tier naming
- shared frontend/backend types

Right now too much product correctness depends on convention.

### D. Harden hosted-product security

Minimum changes before serious hosting:

- default `AUTH_REQUIRED=true` in production paths
- remove query-string API key auth from websocket path
- stop collapsing unauthenticated traffic into shared `default` user semantics
- add role separation for dashboard/admin actions
- move rate limiting to shared durable storage

### E. Make scorecard the moat

The most valuable long-term product asset is not “more AI.”
It is:

- event history
- source-level hit rates
- regime-conditioned outcomes
- user feedback
- delivery and engagement traces

Event Radar should invest more in calibration and less in generic summarization.

## Final Recommendation

If I were prioritizing as product owner, I would do this:

1. harden auth, contracts, and tests
2. fix documentation drift
3. move pipeline transport to durable infrastructure
4. sharpen the product around “receipts-backed event intelligence”
5. only then expand source count and premium feature surface

Event Radar already has enough code to be interesting.
It does not yet have enough operational discipline to be reliably trusted as a serious hosted intelligence product.

That is fixable, and the repo’s current shape suggests the highest ROI is in reliability and packaging, not invention from scratch.

## External Sources

Official or vendor-controlled sources used for competitor research:

- Benzinga Pro pricing: https://www.benzinga.com/pro/pricing
- MarketBeat subscriptions: https://www.marketbeat.com/compare-products/
- Stocktwits subscriptions: https://stocktwits.com/subscriptions
- The Fly rates: https://thefly.com/rates.php
- Trade Ideas pricing: https://www.trade-ideas.com/pricing/
- Hammerstone trial and product pages: https://www.hammerstonemarkets.com/trial/ and https://www.hammerstonemarkets.com/
- Hammerstone enterprise pricing: https://www.hammerstonemarkets.com/enterprise/
- OpenBB pricing: https://openbb.co/pricing/
- AlphaSense expert insights: https://www.alpha-sense.com/platform/expert-insights and related AlphaSense product/help pages
- Accern Rhea and Titan product pages: https://www.accern.com/products/rhea and https://www.accern.com/products/titan
- Kavout pricing plans: https://www.kavout.com/pricing-plans
- Unusual Whales official docs and FAQ: https://docs.unusualwhales.com/faq/ and related docs pages
- TipRanks official content and product surfaces: https://www.tipranks.com/ plus official TipRanks content surfaced in search results

Notes:

- Unusual Whales public docs still expose older pricing information and explicitly point readers to a pricing page for up-to-date pricing, so I treated current-price certainty there as low.
- TipRanks and several enterprise vendors do not expose clean, stable list pricing in the same way as retail peers; where pricing was not clearly verifiable, I treated that as “public pricing not straightforward.”
