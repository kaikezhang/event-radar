# Day Trader User Review — 2026-03-21

**Reviewer perspective:** Active day trader evaluating Event Radar as a potential addition to their trading workflow. Currently uses TradingView, Discord alerts, Twitter/X, and a Bloomberg terminal at work.

---

## Speed of Information — 5/10

**How fast can I get to actionable info?**

I opened the app and saw... skeleton loading bars. For 3-5 seconds. Then events appeared, but the most recent ones are from "7h ago" and "1d ago." There's nothing from the last hour. For a product that says "before they hit the headlines," that's a problem.

When I click into an event, the detail page is comprehensive — I can see the headline, the directional thesis, the bull/bear case. That's maybe 5 seconds of reading to get the gist. But then I have to scroll through 11 sections to see everything. Most of it I don't care about in the heat of the moment.

**What I need in a trading context:**
- Open app → see what happened in the last 30 minutes → assess if I need to act → act
- Total time budget: 15 seconds

**What Event Radar delivers:**
- Open app → wait 3-5s → scan feed → click event → scroll → read analysis → still don't know the current stock price → open TradingView anyway
- Total time: 60+ seconds, and I still need another tool

**The killer problem:** There are NO STOCK PRICES anywhere. I see "BEARISH High conf" on AAL but I have no idea if AAL is at $15 or $12 right now, what it was when the event happened, or how it's moved since. I can't make a trading decision without price context. This is like a weather app that tells you "storm coming" but never shows the temperature.

---

## Signal vs Noise — 5/10

With the default filters (HIGH + CRITICAL), the feed shows 2-3 events over several days. That's not enough signal to justify keeping the app open. I'd check it once, see nothing new, and close it.

With NO filters, the History page shows 23,897 events. That includes things like:
- "[Rule] Schedules of Controlled Substances: Placement of 3-Methoxyphencyclidine..." (FDA)
- "[Notice] Foreign-Trade Zone 27; Application for Subzone; Methods Machine Tools, Inc." (Federal Register)

These are noise for a day trader. I don't care about deep seabed mining exploration licenses.

**The calibration problem:** The app has two modes — barely any signal (HIGH+CRITICAL) or drowning in regulatory noise (all events). There's no sweet spot. What I want is: "here are the 3-5 events TODAY that could move stocks on your watchlist." Not 0 events, not 23,000 events.

**The ticker mismatch:** My watchlist has 10 tickers (NVDA, AAPL, META, etc.), but the feed events are about AAL, MU, XLE, CL — tickers that AREN'T on my watchlist. Why? If I'm filtering by "My Watchlist," I should only see events for MY tickers. If there are none, tell me "quiet day for your tickers" instead of showing unrelated events.

Wait — actually, looking more carefully, the feed shows events that AFFECT my watchlist tickers even if the primary ticker differs. The AAL airspace event tags AAL, DAL, and UAL. The XLE sanctions event tags XLE. These are in "All Events" mode. "My Watchlist" mode shows different events. OK, this makes more sense, but the distinction between the two modes isn't obvious.

---

## Customization — 4/10

**Can I set up MY workflow?**

- **Ticker watchlist:** Yes. Easy to add/remove. Sector packs are nice. Drag to reorder. Notes field per ticker. Good.
- **Alert thresholds:** No. I can't say "only alert me on NVDA if severity is CRITICAL" or "alert me on ANY earnings surprise regardless of severity." It's a one-size-fits-all severity filter.
- **Custom rules:** No. I can't create rules like "alert me when any ticker in my watchlist has unusual options activity + AI confidence > 0.8."
- **Layout customization:** No. I can't resize the feed/detail panels. I can't choose which sections show on the event detail. I can't pin tickers to the top.
- **Notification rules:** The notification budget exists (quiet hours, daily cap), which is thoughtful. But I can't set per-ticker or per-event-type notification rules.
- **Sound alerts:** Exist but haven't tested them. The concept is right — traders need audio alerts when they're looking at charts on another monitor.
- **Audio squawk (TTS):** This is actually brilliant. Bloomberg terminal has a squawk box for breaking news. If this works well, it's a genuinely premium feature. Haven't been able to test it live.

---

## Trust — 4/10

**Do I trust the AI analysis?**

The Scorecard page openly shows a **24.4% directional hit rate.** That means when the AI says "BEARISH," the stock goes down only 24.4% of the time. That's worse than guessing. A literal coin flip would be 50%.

The source accuracy bar is 100% red. The avg T+20 move is 0.0%.

I appreciate the radical transparency — most AI products hide their accuracy. But the transparency is telling me not to trust the directional calls. So what's the point of the BEARISH/BULLISH badges?

**What builds trust:**
- The Alert Provenance ("Source Journey") is excellent. Seeing that an event went through Rule Filter → AI Judge (Confidence: 0.90) → Enriched → Delivered tells me there's a real pipeline, not just an LLM hallucinating.
- Source attribution (via CNBC, via Yahoo Finance) is critical. I can click through to verify.
- The multi-source aggregation is trustworthy — SEC filings, Federal Register, StockTwits trending. These are real data sources.

**What breaks trust:**
- 24.4% hit rate displayed prominently
- "No upside thesis identified" on the Bull Case — if the AI can't find a bull case, maybe the event isn't clearly directional, and the BEARISH badge shouldn't be so confident
- "Insufficient Data" and "Pending" throughout the Trust section — feels like the verification system isn't working yet
- The "High conf" badge saying "High confidence" on a BEARISH call, when the aggregate system is right only 24.4% of the time. High confidence in what?

---

## Comparison to Current Tools

### vs TradingView
TradingView gives me charts, price data, technical indicators, community ideas, and real-time alerts based on price/volume conditions. Event Radar gives me news events with AI analysis. They're complementary, not competitive. But Event Radar NEEDS price data to be used alongside TradingView, not instead of it. Currently I'd have to constantly switch between them.

### vs Discord (trading servers)
Discord trading servers give me: human-curated alerts, discussion, real-time chat about events, screenshots of setups. Event Radar gives me: AI-curated alerts with structured analysis. The AI analysis is more thorough but less nuanced than a good human trader's take. Discord is social; Event Radar is a solo tool. **Missing: community layer.**

### vs Twitter/X
Twitter/X is where news breaks first. Period. If Event Radar's events are "7h ago" and "1d ago," Twitter had them hours earlier. The value of Event Radar isn't speed (Twitter wins), it's ANALYSIS — the bull/bear thesis, the pattern matching, the confidence scoring. But the analysis needs to be accurate to justify the latency.

### vs Bloomberg Terminal
Bloomberg has everything — price, news, analytics, chat, execution. Event Radar can't compete on scope. But Event Radar could compete on ACCESS — $29/month vs $24,000/year. The AI analysis and event detection pipeline is legitimately Bloomberg-grade thinking at retail pricing. If accuracy improves.

---

## Missing Killer Feature

**One feature that would make this indispensable:**

**"Trade Signal" with price tracking and P&L simulation.**

After every BEARISH/BULLISH call, show me:
- The stock price AT THE TIME of the alert
- A suggested entry, stop-loss, and target (even if simplified)
- Real-time tracking of how that "trade" is performing
- Running P&L: "If you'd acted on our last 10 BULLISH calls, you'd be up/down X%"

This turns Event Radar from "interesting AI analysis I might read" into "a signal service I can act on and verify." The Scorecard already tracks T+5 and T+20 moves — the infrastructure exists. Surface it per-alert instead of in aggregate.

If the hit rate is really 24.4%, this feature would also force the team to improve the model because the losses would be painfully visible.

---

## Would I Pay $29/month? — NO

**Honest assessment:**

Not today. Here's my math:
- TradingView Pro: $15/month — gives me everything Event Radar lacks (prices, charts, alerts)
- Twitter/X: Free — gives me faster news
- Discord servers: Free or $10/month — gives me community + human analysis

Event Radar at $29/month gives me AI analysis with 24.4% accuracy and no price data. The AI analysis is genuinely interesting — the bull/bear thesis, the source aggregation, the pipeline transparency. But "interesting" isn't worth $29/month. "Profitable" is worth $29/month.

**What would make me pay:**
- >60% directional hit rate (or an honest reframing of what the AI actually does well)
- Live price integration (even delayed 15-min quotes)
- Post-alert price tracking with P&L simulation
- Working push notifications (mobile and desktop)
- API access for my own alert scripts
- At $29/month, I'd be getting better analysis than free alternatives, integrated with price data, with a proven track record

---

## Would I Recommend? — 5/10

**NPS equivalent: 5 (Passive)**

I wouldn't actively tell other traders about Event Radar today. It's not bad — it's just not complete enough to recommend. The AI analysis is a genuinely differentiated feature. The event pipeline and source aggregation are impressive. The Scorecard transparency is rare and admirable.

But I'd feel embarrassed recommending a trading tool with no prices, a 24.4% hit rate, broken tabs, and skeleton loading screens. It would reflect poorly on my judgment.

**What would make me a promoter (9-10):**
- Price integration + post-alert tracking
- Improved accuracy OR honest reframing
- Working mobile notifications
- An "aha moment" where an Event Radar alert made me money that I would have missed otherwise

**The bottom line:** Event Radar has the bones of something great. The vision — AI-powered event detection with transparent accuracy tracking — is legitimately compelling. But the execution gaps (no prices, low accuracy, broken features) make it a "check back in 3 months" product, not a "shut up and take my money" product. Close the price gap and the trust gap, and you'll have something traders actually need.
