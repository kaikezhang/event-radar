# Architecture Review — Event Radar

*Reviewed by: Senior Product Architect perspective*
*Date: 2026-03-09*
*Status: Pre-alpha (documentation only)*

---

## Executive Summary

Event Radar has genuinely impressive documentation for a pre-alpha project. The vision is clear, the market gap is real, and the competitive positioning is sharp. The Block 8-K example alone sells the product.

However, the project currently reads like a "build everything" manifesto rather than a focused launch plan. 30+ sources, 6 tiers, AI classification, correlation engine, backtesting, professional dashboard — this is 12-18 months of work for a small team, not 16 weeks. The biggest risk isn't technical; it's drowning in scope before delivering anything usable.

Below is a section-by-section breakdown of what works, what doesn't, and what needs to change to make this world-class rather than another ambitious side project that stalls at Phase 1.

---

## 1. Product Vision

**File**: `docs/VISION.md`

### What Works

- The Block (XYZ) example is the single most persuasive thing in the entire project. Concrete, verifiable, with exact timestamps and a 23.5% move. Lead with this everywhere — README, landing page, pitch.
- The "What This Is NOT" section is excellent. Shows maturity and prevents scope creep discussions.
- The competitive landscape table is devastating. Every row makes the case for Event Radar.

### Issues

**1.1 — The "2-hour gap" framing is misleading**

The information chain diagram suggests retail traders are 2+ hours behind SEC filings. In reality, the gap is between *primary source publication* and *mainstream media coverage*. Institutional algorithms parse EDGAR in milliseconds. You're not competing with Goldman's co-located servers. You're giving retail traders access to the *same primary sources* that used to require a Bloomberg terminal or a custom data pipeline.

*Why it matters*: If a user expects to beat HFT firms by 2 hours, they'll be disappointed. If they understand they're getting Bloomberg-level source access for free, they'll be thrilled.

*Fix*: Reframe the value prop as "Bloomberg-level source access, not Bloomberg-level speed." The edge is *breadth of monitoring* (30+ sources a single person can't watch) and *AI classification* (instant signal extraction from unstructured filings), not raw latency vs institutions.

**1.2 — No sustainability model**

The competitive table proudly shows "Free" as the price. But infrastructure costs money. SEC polling, LLM API calls, Bark server, database storage, Grafana — this has a real monthly cost. For a project aspiring to be "industry-leading," there's no plan for how it sustains itself.

*Why it matters*: Open-source projects die when maintainers burn out paying server bills. Users need confidence this won't disappear.

*Fix*: Add a sustainability section. Options: (a) self-hosted only (user pays their own infra), (b) optional hosted tier with premium features (multi-user, managed alerts), (c) sponsorship model, (d) dual-license. Even just acknowledging this is enough for now.

**1.3 — Success metrics need baselines and measurement plans**

"> 85% correct type + direction" — measured how? Against what labeled dataset? "< 15% of HIGH+ alerts" — who decides what's a false positive?

*Fix*: For each metric, add: how it's measured, what constitutes ground truth, and when measurement begins. "Classification accuracy: measured against manually-labeled sample of 200 events per quarter."

**1.4 — Long-term vision Phase 3 is a premature leap**

"Backtesting marketplace — share and validate event-driven strategies with historical data." This is a completely different product (social trading / strategy platform). Including it in the vision muddies the focus.

*Fix*: Keep the long-term vision to two phases: (1) best event detection, (2) community-contributed scanners. Save the marketplace idea for a separate document. If anything, Phase 3 should be "API + programmatic access" — letting quants build on top of your data.

---

## 2. Source Coverage

**File**: `docs/SOURCES.md`

### What Works

- The 6-tier system is logical and well-organized.
- Source Priority Matrix (fast/slow vs high/low impact quadrant) is an excellent prioritization tool.
- The 8-K item breakdown with historical impact and direction is deeply practical — this shows domain expertise.
- Social signal anomaly detection (10x baseline, sentiment flip) is the right approach vs naive mention counting.

### Issues

**2.1 — Critical missing sources**

Several high-impact sources are absent:

| Missing Source | Why It Matters | Suggested Tier |
|---|---|---|
| **Earnings call transcripts (real-time)** | CEO tone, forward guidance language, and Q&A surprises move stocks more than the earnings numbers themselves. Services like Rev.com or AssemblyAI can transcribe in near-real-time. | Tier 3 |
| **Bankruptcy filings (PACER)** | Chapter 11 filings are massive events. PACER has an API. | Tier 1 |
| **FDIC bank actions** | Bank closures, enforcement actions. SVB-style events. | Tier 1 |
| **Crypto regulatory actions** | Given Trump and Musk both move crypto markets, SEC crypto enforcement and executive orders on digital assets are high-impact. | Tier 1 or Tier 2 |
| **Supply chain disruptions** | Port closures, shipping route changes (Suez, Panama), chip shortage announcements. | Tier 5 |
| **Activist investor 13D amendments** | Not just initial 13D filings but amendments showing increased/decreased stakes. | Tier 6 |

*Fix*: Add these to the source catalog. Prioritize earnings transcripts and bankruptcy filings for Phase 1 — they're high-signal and relatively easy to integrate.

**2.2 — Scraping fragility is under-discussed**

Truth Social (no API), WARN Act (state labor department sites), analyst ratings (TipRanks, MarketBeat) — these all depend on web scraping. Scraping breaks constantly. Sites change layouts, add CAPTCHAs, block IPs, or send cease-and-desist letters.

*Why it matters*: If your highest-priority scanner (Trump posts) depends on scraping a hostile target, your "Critical" tier has a single point of failure that could break any day.

*Fix*: For every scraped source, document: (a) legal risk assessment (ToS review), (b) fallback strategy (3rd-party aggregator, manual monitoring), (c) expected maintenance burden. Consider using a third-party Trump post aggregator as primary, with direct scraping as fallback — not the other way around.

**2.3 — Polling intervals need justification**

Why is Trump 15s but Musk 30s? Why is PR Newswire 60s but FDA 5min? Some of these seem arbitrary.

*Fix*: Add a column explaining the rationale. "15s — Trump posts can move markets in under 1 minute; 15s polling ensures detection within 30s worst-case." This also helps community contributors understand the design intent when adding new scanners.

**2.4 — No data quality/validation discussion**

What happens when SEC EDGAR returns malformed data? When a Truth Social scrape captures a reply instead of a new post? When an RSS feed has duplicate entries?

*Fix*: Add a "Data Quality" section covering: input validation per source, deduplication strategy (hash-based? content similarity?), and how malformed data is handled (drop silently? log and alert? quarantine for review?).

---

## 3. Architecture

**File**: `docs/ARCHITECTURE.md`

### What Works

- Scanner plugin architecture is the right pattern. Independent polling loops with crash isolation is exactly how you build a resilient multi-source system.
- Unified Event schema is clean and covers the right fields.
- Two-stage AI classification (rule-based pre-filter + LLM) is smart — it controls costs and latency while still leveraging AI where it adds value.
- Observability from day one (Prometheus + Grafana + structured logging) is a sign of production-grade thinking.

### Issues

**3.1 — The event bus is undefined (critical gap)**

The architecture says "Scanners emit events into a shared event bus" but never defines what this bus is. In-memory EventEmitter? Redis Streams? Bull queue? Kafka? This is the most important architectural decision in the entire system and it's hand-waved.

*Why it matters*: If it's in-memory, you lose events on crash. If it's Redis, you need Redis infrastructure. If it's Kafka, you've introduced massive operational complexity. The choice affects durability, ordering, replay capability, and horizontal scaling.

*Fix*: Define the event bus explicitly. Recommendation: **Redis Streams** for Phase 0-3 (lightweight, persistent, supports consumer groups, built-in replay). Start with a simple Node.js EventEmitter behind an interface that can be swapped to Redis later. Document the interface so the swap is clean.

**3.2 — Mixed-language complexity is unaddressed**

The backend is Node.js/TypeScript, but the primary SEC parsing library (edgartools) is Python. This means either: (a) running a separate Python process/service, (b) calling Python from Node via child_process, or (c) rewriting the SEC parsing in TypeScript.

*Why it matters*: Options (a) and (b) add significant deployment complexity, inter-process communication overhead, and debugging difficulty. Option (c) loses the benefit of edgartools. This is a real architectural tension that needs a decision.

*Fix*: Pick one approach and document it. Recommendation: Run edgartools as a lightweight Python microservice (FastAPI) that the Node.js scanner calls via HTTP. This keeps the language boundary clean, lets you test the SEC parser independently, and aligns with the scanner plugin model. Alternatively, reconsider making the backend Python (FastAPI) — the polling/async workload works fine in Python with asyncio, and you eliminate the language mismatch entirely.

**3.3 — No authentication/authorization architecture**

The system stores user watchlists, alert preferences, and has a web dashboard accessible remotely (Cloudflare Tunnel). There's no discussion of auth.

*Why it matters*: Even for a single-user self-hosted system, you need auth. The dashboard exposes market intelligence. The config contains API keys. The Cloudflare Tunnel makes it internet-accessible.

*Fix*: Add an auth section. For V1: basic auth or API key (already mentioned briefly in Roadmap). For V2: consider OAuth2 or OIDC if multi-user support is added. Document the threat model — what's at risk if someone gains unauthorized access?

**3.4 — SQLite to PostgreSQL migration is hand-waved**

"SQLite → PostgreSQL" with "Start simple, scale when needed." This is a well-known trap. SQLite and PostgreSQL have different SQL dialects, concurrency models, and operational characteristics. Code written for SQLite doesn't just "work" on PostgreSQL.

*Fix*: Either commit to PostgreSQL from day one (Docker Compose makes this trivial — it's one more container) or commit to SQLite with a clear statement of when/why you'd migrate. Recommendation: **Start with PostgreSQL.** You already have Docker Compose. The operational overhead is minimal. You avoid a painful migration later and get real concurrency, JSONB columns, and full-text search.

**3.5 — No backpressure or rate-limiting design**

What happens during a market crash when all 30+ sources fire simultaneously? When Trump posts 10 times in 5 minutes? When an SEC batch filing drops 200 8-Ks at once?

*Fix*: Document the backpressure strategy. Options: (a) bounded queue with drop-oldest, (b) priority queue (Tier 1 before Tier 4), (c) per-source rate limiting on the delivery side. At minimum, the AI classification stage needs a concurrency limit — you can't send 200 simultaneous LLM requests.

**3.6 — Missing: API design for external consumers**

The architecture shows delivery channels (WebSocket, Discord, Bark) but no REST/GraphQL API for programmatic access. Quants and algo traders — your most engaged users — will want to consume events via API, not via a web dashboard.

*Fix*: Add a REST API section to the architecture. Even if implementation is Phase 4+, the API design should be defined early because it influences the storage schema and event model.

---

## 4. Frontend / UX

**File**: `docs/FRONTEND.md`

### What Works

- The ASCII layout diagram is immediately understandable. The 3-panel design (feed + detail + chart) is the right paradigm for event-driven trading.
- Keyboard shortcuts (J/K navigation, 1-6 tier toggles) show you understand the power-user audience. This is what separates a tool from a toy.
- Event card design (severity dot, source icon, ticker badge, direction arrow, time elapsed, confidence) packs maximum information into minimum space.
- Health bar at the bottom is a great touch — traders need to trust that the system is working.

### Issues

**4.1 — AG Grid is likely overkill**

AG Grid is designed for massive tabular datasets with sorting, filtering, grouping, and cell editing. Your event feed is a scrolling list of cards. Using AG Grid for this is like using a forklift to move a chair — it works, but it's heavy (500KB+ bundle), has a steep learning curve, and the Community edition lacks key features (streaming updates require Enterprise, $1,600/dev).

*Why it matters*: Bundle size matters for a PWA. Licensing costs conflict with "free." The card-based event feed UI doesn't map naturally to a grid paradigm.

*Fix*: Use a virtualized list library (`@tanstack/virtual` or `react-virtuoso`) for the event feed. Save AG Grid for if/when you build a tabular event explorer (Phase 4) — and even then, evaluate `@tanstack/table` first.

**4.2 — No saved filter presets or watchlists in dashboard**

Filters exist (tier, severity, type, ticker, direction) but there's no concept of saving filter combinations. A trader who always monitors SEC + FDA + insider trades on their 20-stock watchlist doesn't want to reconfigure filters every session.

*Fix*: Add saved filter presets (stored in localStorage or user profile). Include at least: "My Watchlist" (filtered by ticker list), "High Conviction" (CRITICAL + HIGH, Tier 1-2 only), and "Full Firehose" (no filters).

**4.3 — No multi-monitor / detachable panel support**

Professional traders use 2-6 monitors. A single-page app confined to one browser window is a significant limitation vs paid products.

*Why it matters*: This is one of the first things power users will ask for. Bloomberg Terminal supports multiple windows. TradingView supports detached charts.

*Fix*: Document multi-window support as a Phase 3 or Phase 4 goal. For V1, consider allowing the chart panel to be opened in a separate browser tab with shared state (via BroadcastChannel API or SharedWorker).

**4.4 — No export functionality**

No CSV export, no API endpoint for historical events, no way to get data out of the system.

*Fix*: Add an "Export" button to the event feed (filtered results → CSV). Add a "Copy Event JSON" button to event detail. Plan API access for Phase 4.

**4.5 — Missing: notification sound customization in dashboard spec**

Sound alerts are mentioned ("Sound alert on CRITICAL events (configurable)") but there's no UI spec for sound configuration — which sounds, volume control, per-severity sound mapping, mute schedules.

*Fix*: Add a settings panel spec: sound selection per severity, volume slider, quiet hours schedule, test button.

**4.6 — Light theme should be available**

"Default: Dark mode" is right for the primary audience, but a light theme option is table-stakes for any professional tool. Some traders work in bright offices. Some have visual impairments that make dark themes harder to read.

*Fix*: Plan a light theme variant. Since you're using Tailwind + shadcn/ui, this is relatively low-effort with CSS variables.

---

## 5. Delivery / Alerts

**File**: `docs/DELIVERY.md`

### What Works

- Bark selection is well-justified and thoroughly documented. The critical alert bypass of DND/silent mode is genuinely a killer feature for traders.
- Channel comparison table is thorough and honest about trade-offs.
- Alert routing logic pseudocode is clear and immediately implementable.
- Configuration YAML is clean and production-ready.
- ntfy as cross-platform secondary is the right call.

### Issues

**5.1 — No Telegram support (significant omission)**

Telegram has the largest active trading community outside of Discord. Telegram bots are trivial to implement, support rich formatting, and work on all platforms. Many traders already live in Telegram.

*Why it matters*: You list Discord, Slack, and email — but not the platform where the most active retail trading communities actually communicate.

*Fix*: Add Telegram bot as a delivery channel, targeted for Phase 1 alongside Discord. The API is free, well-documented, and supports rich messages with inline buttons. Priority: above Slack, below Discord.

**5.2 — No per-ticker or per-source alert rules**

The current routing is purely severity-based. A trader holding $TSLA wants CRITICAL alerts for Tesla-related events but doesn't care about $XYZ restructuring at any severity. The current system can't express this.

*Why it matters*: Without per-ticker filtering, users will either get too many irrelevant alerts (and disable push notifications) or miss relevant events on tickers they care about.

*Fix*: Move the "Smart alerts & rules engine" from Phase 4 (P4.4) to Phase 2. At minimum, watchlist-based filtering (alert only for tickers I watch) should ship with the MVP dashboard. The full rules engine can wait, but basic ticker filtering cannot.

**5.3 — No delivery retry/failure handling**

What happens when the Bark server is down? When Discord rate-limits the webhook? When ntfy returns a 500?

*Fix*: Add a delivery reliability section: retry with exponential backoff (3 attempts, 1s/5s/30s), dead letter queue for failed deliveries, fallback chain (if Bark fails, try Pushover, then ntfy), and delivery status tracking in the dashboard.

**5.4 — No alert cooldown/deduplication across channels**

If the same event triggers Bark + Discord + ntfy + WebSocket, the user gets 4 notifications for one event. If a story develops over 10 minutes with 5 related events, they get 20 notifications.

*Fix*: Document cross-channel deduplication (one event = one push per channel) and event grouping (related events within a time window get merged into a single "developing story" notification with a count badge).

**5.5 — Webhook output for external integrations is too late (Phase 5)**

Programmable webhook output (your system calls an arbitrary URL when an event matches a rule) is one of the most requested features in any alerting system. Deferring it to Phase 5 means your most technical users — the ones who would build integrations and evangelize the project — can't use it until the end.

*Fix*: Move outbound webhook support to Phase 2 or Phase 3. It's a simple feature (HTTP POST with event JSON payload to a user-configured URL) that dramatically increases the platform's utility.

---

## 6. References

**File**: `docs/REFERENCES.md`

### What Works

- edgartools is the right choice for SEC parsing — well-maintained, AI-native, covers all form types.
- OpenBB as an architectural reference (provider plugin pattern) is appropriate and well-analyzed.
- The "Why we don't just use/fork it" explanations for each reference show clear thinking.
- Competitive products table with "Key Feature We Want" is a practical feature-mining tool.

### Issues

**6.1 — Missing: Financial NLP / sentiment analysis libraries**

No mention of FinBERT, VADER for finance, or other financial sentiment models. The AI classification pipeline relies on generic LLMs, but domain-specific NLP models are faster, cheaper, and often more accurate for financial text classification.

*Fix*: Add references to: (a) **FinBERT** (HuggingFace, fine-tuned BERT for financial sentiment), (b) **SEC-BERT** (domain-adapted for SEC filings), (c) **VADER** (rule-based sentiment, good for social media). These could replace or supplement the LLM for Stage 2 classification, dramatically reducing cost and latency.

**6.2 — Missing: Event bus / message queue references**

The architecture depends on an undefined "event bus" but References lists no messaging infrastructure. This is like designing a highway system without mentioning asphalt.

*Fix*: Add references to: **BullMQ** (Redis-based job queue for Node.js, most natural fit), **Redis Streams** (built-in stream processing), or **Redpanda** (Kafka-compatible, lighter weight). Pick one as the target implementation and explain why.

**6.3 — Missing: Web scraping infrastructure references**

Multiple critical sources depend on scraping, but no scraping framework is referenced beyond Playwright.

*Fix*: Add: **Crawlee** (Apify's open-source scraping framework, built on Playwright, includes proxy rotation, anti-detection, and request queuing). This is significantly more robust than raw Playwright for production scraping.

**6.4 — sec-api listing conflicts with "free" positioning**

`sec-api` is listed as a potential dependency at "$49+/mo." If you use paid APIs, the "Free" row in the competitive landscape table becomes misleading.

*Fix*: Either mark paid libraries clearly as "optional premium accelerator" or remove them. The free path should work end-to-end with edgartools + RSS polling.

---

## 7. Roadmap

**File**: `docs/ROADMAP.md`

### What Works

- Phase 0 exit criteria ("SEC 8-K scanner running, detecting real filings, pushing to Discord") is perfect. Specific, testable, achievable.
- The end-to-end proof concept (source → alert in <60s) is the right forcing function.
- Key Risks table is honest and includes real mitigations.
- Dependency graph is useful.

### Issues

**7.1 — Timeline is aggressively unrealistic**

"6 weeks to MVP" and "16 weeks to full vision" assumes everything goes perfectly, no bugs take longer than expected, no API changes, no scraping breakage, and a sustained velocity that is hard to maintain.

Phase 0 (2 weeks) includes: TypeScript monorepo setup, Docker Compose with 3 services, CI/CD pipeline, scanner plugin framework with registry + health reporting + Prometheus metrics, SEC EDGAR scanner with edgartools integration, and Discord webhook delivery. That's 7 substantial tasks in 10 working days.

Phase 1 (4 weeks) has 6 milestones including building an AI classification engine, a storage layer, 4+ new scanners, and an event deduplication system. The AI classification engine alone — with local model support, confidence scoring, and prompt engineering — is a 2-3 week task.

*Why it matters*: Unrealistic timelines demoralize contributors and erode trust. When Phase 0 takes 4 weeks instead of 2, the project looks "behind schedule" even though the work is progressing well.

*Fix*: Either double all time estimates (4-week Phase 0, 8-week Phase 1) or cut scope per phase. Recommendation: **cut scope**. Phase 0 should be: monorepo + one scanner + Discord alert. That's it. No Prometheus, no Grafana, no scanner registry, no health reporting. Get the core loop working first. Move the infrastructure to Phase 1.

**7.2 — Phase 1 is trying to do too much**

AI classification engine + storage layer + 3 Tier 1 scanners + 2 Tier 2 scanners + 3 Tier 3 scanners + event deduplication = 6 milestones, at least 15 substantial work items. This should be 2-3 phases.

*Fix*: Split Phase 1:
- **Phase 1A** (3 weeks): Storage layer + 2 more Tier 1 scanners (Form 4, Fed). Rule-based classification only (no LLM yet).
- **Phase 1B** (3 weeks): LLM classification engine + Tier 2 (Trump, Musk) + deduplication.
- **Phase 1C** (2 weeks): Tier 3 newswires + classification refinement.

**7.3 — No testing strategy**

Zero mention of testing anywhere in the roadmap. No unit tests, no integration tests, no E2E tests. For a system that processes financial events and delivers alerts, untested code is unacceptable.

*Why it matters*: A false positive CRITICAL alert at 3 AM that bypasses DND and wakes someone up — for a parsing bug — will make them uninstall immediately. A missed insider buy alert due to a deduplication bug costs the user money.

*Fix*: Add testing milestones to every phase. Phase 0: unit tests for scanner + parser + delivery. Phase 1: integration tests for the full pipeline (mock source → event → classification → delivery). Phase 2: E2E tests for the dashboard. Require >80% coverage for scanner and classification code.

**7.4 — Missing: Security hardening milestone**

API keys in config files, Cloudflare Tunnel to the internet, web dashboard with no auth discussion, scraping infrastructure that could be abused — there's no security milestone.

*Fix*: Add a security milestone to Phase 2: secrets management (env vars, not config files), HTTPS everywhere, CSP headers, rate limiting on the API, input sanitization for user-provided filter values.

**7.5 — Missing risks**

The Key Risks table is missing several critical risks:

| Missing Risk | Impact | Mitigation |
|---|---|---|
| **Legal liability for scraped sources** | Truth Social, analyst rating sites, etc. may send C&D letters or sue | Legal review of each scraped source's ToS; always have a non-scraping fallback |
| **Data quality / false signals** | Bad parse → wrong alert → user loses trust or money | Validation layer, confidence thresholds, "unverified" badge for low-confidence events |
| **Single maintainer bus factor** | If you stop working on it, project dies | Document architecture decisions, write contributor guides early, recruit co-maintainers |
| **Alert fatigue causing users to disable notifications** | Users turn off Bark → miss real events | Alert budgeting (max N pushes/hour), progressive severity (only escalate if corroborated) |

**7.6 — Bark + ntfy should be Phase 0, not just Discord**

Discord is a poor primary alert channel — notifications are unreliable, easily buried, and can't bypass DND. If Bark is the "decided" primary channel, it should be in Phase 0's end-to-end proof, not deferred.

*Fix*: Phase 0 exit criteria should be: "SEC 8-K → Bark push notification on iOS in <60s." Discord can be a secondary output for history/review.

---

## 8. Overall Assessment

### What would make this world-class

**1. Ruthless scope reduction for V1.**
Ship 5 scanners that work perfectly before adding 25 more that are flaky. The value of Event Radar isn't "30+ sources" — it's "the first event intelligence platform where every alert is trustworthy." Start with: SEC 8-K, SEC Form 4, Trump Truth Social, PR Newswire, and BLS economic data. That covers Tier 1, 2, 3, and 5 with the highest-impact sources from each.

**2. Define the Scanner Plugin SDK as a first-class artifact.**
The community vision (Phase 2 of the long-term plan) depends on people being able to easily add scanners. The plugin interface should be documented, typed, and include a `create-scanner` CLI template generator in Phase 1. This is what turns a project into a platform.

**3. Ship the API before the dashboard.**
Your most engaged early users will be technical. They want a REST API and webhook output, not a pretty UI. Ship the pipeline + API + Bark alerts first, then build the dashboard. This also gives you real usage data to inform the dashboard design.

**4. Resolve the Python/TypeScript split.**
This is a real architectural debt. Either go all-TypeScript (write your own SEC parser or find a TS library) or go all-Python (FastAPI backend, which handles async polling fine). Mixing languages doubles your toolchain, complicates deployment, and makes it harder for contributors. Given that edgartools, FinBERT, and most financial data libraries are Python, the pragmatic choice may be a Python backend.

**5. Build in public.**
Post weekly progress updates. Share event detection screenshots. Show the Block 8-K example working in real-time. Open-source projects succeed on momentum and community trust, not just code quality. The documentation is already good enough to start building an audience before writing a single line of code.

**6. Add a "confidence" UX throughout.**
Don't hide uncertainty. When an AI classification is 60% confident, show it prominently. When a source is scraped (vs API), show a reliability indicator. When an event has no corroborating sources, flag it as "unconfirmed." Trust is the product. Show users exactly how much to trust each signal.

### Strengths to preserve

- The Block example and problem statement. Don't dilute this.
- The 6-tier source hierarchy. It's a genuinely useful mental model.
- The observability-first architecture. Keep this.
- The Bark integration for iOS critical alerts. This is a differentiator.
- Keyboard-driven dashboard UX. This signals "built for power users."

### The one thing to change right now

**Rewrite the Roadmap with half the scope and double the time estimates.** Everything else in the documentation is strong. But an unrealistic roadmap is worse than no roadmap — it sets expectations that can't be met. A 12-week plan to ship 5 bulletproof scanners + Bark alerts + a basic dashboard is more credible and more achievable than a 6-week plan to ship everything.

---

*End of review.*
