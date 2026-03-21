# Improvement Summary — v1 vs v2 — 2026-03-21

**Period:** Post-Sprint S0 through S5 (6 sprints, same day)
**Previous reviews:** `*-review-2026-03-21.md` (v1)
**Current reviews:** `*-review-v2-2026-03-21.md` (v2)

---

## Score Comparison

| Dimension | v1 Score | v2 Score | Change | Notes |
|-----------|----------|----------|--------|-------|
| **PM: Value Prop Clarity** | 6/10 | 7/10 | +1 | Scorecard reframe helps; onboarding still doesn't demo value |
| **PM: Feature Completeness** | 7/10 | 7.5/10 | +0.5 | Smart Feed + Search + Daily Briefing; no price data |
| **PM: Retention Hooks** | 4/10 | 6/10 | +2 | Daily Briefing + Smart Feed; still no notifications |
| **PM: Monetization Readiness** | 4/10 | 4.5/10 | +0.5 | Better framing, same fundamental barriers |
| **UX: Cognitive Load** | 6/10 | 7.5/10 | +1.5 | Event detail tabs working = massive improvement |
| **UX: Interaction Patterns** | 7/10 | 8/10 | +1 | Feed modes, keyboard nav, search modal |
| **UX: Error Handling** | 4/10 | 5.5/10 | +1.5 | Push recovery guide, WS status indicator |
| **UX: Mobile Experience** | 7/10 | 8/10 | +1 | No overflow, Scorecard loads, all pages work |
| **UI: Visual Hierarchy** | 7/10 | 7.5/10 | +0.5 | Tab structure helps; orange overload persists |
| **UI: Color System** | 6/10 | 6.5/10 | +0.5 | Theme toggle removed (dark only); orange still overused |
| **UI: Polish Level** | 6/10 | 7/10 | +1 | Several "beta" items fixed; new items introduced |
| **Trader: Speed of Info** | 5/10 | 5.5/10 | +0.5 | Smart Feed helps; still no prices |
| **Trader: Signal vs Noise** | 5/10 | 6.5/10 | +1.5 | Smart Feed is the biggest win for traders |
| **Trader: Trust** | 4/10 | 5.5/10 | +1.5 | Scorecard reframe + Trust tab working |
| **Trader: Would Pay $29/mo** | NO | NO | = | Closer, but same blockers |
| **Trader: NPS** | 5/10 | 6/10 | +1 | Trending toward Promoter |
| **QA: Playbook Score** | 93.3 | 93.9 | +0.6 | 2 old bugs fixed, 1 new bug |
| | | | | |
| **Average (all dimensions)** | **5.7** | **6.5** | **+0.8** | |

---

## Top 3 Biggest Improvements

### 1. Event Detail Tab Restructure (S4) — Cognitive Load -60%

The event detail page went from 11 sections dumped on a single scroll to 3 focused tabs (Summary / Evidence / Trust). This is the highest-impact UX change across all sprints. It transformed an overwhelming information dump into a progressive disclosure system that matches how traders actually consume information: quick summary → supporting evidence → verification.

**Impact:** UX Cognitive Load +1.5, UI Polish +1, Trader Speed +0.5

### 2. Smart Feed (S5) — Signal/Noise Ratio Transformation

Smart Feed introduces algorithmic curation: watchlist-relevant events + trusted-source HIGH/CRITICAL alerts. This solves the v1 "two extremes" problem where users had either 2 events or 23,000 events with nothing in between. Smart Feed provides 3-5 relevant events per day — the sweet spot for daily engagement.

**Impact:** PM Retention +2, Trader Signal/Noise +1.5, PM Feature Completeness +0.5

### 3. Scorecard Reframe (S2) — Trust Narrative Reset

Changed the Scorecard hero from "24.4% hit rate" (anti-selling feature) to "24,039 Events Detected from 15 sources" (impressive scale metric). Hit rate is now behind a collapsible "Advanced Analytics" section with a disclaimer. This doesn't change the underlying accuracy, but it changes the STORY: from "we're wrong 75% of the time" to "we're watching everything 24/7."

**Impact:** PM Value Prop +1, Trader Trust +1.5, PM Monetization +0.5

---

## Top 3 Remaining Gaps

### 1. No Price Data — THE Gap

This was the #1 gap in v1. It's still the #1 gap in v2. It was supposed to be addressed in S1 but no prices are visible anywhere in the UI. Every trader needs price context. Every competitor shows prices. A "BEARISH High conf" alert without knowing the current stock price, the price at alert time, or the % change since is fundamentally incomplete. This single gap prevents monetization, undermines trust, and forces users to maintain a second tool (TradingView).

**Who cares:** PM (monetization), Trader (actionability), UX (incomplete information journey)

### 2. No Per-Event Outcome Tracking

The Scorecard shows aggregate statistics (24.4% hit rate across all events), but individual events show "Pending" for T+5 and T+20 moves. Users who see "BEARISH" want to know: was it right? The infrastructure exists (Scorecard computes outcomes in aggregate), but it's not surfaced per-event. This gap kills both trust ("prove the AI works") and retention ("come back to see if we were right").

**Who cares:** Trader (trust), PM (retention), UX (incomplete loop)

### 3. No Working Notification Delivery

Push notifications are blocked in headless/most browser environments. The recovery guide is excellent, but there are no fallback channels (email, Discord, Telegram) exposed in Settings. The backend has Discord webhook delivery, but it's not accessible to users through the UI. A real-time alerting product that can only alert you when you're actively looking at it is a contradiction.

**Who cares:** PM (retention), Trader (workflow), UX (dead-end flow)

---

## Overall Ship Readiness Verdict

| Criterion | v1 | v2 | Target |
|-----------|----|----|--------|
| QA Score | 93.3 | 93.9 | >90 ✅ |
| Critical bugs | 0 | 0 | 0 ✅ |
| Core flows work | Partial (tabs broken) | Yes | Yes ✅ |
| Mobile responsive | Partial (overflow) | Yes | Yes ✅ |
| Price data | No | No | Yes ❌ |
| Notification delivery | No | No | Yes ❌ |
| Monetization ready | No | No | $29/mo ❌ |
| NPS ≥ 7 | 5 | 6 | 7 ❌ |

### Verdict: SHIP AS FREE BETA — NOT READY FOR $29/month

**The product is ready to ship as a free beta / early access product.** The core experience works: onboarding → feed → event detail → search → scorecard. The QA score is 93.9 (SHIP READY). No critical bugs. Mobile works. The UI is polished enough for early adopters.

**The product is NOT ready to charge $29/month.** The three foundational gaps (prices, outcomes, notifications) are all required for a paid trading tool. Without prices, it's a news aggregator. Without outcome tracking, the AI claims are unverifiable. Without notifications, it's a manual-check tool, not a real-time alert system.

**Recommended next steps:**
1. Fix the event search route bug (1-line fix, immediate)
2. Add price data to event cards and detail pages (strategic, weeks)
3. Surface per-event outcome tracking (medium, uses existing infrastructure)
4. Expose Discord/email notification channels in Settings (medium)
5. Then reconsider monetization readiness

**The trajectory is right.** Six sprints produced meaningful improvements across every dimension. The team is solving the right problems. But the remaining gaps are strategic, not sprint-level — they need market data APIs, model improvements, and notification infrastructure. These are the investments that turn a promising beta into a $29/month product.
