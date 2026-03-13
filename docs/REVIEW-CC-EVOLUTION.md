# Engineering Review — Evolution Strategy

**Reviewer perspective**: VP Engineering, fintech startup (built real-time trading systems)
**Date**: 2026-03-13

---

## Executive Summary

This is a thoughtful strategy from someone who clearly understands the product's core problem: you have a detection system that detects nothing. 6,788 events in, 0 delivered out. The diagnosis is correct. But the proposed solution has sequencing errors, underestimated complexities, and a few architectural traps that will cost you months if you don't catch them now.

**Bottom line**: The strategy tries to build a self-driving car when you haven't proven the engine starts. You need to deliver value to one real user within 2 weeks, not build a backtest framework.

---

## 1. Prioritization — The Order Is Wrong

### Current proposed order:
1. Enable LLM Enrichment (P0)
2. SEC EDGAR scanner (P0)
3. PR Newswire/BusinessWire (P1)
4. Post-Market Review Bot (P1)
5. Backtest Framework (P1)
6. Price Service (P1)
7. Rich Delivery (P2)
8. Feedback Loop (P2)
9. Truth Social (P2)
10. NYSE Halt (P3)

### What I'd actually do:

**The fundamental issue**: You can't backtest, self-evolve, or measure quality if you have zero delivered alerts. And you can't deliver alerts if the pipeline is broken and the sources are weak. Fix the plumbing first.

#### If I only had 2 weeks:

**Week 1 — Make the system actually work end-to-end:**
1. Enable LLM Enrichment (1h) — agreed, this is trivial P0
2. Fix whatever is causing 0 deliveries — the doc says "filter 挡了所有" was "刚修了" but I want to see alerts actually flowing before touching anything else. Run for 24h, verify ≥1 delivery.
3. SEC EDGAR 8-K scanner (2-3d) — agreed, this is the single highest-value source
4. PR Newswire + BusinessWire RSS (1d) — low effort, high payoff, just RSS parsing

**Week 2 — Make delivered alerts actually useful:**
5. Rich delivery format (1-2d) — the mock in 战略七 is what makes this product worth using. Do this BEFORE building measurement infrastructure.
6. Price Service (2d) — you need this for everything downstream, and it makes alerts immediately more valuable ("since alert: +3.2%")
7. Manual post-market review (0.5d) — just a SQL query + spreadsheet. Don't build a bot yet. Run it by hand for 2 weeks to validate the concept.

**What I'd defer (and why):**
- Backtest framework → You have <2 weeks of delivered alert data. Backtesting against events that were never delivered through the current pipeline is measuring a system that doesn't exist. Build this in month 2.
- Post-Market Review Bot → Do this manually first. Automating it before you know what the output looks like is premature.
- Feedback Loop / Auto-tuning → Dangerous to automate parameter changes on a system you don't understand yet. Run manually for at least 4 weeks.
- Truth Social → High effort, legally sketchy scraping, and the signal is already partially captured by news scanners that cover Trump's posts reactively.

---

## 2. Feasibility — What's Harder Than It Looks

### SEC EDGAR Scanner (rated 中 difficulty — actually higher)
- The ATOM/RSS feed is simple. Parsing the actual 8-K content is not. 8-Ks are HTML/XBRL soup with wildly inconsistent formatting across filers.
- Item number extraction sounds easy ("just regex 2.05") but many 8-Ks have multiple items, and the item text doesn't always match what you'd expect.
- You already have a Python SEC service (`services/sec-scanner/`) with edgartools. The real question: is this service production-ready? Does it handle the 8-K polling loop, or is it just a one-shot parser?
- **Risk**: Spending 3 days on the scanner and realizing edgartools doesn't support real-time RSS polling, then having to write a custom poller in Python.
- **Recommendation**: Start with the RSS feed only (just detect new filings by CIK + accession number). Don't parse content in v1 — just pass the headline + link. Let the LLM Judge read the filing summary. You can add deep parsing later.

### Post-Market Review Bot (rated 2-3d — actually 5-7d)
- "Search why SMCI dropped 15% using LLM + web search" is a research agent, not a cron job. Building reliable web search → LLM → structured output is its own project.
- You'll need: web search API (SerpAPI/Tavily, $50-100/mo), robust prompt engineering to handle "I don't know" cases, structured output parsing, and error handling for when the LLM hallucinates a catalyst.
- **The 80/20**: Just pull the top movers list and diff against your delivered alerts. The "why" can be a manual step for the first month.

### Backtest Framework (rated 3-5d — actually 2-3 weeks for anything useful)
- "Replay events through pipeline (stateful!)" — this is deceptively complex. Your pipeline has time-dependent state (staleness windows, dedup caches, session-based filtering). Replaying events in fast-forward means you need to mock system time throughout the entire pipeline.
- Price data fetching: yfinance is rate-limited and unreliable for intraday data. You'll burn a day just dealing with Yahoo Finance quirks (API changes, missing data, splits not adjusting correctly).
- Calculating "recall" requires knowing ALL events that moved stocks ≥3%, not just the ones your scanners found. This is the post-market review problem again — you need an external ground truth dataset.
- **Recommendation**: Don't build a generic replay engine. Build a simple A/B comparator: "given these 6,788 events, how many would Strategy A deliver vs Strategy B?" No time simulation needed. No price data needed for v1. Just count alerts/day and manually inspect a sample.

### Truth Social Scanner (rated 3-5d — actually open-ended)
- No official API. Third-party APIs come and go. Scraping ToS violations.
- Even if you get it working, you're one cease-and-desist from losing the source.
- Trump posts are already covered (with 30-60 min delay) by Reuters/AP/CNBC breaking news scanners. The delta between "4 seconds after Truth Social post" and "2 minutes after AP picks it up" matters for HFT, not for swing traders.
- **Recommendation**: Skip this entirely for v1. If your target user is an event-driven swing trader (per VISION.md), the 2-minute delay from news wires is fine.

### What's Easier Than It Looks

- **PR Newswire / BusinessWire**: These are literally RSS feeds. Parse XML, extract headline + ticker + link, emit event. Half a day, max.
- **NYSE/Nasdaq Halt Feed**: Nasdaq provides a public halt/resume page. Scrape it every 30s. Halts are binary events — no classification needed. Should take <1 day.
- **Enabling LLM Enrichment**: Literally flip an env var. This really is 1 hour including testing.

---

## 3. Missing Pieces — What's Not Mentioned

### A. Operational Runbook
You have 6 active scanners and 8 disabled ones, but no mention of:
- What happens when a scanner dies at 9:31 AM on a Monday? Who gets paged?
- How do you restart a scanner without restarting the whole backend?
- What's the recovery procedure when the DB is full / the LLM API is down / Discord rate-limits you?

This is table stakes for a system that claims real-time market intelligence.

### B. Data Licensing & Legal Risk
- SEC EDGAR: fine, public data
- PR Newswire/BusinessWire: RSS is public, but redistributing full text may violate terms. You need to link to the original, not republish.
- Truth Social scraping: legal gray area at best
- StockTwits API: their ToS explicitly prohibits using data for trading signals
- Reddit: already 403'd, and Reddit's API pricing killed most bots

**The strategy doesn't mention legal review at all.** For a fintech product, this is a critical gap. One cease-and-desist can take out a Tier 1 source.

### C. Disaster Recovery & Data Integrity
- What happens if the DB corrupts? Backups?
- What if you deliver a false alert (e.g., LLM hallucinates a ticker)? Is there a kill switch?
- What if you deliver a real alert to Discord and it triggers someone's algo? Liability?

### D. Testing Strategy for Scanners
- The doc mentions 900+ tests but doesn't discuss how scanner tests work. Do you mock the HTTP responses? Do you have golden files for SEC filings?
- New scanners (SEC EDGAR, PR Newswire) need integration tests against real data, not just unit tests.

### E. Monitoring the LLM Judge
- If the LLM Judge starts rejecting everything (API degradation, prompt drift, model update), you'll go back to 0 deliveries with no alarm.
- **Must-have**: alert if delivered_count < 1 for any 24h period during market days.
- **Must-have**: log every LLM Judge decision (push=true/false + reason) for audit.

### F. Graceful Degradation
- If OpenAI is down, does the whole pipeline stop? It shouldn't.
- You need a fallback path: rule-based-only filtering when LLM is unavailable. The circuit breaker mentioned in the commit history is a start, but the strategy doc doesn't discuss degraded-mode behavior at all.

---

## 4. Risks

| Strategy | Risk | Severity | Mitigation |
|----------|------|----------|------------|
| LLM Enrichment | OpenAI rate limit / outage blocks all deliveries | High | Circuit breaker + rule-only fallback |
| SEC EDGAR | edgartools dependency — single maintainer, could break | Medium | Pin version, have manual RSS fallback |
| Post-Market Review Bot | LLM hallucinates catalysts, creates false "missing scanner" issues | High | Human review before any auto-created issues |
| Backtest Framework | Overfitting to historical data — tuning params to ace the backtest but failing on new events | High | Hold-out set, walk-forward validation |
| Auto-tuning (战略六) | Feedback loop oscillation — system keeps tightening and loosening filters | Critical | Rate-limit parameter changes, require human approval |
| Truth Social | Legal risk + source instability | High | Don't build it. Use news wire proxies. |
| Price Service via yfinance | yfinance is unofficial, breaks frequently, rate-limited | Medium | Cache aggressively, have polygon.io or Alpha Vantage as backup |
| Rich Delivery | "Action: Watch for entry on initial dip" is dangerously close to financial advice | High | Legal review of all LLM-generated action text. Consider removing the "Action" field entirely. |

### The Biggest Risk Nobody's Talking About

**LLM model updates**. You're building your entire filtering pipeline on GPT-4o-mini's judgment. OpenAI ships model updates without notice. One day your 3-10 alerts/day becomes 0 or 50 because the model's behavior shifted. You need:
1. A regression test suite of ~50 labeled events (25 should-push, 25 should-not-push)
2. Run this suite on every LLM provider change or monthly
3. Alert if accuracy drops below 80%

---

## 5. Architecture Concerns

### A. Single-Process Bottleneck
The architecture doc says EventBus is currently `EventEmitter` (in-memory). This means:
- All scanners + pipeline + delivery run in one Node.js process
- One scanner throwing an unhandled exception can crash everything
- No horizontal scaling

For v1 this is fine. But the strategy doc talks about 30+ sources — at that scale, you need process isolation. Plan the migration to Redis Streams (or at minimum, child_process isolation for scanners) before you hit 15+ scanners.

### B. LLM Judge as Single Point of Failure
The pipeline is: Scanner → Dedup → Staleness → **LLM Judge** → Enrich → Deliver

If LLM Judge is down, nothing gets delivered. The FEED-STRATEGY.md says "删除所有硬编码 filter" — this means you're removing the safety net. If the LLM is unavailable, you have ZERO filtering.

**Recommendation**: Keep the rule-based filters as a fallback tier. When LLM is available, use LLM Judge. When it's not, fall back to keyword + severity rules. Don't delete them — disable them behind a feature flag.

### C. Price Service Will Become a Dependency Nightmare
The strategy proposes one Price Service that feeds: backtest, post-market review, delivery enrichment, and feedback loop. That's four consumers with very different requirements:
- Backtest needs bulk historical data (thousands of ticker-days)
- Delivery enrichment needs real-time quotes with <5s latency
- Post-market review needs EOD data
- Feedback loop needs T+30m/T+1d/T+5d scheduled lookups

**Don't build one service.** Build two:
1. A historical price cache (batch, yfinance, runs nightly)
2. A real-time quote adapter (on-demand, with a different provider like Finnhub free tier for WebSocket quotes)

### D. The "Stateful Replay" Problem
Backtest requires replaying events through a stateful pipeline (dedup state, staleness windows). This means the pipeline code needs to be deterministic and time-mockable. Right now it probably uses `Date.now()` everywhere.

**If you want backtest, design the pipeline to accept an injectable clock NOW**, before writing more pipeline code. Retrofitting this later is painful.

---

## 6. Cost Analysis — Steady State

| Item | Monthly Cost | Notes |
|------|-------------|-------|
| PostgreSQL (self-hosted) | $0 | Docker on your own machine |
| OpenAI GPT-4o-mini (LLM Judge) | ~$0.30 | ~30-50 calls/day × $0.0003 |
| OpenAI GPT-4o-mini (Enrichment) | ~$0.10 | ~10 calls/day × $0.0003 |
| OpenAI GPT-4o-mini (Post-Market Review) | ~$5 | ~20 web searches + LLM calls/day |
| Web Search API (SerpAPI/Tavily) | $50-100 | For post-market review bot |
| X API (if you want it) | $200 | Basic tier |
| VPS (if not self-hosted) | $10-20 | 2 vCPU, 4GB RAM is plenty |
| Discord | $0 | Webhook is free |
| Domain + Cloudflare | $10/yr | |
| **Total (self-hosted, no X)** | **~$5-10/mo** | |
| **Total (VPS + X API + search)** | **~$280-330/mo** | |

The LLM costs are negligible — that's a real advantage. The expensive part is the X API and web search for the review bot. **Cut those and you're under $30/mo total.**

If you're planning to charge $15/mo, you need ~2-3 paying users to break even on the VPS scenario. That's achievable but tight. The real cost is your time.

---

## 7. Competitive Analysis

### vs Benzinga Pro ($177/mo)
- Benzinga has **direct newswire licensing** (they are a newswire). You can't compete on source breadth with RSS scraping.
- Benzinga's speed is sub-second for corporate announcements. Your architecture has a structural 30-60s delay (polling interval + LLM processing).
- **Your edge**: AI enrichment + historical pattern matching. Benzinga gives you the headline; you give them the "so what" + historical win rate. That's a real differentiator.

### vs LevelFields ($99/mo)
- LevelFields already does "event → AI classification → alert" with backtested performance data.
- They have 2+ years of historical event data with price outcomes.
- **Your edge**: Open source, self-hosted, broader source coverage (if you build it). The "free + open source" angle is compelling for technical traders who don't trust black-box services.

### vs Minas Watch (Free/Pro)
- Closest competitor in spirit. SEC + PR Newswire focus.
- They're ahead on SEC parsing maturity.
- **Your edge**: Multi-source correlation, AI enrichment, historical patterns.

### Honest Assessment
Right now, Event Radar is behind all of these products in terms of actual functionality. You have 0 delivered alerts. They have paying users. The strategy document is aspirational, and that's fine — but the competitive comparison in VISION.md claiming "✅" for features that don't work yet is misleading.

**The real competitive question**: Can a solo developer (or small team) with open-source + AI catch up to funded companies with newswire licenses? The answer is "partially" — you'll never match Benzinga on speed for corporate announcements, but you can match or beat them on AI analysis and historical context. **Lean into the analysis angle, not the speed angle.**

---

## 8. Specific Technical Recommendations

1. **Add a delivered_count health check**: Alert if 0 alerts delivered in any market-day 24h window. This is your canary.

2. **Keep rule-based filters as LLM fallback**: Don't delete them. Gate them behind `LLM_AVAILABLE` state.

3. **Build the SEC EDGAR scanner as RSS-only first**: Poll the ATOM feed, extract filing metadata (CIK, form type, filing date, accession number), pass headline to LLM Judge. Don't parse filing content in v1.

4. **Inject a clock interface into the pipeline**: `type Clock = { now(): Date }`. Use `RealClock` in production, `MockClock` in backtest. Do this before writing more pipeline code.

5. **Create a golden test set**: 50 real events, manually labeled push/no-push. Run against LLM Judge on every prompt change or model update.

6. **Log every LLM Judge decision**: Store in `pipeline_audit` table with full input + output + latency. This is your backtest ground truth AND your debugging lifeline.

7. **Don't auto-tune filter parameters** (战略六): Run the feedback loop in report-only mode for at least 2 months before enabling any automatic parameter changes. One bad auto-tune cycle can silence your entire system.

8. **Remove the "Action" field from delivery**: "Watch for entry on initial dip" is investment advice. Your disclaimer says "not financial advice" but the product literally says "Action: Watch for entry." Pick one. I'd remove it to avoid regulatory risk, or reword to purely informational framing ("Historical similar events saw initial dips lasting 1-3 days").

9. **Add a manual kill switch**: A way to immediately stop all deliveries (env var or API endpoint). When (not if) the LLM produces a bad alert at 9:31 AM on an FOMC day, you need to be able to shut it down in <10 seconds.

10. **Separate price service into two components**: Historical batch (nightly yfinance pull) and real-time quotes (Finnhub WebSocket or similar). Don't try to make one service do both.

---

## Summary Verdict

| Aspect | Grade | Notes |
|--------|-------|-------|
| Problem understanding | A | Correct diagnosis of the 0-delivery problem |
| Vision clarity | A | The "decision support, not notification" framing is strong |
| Prioritization | C | Backtest and self-evolution too early; ship value first |
| Feasibility estimates | D+ | Nearly every item is underestimated by 2-3x |
| Risk awareness | C | Missing legal, operational, and LLM drift risks |
| Architecture | B | Sound foundations but single-process and LLM-SPOF concerns |
| Cost analysis | B+ | LLM costs are genuinely low; biggest cost is developer time |
| Competitive positioning | B- | Honest about landscape but claiming features that don't exist |

**My 2-week plan if I were running this**:
1. Day 1: Enable LLM enrichment, verify pipeline delivers ≥1 alert
2. Days 2-4: SEC EDGAR RSS scanner (metadata only, no deep parsing)
3. Day 5: PR Newswire + BusinessWire RSS scanners
4. Days 6-7: Rich delivery format (the mock in 战略七)
5. Days 8-9: Price Service (historical batch only, for "since alert" display)
6. Day 10: LLM Judge golden test set (50 labeled events)
7. Days 11-14: Run the system live, manually review every alert, fix issues as they arise

After 2 weeks you'll have: working alerts from 3+ primary sources, AI enrichment, rich delivery format, and enough live data to know if the backtest framework is even worth building.

---

*Reviewed 2026-03-13*
