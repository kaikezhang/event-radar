# Event Radar — Brutally Honest Product Critique

> **Persona**: Swing trader, first-time user. Trades mid-cap momentum plays, holds 2–10 days. Currently uses TradingView alerts + Twitter/X + Benzinga Pro free tier. Discovered Event Radar through a Discord mention.
>
> **Date**: 2026-03-16 | **Device**: iPhone (mobile web)

---

## 1. FIRST IMPRESSION — Would I stay or leave?

**I'd give it about 90 seconds.**

Opening `01-feed-unauth.png`: Dark mode, clean layout, real events loading immediately — good. I can see severity badges (HIGH, CRITICAL), sources, timestamps. This is better than most fintech landing pages that just show you a marketing video.

But three things immediately undermine confidence:

- **"Reconnecting" in the header.** The very first thing I see is that the app can't connect to its own backend. If your real-time event detection tool can't stay online, why would I trust it with my alerts?
- **"Viewing delayed public feed"** — Delayed by how much? 5 minutes? 1 hour? 1 day? This is critical information for a trader and you just hand-wave it. If I'm seeing yesterday's news, this is useless.
- **The title and summary are identical on the GOOG card.** "Alphabet Inc. (GOOG) Announces Completion of its Acquisition of Wiz" appears twice — once as the title, once as the "summary." This screams "we just duplicated the headline because we had nothing else to say." It makes the AI enrichment look broken.

The Woodward (WWD) card has `&amp;` in the title — raw HTML entities visible to the user. Amateur hour. This is the kind of thing that makes me think nobody actually uses this product.

**Verdict: I'd stay long enough to poke around, but I'm skeptical. The "Reconnecting" status and HTML encoding bugs tell me this is early-stage and unreliable.**

---

## 2. PAGE BY PAGE

### Feed — Unauthenticated (`01-feed-unauth.png`)

**What works:**
- Date-sectioned layout (TODAY / YESTERDAY / MAR 14) is intuitive
- Severity badges (HIGH / CRITICAL) with color coding — immediately scannable
- Source labels (Breaking News, PR Newswire) add credibility
- Bottom nav is clean and standard

**What's broken or confusing:**
- `&amp;` HTML entity rendering in WWD card title — unacceptable
- Title = Summary duplication on GOOG card — makes AI look broken
- "Reconnecting" status — shakes confidence on first visit
- No "TODAY" section visible — feed starts at YESTERDAY. Did nothing happen today? Or is the scanner broken? I have no way to know.
- No price movement data on any card. I see "Alphabet acquired Wiz" — cool, but GOOG moved how much? Without the price reaction, this is just a news reader.
- No timestamp precision — "11h ago" tells me roughly when, but for a swing trader catching a move, I need to know if this was pre-market, during session, or after hours.
- The event count labels ("1 event", "2 events", "3 events") add no value. I can count the cards myself.

### Login (`02-login.png`)

**What works:**
- Magic link is frictionless — no password to remember
- Value prop text is concise

**What's confusing:**
- "Offline" dot in the header while I'm clearly online and loading a page. Is this a WebSocket status? Don't show me infrastructure details. Either the app works or it doesn't.
- Why does the bottom nav still show Feed/Watchlist/Search/Settings? If I'm not logged in, Watchlist and Settings are useless. This creates dead clicks.

### Verification (`03-verify-error-but-logged-in.png`, `03-verify-failed.png`)

**This is a hard stop.**

I clicked the magic link in my email. The app shows me a big red X and says **"Verification failed — API error: 401"** with a "Try signing in again" link. According to the walkthrough notes, I'm actually logged in (the avatar "T" is showing). But the page tells me I failed.

This is the single worst moment in the entire user journey. I just gave you my email, I clicked your link, and you told me it didn't work. A significant percentage of users will:
1. Try again (creating another magic link, possibly hitting rate limits)
2. Give up entirely
3. Never come back

Even if the auth actually succeeded, the **perception** is failure. And perception is reality for a new user.

### Onboarding (`04-onboarding.png`)

**What works:**
- Sector packs (Tech Leaders, Biotech, Energy, Finance) are a smart shortcut
- "Trending this week" with event counts (SPY 72 events, USO 70 events) gives social proof
- Minimum 3 tickers requirement is reasonable
- The counter "You're watching 0 tickers" with "Add at least 3 more to continue" is clear

**What's confusing:**
- Still shows "Offline" dot — persistent anxiety signal
- I can only see SPY and USO in the trending section. Where are the rest? The walkthrough mentions PATH(54), QQQ(51) — are these below the fold? If so, the most popular tickers should be visible without scrolling.
- No explanation of what happens after I pick tickers. Will I get push notifications? Emails? Just a filtered feed? I'm committing to a watchlist without knowing what I'm signing up for.

### Feed — Authenticated (`05-feed-auth.png`)

**What works:**
- "All Events" dropdown implies I can filter — good
- Same clean card layout

**What's broken:**
- "Reconnecting" again in the header. This is now the third time I've seen connection issues. Pattern established: this app has reliability problems.
- The walkthrough says "My Watchlist" should be the default view for auth users, but the screenshot shows "All Events" dropdown. If the watchlist view shows "No watchlist events yet," that's a terrible default — I just picked tickers and now I see nothing?
- Same `&amp;` encoding bug on WWD card
- Same title=summary duplication on GOOG card
- The Unixell Biotech card at the bottom shows `<p>SHANGHAI, March 13, 2026 /PRNewswire/ -` — raw HTML tags leaking into the summary. Three encoding/sanitization bugs visible on a single page.
- Still no price data anywhere. I know things happened, but I don't know if they moved the stock.

### Event Detail (`06-event-detail-english.png` — GOOG/Wiz)

**What works:**
- Section headers ("CATALYST / EVENT SUMMARY", "WHY IT MATTERS") are well-structured
- "What happened" / "Impact" framing is trader-friendly
- Severity badge (HIGH) and Signal badge (Monitor) are visible
- Share button is there

**What's missing:**
- **No chart.** I'm looking at an event about GOOG acquiring Wiz and there's no price chart showing the reaction? This is the most basic thing a trader needs.
- **No link to the source article.** Where did this news come from? I can't verify it. "Breaking News · 11h ago" — from where? Reuters? Bloomberg? A random blog?
- **No related events.** Has GOOG had other acquisitions? What happened to the stock after those? The Discord alert (reference screenshot) shows historical pattern data, best/worst cases, most similar events — the web app shows none of this.
- **The AI summary is painfully thin.** "Alphabet Inc. (GOOG) has completed its acquisition of Wiz, marking a strategic expansion in its tech portfolio." That's just the headline rephrased. "The successful acquisition may enhance GOOG's competitive edge and innovation capabilities in cloud computing, signaling growth potential." This is ChatGPT-tier filler. No numbers, no deal size, no target price impact, no sector comparison.
- **"Back to watchlist"** — but I might have come from the main feed. The back button should say "Back" and go to wherever I came from, not assume I came from the watchlist.

### Event Detail — Chinese (`06-event-detail-top.png` — Oil stockpiles)

**Immediate dealbreaker.** The signal badge says "立即关注" (Chinese for "Watch Now") and the entire AI summary is in Chinese. I'm an English-speaking swing trader. I cannot read this.

I understand from the walkthrough that this is a historical data issue from before a language migration. But as a user, I don't know that. I just see a product that randomly switches languages. This destroys trust instantly. If half my event details are in a language I can't read, this product is unusable.

### Watchlist (`07-watchlist.png`)

**What's confusing:**
- I just went through onboarding where I picked tickers. Now I'm on the Watchlist page and it says "Start with a watchlist" and "Add your first ticker." Did my onboarding selections not save? This is gaslighting.
- The walkthrough confirms this is a bug: "Watchlist page shows onboarding even when user has tickers in DB." But from my perspective, I just wasted time in onboarding.
- Quick add shows AAPL / NVDA / TSLA — the same three tickers from onboarding. No personalization.
- "Watchlist-first onboarding" section with Step 1/2 is tutorial content that shouldn't exist on a page I've already visited. If I have tickers, show me my tickers and their recent events. Don't re-onboard me.

### Search (`08-search.png`)

**What works:**
- Clean empty state
- Popular ticker chips for quick access

**What's broken:**
- **Search doesn't search.** According to the walkthrough, typing "oil" or "Tesla" returns nothing. Only exact ticker symbols work. This is a search page that can't search. If I type "FDA approval" and get nothing, I'll assume there are no FDA events — when really the search is just broken.
- The placeholder text says "Search events or tickers..." — a lie. It only searches tickers.
- No recent searches, no search history, no trending searches beyond the static ticker chips.

### Settings (`09-settings.png`)

**What works:**
- Section headers are clear
- The "Enable push in under a minute" step-by-step guide is user-friendly design

**What's broken:**
- **Push notifications don't work.** The big yellow warning says "Browser push is unavailable because this app is missing its public push key." This is a configuration issue on the developer's side, not something I can fix. But the page acts like it's my problem.
- "UNSUPPORTED" badge + "PERMISSION: DEFAULT" — technical jargon. I'm a trader, not a DevOps engineer.
- The entire Settings page is about alerts and notifications... which don't work. So this page is effectively a dead end.
- No other settings visible: no theme toggle, no timezone selection, no alert frequency preferences, no email digest options.

---

## 3. INFORMATION DENSITY — Can I make a trading decision?

**No.** Not from any page in this app.

To make a swing trade decision, I need:
1. **What happened** — Event Radar provides this (partially)
2. **Price reaction** — completely missing
3. **Volume context** — completely missing
4. **Historical pattern** — available in Discord alerts but NOT in the web app
5. **Related tickers / sector impact** — missing
6. **Timeline** — when did this happen relative to market hours? Vague "11h ago" isn't enough
7. **Source credibility** — no source links to verify

The Discord alert (`reference-discord-alert.png`) is actually more useful than the web app. It shows historical pattern data (251 similar events, avg alpha T+5, T+20, win rate), best/worst case examples (SMCI +78.3%, UNH -35.7%), and most similar past events. **The web app has none of this.** The product's most valuable data is trapped in Discord messages.

Each event card in the feed is essentially a headline + a rephrased headline. There's no data density. Compare to Benzinga Pro where each alert shows price, change %, volume, and the catalyst in a single line.

---

## 4. FRICTION POINTS

1. **Verification failure page** — The biggest friction point. Magic link appears to fail even when it works. Users will bounce.
2. **Onboarding → Watchlist disconnect** — I pick tickers in onboarding, then the watchlist page asks me to pick tickers again. Did my choices save?
3. **"Reconnecting" / "Offline" everywhere** — Creates persistent anxiety that the app is unreliable.
4. **Chinese content in English app** — Random language switches break flow completely.
5. **Search that doesn't search** — Promise of "search events or tickers" but only tickers work.
6. **No push notifications** — The entire notification pipeline is broken due to missing VAPID key.
7. **Raw HTML in event cards** — `&amp;`, `<p>` tags visible in summaries. Makes the product feel unfinished.

---

## 5. MISSING FEATURES

As a swing trader, I expected:

- **Price charts on event detail pages** — The most obvious missing feature
- **Price movement data on feed cards** — "$GOOG +2.3% on Wiz acquisition completion"
- **Historical pattern analysis in the web app** — This exists in Discord alerts but not here
- **Full-text search** — Search by keyword, not just ticker
- **Push notifications that work** — The core value prop of "alerts that matter" requires working alerts
- **Source links** — Link to the original filing, article, or press release
- **Ticker profile pages** — Click $GOOG, see all recent events for that ticker with a chart
- **Alert customization** — Let me choose: only CRITICAL events, only SEC filings, only for my watchlist
- **Email digests** — Morning summary of overnight events for my watchlist
- **Market hours context** — Pre-market / regular / after-hours labels on events
- **Sector heat map or overview** — What sectors are seeing the most activity?
- **Position sizing / risk context** — Even basic "this stock has avg daily range of X%" would help

---

## 6. TRUST

**I do not trust this product to manage my alerts.** Here's why:

- The app can't maintain a WebSocket connection (Reconnecting/Offline on every page)
- The verification flow shows false errors
- Push notifications are broken at the infrastructure level
- Some event summaries are in Chinese with no explanation
- Raw HTML leaks into visible content
- The AI analysis is surface-level filler, not actionable intelligence
- There's no source attribution — I can't verify any event

**Trust requires reliability + accuracy + transparency.** Event Radar currently fails on all three.

The Discord bot, ironically, feels more trustworthy because it includes source links, historical data, and statistical evidence. The web app strips all of that away and replaces it with vague AI summaries.

---

## 7. COMPETITOR COMPARISON

### vs. Benzinga Pro
Benzinga Pro shows me a real-time feed with price, change %, volume, source, and analyst ratings in every row. I can filter by event type (FDA, earnings, insider trades). I can click through to the source. Event Radar shows me a headline and a paraphrased headline. Benzinga wins on information density by a factor of 10x.

### vs. TradingView Alerts
TradingView lets me set alerts on specific price levels, indicators, or conditions with full customization. The alerts actually work — push, email, webhook, SMS. Event Radar's alerts don't work at all (missing VAPID key). TradingView also shows me the chart, which Event Radar doesn't.

### vs. Twitter/X
Honestly? Following @unusual_whales, @DeItaone, and a few SEC filing bots on Twitter gives me faster, more detailed, more contextualized event information than Event Radar currently provides. Twitter also has community discussion — I can see how other traders are reacting in real-time. Event Radar is a solo experience with less data.

### Where Event Radar COULD win
The Discord alert format — with historical pattern matching, statistical edge data, and best/worst case examples — is genuinely unique and valuable. **No competitor does this.** If the web app surfaced that data, it would have a real differentiator. Right now, the web app is a worse version of a generic news feed.

---

## 8. VERDICT

### Would I pay for this?
**No.** Not in its current state. The core promise is "track market-moving events, get alerts that matter." The alerts don't work. The events lack the data I need to act. The AI analysis tells me nothing I couldn't get from reading the headline. I'd use the Discord bot before I'd use this web app.

### Would I recommend it?
**Not yet.** I'd tell a trading buddy: "There's this thing called Event Radar that has a cool Discord bot with historical pattern matching. The web app is early and kind of broken, but keep an eye on it."

### What would change my mind?
If the web app had: (1) working push alerts, (2) price charts on event pages, (3) the historical pattern data from Discord, and (4) no bugs — I'd pay $15–25/month for it. The concept is strong. The execution isn't there yet.

---

## 9. TOP 5 THINGS TO FIX — Ranked by Impact on User Retention

### #1: Fix the verification flow (03-verify-error-but-logged-in.png)
**Impact: Critical — this kills signups.**
Users who click the magic link and see "Verification failed" will not try again. This is the top of your funnel and it's broken. Every other fix is pointless if users can't get past login. Fix the race condition between the verify API and AuthContext. If auth succeeded, show success. Period.

### #2: Fix HTML encoding and content sanitization (01-feed-unauth.png, 05-feed-auth.png)
**Impact: High — this makes the product look amateur.**
`&amp;` in titles, `<p>` tags in summaries, title duplicated as summary — these are all symptoms of not sanitizing source content before display. This is a single afternoon of work that dramatically improves perceived quality. Strip HTML entities, decode them, truncate summaries properly, and never show raw markup to users.

### #3: Surface price data and historical patterns in the web app (06-event-detail-english.png)
**Impact: High — this is the difference between a news reader and a trading tool.**
The Discord bot already has historical pattern matching (avg alpha, win rate, similar events). Port this to the event detail page. Add current price and % change to feed cards. Without price context, events are just headlines — and I can get headlines anywhere.

### #4: Make search actually search (08-search.png)
**Impact: High — broken search erodes trust in the entire dataset.**
If I search "oil" and get nothing despite an oil stockpiles event being in the feed, I'll assume your data is incomplete. Implement full-text search across event titles and summaries. This is table stakes for any content platform.

### #5: Get push notifications working (09-settings.png)
**Impact: High — this is your core value proposition.**
"Get alerts that matter" is your tagline. Alerts don't work. Configure the VAPID key, test the push flow end-to-end, and make sure a user can go from signup to receiving their first push notification in under 2 minutes. Without working notifications, Event Radar is just a website I have to remember to open — and I won't.

### Honorable mentions:
- **Fix the Reconnecting/Offline status** — either fix the WebSocket or don't show connection status to users. Showing "Offline" on every page is self-harm.
- **Migrate all historical events to English** — or at minimum, hide/re-enrich Chinese-language events so users never see `06-event-detail-top.png`.
- **Fix the Watchlist page post-onboarding** — if the user just completed onboarding with tickers, the watchlist page must reflect that immediately.

---

## Final Thought

Event Radar has a genuinely interesting core idea: automated event detection + AI analysis + historical pattern matching. The Discord bot proves the concept works. But the web app feels like a prototype that was shipped before it was ready. The bugs aren't edge cases — they're in the main flow (login, feed, search, notifications). Every page has at least one issue that would make a new user question whether this product is maintained.

The good news: none of these problems are architectural. They're execution bugs and missing features. Fix the top 5, and you have something worth paying for. Ship it as-is, and users will bounce after the verification page.
