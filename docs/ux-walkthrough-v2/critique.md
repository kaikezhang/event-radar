# Event Radar v2 — Swing Trader Critique

> Reviewer: Simulated swing trader, first-time user
> Date: 2026-03-16
> Device: iPhone 14 Pro screenshots (390x844)

---

## 1. First Impression — Stay or Leave?

**I'd give it 30 seconds.** The feed landing (01) is clean and immediately legible — dark theme, severity badges, date grouping. I can tell within 3 seconds this is a news/event feed for stocks. The "Viewing delayed public feed — Sign in for live" banner is a smart hook. The CRITICAL/HIGH color coding catches my eye.

But here's the problem: the feed looks like a slightly nicer RSS reader. There's nothing on the landing page that screams "this is smarter than my Bloomberg terminal alerts" or "this will make you money." The value prop is invisible until you drill into an event detail — and most visitors will never get that far.

**Verdict: I'd stay long enough to tap one event. If that event detail disappoints, I'm gone.**

---

## 2. Can I Make a Trading Decision from Event Detail?

Looking at 05-event-detail.jpg (GOOG/Wiz acquisition):

**Short answer: No. Not yet.**

What's good:
- The "What happened" summary is tight and useful
- Impact and Risks sections exist — this is the right structure
- Market Context showing "$GOOG bullish" is directionally helpful
- Regime Context adds macro awareness most alert tools lack

What kills it:
- **No price data.** I'm looking at a stock event and there's no price, no chart, no % move. I have to leave the app to check if GOOG already moved 5% on this news or if I'm early. This is the single biggest gap.
- **"Monitor" signal with "Unclear" direction is useless for trading.** If your AI can't form an opinion, don't show a badge that looks like a recommendation. "Monitor" tells me nothing I didn't already know — I'm here because I'm monitoring.
- **Verification section is confusing.** "Outcome tracking has not produced a usable T+5 or T+20 move yet" — this reads like internal debugging, not trader-facing content. "Insufficient Data / Pending / Pending" screams beta product, not confidence.
- **Wall of text.** The page is absurdly long. I scrolled through what looks like 6+ screen-heights of content. A swing trader needs: what happened, how big, which direction, am I early or late. Everything else is noise until I ask for it.

**What I'd need to trade on this:** A price chart overlay showing when the event fired vs. current price. A clear bull/bear/neutral verdict (not "Monitor"). Comparable historical events with their outcomes ("last 5 mega-acquisitions averaged +3.2% in 5 days").

---

## 3. Top 3 Things Still Broken

### 3a. Login is a brick wall
The verify screen (03) shows "Verification failed — API error: 401." This isn't a minor bug — this is the **entire onboarding funnel**. A user who can't log in is a user who churns permanently. The fact that this is caused by React StrictMode double-mounting is embarrassing — it means every single dev-mode test passed while real users hit a wall. Ship-blocking.

### 3b. HTML entity encoding in the feed
The WWD card in the feed (01) shows `&amp;` in the title. This is the first piece of content a new user reads. It makes the product look unfinished. Small bug, massive perception damage.

### 3c. The event detail page has no price context
As covered above — an event alert tool for traders that doesn't show the ticker's price or move is like a weather app that doesn't show the temperature. The AI enrichment is interesting but it's floating in a vacuum without market data to anchor it.

---

## 4. Top 3 Things That Work Well

### 4a. Onboarding flow concept is solid
The onboarding (04) and watchlist (06) screens nail the "pick tickers you care about" flow. Sector packs are a smart shortcut. "Trending this week" with event counts is genuinely useful for discovery. The progressive disclosure (pick tickers -> enable push -> go) is the right sequence.

### 4b. Severity-first feed design
The feed (01) leading with HIGH/CRITICAL colored badges is correct for the use case. Date grouping with event counts helps me gauge activity. The information hierarchy — severity, ticker, headline, snippet — is exactly what a scanner should show. I can triage 10 events in 10 seconds.

### 4c. AI enrichment depth on event detail
Despite the UX issues, the raw analytical content on the detail page (05) is impressive. Impact analysis, risk factors, regime context, market direction, and a verification/scorecard framework — this is the kind of structured thinking that justifies paying for a product vs. reading free news. The "Was this useful?" feedback loop is a nice touch for improving signal quality. If this content were condensed and paired with price data, it would be genuinely differentiated.

---

## 5. Would I Pay? Would I Recommend?

**Would I pay today? No.**

The login is broken, there's no price data on events, and push notifications don't work. I'm being asked to pay for an alert tool that can't alert me and can't show me if the alert matters. The AI analysis is interesting but "Monitor / Unclear / Insufficient Data" on a major acquisition that's already been announced makes me doubt the signal quality.

**Would I pay for the v3 I can see forming? Maybe.**

The bones are good. The severity-first feed, watchlist-driven personalization, and structured AI enrichment are the right building blocks. If you fix:
1. Login (obviously)
2. Add price/chart context to event detail
3. Make the AI commit to a direction or explicitly say "too early to call — here's what to watch"
4. Get push working so I actually receive alerts in real-time

...then you'd have something worth $15-20/month for an active swing trader. The competitive bar is StockTwits (free, noisy), Benzinga Pro ($117/mo, comprehensive), and plain Discord alert bots (free, no analysis). Event Radar could own the middle — smarter than free, cheaper than Bloomberg — but only if the event detail page becomes a decision-support tool instead of an AI book report.

**Would I recommend it today?** I'd tell a friend "interesting concept, check back in a month." That's not good enough. You need people saying "this caught a move I would have missed." Fix the detail page, ship push, and get 3-5 case studies of events where your alert beat the crowd. Then we'll talk.

---

*Reviewed against screenshots 01-08 from walkthrough v2, 2026-03-16.*
