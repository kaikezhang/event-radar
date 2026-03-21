# Day Trader User Review v2 — 2026-03-21

**Reviewer perspective:** Active day trader evaluating Event Radar as a potential addition to their trading workflow. Currently uses TradingView, Discord alerts, Twitter/X, and a Bloomberg terminal at work.
**Compared to:** trader-review-2026-03-21.md (v1)
**Sprints completed since v1:** S0-S5

---

## Speed of Information — 5.5/10 (was 5/10, +0.5)

**What improved:**
- **Smart Feed reduces noise.** Instead of wading through all events, Smart Feed curates to watchlist-relevant + high-severity + trusted-source events. I get 3 events instead of hundreds. That saves scanning time.
- **Event detail tabs** let me jump to what I need. Summary for the quick read (10 seconds), Evidence if I want proof (30 seconds), Trust if I want to verify the source (30 seconds). In v1, I had to scroll through 11 sections on a single page.
- **Global search works** for events now. I can type "oil sanctions" and immediately see 10 relevant events with severity and dates. That's fast discovery.

**What hasn't changed:**
- **Still no stock prices anywhere.** I see "BEARISH High conf" on XLE but I still don't know what XLE is trading at. Is it $85? $70? Did it already drop 10% or is this the first signal? I have no price context. I still need TradingView open on another screen.
- **Feed events are still stale.** My Watchlist shows events from 4-5 days ago. Smart Feed shows events from "13h ago" at best. If I'm a day trader checking at market open, I need events from the last 2 hours, not from yesterday.
- **Total time to actionable decision: still 45-60 seconds**, and I still need another tool for price data.

**The silver lining:** The event search is genuinely useful for research. When I hear about "Iran sanctions" on Twitter, I can search Event Radar to get structured AI analysis with bull/bear thesis. That's a different use case — not real-time trading, but research and preparation. The product is better at research than real-time alerting.

---

## Signal vs Noise — 6.5/10 (was 5/10, +1.5)

**This is the biggest improvement.** Smart Feed is the feature I was missing.

**v1 problem:** Two modes — barely any signal (HIGH+CRITICAL) or drowning in regulatory noise (all events). No sweet spot.

**v2 solution:** Smart Feed adds a middle ground. It curates events based on:
- Watchlist relevance
- Source trustworthiness
- Severity level
- Recency

The result: 3 events in Smart Feed vs 2 in My Watchlist (with HIGH+CRITICAL filter) vs hundreds in All Events. Smart Feed shows me events that aren't necessarily about MY tickers but are relevant to my sector or trading universe. The XLE sanctions event appeared in Smart Feed even though XLE isn't on my watchlist — because oil sanctions affect multiple sectors I care about. That's intelligent curation.

**Still noisy in History/All Events:** The History page shows 24,071 events including StockTwits trending alerts for LOBSTAR.X (16 watchers), FUST Token (15 watchers), and MOG Coin (3,516 watchers). These are micro-cap meme tokens and should be filtered out entirely for equity day traders. The severity system marks everything as MEDIUM, making it impossible to distinguish "Oil futures crash" from "LOBSTAR.X is trending on StockTwits." These are not the same severity.

**Daily Briefing adds context:** "1 event detected in the last 24h for your watchlist" is useful framing. It tells me whether it's worth scrolling or if I should move on. In v1, I had to scan the feed myself to figure this out.

---

## Trust — 5.5/10 (was 4/10, +1.5)

**The Scorecard reframe is smart.**

In v1, the Scorecard led with "24.4% directional hit rate" front and center. I saw that number and immediately questioned the product's value. In v2:
- Hero: "24,039 Events Detected" — impressive scale number
- Secondary: "53 Outcomes Tracked" / "15 Active Sources"
- Hit rate: Hidden behind "Advanced Analytics" collapsible section with disclaimer

This is better framing. The product's strength is DETECTION and COVERAGE, not directional accuracy. Leading with detection count tells me "we're watching everything." The hit rate is still there for those who dig, which is honest.

**The event detail Trust tab is genuinely good:**
- Source Journey shows the pipeline: Rule Filter → AI Judge (Confidence: 0.90) → Enriched → Delivered
- Verification section shows outcome status with context: "Outcome tracking has not produced a usable T+5 or T+20 move yet"
- Feedback buttons let me rate alerts (Useful / Not useful / Bad data)

**But the fundamental trust problem remains:** The AI says "BEARISH High conf" on events where the directional hit rate is 24.4%. "High confidence" from a system that's right less than a coin flip. The confidence label doesn't match the reality.

**Interesting data point:** The Signal Buckets in the Scorecard show that "Monitor" signals have a 60% hit rate (5 usable verdicts). "Background" signals have 8.3% (12 usable verdicts). This suggests the AI is actually good at some categories and bad at others. If the product surfaced this granularity per-event — "This is a Monitor-class signal (60% historical accuracy)" — that would be much more trustworthy than a blanket "High conf."

---

## Customization — 4.5/10 (was 4/10, +0.5)

**What's new:**
- **Smart Feed** is effectively an auto-customized view. The algorithm makes filtering decisions for me based on my watchlist and event quality.
- **Notification budget** (quiet hours, daily cap) is still present and thoughtful.
- **Sound alerts** and **Audio Squawk (TTS)** sections are in Settings — haven't tested them live, but the concepts are right for a trading workflow.

**What's still missing:**
- No per-ticker severity thresholds ("only CRITICAL for NVDA, all severities for AAPL")
- No custom rules ("alert on any earnings surprise regardless of ticker")
- No layout customization (can't resize panels, choose which sections show)
- No per-event-type notification rules

---

## Comparison to Current Tools (Updated)

### vs TradingView
Still complementary, not competitive. TradingView has prices, charts, technical indicators. Event Radar has AI event analysis. Together they'd be powerful — Event Radar tells you WHAT happened and WHY it matters, TradingView tells you what the MARKET is doing about it. The gap is that Event Radar doesn't have any price integration to bridge the two workflows.

### vs Discord (trading servers)
Event Radar's Smart Feed is approaching Discord-quality curation. A good Discord moderator filters noise and highlights important events — Smart Feed does this algorithmically. The AI analysis (bull/bear thesis) is more structured than Discord chatter. Still missing: the social/discussion layer.

### vs Twitter/X
Twitter is still faster for breaking news. But Event Radar's search is now a genuine complement — when something breaks on Twitter, I can search Event Radar for "Iran sanctions" and get structured analysis with historical context. That's a research workflow Twitter can't provide.

### vs Bloomberg Terminal
The gap is closing on event analysis quality. The Source Journey and Trust system are Bloomberg-grade transparency concepts. The AI thesis generation is something Bloomberg doesn't automate. But Bloomberg has prices, charts, execution, chat, and 30+ years of data. Event Radar is still a specialized niche tool vs Bloomberg's universe.

---

## Would I Pay $29/month? — STILL NO (was NO)

**Honest assessment:**

Closer, but not there. The product improved meaningfully:
- Smart Feed saves me time (worth something)
- Event search lets me research efficiently (worth something)
- Scorecard reframe doesn't actively undermine trust (neutral improvement)
- Event detail tabs make the AI analysis accessible (worth something)

But the core barriers remain:
1. **No prices.** I can't use this tool without TradingView open alongside it. At $29/month, I expect integrated price context.
2. **24.4% directional accuracy** (hidden but unchanged). The AI is still wrong 3 out of 4 times on direction.
3. **No outcome tracking per event.** I can't verify if individual alerts were right or wrong.
4. **No working notifications.** I have to actively open the app to check — defeats the purpose of a "real-time" alerting tool.

**What would make me pay $29/month:**
- Price integration (current price + price at alert time + % change since)
- Per-event outcome tracking ("We said BEARISH. 5 days later: down 3.2%.")
- >50% directional accuracy OR drop directional claims entirely ("event detected" not "BEARISH")
- Working push/email/Discord notifications
- At least 1 confirmed "this alert made me money I would have missed" experience

**Price I'd pay today:** $9/month as a research supplement. Not $29/month as a trading tool.

---

## Would I Recommend? — 6/10 (was 5/10, +1)

**NPS equivalent: 6 (Passive, trending toward Promoter)**

I'd mention Event Radar to other traders casually now. "Hey, there's this app that does AI analysis on breaking market events — pretty interesting research tool." I wouldn't enthusiastically recommend it yet because:
- No prices = credibility issue ("you recommend a trading tool with no prices?")
- Search results 404 = embarrassing if shown during a demo
- Hit rate = liability if anyone digs into the Scorecard

**What moved the needle from 5 to 6:**
- Smart Feed proves the team understands curation
- Event search proves the team understands discoverability
- Tab restructure proves the team can execute UX improvements
- Daily Briefing proves the team thinks about retention

The TRAJECTORY is right. The improvements are aimed at the right problems. But the big gaps (prices, accuracy, notifications) need more than sprints — they need strategic investment.

**What would make me a promoter (9-10):**
- Price integration + post-alert tracking (the "aha moment" of seeing Event Radar was right and I made money from it)
- Improved accuracy OR honest reframing (drop BEARISH/BULLISH, use "event detected" with severity only)
- An API so I can integrate Event Radar signals into my trading scripts
- One real story: "Event Radar caught the Iran sanctions story 2 hours before CNBC and my oil short made $X." That's the viral moment.

---

## Bottom Line

Event Radar went from "interesting prototype, check back in 3 months" to "legitimate research tool, still not a trading tool." The improvement trajectory is encouraging — Smart Feed, event search, tab restructure, Daily Briefing all address real user problems. But the product is still trying to be a trading intelligence platform while missing the most fundamental piece of trading intelligence: price data. Fix that, and you'll convert passive observers into paying users.
