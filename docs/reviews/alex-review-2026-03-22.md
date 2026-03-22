# Subject: My first week with Event Radar — honest feedback

Hey,

I'm Alex, swing trader, $150K account. Been trading event-driven for 6 years, mostly tech and energy names. I've been using Event Radar for about a week now. Here's my honest take after spending this Sunday afternoon prepping for Monday's market open.

## What got me excited

**The Iran/Hormuz 48-hour ultimatum hit my feed 5 hours ago.** Trump's direct threat to obliterate Iran's power plants if they don't open the Strait of Hormuz. The AI tagged it CRITICAL, linked it to XLE/USO/BA/LMT, and summarized the geopolitical context in one paragraph. That's exactly what I need — I can start planning my Monday energy trades right now. Paired with the Iran sanctions waiver story from yesterday and the oil price decline from Thursday, I have a full narrative arc in three cards. That's more useful than scrolling Twitter for 45 minutes.

**Ticker profile pages are legitimately good.** I clicked into NVDA and got: 6 events tracked, TradingView price chart, upcoming earnings (2026-05-20, EPS est $1.77), and a history of the last 4 earnings beats. AAPL shows earnings coming 2026-04-30. TSLA on 2026-04-21. This is my pre-Monday catalyst calendar built right into the product. I didn't expect this level of utility.

**The earnings data has directional labels.** NVDA's last 4 quarters all BULLISH with the beat percentages (5.3%, 3.5%, 4.1%, 8.0%). TSLA shows Q3 BEARISH (-10.5% miss) and Q1 BEARISH (-34.9% miss). That historical pattern context is useful for sizing positions around upcoming reports.

**The Smart Feed with HIGH+CRITICAL filters is the right default.** I don't want 24,755 events. I want the 10-15 that actually matter this week. The Daily Briefing saying "2 events detected in the last 24h" with the top event highlighted is perfect for a Sunday check-in.

**The Trust tab's Source Journey is transparent.** The Iran event shows: Truth Social → Rule Filter → AI Judge (0.95 confidence) → Enriched → Delivered in 37 seconds. I can see how the sausage is made. That builds trust faster than a marketing page.

**Search actually works for thematic research.** I searched "Iran" and got 10+ results spanning a week — from the 48-hour ultimatum today to "Iran War Delivers Windfall to America's Oil Country" on Mar 14. I can trace an entire geopolitical theme developing in real time. That's powerful.

## What made me want to cancel

**My watchlist has 13 tickers but I only added 4.** During onboarding, I carefully added NVDA, AAPL, TSLA, META. The counter said "4 tickers." Then I get to the watchlist page and there are 13: MUR, CING, SWMR, AAL, GOOGL — I never asked for these. Where did they come from? If you're auto-adding tickers, tell me. If it's leftover state from a previous session, clear it during onboarding. I don't want mystery tickers diluting my feed. MUR (Murphy Oil) and CING (Cingulate Inc.)? I've never even heard of Cingulate. That's noise.

**The onboarding popular ticker buttons are all disabled.** AAPL, TSLA, NVDA, MSFT, AMZN, SPY — every single "Quick add" button was grayed out and unclickable. I had to type each ticker manually into the custom input. The whole point of "Quick add" is... quick. This is broken.

**The WebSocket connection is unreliable.** During my 30-minute session: Connected → Reconnecting (during onboarding) → Connected → Offline (on AAPL page) → Offline (stayed offline for 5+ pages) → Connected again. For a product that promises "Live" real-time events, "Offline" is the worst status to see. If I'm leaving this open during market hours and it drops to Offline, I'm missing alerts. That's money lost.

**META's Q3 2025 earnings data looks wrong.** The ticker profile shows "EPS: $1.05 vs consensus $6.71 (-84.3% miss)." An 84% miss for META? That would have been the biggest tech earnings disaster in history. I was trading META at the time — that didn't happen. If I can't trust the historical data, I can't trust the product.

**The Evidence tab is completely empty.** I clicked into the Iran/Hormuz event (the most important event on the platform right now) and the Evidence tab shows... nothing. Just a sidebar with a Share button. Where's the Market Context? Source Details? Risk Factors? The Summary tab gives me "What Happened" and "Similar Past Events" (none found), but the Evidence tab is a ghost town. That's a tab that shouldn't exist if it has no content.

**Search is inconsistent.** "Iran" returns 10+ results. "tariff" initially returned nothing, then showed results on a second try (debounce timing issue?). "earnings" returned zero results despite the system being full of earnings events. Search needs to be rock-solid — if I search "NVDA earnings" and get nothing, I'll just go back to Google.

**The Watchlist feed shows events for tickers I didn't add.** My Watchlist tab showed AAL (UAE airspace closure) and MU (Micron Taiwan factory) events — tickers that were in the ghost watchlist, not my intentional picks. Zero events for NVDA, AAPL, TSLA, META. The header says "11 alerts this week" but none of them are for tickers I actually care about.

**Scorecard data is too thin to be actionable.** 22,410 events detected, 70 outcomes tracked (0.3%). The "High-Quality Setup" tier has 20 alerts and 0 usable verdicts — your highest-confidence tier has literally never been validated. 38.6% directional hit rate is worse than a coin flip. All T+20 averages are N/A. For a swing trader, T+20 is my primary horizon. I appreciate the honesty of the "calibration layer, not a victory lap" disclaimer, but this page currently says "we don't know if our signals work."

**Notification channels failed to load.** Settings page shows "Could not load notification channel settings" with a Retry button. Discord webhook field is there but the Save button is disabled. I can see the setup instructions but can't actually configure anything. The email digest says "Coming soon." So my only notification option right now is browser push — which is blocked — and there are step-by-step recovery instructions, which is nice, but I need Discord working first.

## What I'd need to see to keep paying $29/month

1. **Fix the watchlist ghost tickers.** Clean slate on onboarding. Only add what I explicitly pick. Show me per-ticker event counts on the watchlist page ("NVDA: 1 event this week, AAPL: 0, TSLA: 0").
2. **Validate the earnings data.** The META Q3 -84.3% miss is either a data error or the system ingested garbage. Audit the backfill pipeline. If the historical data is wrong, nothing built on top of it is trustworthy.
3. **Make search reliable.** "earnings" should return results. "tariff" should return results on the first try. Search is the core tool I'd use daily — it needs to work every time.
4. **Bulk up outcome tracking.** 70 out of 22,410 is not a scorecard, it's a proof of concept. Track outcomes for every directional call. Get to 500+ verdicts before asking me to trust the hit rate.
5. **Fix the WebSocket.** I need "Connected" to mean "always connected." Offline status during a 30-minute casual browse is unacceptable for market hours use.
6. **Populate the Evidence tab.** If you have the data, show it. If you don't, hide the tab. Empty tabs erode trust.
7. **Discord notifications that actually save.** Get the channel settings loading. Let me paste a webhook URL and test it.

## Page-by-page breakdown

### Onboarding — 6/10
The flow is clean: welcome → add tickers → notifications → done. The notification severity breakdown (CRITICAL: Push + Feed, HIGH: Push + Feed, MEDIUM: Feed only) is exactly the right UX. But the popular ticker "Quick add" buttons being ALL disabled is a showstopper. I had to manually type every ticker. The onboarding also didn't warn me that phantom tickers existed in my account.

### Smart Feed — 8/10
Best page in the product. The Iran/Hormuz → sanctions waiver → oil price narrative told across three cards is chef's kiss. Daily Briefing with "2 events in the last 24h" and top event highlighted is the right UX for a Sunday check-in. Severity filters work. Event cards are information-dense in a good way: CRITICAL badge, source (Truth Social / CNBC / Yahoo Finance), time ago, AI summary, ticker links, direction with confidence, price at event time, outcome pending indicator. Loses points for: the connection status flickering, and the Watchlist tab feed not showing events for my actual watchlist tickers.

### Watchlist Feed — 3/10
Shows events for phantom tickers (AAL, MU) not my chosen ones (NVDA, AAPL, TSLA, META). The "11 alerts this week" headline is misleading when none are for tickers I intentionally track. This mode is supposed to be "events that matter to ME." Right now it's "events for tickers that appeared from nowhere."

### Ticker Profiles (NVDA, AAPL, TSLA, META) — 7/10
Genuinely useful. TradingView chart, upcoming earnings with dates and EPS estimates, historical earnings with beat/miss percentages, directional labels. This is what I wanted from Event Radar — a per-ticker intelligence dashboard. Loses points for: META's suspect Q3 data (-84.3% miss), no sector context, no analyst actions, no options flow. But the earnings-focused view is a solid foundation.

### Event Detail — 5/10
Summary tab is sparse but functional. "What Happened" section is clear. "Similar Past Events" shows nothing (fair for a geopolitical event). Missing: Bull vs Bear thesis, price tracking/outcome data, deeper analysis. The Iran event shows NEUTRAL direction but the underlying content is clearly market-moving — direction label seems miscalibrated for geopolitical events. Evidence tab is completely empty. Trust tab is the star — Source Journey with timestamps is transparent and trust-building.

### Scorecard — 5/10
Beautiful charts, professional UI. The framework (Source accuracy, Rolling trends, Signal/Confidence/Source buckets) is exactly right. But 70 outcomes out of 22,410 events is a 0.3% tracking rate. "High-Quality Setup" has 0 usable verdicts. All T+20 averages are N/A. The honest disclaimer saves it from being a negative, but this page is aspirational, not actionable. I can't make money decisions based on these numbers yet.

### History — 7/10
24,755 events with filters, severity breakdown, top tickers. Upcoming earnings calendar items at the top is smart. The volume of data shows the scanning infrastructure is working. Would be better with: working filter combinations, date range selection, and export capabilities.

### Settings — 5/10
Push notification recovery steps are well-done (step-by-step for unblocking browser permissions). Discord webhook UI exists but "Could not load notification channel settings" error prevents configuration. Email digest is "Coming soon." Sound alerts and TTS Audio Squawk sections exist but I couldn't test them. No auth wall (good — the previous user who reviewed this was wrong about that). But until I can actually save a Discord webhook, this page is 50% promise, 50% error state.

### Search — 6/10
"Iran" search is excellent — 10+ results spanning a week with severity badges, titles, sources, dates. I can trace thematic narratives. "tariff" was unreliable (no results on first attempt, results on retry). "earnings" returned nothing despite the system being full of earnings events. The Tickers tab with trending tickers (JPM 4, XLE 2, GOOG 2) is useful. Event search results are clickable and navigate to detail pages. Half-baked but the foundation is there.

## The bottom line

**Would I recommend this to my trading buddy?** Not yet. But I'm closer to yes than I expected.

Here's the thing: Event Radar surprised me. The ticker profiles with upcoming earnings are something I'd actually use every week. The Smart Feed's narrative threading (Iran ultimatum → sanctions waiver → oil decline) is genuinely better than scrolling Twitter or even my Bloomberg terminal for thematic awareness. The Trust tab's Source Journey pipeline is the most transparent thing I've seen from any AI trading product. The search, when it works, lets me research themes in seconds.

But the product keeps tripping over itself. Phantom watchlist tickers destroy the "personalized for you" promise. An 84% META earnings miss that never happened destroys data trust. An empty Evidence tab destroys the "deep analysis" narrative. Search that can't find "earnings" in a system full of earnings events is broken at the core use case level. And a WebSocket that drops to "Offline" during a casual browse means I can't rely on this during live trading.

**What would change my mind:** Fix the five trust-killers: (1) watchlist integrity, (2) earnings data accuracy, (3) search reliability, (4) Evidence tab content, (5) connection stability. Do that, and the Smart Feed + Ticker Profiles + Search combination is worth $29/month easily. The scanning infrastructure detecting 22K+ events from 17 sources is clearly working. The AI summaries are sharp. The UI is clean. It just needs the last 20% of polish to be money-on-the-line trustworthy.

**Grade: B-** — I see the vision. The Smart Feed and Ticker Profiles got me excited. But I can't bet real money on a product with data integrity questions and an unreliable connection. Fix those, and this is a B+ headed for an A-.

— Alex
