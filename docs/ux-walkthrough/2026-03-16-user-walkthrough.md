# Event Radar — Complete User Walkthrough

> Date: 2026-03-16 | Device: iPhone 14 Pro (390×844) | Mode: AUTH_REQUIRED=true
> All screenshots in this directory.

## User Journey

### Step 1: First Visit (Unauthenticated)
**Screenshot**: `01-feed-unauth.png`
**URL**: `/`
**What user sees**:
- Header: ⚡ Event Radar + Offline indicator + "Sign in" link
- Banner: "Viewing delayed public feed · Sign in for live →"
- "All Events" dropdown + Filters button
- Date-sectioned event feed: TODAY / YESTERDAY / Mar 13
- Each card: severity badge + source + time + title + summary
- Bottom nav: Feed / Watchlist / Search / Settings

**Notes**:
- Feed shows real events immediately — good first impression
- "Offline" status visible (WebSocket not connected)
- Default to "All Events" for unauth users ✅

### Step 2: Login Page
**Screenshot**: `02-login.png`
**URL**: `/login`
**What user sees**:
- "Sign in to Event Radar" heading
- Email input field with "you@example.com" placeholder
- "Send magic link" button (disabled until email entered)
- Value proposition above: "Track market-moving events. Get alerts that matter."

### Step 3: Magic Link Verification
**Screenshot**: `03-verify-error-but-logged-in.png`
**URL**: `/auth/verify?token=xxx`
**What user sees**:
- ⚠️ BUG: Shows "API error: 401" even when verification API returns 200
- However, header shows user avatar "T" (logged in from previous session cookies)
- This page needs debugging — verify flow has a race condition with AuthContext

### Step 4: Onboarding
**Screenshot**: `04-onboarding.png`
**URL**: `/onboarding`
**What user sees**:
- "Add tickers to get personalized alerts"
- Sector packs: Tech Leaders / Biotech / Energy / Finance
- Trending this week: SPY(71) / USO(69) / PATH(54) / QQQ(51) etc.
- Custom ticker input
- "You're watching N tickers" counter
- "Start watching" button (requires min 3 tickers)

### Step 5: Feed (Authenticated)
**Screenshot**: `05-feed-auth.png`
**URL**: `/`
**What user sees**:
- Header with user avatar "U" (logged in)
- "My Watchlist" dropdown (default for auth users with watchlist)
- Shows "No watchlist events yet" if no matching events
- Can switch to "All Events" for full feed
- Date sections: TODAY / YESTERDAY / Mar 13

### Step 6: Event Detail
**Screenshot**: `06-event-detail-english.png` (Alphabet/Wiz acquisition)
**Screenshot**: `06-event-detail-top.png` (Oil stockpiles, Chinese enrichment)
**URL**: `/event/:id`
**What user sees**:
- Back button + Share button
- Severity badge (HIGH) + Signal badge (Monitor)
- Event title + source + timestamp
- **CATALYST / EVENT SUMMARY — "What happened"**: AI-generated summary
- **WHY IT MATTERS — "Impact"**: AI analysis of market impact
- More sections below (Why Now, Risks, Historical Pattern, Feedback)

**Notes**:
- English enrichment works correctly for new events ✅
- Old events have Chinese enrichment (from before WP1 language migration)
- Signal badge shows "🟡 Monitor" — new product language ✅

### Step 7: Watchlist Page
**Screenshot**: `07-watchlist.png`
**URL**: `/watchlist`
**What user sees**:
- "Start with a watchlist" intro card
- "Add your first ticker" with input field
- Quick add chips: AAPL / NVDA / TSLA
- "Watchlist-first onboarding" section with Step 1/2 guide
- Bottom nav with Watchlist highlighted

### Step 8: Search Page
**Screenshot**: `08-search.png`
**URL**: `/search`
**What user sees**:
- "Search Events" heading
- Search input: "Search events or tickers..."
- Popular tickers: $AAPL / $NVDA / $TSLA / $MSFT / $AMZN / $META / $GOOGL / $SPY
- Clean empty state

**Known issues**:
- Only does ticker search, not full-text search
- Searching "oil" or "Tesla" returns nothing

### Step 9: Settings Page
**Screenshot**: `09-settings.png`
**URL**: `/settings`
**What user sees**:
- "Alerts and notifications" heading
- Web Push section (currently "Browser push is unavailable" — missing VAPID key)
- Push setup guide: "Enable push in under a minute"
- (Scroll down): Notification budget, quiet hours, daily cap

## Known Bugs Captured

| # | Bug | Page | Severity |
|---|-----|------|----------|
| 1 | Verify page shows 401 error despite successful auth | `/auth/verify` | HIGH |
| 2 | "Offline" status — WebSocket not connecting | Header | MEDIUM |
| 3 | Old events have Chinese enrichment | Event Detail | LOW (historical data) |
| 4 | Search only matches ticker, not full text | Search | HIGH |
| 5 | Push unavailable without VAPID key config | Settings | Config issue |
| 6 | Watchlist page shows onboarding even when user has tickers in DB | Watchlist | MEDIUM |

## Pages Not Shown
- Ticker Profile (`/ticker/:symbol`) — previously crashed with chart duplicate timestamp error (fixed in PR #131)
- Scorecard — removed from nav (no useful data yet)
- Landing page (`packages/landing/`) — separate static site
