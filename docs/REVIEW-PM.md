# Event Radar — PM Review

**Reviewer:** Senior PM perspective
**Date:** 2026-03-13
**Docs reviewed:** USER-APP-SPEC.md, README.md

---

## 1. Product-Market Fit

**Value prop is clear and compelling.** "SEC files at 4:05 PM, CNBC covers it at 6 PM, you had it at 4:05 with AI analysis" — this is a strong hook. Speed + context is a real edge for active traders and portfolio managers.

**Target user is underspecified.** The spec oscillates between:
- **Retail day traders** (mobile-first, severity badges, r/wallstreetbets source)
- **Sophisticated investors** (alpha at T+5/T+20, win rates, historical pattern matching)
- **Casual investors** (email digest, "FYI" severity)

These are very different users with different willingness to pay, notification tolerance, and feature expectations. **Pick one for V1.** My recommendation: **active retail traders who currently use Twitter/X, Discord, and StockTwits to stay informed.** They're underserved by Bloomberg (too expensive), overserved by noise (Twitter), and already mobile-native.

**Competitive landscape the spec ignores:**
- **Benzinga Pro** ($117/mo) — real-time news, squawk box, similar alert feed
- **TradeAlgo** — AI-powered alerts, options flow
- **Unusual Whales** — options flow + political trades, strong retail following
- **Twitter/X finance accounts** — free, fast, noisy
- **Bloomberg Terminal** — $24k/yr, institutional standard

The differentiator here is the **AI enrichment + historical pattern matching combo**. No competitor does "here's what happened + here's what happened the last 12 times this type of event occurred" in a single card. That's the moat — lean into it hard.

---

## 2. MVP Scope

**The MVP is about right in breadth but wrong in priority.**

### Cut from V1
- **Email digest** — adds backend complexity (email service, templates, scheduling) for a feature nobody will use as their primary engagement channel. Ship push + Discord only.
- **Google OAuth** — email+password is fine for V1. OAuth adds dependency complexity. Add it in V1.1 when you see signup friction in metrics.
- **Quiet hours** — over-engineering notification preferences before you have users. Ship a simple on/off toggle.
- **Search** — users won't search historical events until they trust the product. The feed IS the product for V1. Search is V1.5.

### Missing and critical
- **Onboarding flow** — The spec goes straight from register to feed. A new user hits an empty or overwhelming feed with no context. You need: (1) pick 3-5 tickers on signup, (2) show a sample alert with annotation explaining what each section means, (3) ask for push notification permission with a reason.
- **Empty states** — What does the feed look like at 9 PM on a Sunday? If the answer is "nothing," users will churn. You need a "market closed, here's today's summary" or "quiet period, last alert was X hours ago" state.
- **Time-to-first-alert metric** — The backend pipeline determines this, not the app, but the PM needs to own this number. If a user signs up and doesn't get a relevant alert within 4 hours, they'll forget the app exists.

---

## 3. User Journey

**Current journey (from spec):**
```
Visit site → Register → See feed → Scroll → Tap alert → Read AI analysis → ???
```

**Problems:**
1. **No hook before registration.** The user has zero reason to create an account. Show the feed publicly (read-only, delayed 15 min) so they can see the value before committing. Registration unlocks: real-time, watchlist, push notifications.
2. **Steps to value: 4 (register → set watchlist → wait for alert → read it).** That's too many. The feed should be immediately useful without a watchlist. Watchlist is a power-user retention feature, not an onboarding requirement.
3. **No "aha moment" design.** The "aha" is: "I got an alert 20 minutes before I saw it on CNBC, and the historical data told me the right move." You can't manufacture this — it depends on market events. So you need to **simulate it** during onboarding by showing a recent example: "2 days ago, Event Radar caught X at 4:05 PM. CNBC reported it at 6:12 PM. Historical pattern predicted Y, and Z actually happened."
4. **No share/viral loop.** Users who get a great alert should be able to share it. The share button exists in the spec but there's no thought on format. An alert shared to Twitter/Discord should be a rich preview card with "Powered by Event Radar" and a signup link. This is your primary growth channel.

**Recommended journey:**
```
See shared alert on Twitter → Visit site → Browse public feed (delayed) →
See real-time alert they missed → Register → Get first push notification →
Aha moment → Set up watchlist → Daily retention
```

---

## 4. Monetization

**The spec has no business model. This is a red flag for sustainability.**

**Recommended model: Freemium with real-time paywall.**

| | Free | Pro ($15/mo) |
|--|------|-------------|
| Feed | 15-min delayed | Real-time |
| AI analysis | Summary only | Full (impact + action + historical) |
| Historical patterns | Hidden | Full access |
| Watchlist | 3 tickers | Unlimited |
| Push notifications | Daily digest only | Real-time push |
| Sources | Gov + news only | All (social, options flow, etc.) |

**Why this works:**
- Free tier is useful enough to retain and create word-of-mouth
- The paywall is on **speed** and **depth** — exactly what active traders will pay for
- $15/mo is 10x cheaper than Benzinga Pro, positions as the accessible alternative
- Historical pattern data is the unique value — gating it creates upgrade pressure

**Revenue projection:** 1,000 free users → 5% conversion = 50 paying users × $15 = $750/mo. Not venture-scale, but sustainable for a solo/small team product.

**Alternative: Usage-based.** Charge per API call for programmatic access (algo traders, quant funds). This is a V2 play but could be very high margin.

---

## 5. Retention

**What brings users back daily?**

The spec relies entirely on push notifications for retention. That's necessary but insufficient.

**Missing retention mechanics:**

1. **Morning briefing** (noted as V2, should be V1) — A daily push at 8:30 AM: "3 events overnight, NVDA 8-K filed, CPI data at 8:30 AM today." This is the single best retention feature. Users open it like checking weather. Simple to build — it's a cron job that summarizes yesterday's alerts.

2. **Streak/engagement tracking** — Not gamification (cringe for finance), but a simple "You caught 3 events before mainstream media this week" stat. Reinforces the value prop.

3. **Alert accuracy feedback loop** — The 👍👎 feedback buttons exist but there's no feedback on the feedback. Show users: "You marked this alert useful. Here's what happened since: NVDA +12% in 5 days." Closes the loop and builds trust.

4. **Weekend content** — Markets are closed 2/7 days. No new alerts = no reason to open the app. Solve with: weekly recap, "this week in history" (same week events from past years), or curated "most impactful events this week."

**Engagement loop:**
```
Morning briefing push → Open app → Scan feed →
See alert for watched ticker → Read analysis →
Check historical pattern → Make trading decision →
Come back to see if pattern held → Trust builds →
Share a good alert → Invite others
```

---

## 6. Data Moat

**Current defensibility: moderate.**

**What you have:**
- 2,400+ historical events with price outcomes — this is the seed of a moat
- 1,100+ classification rules — hard-won domain knowledge
- Multi-source pipeline — non-trivial to replicate

**What would make it defensible:**
- **Historical database at scale** — 2,400 events is a start. At 100k+ events with verified outcomes, this becomes genuinely hard to replicate. Compound this daily.
- **User feedback data** — Every 👍👎 improves the model. At 10k+ feedback signals, you have a personalization advantage no competitor can copy without their own user base.
- **Speed** — If you consistently beat alternatives by 10+ minutes, speed itself becomes the brand. Publish "beat-the-news" stats publicly.
- **Pattern accuracy track record** — Publish a "prediction accuracy" page. "Our historical patterns predicted direction correctly 67% of the time across 500+ events." This is marketing AND a moat.

**What's NOT a moat:**
- The tech stack (anyone can build a Fastify + React app)
- The AI enrichment (GPT-4o-mini is available to everyone)
- Any individual data source (all public)

**The moat is the combination:** speed + AI context + historical depth + user feedback loop. Each piece is replicable alone; together they compound.

---

## 7. Red Flags

### 🔴 Critical

1. **No public-facing value before signup.** If users must register before seeing anything, your signup conversion will be terrible. The feed should be browsable without an account. This is the #1 adoption killer in the spec.

2. **No business model.** Building a product with ongoing costs (OpenAI API, hosting, data feeds) without a revenue plan is a countdown clock. Define monetization before V1 ships.

3. **"5.5 days" estimate.** This is either wildly optimistic or the spec is over-designed. Auth + PWA push + watchlist + search + feed + detail pages + mobile-first responsive design in 5.5 days means corners WILL be cut. Be explicit about what gets cut.

### 🟡 Concerning

4. **Regulatory risk.** Phrases like "Action: Watch for entry on initial dip" are dangerously close to investment advice. Add a disclaimer, but more importantly, reframe AI outputs as "historical context" not "action recommendations." The 🔴/🟡/🟢 badges should indicate event severity, not trading actions.

5. **Notification fatigue.** The spec allows "all" alerts for watched tickers. If NVDA has 5 social mentions + 2 news articles + 1 filing in a day, that's 8 push notifications. Users will disable notifications within a week. Default should be HIGH+ only, with an explicit opt-in for lower severity.

6. **Single-column desktop.** "桌面端自适应放大但保持单列" — this wastes 60% of screen real estate on desktop. Desktop users (likely your power users) will feel this is a toy. At minimum, show a detail panel alongside the feed on wide screens (Linear does this well).

7. **30-second polling.** This is fine for V1 but will not scale. Plan for WebSocket/SSE migration. More importantly, 30s polling feels slow for a product that promises "秒级推送" (second-level push). The marketing and the product experience are mismatched.

### 🟢 Minor

8. **Mixed language in spec.** The spec mixes Chinese and English. Fine internally, but decide on one language for user-facing copy before development starts to avoid i18n debt.

9. **No analytics plan.** How will you measure if the product is working? At minimum, track: DAU, alerts viewed per session, time-to-first-alert, push notification open rate, watchlist size distribution, signup-to-first-return-visit time.

---

## Summary Recommendations

| Priority | Action |
|----------|--------|
| **P0** | Make feed publicly browsable (delayed) without login |
| **P0** | Define freemium tiers and pricing |
| **P0** | Add regulatory disclaimer, reframe "action" as "context" |
| **P1** | Design onboarding flow (ticker picker → sample alert → push permission) |
| **P1** | Build morning briefing as V1 feature, not V2 |
| **P1** | Default notification threshold to HIGH+, not ALL |
| **P2** | Cut search, email digest, Google OAuth, quiet hours from V1 |
| **P2** | Add empty states and weekend content |
| **P2** | Design shareable alert cards for social virality |
| **P3** | Plan analytics instrumentation |
| **P3** | Plan WebSocket migration path |

**Bottom line:** The core product idea is strong — speed + AI context + historical patterns is a genuinely differentiated combination. But the spec is designed like a developer's feature list, not a user's journey. Flip the perspective: start from "how does a user discover, try, trust, pay for, and evangelize this product?" and the feature priorities change significantly.
