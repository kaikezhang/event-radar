# CrowdTest — Deep Interactive QA for Event Radar

## Purpose

Run a rigorous, interaction-driven QA test of Event Radar from the perspective of multiple user personas. Unlike shallow "page loaded = pass" testing, every test case **defines expected behavior FIRST**, then **performs the actual interaction**, then **compares result vs expectation**.

## Core Philosophy

> "If you didn't type into the search box and verify results, you didn't test search."

Every feature MUST be tested by **doing the thing**, not just seeing that the UI element exists.

## Test Structure

For every test case:
```
1. EXPECTED: What should happen when I do X
2. ACTION: Actually do X (click, type, submit, call API)
3. RESULT: What actually happened
4. VERDICT: ✅ PASS / ❌ FAIL / ⚠️ PARTIAL (with explanation)
```

## Test Execution Method

- Use **Playwright MCP** or **browser tool** to interact with pages
- Use **curl/fetch** to test API endpoints directly
- **Screenshot** or **snapshot** after each interaction to verify
- **Never** mark something as "Working" without performing the interaction

## Test Suite

### Phase 1: Core Functionality (must all pass for beta)

#### TC-01: Feed Loads with Real Events
```
EXPECTED: Feed page shows recent events with severity badges, timestamps, source labels
ACTION: Navigate to / → Skip onboarding → Check feed
VERIFY:
  - [ ] At least 5 events visible
  - [ ] Each event has: title, severity badge (CRITICAL/HIGH/MEDIUM/LOW), source, timestamp
  - [ ] Events sorted by recency (newest first)
  - [ ] "Live" indicator shows connection status
```

#### TC-02: Event Detail Page Shows Full Analysis  
```
EXPECTED: Clicking an event shows summary, classification, evidence, historical context
ACTION: Click any event in feed → Check detail page tabs
VERIFY:
  - [ ] Summary tab: AI analysis with bull/bear case
  - [ ] Classification badge visible (BULLISH/BEARISH/NEUTRAL + confidence)
  - [ ] Evidence tab: source URL or raw text (NOT "Source data not available")
  - [ ] Trust score or similar events section
  - [ ] Price at event time shown (if ticker exists)
  - [ ] "View original source" link works (opens in new tab)
```

#### TC-03: Search Actually Returns Results
```
EXPECTED: Searching for a known ticker returns matching events
ACTION: 
  1. Navigate to /search
  2. Type "SPY" in search box → Press Enter
  3. Verify results appear
  4. Type "Iran" in search box → Press Enter  
  5. Verify text-based results appear
VERIFY:
  - [ ] Ticker search (SPY) returns events with SPY ticker
  - [ ] Text search (Iran) returns events mentioning Iran
  - [ ] Results show event cards with title, severity, date
  - [ ] Clicking a result navigates to event detail
  - [ ] "No results" only shown for genuinely absent queries
PRE-CHECK: curl /api/events?ticker=SPY to confirm data exists
```

#### TC-04: Search Popular Ticker Buttons Work
```
EXPECTED: Clicking $AAPL/$NVDA/$SPY buttons performs search or navigates to ticker page
ACTION: Navigate to /search → Click "$SPY" button
VERIFY:
  - [ ] Page navigates or search executes
  - [ ] Results or ticker profile shown
  - [ ] NOT showing "No results" for major tickers with data in DB
```

#### TC-05: Watchlist CRUD
```
EXPECTED: Can add/remove tickers from watchlist
ACTION:
  1. Navigate to /watchlist
  2. If empty, navigate to an event with a ticker
  3. Click "Add to watchlist" button
  4. Navigate back to /watchlist
  5. Verify ticker appears
VERIFY:
  - [ ] Add to watchlist button exists on event cards
  - [ ] After adding, ticker appears on watchlist page
  - [ ] Watchlist shows event count per ticker
```

#### TC-06: Calendar Shows Scheduled Events Only
```
EXPECTED: Calendar shows time-bound events (earnings, economic data), NOT social media trending
ACTION: Navigate to /calendar
VERIFY:
  - [ ] Events have specific dates/times
  - [ ] Sources are: earnings, econ-calendar, sec-edgar, fda, congress
  - [ ] NO StockTwits trending or Reddit posts
  - [ ] Week/month view works
```

#### TC-07: Scorecard Shows Real Statistics
```
EXPECTED: Scorecard shows event tracking stats with non-zero outcomes
ACTION: Navigate to /scorecard
VERIFY:
  - [ ] Total events tracked shown (should be 20,000+)
  - [ ] Source accuracy breakdown visible
  - [ ] Outcome intervals shown (1h, 1d, T+5, etc.)
  - [ ] At least some intervals have non-zero values
  - [ ] NOT all 0.0% across the board
```

#### TC-08: Settings Page Loads All Sections
```
EXPECTED: Settings shows notification config, display preferences, font size control
ACTION: Navigate to /settings
VERIFY:
  - [ ] Push alerts toggle exists
  - [ ] Discord webhook config exists
  - [ ] Email digest config exists
  - [ ] Font size control exists (small/medium/large)
  - [ ] Font size change actually affects page text
```

### Phase 2: Authentication & Sign-in

#### TC-09: Magic Link Sign-in Flow
```
EXPECTED: Entering email sends magic link, shows confirmation
ACTION:
  1. Navigate to /login
  2. Type "test@example.com" in email field
  3. Click "Send magic link"
VERIFY:
  - [ ] No validation error on valid email
  - [ ] Shows "Check your email" confirmation page
  - [ ] OR shows meaningful error (not JSON parse error, not 530, not 503)
  - [ ] Autofilled email (mobile) also works without errors
```

#### TC-10: Login with Autofill (Mobile Simulation)
```
EXPECTED: Autofill should not cause pattern validation errors
ACTION: 
  1. Navigate to /login
  2. Type email with leading/trailing spaces: "  test@example.com  "
  3. Submit
VERIFY:
  - [ ] Trimmed automatically, no "pattern mismatch" error
  - [ ] type="text" with inputMode="email" (not type="email")
```

### Phase 3: API Endpoint Verification

#### TC-11: Public API Health
```
EXPECTED: /api/health returns system status without auth
ACTION: curl http://localhost:3001/api/health
VERIFY:
  - [ ] Returns 200 with JSON
  - [ ] Contains: status, version, uptime, services.database, services.scanners
  - [ ] database = "connected"
  - [ ] scanners.active > 0
```

#### TC-12: API with Key Returns Data
```
EXPECTED: /api/events with API key returns classified events
ACTION: curl -H "x-api-key: er-dev-2026" http://localhost:3001/api/events?limit=5
VERIFY:
  - [ ] Returns 200 with data array
  - [ ] Events have: id, source, title, summary, severity, metadata
  - [ ] At least some events have non-null classification field
  - [ ] classificationConfidence is number or null (not empty string)
  - [ ] rawPayload NOT present in response
```

#### TC-13: API without Key from Browser Works
```
EXPECTED: Browser requests (with referer/cookie) bypass API key requirement
ACTION: 
  1. From browser, navigate to any page that fetches /api/events
  2. Check browser DevTools network tab for 401 errors
  3. Also: curl without API key but with Referer header
VERIFY:
  - [ ] Browser requests to /api/events return 200 (not 401)
  - [ ] curl with Referer header returns 200
  - [ ] curl WITHOUT Referer AND without API key returns 401
```

#### TC-14: API Classification Filter Works
```
EXPECTED: ?classification=BEARISH returns only BEARISH events
ACTION: curl -H "x-api-key: er-dev-2026" "http://localhost:3001/api/events?classification=BEARISH&limit=10"
VERIFY:
  - [ ] All returned events have classification = "BEARISH"
  - [ ] Count is less than total events (filter is working, not returning all)
  - [ ] Invalid classification value returns 400 error
```

#### TC-15: API Rate Limiting
```
EXPECTED: 100+ rapid requests get rate limited
ACTION: Send 105 rapid requests with API key
VERIFY:
  - [ ] First 100 return 200 with X-RateLimit-Remaining header
  - [ ] Requests 101+ return 429
  - [ ] X-RateLimit-Limit header = 100
```

### Phase 4: Classification & Data Quality

#### TC-16: Geopolitical Events Have Correct Direction
```
EXPECTED: Military/trade/sanctions events are NOT classified as NEUTRAL
ACTION: Search for events mentioning "Iran", "tariff", "sanctions", "military"
VERIFY:
  - [ ] Military escalation events → BEARISH (not NEUTRAL)
  - [ ] Trade deal/peace events → BULLISH (not NEUTRAL)
  - [ ] NEUTRAL only for genuinely ambiguous events
```

#### TC-17: Ticker Extraction Quality
```
EXPECTED: No full company names as tickers (FORD→F, GOOGLE→GOOGL)
ACTION: curl API and check ticker fields
VERIFY:
  - [ ] No ticker longer than 5 chars (except known exceptions like BRK.B)
  - [ ] "FORD" does not appear as ticker (should be "F")
  - [ ] No ETF fallback tickers (QQQ/SPY) on unrelated events
```

#### TC-18: Outcome Values Are Capped
```
EXPECTED: No outcome percentages exceed ±200%
ACTION: Query scorecard or event outcomes from API
VERIFY:
  - [ ] All percentage values between -200% and +200%
  - [ ] No ±448% or other uncapped outliers
```

### Phase 5: UI Polish & Accessibility

#### TC-19: Font Size Control Works
```
EXPECTED: Changing font size in settings affects all text
ACTION:
  1. Navigate to /settings
  2. Change font size to "Large"
  3. Navigate to /feed
VERIFY:
  - [ ] Text visibly larger across all pages
  - [ ] Setting persists after page refresh
  - [ ] Can toggle back to small/medium
```

#### TC-20: WebSocket Connection Status
```
EXPECTED: Shows accurate connection state
ACTION: Observe header status indicator
VERIFY:
  - [ ] Shows "Connected" or "Live" when WebSocket is active
  - [ ] Shows "Offline" or "Reconnecting..." when disconnected
  - [ ] Does NOT show "Live" when WebSocket is actually dead
```

#### TC-21: Daily Briefing Expandable
```
EXPECTED: Briefing card expands to show details on click
ACTION: Find daily briefing card → Click it
VERIFY:
  - [ ] Card expands to show market regime details
  - [ ] Can collapse back
  - [ ] NOT a dead click (no response)
```

#### TC-22: About Page AI References
```
EXPECTED: No hardcoded AI model names
ACTION: Navigate to /about
VERIFY:
  - [ ] Text says "advanced language models" or similar
  - [ ] Does NOT say "GPT-4" or "Claude" specifically
  - [ ] AI Disclosure section exists
```

#### TC-23: Mobile Responsiveness
```
EXPECTED: All pages work at mobile viewport (375px wide)
ACTION: Set viewport to 375x812 (iPhone) → Navigate each main page
VERIFY:
  - [ ] Bottom navigation visible and tappable
  - [ ] Feed cards readable (no horizontal overflow)
  - [ ] Text not truncated beyond readability
  - [ ] Buttons are large enough to tap (min 44x44px touch target)
```

### Phase 6: Edge Cases & Error Handling

#### TC-24: Empty States
```
EXPECTED: Graceful empty states for no-data scenarios
ACTION: Search for nonsense string "xyzzy12345"
VERIFY:
  - [ ] Shows "No results found" with suggestion
  - [ ] Does NOT show error/crash/blank page
  - [ ] Has call-to-action (clear search, back to feed)
```

#### TC-25: Invalid Event ID
```
EXPECTED: 404 page for non-existent event
ACTION: Navigate to /event/00000000-0000-0000-0000-000000000000
VERIFY:
  - [ ] Shows "Event not found" or 404 page
  - [ ] Does NOT show blank white page or JSON error
  - [ ] Has navigation back to feed
```

#### TC-26: Price Endpoint Resilience
```
EXPECTED: Price API returns data or graceful fallback
ACTION: curl http://localhost:3001/api/price/batch?tickers=AAPL,MSFT,FAKE123
VERIFY:
  - [ ] Returns 200 (not 503)
  - [ ] Known tickers have price data
  - [ ] Unknown tickers return null (not error)
  - [ ] Response within 5 seconds
```

## Persona Scoring

After completing ALL test cases above, score from each persona's perspective.

For each persona, assign scores to these categories:
1. **Alert Speed & Relevance** (0-10)
2. **Classification Accuracy** (0-10)  
3. **Data Reliability** (0-10) — prices, outcomes, evidence
4. **Search & Discovery** (0-10)
5. **UI/UX Quality** (0-10)
6. **API/Integration** (0-10) — only for technical personas
7. **Trust & Transparency** (0-10)
8. **Value for Price** (0-10) — would pay $39/mo?

### Personas

1. **Sarah** — Day trader ($500K, Benzinga Pro user)
2. **Marcus** — Hedge Fund CFA (Bloomberg Terminal)
3. **Jordan** — College student (Reddit/Robinhood beginner)
4. **David** — Swing trader ($100K, Unusual Whales)
5. **Maria** — Financial advisor RIA ($20M AUM)
6. **Ray** — Retired PM (60+, accessibility needs)
7. **Chen Wei** — Quant developer (prop trading firm)
8. **Lisa** — Fintech PM (evaluating for partnership)
9. **Mike** — Crypto/macro trader (follows Trump)
10. **Priya** — ESG analyst (pension fund)

## Output Format

Save results to `docs/reviews/crowdtest-YYYY-MM-DD.md` with:

1. **Test Suite Results** — every TC with PASS/FAIL/PARTIAL and actual result
2. **Regression Check** — compare with previous test results
3. **Per-Persona Scores** — table with all categories
4. **Aggregate Scores** — category averages, overall, NPS
5. **Score Trajectory** — chart showing historical scores
6. **Top Issues** — ranked by severity, with affected personas
7. **Top Strengths** — what's working well
8. **Beta Readiness Verdict** — YES/NO with conditions
9. **Before/After Comparison** — if previous test exists

## Critical Rules

1. **NEVER mark a feature as "Working" without interacting with it**
2. **Pre-check data exists** before testing (curl API to confirm)
3. **Test both happy path AND edge cases** for every feature
4. **Test from the ACTUAL deployed URL**, not localhost (unless testing API)
5. **Record exact error messages** — "didn't work" is not acceptable
6. **Test API both WITH and WITHOUT auth** to verify middleware behavior
7. **Every test produces a PASS/FAIL** — no ambiguous "mostly works"
