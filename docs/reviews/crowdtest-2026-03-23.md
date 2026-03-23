# CrowdTest Report — 2026-03-23

**App URL:** https://dod-that-francis-effects.trycloudflare.com
**Backend:** http://localhost:3001
**Previous baseline:** 5.8/10 overall, NPS 5.3
**Target:** 8+/10 overall, NPS 7+

---

## Persona 1: Sarah (Day Trader)

Active trader. Wants real-time alerts, cares about speed and accuracy.

### Scores

| Area | Score | Notes |
|------|-------|-------|
| Feed Loading | 7/10 | Feed loads quickly, 23k+ events with pagination. Smart Feed is a strong differentiator. Sort/filter options work well. Noise ratio is high — most events are StockTwits "entered trending" at MEDIUM severity. |
| Event Detail Depth | 8/10 | Three-tab layout (Summary/Evidence/Trust) is well-structured. Bull/Bear case analysis present. SEC filings show form type + EDGAR links. Many StockTwits events lack enrichment — show "Analysis not available." |
| Watchlist Management | 8/10 | Full-featured with drag-and-drop reordering, ticker search, section grouping, star toggle on feed cards. New tickers append correctly. |
| Search | 7/10 | Clean UI with popular tickers, recent searches, real-time search-as-you-type. Limited results for some tickers. No date range filtering. |
| Speed & Responsiveness | 7/10 | Dark theme loads instantly, skeleton loading cards, WebSocket for real-time updates. SPA with no SSR means slower first paint. Cloudflare tunnel adds latency. |
| Overall Trading Utility | 7/10 | Multi-source aggregation (StockTwits, SEC, news, Reddit, trading halts, econ calendar) is valuable. Direction + confidence scoring, outcome tracking (correct/wrong). Too much noise from low-quality StockTwits alerts. |

### Bugs & Issues
1. **CRITICAL events missing tickers** — Iran/Strait of Hormuz event had tickers but "U.S. stock futures" event did not
2. **Feed noise ratio** — 48/51 recent events were StockTwits "entered trending" alerts at MEDIUM
3. **SEC filing data gaps** — Form 4 insider trades show null transaction type, null shares, $0 values
4. **No SSR fallback** — blank screen on slow connections until JS loads

### NPS: 7/10
> "The app has genuinely useful bones — Smart Feed, bull/bear analysis, outcome tracking are things I can't get from a Bloomberg terminal in this format. But the feed is too noisy with low-quality StockTwits trending alerts, and too many events are missing critical data. I'd recommend it as a 'keep an eye on this' tool, not yet my primary alert system."

**Sarah Average: 7.3/10**

---

## Persona 2: Marcus (Skeptical Analyst)

Doesn't trust AI. Looks for evidence, sources, track record, data provenance.

### Scores

| Area | Score | Notes |
|------|-------|-------|
| Scorecard Credibility | 7/10 | Real metrics: directional hit rate, setup worked rate, avg T+20 move. Source accuracy bars with color-coding. BUT: "Rolling Accuracy Trend" chart uses **mock sinusoidal data** presented as real. "Severity Breakdown" donut chart uses fabricated proxy data. Both have TODO comments admitting this in code. |
| Evidence Tab Quality | 8/10 | Strong — source URLs, raw excerpts, EDGAR links, source-specific cards for 7 source types. "Why It Matters Now" section. Fallback message when no source data available. |
| About/Privacy/Terms | 4/10 | About page is a single paragraph. Privacy/Terms are minimal but present. No team info, methodology, data source list, GDPR language, or data retention policy. |
| Data Provenance | 8/10 | Excellent pipeline timeline: Source -> Rule Filter -> AI Judge -> Enrichment -> Delivery. Sources clearly labeled on every card. Multi-source confirmation badges. |
| Track Record / History | 7/10 | Defaults to HIGH+CRITICAL filter (good). Outcome badges (correct/wrong/pending). No aggregate validation stats on the page itself — must go to Scorecard. |
| Trust Signals | 7/10 | Footer disclaimer, expandable AI-content disclaimer on events, confidence scores, user feedback mechanism. BUT: disclaimer collapsed by default (easy to miss), no "AI-generated" label on summaries, fake charts undermine trust. |

### Bugs & Issues
1. **Fake charts on Scorecard** — "Rolling Accuracy Trend" and "Severity Breakdown" use fabricated data presented as real, with only code comments acknowledging this. Most serious trust issue found.
2. **About page is skeletal** — one paragraph, no substance
3. **Disclaimer hidden by default** — AI-content disclaimer in collapsible section at bottom of Trust tab
4. **No "AI-generated" badge** — summaries and analysis lack clear AI generation labels

### NPS: 6/10
> "The underlying architecture is solid — real provenance tracking, real scorecard data, real source evidence with clickable links and raw excerpts. But I caught two charts presenting fabricated data as real, the About page is empty, and the AI-disclosure is buried. Fix the fake charts, add honest 'data not yet available' states, put an AI-generated label on summaries, and flesh out the About page. Then I'd bump this to an 8."

**Marcus Average: 6.8/10**

---

## Persona 3: Jordan (New User)

First time seeing the product. No trading background. Needs clarity and intuition.

### Scores

| Area | Score | Notes |
|------|-------|-------|
| Onboarding Flow | 8/10 | 4-step wizard (Welcome, Watchlist, Notifications, Done) with progress dots. Sample alert card, sector packs, confetti on completion. "Skip setup" available. Tagline is catchy but vague for zero-trading-knowledge users. |
| UI Clarity | 7/10 | Feed tabs clearly labeled, "What is Smart Feed?" popover works. Scorecard page is jargon-heavy ("Directional hit rate", "T+20 move", "calibration layer"). |
| Tooltips & Help | 5/10 | Smart Feed tooltip exists. No tooltips on severity badges, direction badges (bullish/bearish), T+5/T+20 terminology, or Scorecard metrics. No glossary or help page. |
| Error Handling | 5/10 | ErrorBoundary exists, empty states well-handled, connection loss indicator. **No 404 route** — visiting `/nonexistent` renders blank page in app shell. |
| Mobile Responsiveness | 8/10 | Safe-area-inset support, 44px touch targets, swipe gestures, pull-to-refresh, responsive breakpoints. Bottom nav 5 columns could be tight on 320px screens. |
| Navigation & IA | 7/10 | Bottom nav with 5 sections, active tab highlighting, ticker chips link to profiles. History page not in bottom nav (hidden). No back button on event detail pages on mobile. |
| Visual Design | 8/10 | Professional dark theme, consistent design tokens, severity color system, card-based design with backdrop blur. Minor emoji inconsistency vs lucide-react icons. |

### Bugs & Issues
1. **No 404 route** — visiting any undefined path renders blank content inside app shell
2. **Jargon without explanation** — severity levels, bullish/bearish, T+20, hit rate, confidence buckets lack tooltips
3. **History page not discoverable** — not in bottom nav, no obvious navigation path
4. **No back button** on event detail pages on mobile
5. **Emoji inconsistency** — some components use emoji while rest uses lucide-react icons

### NPS: 6/10
> "The onboarding is pleasant and the dark theme feels modern. But after setup, I hit a wall of trading jargon with no explanations. The lack of a 404 page and no tooltips on key concepts makes me feel like this product wasn't built for people like me. I'd recommend it to a friend who trades, not to other non-traders."

**Jordan Average: 6.9/10**

---

## Overall Summary

### Aggregate Scores

| Persona | Average Score | NPS |
|---------|--------------|-----|
| Sarah (Day Trader) | 7.3/10 | 7/10 |
| Marcus (Skeptical Analyst) | 6.8/10 | 6/10 |
| Jordan (New User) | 6.9/10 | 6/10 |
| **Overall** | **7.0/10** | **6.3/10** |

### Improvement from Baseline

| Metric | Previous (Baseline) | Current | Delta |
|--------|-------------------|---------|-------|
| Overall Score | 5.8/10 | 7.0/10 | **+1.2** |
| NPS | 5.3/10 | 6.3/10 | **+1.0** |

### Top Issues to Fix (Priority Order)

1. **Fake charts on Scorecard** — Rolling Accuracy Trend and Severity Breakdown use fabricated data. Replace with real data or honest "data not yet available" states. (Trust-critical)
2. **No 404 page** — Unknown routes render blank content. Add catch-all route. (UX-critical)
3. **Missing tooltips** — Severity badges, direction badges, Scorecard metrics need plain-language explanations. (Accessibility)
4. **About page** — Currently one paragraph. Needs methodology, data sources, team info. (Trust)
5. **Feed noise ratio** — Too many low-quality StockTwits trending alerts dominate the feed. (Content quality)
6. **SEC filing data gaps** — Form 4 insider trades missing transaction details. (Data quality)
7. **AI-generated label** — Add clear "AI-generated" badges on analysis summaries. (Transparency)
8. **History page discoverability** — Add to bottom nav or provide clear navigation path. (IA)

### What's Working Well

- Smart Feed concept and three-tab feed organization
- Evidence tab with real source data, EDGAR links, raw excerpts
- Data provenance pipeline timeline (Source Journey)
- Onboarding wizard with sample alerts and sector packs
- Drag-and-drop watchlist with ticker grouping
- Mobile-first responsive design with swipe gestures
- Outcome tracking with correct/wrong/pending badges
- WebSocket real-time updates with connection status indicator
- Consistent dark theme with professional visual design

### Verdict

Significant improvement from baseline (+1.2 overall, +1.0 NPS). The app now has solid foundations — Smart Feed, evidence quality, provenance tracking, and mobile responsiveness are all strong. The remaining gaps are primarily in **trust/transparency** (fake charts, hidden disclaimers, missing AI labels) and **educational scaffolding** (tooltips, glossary, About page). Fixing the top 3-4 issues would likely push scores to 8+ overall and 7+ NPS.
