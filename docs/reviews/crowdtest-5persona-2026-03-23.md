# Comprehensive 5-Persona CrowdTest — 2026-03-23

**App URL:** https://dod-that-francis-effects.trycloudflare.com
**Backend:** http://localhost:3001
**Date:** 2026-03-23
**Previous Scores:** 5.8 (first test) → 7.0 (second) → 8.1 (3-persona retest)
**This Test:** 5 personas, 8 areas each, full product evaluation

---

## Persona 1: Sarah (Day Trader, $500K Portfolio)

**Focus:** Feed speed, real-time updates, event detail depth, watchlist power features, keyboard shortcuts, search, signal-to-noise ratio.

### Scores

| Area | Score | Notes |
|------|-------|-------|
| Feed quality & layout | 7/10 | Three feed modes (Smart/Watchlist/All), sort by latest/severity, saveable filter presets, dedup counts. Heavy StockTwits noise — 47/50 recent events are "entered trending" at MEDIUM. |
| Event detail depth | 7/10 | Three-tab detail (Summary/Evidence/Trust) is well-structured. Enriched events show direction, confidence, risk context. Most StockTwits events have shallow/empty detail pages. |
| Real-time updates | 7/10 | WebSocket with green/amber/red connection indicator. Visibility-change auto-reconnect. Max 5 reconnect attempts before giving up — should be infinite for a trading app. No latency indicator. |
| Watchlist power features | 8/10 | 6 pre-loaded tickers, drag-and-drop reorder, per-ticker event counts with severity colors, sections, multi-select batch ops, swipe-to-add from feed. XLE missing `name` field. |
| Search functionality | 7/10 | Popular tickers pills, recent searches, `/` or Cmd+K shortcut. Ticker-based only — no full-text search across event summaries. No "did you mean?" suggestions. |
| Notification settings | 8/10 | Signal tier matrix, Web Push with platform-specific recovery, Discord webhook + test button, quiet hours with timezone, daily push cap (default 20), audio squawk. No Telegram/Bark despite being in delivery package. |
| Keyboard shortcuts | 7/10 | `?` opens help, `j/k` vim-style feed navigation, `/` for search. Only 6 shortcuts total. No visible hint in UI until you press `?`. |
| Signal-to-noise ratio | 5/10 | **Biggest issue.** 90%+ of feed is StockTwits trending garbage for meme stocks. Zero SEC filings, zero trading halts, zero insider moves in current feed. Smart Feed reduces from 50→23 but still heavily social. |

**Overall Satisfaction: 7.0/10**
**NPS: 6/10** (Passive)

> "The bones of this thing are genuinely impressive — the LLM judge, the watchlist drag-and-drop, the three-tab event detail with confidence scores. That's exactly the intelligence layer I want between raw market noise and my trading decisions. But right now, 90% of my feed is StockTwits trending garbage for meme stocks, and there are zero SEC filings, zero trading halts. Fix the signal-to-noise ratio and plug in those institutional sources, and this becomes a tool I'd actually pay serious money for."

---

## Persona 2: Marcus (Hedge Fund Analyst, CFA)

**Focus:** Scorecard methodology, outcome tracking accuracy, evidence sourcing, data provenance, transparency.

### Scores

| Area | Score | Notes |
|------|-------|-------|
| Scorecard methodology | 7/10 | Four bucket breakdowns (Signal, Confidence, Source, Event Type) with hit rates. Rolling Accuracy honestly shows "Coming soon" — right call. "How to read this" says "calibration layer, not victory lap." Only 91/11,028 alerts have usable verdicts though. |
| Outcome tracking accuracy | 5/10 | Only trading halts produce verdicts. Every other source (StockTwits, SEC, news) shows zero usable verdicts despite massive volume. 0.82% verdict rate is concerning for a product this age. |
| Evidence sourcing | 8/10 | Real CNBC URLs, EDGAR links with accession numbers, source-specific cards. LLM Judge shows blocking reasoning. StockTwits evidence is thin (just watcher counts). |
| Data provenance | 8/10 | Trust tab shows full Source Journey: Source → Rule Filter → AI Judge → Enriched → Delivered with timestamps and confidence scores. Feedback mechanism (Useful/Not Useful/Bad Data). Processing time shown. |
| About/Privacy/Terms | 5/10 | About page has 5 sections, 15 data sources, AI disclosure. But contact says "[placeholder email]". Privacy references GitHub without linking. Terms lack limitation of liability specifics. |
| AI disclosure & transparency | 8/10 | "AI-generated analysis · Verify with primary sources" on every summary. LLM judge decisions visible with reasoning. About page names GPT-4. Blocked events show blocking rationale. |
| Statistical presentation | 6/10 | Hit rate color coding (green >60%, yellow 40-60%, red <40%). Tooltips on metrics. But 41.76% hit rate shown without confidence intervals. "Background" bucket shows 731% avg T5 move on 12 verdicts — outlier not flagged. No Sharpe ratio or risk-adjusted metrics. |
| Contact/support info | 2/10 | "[placeholder email]" on About page. No support email, Discord invite, Twitter handle, team names, or physical address. **Weakest area across all personas.** |

**Overall Satisfaction: 6.1/10**
**NPS: 6/10** (Passive)

> "Event Radar has genuinely impressive transparency infrastructure — the source journey pipeline, the AI judge reasoning, and the 'calibration layer, not a victory lap' framing are all things I wish Bloomberg had. But right now 99% of the alerts have no resolved outcomes, the hit rate is below a coin flip on a thin sample, and the contact page literally says '[placeholder email].' I want to trust it, but the data needs another quarter of seasoning before I'd cite it in a research note."

---

## Persona 3: Jordan (College Student, Beginner Investor)

**Focus:** Onboarding flow, UI clarity, jargon understanding, tooltips, mobile experience, accessibility.

### Scores

| Area | Score | Notes |
|------|-------|-------|
| Onboarding flow | 8/10 | 4-step wizard (Welcome → Watchlist → Notifications → Done). Sample alert card in Step 1 is great. Severity levels explained with real examples in Step 3. Confetti on completion. No way to re-trigger after completion. |
| UI clarity & jargon | 7/10 | Severity badges have tooltips. Direction badges explain Bullish/Bearish. But "Golden Judge", "Squawk", "Regime Context", "calibration by model confidence", "conviction tracks reality" still unexplained. Scorecard is a wall of finance jargon. |
| Tooltips & help | 8/10 | Severity badges, direction badges, scorecard metric labels all have tooltips. Smart Feed info button works. BUT: all tooltips use native `title` attributes — **invisible on mobile/touch devices**. Biggest gap. |
| Mobile experience (375px) | 7.5/10 | Responsive layout, safe-area-inset support, 44px touch targets on major elements, swipeable cards. Bottom nav labels at 10px are tiny. Scorecard is content-heavy for mobile. No mobile-specific search trigger button. |
| Navigation & IA | 8.5/10 | 5-item bottom nav (Feed, Watchlist, Scorecard, Search, Settings) with active highlighting. 404 catch-all works. History page has NO navigation path to reach it. No explicit back button on detail pages. |
| Accessibility | 7.5/10 | `aria-label` on most elements, `role="status"` on connection indicator, semantic HTML (`article`, `section`, `nav`). But 10-11px text violates WCAG minimums. No skip-to-main-content link. Dark mode only — no light mode option. |
| Error handling | 9/10 | 404 page with "Go to Feed" CTA. ErrorBoundary with reload button. Scorecard graceful states for empty/building/error. Connection indicator with retry. Platform-specific push permission recovery. |
| Settings & config | 7.5/10 | Comprehensive: push alerts, Discord webhook, email, quiet hours, push cap, audio squawk. Auto-save with toast confirmation. "Audio squawk" is unexplained jargon. Discord webhook setup needs a tutorial link. |

**Overall Satisfaction: 7.9/10**
**NPS: 8/10** (Promoter)

> "Honestly, I was surprised how much I could figure out on my own — the onboarding walked me through picking stocks and the severity levels actually made sense with the examples. The tooltips on the badges saved me from Googling 'bearish' for the hundredth time. But once I got to the Scorecard page with all the 'buckets' and 'hit rates,' I felt like I walked into someone else's advanced finance class. If they could explain those deeper pages the same way they explain the basics, I'd use this every day."

---

## Persona 4: Lisa (Product Manager, Fintech)

**Focus:** API quality, architecture, error handling, performance, SEO, PWA, security, production readiness.

### Scores

| Area | Score | Notes |
|------|-------|-------|
| API quality | 7/10 | `/health` returns version, uptime, per-scanner status, DB connectivity, WebSocket count (TTFB 16ms). `/api/v1/dashboard` is rich. But mixed versioning: `/api/events` works, `/api/v1/events` 404s. `/api/v1/scorecards` 404. No OpenAPI/Swagger docs. |
| Architecture & code quality | 8/10 | Well-structured monorepo, 270 TS files in backend, 114 test files (42% test ratio). 12 scanners, sophisticated pipeline (dedup → LLM classify → rule engine → gatekeeper → delivery). Market regime with real VIX/SPY/RSI. |
| Error handling | 8/10 | Consistent JSON errors with `statusCode`, `error`, `message`. Malformed JSON returns proper 400 with Fastify error code. No visible input validation for query params like `?limit=-1`. No rate limit headers. |
| Performance | 8/10 | `/health` 16ms, `/api/events?limit=50` 46ms for 23,740 rows, dashboard <50ms. Memory 180MB — reasonable. **Frontend running in Vite dev mode** (HMR scripts visible) — not production build. |
| SEO basics | 4/10 | Title and meta description present. `robots.txt` and `sitemap.xml` both serve SPA shell, not actual content. No Open Graph or Twitter Card tags. Client-rendered SPA = empty `<div id="root">` for crawlers. |
| PWA capabilities | 7/10 | `manifest.webmanifest` exists. Service worker implementation in codebase. Web Push support. But manifest has no `icons` field (required for installability). Dev mode means SW likely not registered. |
| Security headers | 8/10 | CSP present and restrictive. `X-Frame-Options: DENY`. `X-Content-Type-Options: nosniff`. CORS with specific origin. API key + JWT auth. But CORS hardcoded to `localhost:5173`. No HSTS header. |
| Production readiness | 6/10 | Mature backend (12 scanners, 23K events, pipeline, auth). But: frontend in dev mode, API versioning inconsistent, CORS hardcoded, no API docs, version 0.0.1, Truth Social scanner degraded. |

**Overall Satisfaction: 7.0/10**
**NPS: 7/10** (Passive)

> "The backend architecture genuinely impressed me — 12 live scanners, a sophisticated pipeline with LLM classification, and sub-50ms API responses against 24K events shows real engineering depth. But the frontend is still running in dev mode with HMR scripts exposed, the API versioning is inconsistent, and the lack of OpenAPI docs would slow down any integration effort on our side. I'd want to see a production build, proper CORS configuration, and API documentation before bringing this to our engineering team for a proof-of-concept."

---

## Persona 5: Ray (Retired Portfolio Manager, 60+)

**Focus:** Font sizes, contrast ratios, information density, navigation simplicity, dark theme readability.

### Scores

| Area | Score | Notes |
|------|-------|-------|
| Font sizes & readability | 6/10 | Headlines at 17px are fine. Everything else is too small: card metadata 11px, bottom nav labels **10px**, scorecard column labels 11px uppercase, footer 11-12px, thesis preview 13px italic tertiary. Need reading glasses for half the UI. |
| Contrast ratios | 7/10 | Primary text (#fafaf9 on #09090b) is excellent ~19.5:1. Tertiary text (#71717a) at ~4.6:1 fails WCAG AA for the small sizes it's used on (nav labels, timestamps, source names). Card borders (#252834) barely visible. |
| Information density | 7/10 | Good card hierarchy, collapsible sections on Scorecard. Feed cards could use more whitespace between them. LOW cards too compressed. Feed header packs many controls into one row. |
| Navigation simplicity | 8/10 | Bottom nav with 5 clear items. **3-click test passes** for all paths: feed→event, search→ticker, watchlist→ticker. Feed mode dropdown looks like a label (not obviously interactive). About page buried in footer. History page undiscoverable. |
| Dark theme readability | 7/10 | Background (#09090b) with gradient is pleasant, not harsh. Severity colors are distinguishable. Bull/bear case tints at 5% opacity nearly invisible. Theme itself is comfortable — issues are text size, not theme. |
| Finding specific info | 7/10 | Scorecard: 1 click. Ticker events: 2 clicks. Settings: 1 click. About page: requires scrolling to footer with 12px tertiary links. Should be in Settings or more prominent. |
| Click target sizes | 8/10 | Major elements use 44px minimum (Apple guideline). Ticker chips (11px, tiny padding) and watchlist star (14px icon) are too small for 60+ users with less precise motor control. |
| Usability without docs | 7/10 | Intuitive layout, market knowledge carries through domain terminology. Feed mode dropdown not obviously interactive. Main friction: discovering About page and History page. |

**Overall Satisfaction: 7.1/10**
**NPS: 7/10** (Passive)

> "Look, the bones of this thing are solid — it pulls from SEC filings, news, social, all in one feed, and the scorecard is honest about what it knows and what it doesn't. That's rare. But I'm 63 years old and half the text on this screen is the size of a legal disclaimer. Make the bottom nav labels bigger, bump up the card metadata to something I can read without my reading glasses, and give me a way to find the About page without scrolling to the bottom of the earth. Do that and I'd use this every morning with my coffee."

---

## Aggregate Results

### Scores by Persona

| Persona | Avg Score | NPS | Role |
|---------|-----------|-----|------|
| Sarah (Day Trader) | 7.0 | 6 | Power user |
| Marcus (Hedge Fund Analyst) | 6.1 | 6 | Skeptic |
| Jordan (College Student) | 7.9 | 8 | Beginner |
| Lisa (Product Manager) | 7.0 | 7 | Evaluator |
| Ray (Retired Manager) | 7.1 | 7 | Accessibility |
| **Overall** | **7.0** | **6.8** | |

### Score Trajectory

| Test | Date | Personas | Overall Score | NPS |
|------|------|----------|---------------|-----|
| First test | 2026-03-21 | Baseline | 5.8 | 5.3 |
| Second test | 2026-03-23 | 3 personas | 7.0 | 6.3 |
| Retest (post-fixes) | 2026-03-23 | 3 personas | 8.1 | 7.7 |
| **This test (comprehensive)** | **2026-03-23** | **5 personas** | **7.0** | **6.8** |

**Note:** The 3-persona retest scored 8.1 because it measured improvement on previously-identified issues (fake charts, 404, tooltips, About page). This 5-persona comprehensive test adds two new evaluator profiles (Lisa: technical/API, Ray: accessibility/readability) who exposed entirely new issue categories (production readiness, font sizes, API documentation) that weren't measured before. The underlying product is the same — the broader lens reveals more areas for improvement.

---

## Top 10 Issues Found (Prioritized)

| # | Issue | Severity | Persona(s) | Impact |
|---|-------|----------|------------|--------|
| 1 | **Signal-to-noise ratio** — 90%+ of feed is StockTwits trending noise. Zero SEC filings, trading halts, or insider moves in current feed. | CRITICAL | Sarah, Marcus | Core product value undermined |
| 2 | **Contact email is "[placeholder email]"** on About page | HIGH | Marcus, Ray, Lisa | Trust-destroying for a financial product |
| 3 | **Font sizes too small** — Bottom nav 10px, card metadata 11px, scorecard labels 11px, footer 11-12px | HIGH | Ray, Jordan | Accessibility failure for 60+ users |
| 4 | **Frontend running in Vite dev mode** — HMR scripts exposed, no code splitting, no minification | HIGH | Lisa | Not production-ready |
| 5 | **Tooltips invisible on mobile** — All use native `title` attributes, which don't fire on touch | HIGH | Jordan, Ray | Mobile users can't access jargon explanations |
| 6 | **Only 0.82% verdict rate** — 91 usable verdicts out of 11,028 alerts; only trading halts produce outcomes | HIGH | Marcus | Scorecard credibility limited |
| 7 | **API versioning inconsistent** — `/api/events` works, `/api/v1/events` 404s. No OpenAPI docs. | MEDIUM | Lisa | Integration friction |
| 8 | **Tertiary text contrast fails WCAG AA** — #71717a on #09090b (~4.6:1) used on small text throughout | MEDIUM | Ray | Accessibility compliance |
| 9 | **History page undiscoverable** — `/history` route exists but no navigation link anywhere | MEDIUM | Jordan, Ray | Feature invisibility |
| 10 | **No SEO/social sharing** — No Open Graph tags, sitemap serves SPA shell, client-rendered only | MEDIUM | Lisa | Zero discoverability |

---

## Top 10 Things Working Well

| # | Strength | Persona(s) |
|---|----------|------------|
| 1 | **Data provenance pipeline** — Full Source Journey (Source → Rule Filter → AI Judge → Enriched → Delivered) with timestamps and confidence scores visible on every event | Marcus, Sarah |
| 2 | **Scorecard honesty** — "Coming soon" placeholder instead of fake charts. "Calibration layer, not a victory lap" framing. Real severity data from API. | Marcus, Lisa |
| 3 | **Backend architecture** — 12 live scanners, sub-50ms API responses, sophisticated pipeline with LLM classification, 23K+ real events | Lisa, Sarah |
| 4 | **Onboarding wizard** — 4-step flow with sample alert, sector packs, severity explanations, confetti completion. Genuinely good for beginners. | Jordan |
| 5 | **AI disclosure & transparency** — "AI-generated analysis · Verify with primary sources" on every summary. LLM judge reasoning visible. About page names GPT-4. | Marcus, Jordan |
| 6 | **Watchlist features** — Drag-and-drop reorder, per-ticker event counts, sections, multi-select batch ops, swipe-to-add from feed | Sarah, Ray |
| 7 | **Notification system** — Signal tier matrix, Web Push with platform-specific recovery, Discord webhook, quiet hours, daily cap, audio squawk | Sarah, Lisa |
| 8 | **Error handling** — 404 catch-all, ErrorBoundary, graceful empty/building/error states on Scorecard, connection indicator with retry | Jordan, Lisa |
| 9 | **Dark theme design** — Professional, consistent, comfortable for extended reading. Severity color system works well. 19.5:1 primary text contrast. | Ray, Jordan |
| 10 | **Evidence tab quality** — Real source URLs, EDGAR links with accession numbers, raw excerpts, source-specific cards, "View on EDGAR" deep links | Marcus, Sarah |

---

## Cross-Persona Heat Map

| Area | Sarah | Marcus | Jordan | Lisa | Ray | Avg |
|------|-------|--------|--------|------|-----|-----|
| Core feed/content | 7 | 7 | 8 | — | 7 | 7.3 |
| Trust/transparency | 7 | 6 | 8 | — | — | 7.0 |
| Navigation/UX | — | — | 8.5 | — | 8 | 8.3 |
| Performance/API | 7 | — | — | 8 | — | 7.5 |
| Accessibility | — | — | 7.5 | — | 6.5 | 7.0 |
| Production readiness | — | — | — | 6 | — | 6.0 |

**Weakest dimension:** Production readiness (6.0) — driven by dev-mode frontend, missing API docs, CORS issues.
**Strongest dimension:** Navigation/UX (8.3) — bottom nav, 3-click test, 404 handling all solid.

---

## Recommendations for Next Round

### P0 — Must fix
1. **Fix signal-to-noise ratio** — Tighten StockTwits filtering or deprioritize in Smart Feed. Ensure SEC, trading halt, and insider data flows to feed.
2. **Replace "[placeholder email]" with real contact** — Even a simple hello@eventradar.io would do.
3. **Increase minimum font sizes** — Bottom nav to 12px, card metadata to 13px, scorecard labels to 12px.
4. **Deploy production frontend build** — Remove Vite HMR, enable code splitting and minification.

### P1 — Should fix
5. **Add touch-friendly tooltips** — Replace native `title` attributes with tap-to-show tooltip components for mobile.
6. **Improve outcome tracking coverage** — Extend verdict pipeline beyond trading halts to SEC, news, and earnings events.
7. **Standardize API versioning** — All routes under `/api/v1/`. Add OpenAPI/Swagger docs.
8. **Improve tertiary text contrast** — Bump #71717a to #a1a1aa for small text elements.

### P2 — Nice to have
9. **Add History page to navigation** — Either bottom nav or a link from Settings/Feed.
10. **Add Open Graph meta tags** — Enable social sharing previews.
11. **Add confidence intervals to hit rate** — n=91 → 95% CI ±10pp. Show it.
12. **Explain remaining jargon** — "Golden Judge", "Squawk", "Regime Context" need plain-language tooltips.

---

## Verdict

The comprehensive 5-persona test reveals Event Radar at **7.0/10 overall with 6.8 NPS**. The product has made significant trust and UX improvements since the first test (5.8 → 7.0), with honest scorecard presentation, good onboarding, strong data provenance, and solid navigation being clear strengths.

However, two new personas (Lisa: technical evaluator, Ray: accessibility) exposed previously unmeasured gaps: the frontend is not production-deployed, font sizes exclude older users, API documentation is missing, and the signal-to-noise ratio remains the #1 user-facing problem across all personas.

The path to 8.0+ requires fixing the feed noise (content quality), the "[placeholder email]" (trust), font sizes (accessibility), and the dev-mode deployment (production readiness). These are all tractable fixes that would lift every persona's score.
