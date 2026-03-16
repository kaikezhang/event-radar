# Event Radar — User Walkthrough v2

> Date: 2026-03-16 06:40 UTC | After: PR #133 (auth/HTML/WS) + PR #134 (search/VAPID/historical)
> Device: iPhone 14 Pro (390×844) | Auth: AUTH_REQUIRED=true

## Screenshots (all in this directory)

| # | Page | File | Notes |
|---|------|------|-------|
| 01 | Feed (unauth) | `01-feed-unauth.png` | First landing, "All Events" default, date sections |
| 02 | Login | `02-login.png` | Magic link email form |
| 03 | Verify | `03-verify-failed.png` | ⚠️ BUG: "Verification failed - API error: 401" |
| 04 | Onboarding | `04-onboarding.png` | Sector packs + trending tickers |
| 05 | Event Detail | `05-event-detail.jpg` | GOOG/Wiz — full enrichment data shown |
| 06 | Watchlist | `06-watchlist.png` | Ticker management |
| 07 | Search | `07-search.png` | Popular tickers, search input |
| 08 | Settings | `08-settings.png` | Push (unavailable), notification budget, sound |

## Known Bugs

1. **CRITICAL — Verify 401**: React StrictMode double-mounts useEffect → two verify API calls → first succeeds (token consumed), second fails (token already used) → error shown. Root cause confirmed.
2. **MEDIUM — HTML entities**: `&amp;` still visible in some titles (e.g., "Woodward (WWD)" in feed)
3. **LOW — Onboarding layout**: "Add custom ticker" section overlaps with bottom nav
4. **CONFIG — Push unavailable**: VAPID key not configured for this deployment

## What's Improved Since v1
- Event Detail now shows full AI enrichment data (summary, impact, risks, regime context)
- WS status is now a subtle dot instead of prominent "Offline" text
- Feed defaults to HIGH+CRITICAL severity
- Infinite scroll implemented
- StockTwits trending dedup fixed
- Full-text search backend implemented

## Review Request
Review ALL screenshots as a swing trader user. Be brutally honest about:
1. Would you understand what this product does in 5 seconds?
2. Can you make a trading decision from the event detail page?
3. What's still broken or confusing?
4. What's missing vs. the Discord bot alerts?
