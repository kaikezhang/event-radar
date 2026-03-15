# CEO Review: Phase 3 Completion & Productization Plan

> Reviewer: CC (CEO lens) | Date: 2026-03-15 | Plan: `docs/plans/2026-03-15-phase3-productization.md`

### Verdict: BUILD — with surgery

This plan is a massive improvement over the original 8-week vision. It correctly narrows scope, acknowledges what's already built, and sequences work around real dependencies. But it still has soft spots that will cost you if you don't address them now.

---

### 1. Are the 8 Work Packages the Right Priorities?

**Mostly yes. But the weighting is off.**

The plan correctly identifies auth, watchlist-first UX, and language migration as the three things that transform "dev tool" into "product." That's the right instinct.

**What's right:**
- WP1 (Auth) — correct that it blocks everything user-scoped
- WP2 (Watchlist-First) — correct that this is the core differentiator
- WP3 (Language) — correct that "ACT NOW" undermines credibility
- WP4 (Scanner Hardening) — correct, especially 4a (immediate first poll) and 4d (smart cooldown)

**What's questionable:**
- WP6 (Multi-Source Confirmation) is listed as "Medium" priority but it's actually one of the highest-trust features you could ship. A badge that says "Confirmed by 3 sources" does more for trader confidence than any amount of AI prose. **Promote this.** The lightweight ticker+eventType+30min approach is exactly right — don't overthink it with embeddings.
- WP5 (Event Bus Concurrency) is defensive infrastructure. It matters, but calling it a "work package" overstates its product relevance. It's a half-day patch. Just do it inside WP4 as "4e" and stop thinking about it.
- WP7 (Frontend Polish) bundles three unrelated things. Workbox caching is infrastructure. Short URLs are a nice-to-have. Provenance display is **critical product differentiation**. Don't let the provenance work get lost inside a "polish" bucket.

**What's missing:**
- **Onboarding flow.** The plan describes a login page and a watchlist page but says nothing about the first 60 seconds after signup. A swing trader signs up, sees an empty watchlist, and... what? You need: (1) suggested tickers based on recent high-signal events, (2) a "popular watchlists" seed, or (3) at minimum a guided "add 5 tickers to get started" step. Without this, activation will be terrible.
- **Notification budget / quiet hours.** The vision doc specifically called this out. The plan doesn't address it. If you're serious about "when Event Radar pings you at 2am, you KNOW it matters," you need user-configurable quiet hours and a daily notification cap. Otherwise you're just another noisy app.
- **Scorecard improvements.** The scorecard page already exists but the plan treats it as "done." It's not done until it shows per-source accuracy and per-event-type accuracy — those are the numbers that build trust. The current aggregation is too coarse.

---

### 2. Execution Order

**The dependency graph is correct but the week-by-week schedule is suboptimal.**

Problem: WP3 (Language Migration) is scheduled for Week 2, but it should be Week 1, Day 1. It's a 0.5-day task that touches the enrichment prompt, delivery templates, and UI labels. Every event processed after this change ships with the right voice. Every event processed before it ships with "ACT NOW" language that you'll have to explain away later. **Do it first. It's cheap and it compounds.**

Better order:
- **Week 1:** WP3 (Language, half day) + WP1 (Auth) + WP4a/4b (Scanner fixes)
- **Week 2:** WP2 (Watchlist-First) + WP4c/4d + onboarding flow
- **Week 3:** WP6 (Confirmation) + WP7c (Provenance — pull out of polish) + WP5 (Concurrency, half day)
- **Week 4:** WP8 (Landing) + WP7a/7b (Workbox, short URLs) + integration testing

This front-loads user-facing product changes and back-loads infrastructure polish.

---

### 3. Product Language Migration

**The proposed language is better but not sharp enough.**

Current proposal:
| Old | New |
|-----|-----|
| ACT NOW | High-Quality Setup |
| WATCH | Developing Situation |
| FYI | For Reference |

My take:
- **"High-Quality Setup"** is good. It's trader language. A swing trader knows what a "setup" is.
- **"Developing Situation"** sounds like a CNN chyron, not a trading terminal. Try **"Monitor"** or **"Developing Setup"** — keep "setup" as the consistent framing.
- **"For Reference"** is fine but passive. Consider **"Background"** — it's shorter, clearer, and implies "file this away."

The enrichment prompt update is the most important part of WP3. The new prompt text is good:

> "Do not use BUY, SELL, HOLD, or any personal financial advice language. Frame as intelligence, not recommendations."

**Add one more line:** "Never state what a trader should do. State what the data shows and what historically followed." That's the voice.

The field rename from `action` to `signal` is correct and important. It's not just cosmetics — it changes how downstream code and prompts think about the field.

---

### 4. Watchlist-First UX

**The proposal is directionally right but too timid.**

What's proposed: a toggle pill between "All Events" and "My Watchlist" on the feed.

What it should be: **My Watchlist IS the feed.** "All Events" is the secondary view for exploration. The toggle should default to watchlist and the "All Events" tab should feel like browsing, not the main experience.

Specific gaps:

1. **The watchlist page itself needs to be the dashboard, not just a list of tickers.** The plan mentions "latest event + market context + sparkline" per ticker — good. But go further: group events by ticker on the watchlist view. When I look at my watchlist, I want to see "NVDA: 2 events today (1 high-quality)" at a glance, not a chronological firehose filtered by my names.

2. **Push notifications should ONLY fire for watchlist tickers by default.** The plan doesn't say this explicitly. If I get a push for a ticker I don't follow, you've broken the contract. Make it opt-in for non-watchlist alerts (maybe a "breaking market events" toggle in settings).

3. **The empty-watchlist fallback ("falls back to full feed if watchlist is empty") is wrong.** Don't show the firehose to a new user. Show the onboarding flow. The firehose is overwhelming and unearned — the user hasn't told you what they care about yet.

4. **Watchlist size matters.** A swing trader typically watches 10-30 names. The plan should state a target watchlist size and design around it. The Alpha Vantage rate limit concern is real — with 500 symbols max in cache and multiple users, you'll hit walls fast. This is a business model question disguised as a technical constraint.

---

### 5. Auth System — Magic Link

**Right choice. The implementation spec is solid.**

Magic link is perfect for this product because:
- No password to forget
- Email = identity (you need it for push subscription management anyway)
- Low friction for the "try it once" user
- No OAuth complexity (Google/GitHub login adds nothing for traders)

Things I'd tighten:
- **JWT expiry of 24h is too short** for a mobile PWA. A trader checks the app once in the morning and once after close. If their JWT expired mid-day, they'll hit a login wall when they tap a push notification. **Make it 7 days** with refresh token rotation. The 30-day refresh token is fine.
- **The `AUTH_REQUIRED=false` default for self-hosted is correct** and important. Don't let auth complexity poison the self-hosted experience.
- **Resend is the right email provider.** Don't overthink this. The SMTP fallback via nodemailer is good insurance.

One concern: the plan says "creates user if not exists" on verify. That's correct for the happy path, but you need to decide: **can anyone with an email sign up, or is this invite-only for beta?** If it's open signup, you need rate limiting on the magic link endpoint immediately (not "later"). If it's invite-only, add an allowlist check.

---

### 6. Landing Page

**The proposed sections are correct but the messaging needs to be sharper.**

Current hero: "Not more alerts. Better setups."

That's good. Keep it. But the rest of the page needs to answer the trader's real question: **"Why should I trust another alert service?"**

My suggested structure:

1. **Hero:** "Not more alerts. Better setups." + a real screenshot of a high-quality alert (the MRNA example, fully rendered with current market context, historical stats, and provenance)
2. **The problem:** "You get 200 alerts a day. You act on 3. We show you the 3." (One sentence, not a paragraph)
3. **How it works:** The 4-step visual is fine, but label them as outcomes, not process: "What happened → Why it matters now → What followed historically → Whether we were right"
4. **Scorecard:** This is your killer section. Show a real 90-day accuracy table. "We show our receipts" is the right instinct — make it the biggest section on the page. **This is your competitive moat in marketing form.**
5. **Self-host CTA:** `docker compose up` — keep it prominent. Open source credibility is a distribution lever for traders who are inherently skeptical.
6. **Cloud waitlist:** Email signup, but frame it as exclusive: "Cloud beta — limited spots" (even if it's not limited, urgency helps)

**What to cut from the landing page:** Don't mention pricing. Don't mention "AI-powered." Don't compare to Bloomberg. Those all trigger trader skepticism. Let the product speak through the example alert and the scorecard.

**Tech choice:** Static HTML/Tailwind is correct. Don't use React for a landing page. Ship it as `public/landing.html` — separate deploy is unnecessary overhead for Week 4.

---

### 7. What Would I Cut? What Would I Add?

**Cut:**
- **WP7a (Workbox caching)** — defer to post-launch. The app works without it. Offline financial data is an oxymoron anyway.
- **WP7b (Short URLs)** — nice-to-have, not launch-blocking. A UUID in the URL is ugly but functional.
- **WP5 as a standalone work package** — fold it into WP4 as a half-day task.

**Add:**
- **Onboarding flow** (discussed above) — this is the difference between 5% and 50% activation
- **Notification budget controls** — daily cap + quiet hours. Even if the default is "unlimited," having the settings page shows you respect the trader's attention
- **Per-source and per-event-type scorecard breakdowns** — the current aggregate scorecard is a start, but traders want to know "how accurate are your FDA alerts specifically?" That's the trust-building granularity.

**Net effect:** You're still at 8 work packages, but they're better aimed at activation and trust.

---

### 8. Is 4 Weeks Realistic?

**For the plan as written: tight but possible.**

The plan benefits enormously from what Phases 0-2 already shipped. Auth is the only truly net-new subsystem. Language migration is a half-day. Scanner hardening is incremental. Watchlist-first is UI work on existing pages. Landing page is a day.

**Where it'll slip:**
- Auth always takes longer than estimated. JWT refresh flows, edge cases (expired token + push notification tap), email deliverability debugging — budget 3 days, not 2.
- Watchlist-first UX will surface data model issues. The moment you filter the feed by watchlist, you'll discover events that don't have clean ticker associations. The `event.metadata.ticker` extraction path needs to be robust, and it probably isn't today.
- Multi-source confirmation (WP6) is scoped well ("lightweight, no embeddings") but the UI work to show confirmation badges across AlertCard, EventDetail, and delivery templates adds up.

**My honest estimate: 5 weeks** with the cuts I suggested. 4 weeks if everything goes smoothly, which it won't.

**The critical path is:** Auth (3d) → Watchlist-First (2d) → everything else in parallel. If auth slips a week, the whole plan slips a week. Consider: can you start WP2 with a "fake auth" (hardcoded user, real watchlist filtering) and wire real auth in later? That would de-risk the schedule.

---

### Bottom Line

This plan is the right plan at the right time. It correctly identifies that Event Radar's moat is **accountable signal quality** — not speed, not AI, not source count. The watchlist-first + scorecard + provenance combination is genuinely differentiated.

The biggest risk isn't technical — it's activation. You can build all 8 work packages perfectly and still fail if a new user signs up, sees an empty screen, and leaves. **Onboarding is the missing work package.** Add it or the rest doesn't matter.

Ship the language migration on Day 1. Ship auth by end of Week 1. Ship watchlist-first by end of Week 2. Everything after that is gravy.
