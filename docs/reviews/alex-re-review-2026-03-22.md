# Subject: Re-review after Phase 3 fixes — honest update

Hey,

Alex here again. Same $150K swing trader, same Sunday afternoon prep. You told me you fixed the five things I flagged. I went back in to check. Here's where things stand.

## What improved since my last review

**Search works now. All three of my test queries returned results.** "Earnings" — which returned ZERO results last time — now pulls up Dollar General, Bumble, Oracle, Macy's, and more. "Iran" still returns 10+ results spanning a week of geopolitical developments. "Tariff" returns 8 results on the first try. No more retry-and-pray. This was my #3 trust killer and it's fixed. (TK3 ✅)

**META earnings data is no longer insane.** Last time, META Q3 2025 showed "$1.05 vs $6.71 (-84.3% miss)" — a number that would've triggered congressional hearings. Now the profile shows 20 quarters of clean GAAP earnings going back to Q4 2020. Q4 2025: EPS $8.88 vs est $8.22 (+8.0% beat). Q3 2023: EPS $4.39 vs est $3.63 (+20.9% beat). These numbers pass my sniff test. I was trading META through those quarters and these match reality. (TK2 ✅)

**The Evidence tab has content.** I opened the PTC corporate event and the Evidence tab now shows: Market Context (why it matters), Source Details (Yahoo Finance with a link to the original article), Risk Factors, and Historical Similar Events with pattern match stats (10 cases, +0.0% avg T+20 move). Last time this tab was a ghost town. Now it's useful intelligence. (TK4 ✅)

**WebSocket connection is more stable.** I browsed for 15+ minutes across every page. The status indicator showed "Connected / Live" for the vast majority of the session. I saw one brief "Reconnecting..." after clearing localStorage, but it recovered in seconds. Last time it went Offline for 5+ page views in a row. Big improvement. (TK5 ✅, with caveats — see below)

**The onboarding Quick Add buttons work now.** AAPL, TSLA, NVDA — all clickable, all worked. Last time every single popular ticker button was grayed out and broken. Custom ticker input also works (typed META, pressed Enter, added). (TK1 partial ✅)

**Event detail pages are significantly richer.** The PTC event showed: Bull/Bear thesis breakdown, "What Happened Next" price outcome section, Similar Past Events (with 3 related events), and Market Regime context. The Trust tab's Source Journey is still great. The three-tab structure (Summary / Evidence / Trust) now has differentiated, useful content in each.

**Feed dedup is working.** The "UK to Dissolve Crypto Exchange" event shows "and 3 similar" collapsed. No duplicate spam. This is a small thing but it matters — last time I didn't flag this but I noticed repeated headlines.

## What still makes me want to cancel

**My watchlist STILL has 13 tickers when I only added 4.** This is the same exact problem from my first review. I carefully added NVDA, AAPL, TSLA, META during onboarding. The watchlist page shows 13: MUR, CING, SWMR, AAL, GOOGL, AMZN, MSFT, SPY, MU — all phantom tickers I never asked for. Cingulate Inc.? Swarmer, Inc.? I manage a $150K portfolio, not a dartboard. You told me TK1 was fixed. It's not. (TK1 ❌ — still broken)

**The onboarding Continue button is broken.** I added 4 tickers (counter correctly showed "watching 4 tickers") but clicking Continue did nothing. The page just sat there. I had to use "Skip setup" to get to the feed. The console shows "Maximum update depth exceeded" — a React render loop that fires on every page load. This isn't cosmetic, it's blocking the primary onboarding flow.

**"My Watchlist" feed mode shows events for phantom tickers, not mine.** Switching to "My Watchlist" showed AAL (UAE airspace closure) and MU (Micron factory acquisition) events. Zero events for NVDA, AAPL, TSLA, or META — even though those tickers DO have events in the system (I checked: there are 3 matching events including "Super Micro Nvidia chip diversion"). The watchlist feed is still fundamentally broken because it reads from the phantom watchlist, not my actual picks.

**Notification channel settings still fail to load.** Settings page shows "Could not load notification channel settings" with a Retry button — same error as last time. The API returns 401 Unauthorized. Discord webhook field is visible but Save is disabled. Email is "Coming soon." My only option is browser push, which is blocked. I literally cannot configure any notification channel.

**Scorecard outcome tracking is still at 70.** Last time: 22,410 events, 70 outcomes. Now: 22,431 events, 70 outcomes. You told me tracking went from 70 to 11,737. I see 70 on the page. The "High-Quality Setup" tier still has 0 usable verdicts. All T+20 averages still N/A. The Scorecard is still aspirational, not actionable.

**React render loop fires on every page load.** Console shows multiple "Maximum update depth exceeded" errors immediately on page load. This is likely what's blocking the onboarding Continue button. It may also be causing other subtle issues I didn't catch. A render loop in production is a red flag.

## What would change my mind

You fixed 3 out of 5 trust killers cleanly (search, META earnings, Evidence tab). WebSocket is better but still has a render loop underneath. The watchlist ghost ticker problem is completely unfixed.

Here's my updated list:

1. **Fix the watchlist ghost tickers.** For real this time. The onboarding adds my 4 picks, but the watchlist page shows 13. Clean up whatever legacy state is loading extra tickers. Until this works, the "personalized for you" promise is empty.
2. **Fix the onboarding Continue button.** The React render loop is blocking the primary user flow. New users can't complete setup.
3. **Fix notification channel loading.** The 401 Unauthorized error needs to resolve. Let me paste a Discord webhook and save it.
4. **Get outcome tracking above 70.** If you've backfilled to 11,737, the Scorecard page isn't showing it. Surface the data.

## Page-by-page signal-to-noise re-rating

### Onboarding — 5/10 (was 6/10) ⬇
Quick Add buttons work now (big win), but the Continue button is broken due to a render loop. Users literally cannot complete onboarding without using Skip. That's worse than disabled buttons.

### Smart Feed — 9/10 (was 8/10) ⬆
Still the best page. Daily Briefing, severity badges, directional labels, thesis summaries, source attribution, dedup grouping. The Iran narrative thread across 4 days is excellent. Event cards now show price at event time ($149.81) with pending outcome indicators (⏳). Feed mode switcher works (Smart Feed / My Watchlist / All Events). Gains a point for dedup and richer cards.

### Watchlist Feed — 3/10 (was 3/10) →
Same problem. Shows phantom ticker events (AAL, MU), not my picks (NVDA, AAPL, TSLA, META). "0 events in the last 24h" for a feed that should match my watchlist tickers. Completely unreliable for personalized alerting.

### Ticker Profiles — 9/10 (was 7/10) ⬆⬆
Major improvement. META now shows 20 quarters of clean GAAP earnings data — no more phantom -84.3% miss. NVDA shows 20 events with consistent beat history. Profiles show event count, avg severity, top source, and market reaction chart. Gains 2 points for trustworthy data.

### Event Detail — 8/10 (was 5/10) ⬆⬆⬆
Biggest improvement. Summary tab now has Bull/Bear thesis, "What Happened Next" price tracking, Similar Past Events, and Market Regime context. Evidence tab has Market Context, Source Details, Risk Factors, and pattern match data. Trust tab still excellent with Source Journey. Three tabs all have differentiated, useful content now.

### Scorecard — 5/10 (was 5/10) →
Same numbers: 70 outcomes out of 22,431 events. Still 0 usable verdicts in "High-Quality Setup." The UI is professional and the disclaimer is honest, but nothing has changed in the underlying data. I still can't make money decisions from this page.

### History — 7/10 (was 7/10) →
No change observed. Filters, severity breakdown, solid volume of events.

### Search — 8/10 (was 6/10) ⬆⬆
"Earnings" works now. "Tariff" works on the first try. "Iran" still excellent. Two-tab layout (Tickers / Events) with trending tickers. Results show severity badges, sources, dates, and are clickable. Gains 2 points for reliability.

### Settings — 4/10 (was 5/10) ⬇
Push notification recovery steps are still well-done. But "Could not load notification channel settings" is the same error as before — the API returns 401. Discord webhook field exists but can't be saved. Email is still "Coming soon." Loses a point because this was supposed to be fixed.

### WebSocket — 7/10 (was ~3/10) ⬆⬆⬆
Connection stayed "Live" for most of my session. Previously it dropped to Offline for 5+ consecutive pages. Big improvement. Still has underlying console errors ("Maximum update depth exceeded") that may cause issues under load.

## The bottom line

**Updated grade: B** (was B-)

You fixed 3 out of 5 trust killers and the product is noticeably better in the areas that matter most: search reliability, earnings data accuracy, and the Evidence tab. Event detail pages went from sparse to genuinely useful. The feed remains the star of the product.

But you introduced a new critical bug (onboarding render loop breaking the Continue button), the watchlist ghost tickers are completely unfixed, notification settings still 401, and the Scorecard hasn't budged. The grade moves up half a step because search + Evidence + earnings data represent real, substantive improvements to my daily workflow. But the watchlist problem prevents me from upgrading further — a personalized trading tool that doesn't know my portfolio is fundamentally broken.

**Updated NPS: 6/10** (was 5/10)

One point gained. Search and Evidence tab improvements mean I'm more likely to come back for thematic research. But I still wouldn't recommend it to my trading buddy until the watchlist works.

**Would I recommend this now?** Still no. But closer. The Smart Feed + Ticker Profiles + Search combination is $29/month good when it works. The watchlist integration is what would turn "useful research tool" into "essential daily tool." Fix the watchlist, fix onboarding, get notification channels loading, and surface those 11K outcomes you supposedly backfilled. Do that and this is a B+ easily.

**Top 3 remaining issues:**
1. Watchlist ghost tickers — exact same bug as 2 weeks ago, with the same phantom CING/SWMR/MUR tickers
2. Onboarding Continue button broken — React render loop ("Maximum update depth exceeded") prevents new users from completing setup
3. Notification channels 401 Unauthorized — can't configure Discord or any alert delivery method

— Alex
