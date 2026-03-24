# CrowdTest — Persona-Driven Interactive QA for Event Radar

## Purpose

Simulate 10 real users with different backgrounds, each navigating the app **as they naturally would**, performing actions relevant to their workflow, and scoring based on whether things work for their use case.

## Core Philosophy

> "If you didn't type into the search box and verify results, you didn't test search."
> "Each persona tests the app through THEIR lens, not a generic checklist."

Every feature MUST be tested by **doing the thing**, not just seeing that the UI element exists.

## Test Execution Method

- Use **Playwright MCP** or **browser tool** to interact with pages
- Use **curl** to test API endpoints directly
- **Snapshot** after each interaction to verify what's on screen
- **Never** mark something as "Working" without performing the interaction
- Each persona runs their **own journey** through the app

## Verification Pattern

For every action a persona takes:
```
EXPECTED: What should happen
ACTION: What I actually did (click, type, curl)  
RESULT: What actually happened (quote exact text/error from snapshot)
VERDICT: ✅ PASS / ❌ FAIL / ⚠️ PARTIAL
```

## Pre-Flight Checks (before any persona runs)

Run these first to ensure the environment is testable:

```bash
# 1. Backend alive?
curl -s http://localhost:3001/api/health | jq .

# 2. Frontend accessible?
curl -s -o /dev/null -w "%{http_code}" $APP_URL

# 3. How many events in DB?
curl -s -H "x-api-key: er-dev-2026" "http://localhost:3001/api/events?limit=1" | jq '.total'

# 4. Any events with classification?
curl -s -H "x-api-key: er-dev-2026" "http://localhost:3001/api/events?classification=BEARISH&limit=1" | jq '.total'

# 5. Which tickers have data?
curl -s -H "x-api-key: er-dev-2026" "http://localhost:3001/api/events?ticker=SPY&limit=1" | jq '.total'
curl -s -H "x-api-key: er-dev-2026" "http://localhost:3001/api/events?ticker=AAPL&limit=1" | jq '.total'
```

Record all pre-flight results. If backend is down or zero events, STOP and report.

---

## Persona Journeys

### 👩‍💻 Persona 1: Sarah — Day Trader ($500K, Benzinga Pro user)

**Profile:** Full-time day trader, needs sub-second alerts, trades earnings/halts/breakouts, pays $150/mo for Benzinga Pro.

**Sarah's Journey:**
1. **Open the app** → Skip onboarding
   - VERIFY: Feed loads with real events, not demo data
   - VERIFY: "Live" indicator shows actual WebSocket status
   
2. **Scan the feed for today's actionable events**
   - VERIFY: Events have severity badges, timestamps, source labels
   - VERIFY: At least 1 event today has a classification (BULLISH/BEARISH)
   - Count how many events are visible without scrolling
   
3. **Click the highest-severity event**
   - VERIFY: Detail page loads with AI analysis (bull/bear case)
   - VERIFY: Evidence tab shows real source data (NOT "Source data not available")
   - VERIFY: Price at event time is shown (if ticker exists)
   - Click "View original source" link → VERIFY it opens real URL
   
4. **Search for "NVDA"** (her favorite stock)
   - Navigate to /search → Type "NVDA" → Enter
   - VERIFY: Results appear (or explain why none exist)
   - PRE-CHECK: `curl /api/events?ticker=NVDA` to see if data exists
   
5. **Search for "Iran"** (today's big macro story)
   - Type "Iran" in search → Enter
   - VERIFY: Events about Iran/geopolitical situation appear
   
6. **Check the Scorecard**
   - Navigate to /scorecard
   - VERIFY: Total events tracked > 20,000
   - VERIFY: Outcome percentages are NOT all 0.0%
   - VERIFY: No outcome exceeds ±200%

**Sarah's Score Categories:** Alert Speed, Event Quality, Classification Accuracy, Price Context, Actionability, Source Coverage, Search, Mobile

---

### 👨‍💼 Persona 2: Marcus — Hedge Fund CFA (Bloomberg Terminal)

**Profile:** Fundamental analyst at $2B fund, requires institutional-grade data provenance and audit trail.

**Marcus's Journey:**
1. **Test the API programmatically** (Marcus uses APIs, not GUIs)
   ```bash
   # Health check
   curl -s http://localhost:3001/api/health | jq .
   
   # List events with auth
   curl -s -H "x-api-key: er-dev-2026" "http://localhost:3001/api/events?limit=5" | jq '.data[0] | {id, classification, classificationConfidence, ticker, severity}'
   
   # Classification filter
   curl -s -H "x-api-key: er-dev-2026" "http://localhost:3001/api/events?classification=BEARISH&limit=5" | jq '.data | length'
   
   # Without API key (should 401 for programmatic access)
   curl -s "http://localhost:3001/api/events?limit=1" | jq .
   ```
   - VERIFY: classification field is NOT null/empty on classified events
   - VERIFY: filter returns only BEARISH events
   - VERIFY: no rawPayload in response
   - VERIFY: rate limit headers present (X-RateLimit-Limit, X-RateLimit-Remaining)

2. **Check Evidence tab on 3 different events**
   - Click 3 events from different sources (SEC, Breaking News, Truth Social)
   - For each: check Evidence tab
   - VERIFY: At least 2 of 3 have real source data (URL or text)

3. **Verify data quality on event detail**
   - Find an SEC 8-K filing event
   - VERIFY: "View filing →" link goes to real SEC EDGAR URL
   - VERIFY: Ticker is correct (e.g., FCX not QQQ for a Freeport-McMoRan filing)
   
4. **Check API docs page**
   - Navigate to /api-docs (if it exists in frontend)
   - VERIFY: Endpoint documentation is present

**Marcus's Score Categories:** Data Quality, Source Provenance, Classification Rigor, Scorecard/Analytics, Historical Context, API Access, Compliance, Trust Framework

---

### 🧑‍🎓 Persona 3: Jordan — College Student (Reddit/Robinhood)

**Profile:** 20yo, $2K in Robinhood, follows r/wallstreetbets, wants simple explanations.

**Jordan's Journey:**
1. **First-time user experience**
   - Open app for the first time
   - VERIFY: Landing/onboarding page is welcoming
   - VERIFY: "Get started" and "Skip setup" buttons work
   - Click "Skip setup"
   
2. **Browse the feed casually**
   - VERIFY: Headlines are readable without finance jargon overload
   - Find one event Jordan would understand
   - VERIFY: Summary is in plain English
   
3. **Try the popular ticker buttons**
   - Navigate to /search → Click "$TSLA" button
   - VERIFY: Something happens (results or ticker page)
   - VERIFY: NOT a dead click or error page
   
4. **Try adding a stock to watchlist**
   - Find an event with a ticker
   - Click "Add to watchlist" button
   - Navigate to /watchlist
   - VERIFY: Ticker appears on watchlist

5. **Check settings**
   - Navigate to /settings
   - VERIFY: Font size control exists
   - Change font size → verify it changes

**Jordan's Score Categories:** Onboarding, Ease of Use, Learning Value, Jargon Level, Mobile Experience, Fun Factor, Watchlist, Price

---

### 📈 Persona 4: David — Swing Trader ($100K, Unusual Whales)

**David's Journey:**
1. **Look for multi-day catalysts in the feed**
   - Browse feed for events with tickers
   - VERIFY: At least some events have price + outcome tracking (price chips)
   
2. **Check historical outcomes on Scorecard**
   - Navigate to /scorecard
   - VERIFY: T+5 (or similar multi-day interval) shows data
   - VERIFY: Source accuracy breakdown exists
   
3. **Search for sector plays**
   - Search "oil" → VERIFY: energy-related events appear
   - Search "XLE" → VERIFY: ticker results
   
4. **Check Calendar for upcoming catalysts**
   - Navigate to /calendar
   - VERIFY: Shows scheduled events with dates
   - VERIFY: NO StockTwits trending posts in calendar
   - VERIFY: Events are from earnings/econ-calendar/sec/fda

**David's Score Categories:** Catalyst Detection, Outcome Tracking, Sector Analysis, Options Flow, Chart/Visual, Signal Quality, Calendar, Backtesting

---

### 👩‍💼 Persona 5: Maria — Financial Advisor RIA ($20M AUM)

**Maria's Journey:**
1. **Check today's macro events for client calls**
   - Browse feed for HIGH/CRITICAL events
   - VERIFY: Macro events (rates, geopolitical) are covered
   - VERIFY: Events mention specific impact on sectors/tickers
   
2. **Test notification settings**
   - Navigate to /settings
   - VERIFY: Discord webhook config exists
   - VERIFY: Email digest option exists
   - VERIFY: Notification budget / quiet hours exist
   
3. **Try the Daily Briefing**
   - Find the Daily Briefing card (if visible)
   - Click it → VERIFY it expands with details
   - VERIFY: NOT a dead click
   
4. **Check About page for compliance**
   - Navigate to /about
   - VERIFY: AI Disclosure section exists
   - VERIFY: Does NOT mention specific model names (GPT-4, Claude)
   - VERIFY: "Verify with primary sources" disclaimer present

**Maria's Score Categories:** Macro Coverage, Client Communication, Compliance, Alert Management, Reliability, Daily Briefing, Multi-Client, Professionalism

---

### 👴 Persona 6: Ray — Retired PM (60+, accessibility)

**Ray's Journey:**
1. **Test font size controls**
   - Navigate to /settings
   - Find font size control
   - Change to "Large" → Navigate to /feed
   - VERIFY: Text is visibly larger
   - Change back to "Medium"
   - VERIFY: Text returns to normal size
   - Refresh page → VERIFY: Font size setting persisted
   
2. **Test keyboard navigation**
   - Press "?" → VERIFY: keyboard shortcuts help appears
   
3. **Test readability on event detail**
   - Click any event
   - VERIFY: Key information (ticker, direction, price) is not buried
   - VERIFY: Text has sufficient contrast

**Ray's Score Categories:** Font Size, Contrast, Navigation, Information Density, Keyboard Access, Loading Speed, Error Handling, Audio Alerts

---

### 👨‍💻 Persona 7: Chen Wei — Quant Developer (prop trading firm)

**Chen Wei's Journey:**
1. **Comprehensive API audit**
   ```bash
   # Health endpoint
   curl -s http://localhost:3001/api/health | jq .
   
   # Events with classification
   curl -s -H "x-api-key: er-dev-2026" "http://localhost:3001/api/events?limit=3" | jq '.data[] | {classification, classificationConfidence, ticker}'
   
   # Filter by classification
   curl -s -H "x-api-key: er-dev-2026" "http://localhost:3001/api/events?classification=BULLISH&limit=5" | jq '[.data[] | .classification] | unique'
   
   # Verify rawPayload stripped
   curl -s -H "x-api-key: er-dev-2026" "http://localhost:3001/api/events?limit=1" | jq '.data[0] | has("rawPayload")'
   
   # Test without API key (programmatic = 401)
   curl -s "http://localhost:3001/api/events?limit=1" -w "\n%{http_code}"
   
   # Test with browser referer (should bypass)
   curl -s -H "Referer: https://example.com" "http://localhost:3001/api/events?limit=1" | jq '.data | length'
   
   # Rate limit headers
   curl -sI -H "x-api-key: er-dev-2026" "http://localhost:3001/api/events?limit=1" | grep -i "ratelimit"
   
   # Price batch
   curl -s -H "x-api-key: er-dev-2026" "http://localhost:3001/api/price/batch?tickers=AAPL,MSFT,FAKE123" | jq .
   
   # Invalid classification filter (should 400)
   curl -s -H "x-api-key: er-dev-2026" "http://localhost:3001/api/events?classification=INVALID" | jq .
   ```
   
2. **Check schema consistency**
   - VERIFY: classification is string or null (not empty string "")
   - VERIFY: classificationConfidence is number or null
   - VERIFY: severity is always one of CRITICAL/HIGH/MEDIUM/LOW
   - VERIFY: eventType field exists (even if null)

**Chen Wei's Score Categories:** API Quality, Data Schema, WebSocket, Bulk Data, Event Classification, Historical Data, Rate Limiting, Webhook/Callback

---

### 👩‍💼 Persona 8: Lisa — Fintech PM (evaluating for partnership)

**Lisa's Journey:**
1. **Product walkthrough for exec demo**
   - Navigate every main page: Feed → Watchlist → Calendar → Scorecard → Search → Settings → About
   - For EACH page: VERIFY it loads, has content, no errors in snapshot
   
2. **Test sign-in flow**
   - Navigate to /login
   - Type "demo@example.com"
   - Click "Send magic link"
   - VERIFY: Shows "Check your email" (NOT JSON error or pattern mismatch)
   
3. **Check pricing page**
   - Navigate to /pricing (if exists)
   - VERIFY: Pricing tiers visible or skeleton exists
   
4. **Evaluate design consistency**
   - VERIFY: Dark mode consistent across all pages
   - VERIFY: Footer on every page
   - VERIFY: Navigation works (clicking between pages doesn't break)

**Lisa's Score Categories:** Product Vision, Design Quality, Feature Completeness, Data Reliability, API/Integration, Competitive Edge, Scalability Signals, Partnership Readiness

---

### 🧔 Persona 9: Mike — Crypto/Macro Trader (follows Trump)

**Mike's Journey:**
1. **Look for Trump/Truth Social posts**
   - Browse feed for Truth Social source events
   - VERIFY: If any exist, they have CRITICAL or HIGH severity
   - VERIFY: Geopolitical events have non-NEUTRAL classification
   
2. **Search for geopolitical events**
   - Search "Iran" → VERIFY: results appear
   - Search "tariff" → VERIFY: results appear or "no results" (both acceptable)
   
3. **Check classification on Iran events**
   - Click an Iran-related event
   - VERIFY: Classification is BEARISH (military escalation) or BULLISH (peace talks)
   - VERIFY: NOT NEUTRAL on clearly directional geopolitical events
   
4. **Test ticker extraction quality**
   - Browse events with tickers
   - VERIFY: No "FORD" (should be "F")
   - VERIFY: No QQQ on unrelated events
   - VERIFY: Reasonable tickers (1-5 chars)

**Mike's Score Categories:** Trump/Truth Social, Geopolitical Coverage, Crypto Coverage, Speed, Cross-Asset, Classification, Notifications, Macro Thesis

---

### 👩‍🔬 Persona 10: Priya — ESG Analyst (pension fund)

**Priya's Journey:**
1. **Check regulatory source coverage**
   - Browse feed → filter or look for SEC/FDA/Congress sources
   - VERIFY: Multiple regulatory sources present
   
2. **Test edge cases**
   - Search nonsense string "xyzzy12345" → VERIFY: graceful empty state
   - Navigate to /event/00000000-0000-0000-0000-000000000000 → VERIFY: 404 page
   - Navigate to /nonexistent-page → VERIFY: 404 page
   
3. **Check About page for data transparency**
   - Navigate to /about
   - VERIFY: Lists data sources
   - VERIFY: AI disclosure present
   - VERIFY: Update frequency or freshness info

**Priya's Score Categories:** Regulatory Coverage, Sanctions/Geopolitical, ESG Detection, Company Mapping, Report Export, Historical Analysis, Compliance Integration, Data Granularity

---

## Scoring

Each persona scores their categories 0-10, plus:
- **NPS** (0-10): Would you recommend this?
- **Would pay $39/mo?**: Yes / Maybe / No (with reason)

## Output Format

Save to `docs/reviews/crowdtest-YYYY-MM-DD.md` with:

1. **Pre-Flight Results** — environment status
2. **Persona Journeys** — each persona's full journey with EXPECTED/ACTION/RESULT/VERDICT for every step
3. **Per-Persona Score Table** — all categories + NPS + payment willingness
4. **Aggregate Scores** — overall average, category averages
5. **Test Case Summary** — total PASS/FAIL/PARTIAL count
6. **Score Trajectory** — chart comparing to previous tests
7. **Top Issues** — ranked by severity
8. **Top Strengths** — what's working
9. **Beta Readiness Verdict** — YES/NO with conditions
10. **Comparison** — before/after table if previous test exists

## Critical Rules

1. **NEVER mark a feature as "Working" without interacting with it**
2. **Pre-check data exists** before testing (curl API first)
3. **Each persona DOES their own actions** — not just scoring after a generic test
4. **Record exact text** from snapshots — "didn't work" is not acceptable
5. **Test API both WITH and WITHOUT auth** 
6. **Every interaction produces a PASS/FAIL** — no ambiguous "mostly works"
7. **Different personas can test the same feature** — that's expected! They may find different issues based on their use case
