# CEO Review: Alert Quality Redesign

> Reviewer: CC (CEO / product strategy lens) | Date: 2026-03-16 | Plan: `docs/plans/2026-03-16-alert-quality-redesign.md`

### Verdict: APPROVE WITH CHANGES

This is the right strategic direction. Event Radar should not be a high-volume market news firehose. It should be a conviction engine for swing traders.

But the current plan is still too binary. It treats "should this exist?" and "should this interrupt the user?" as the same decision. That is the core product mistake to avoid. The Delivery Gate is a good idea only if it becomes a **push gate**, not a universal visibility gate.

---

### 1. Product Positioning

**Yes: push only confident directional alerts.**

That is the right product promise. A swing trader does not want 30 notifications about vague activity. They want a small number of setups with a clear read on likely price impact.

But I would define the positioning more precisely:

**Event Radar should push three kinds of things only:**
- A clear single-stock bullish/bearish setup
- A watchlist name that has become materially more interesting
- A true market-level event with an obvious tradable proxy (`SPY`, `QQQ`, `XLF`, `XLE`, etc.)

That third category matters. The plan currently implies "no ticker = no push" and "no direction = no push." That is mostly correct for junk, but it will wrongly suppress some of the most valuable macro and sector alerts. "Oil breaks $100" or "Fed lowers bank capital requirements" are useful because they imply a tradable basket even if there is no single natural stock. Do not design the system so it can only think in one-stock terms.

**Product statement I would use:**

> Event Radar only interrupts you for high-conviction setups with a clear likely market impact. Everything else belongs in the feed, not in your notifications.

That is sharper and more correct than "only push events with ticker + direction + confidence."

---

### 2. Too Aggressive or Too Conservative?

**As written, it is too aggressive if applied to all delivery surfaces.**

Blocking all `🟡 Monitor` alerts is too blunt. Some of the most valuable swing-trading setups begin as "something is developing, pay attention." A trader does not need 20 of these, but they probably do need a few:
- A watchlist name entering a potentially material SEC/fundamental situation
- A notable trading halt in a stock they already care about
- A rumor / regulatory / earnings-preannouncement situation where confirmation is still pending

The real answer is not "allow Monitor again everywhere." The answer is:

- `🔴 High-Quality Setup` -> interruptive push
- `🟡 Monitor` -> feed by default, push only for watchlist names or major market names
- `🟢 Background` -> database only

There is another issue: the plan relies on an enrichment confidence threshold, but the current enrichment contract does not actually expose a confidence field. The current schema in `packages/shared/src/schemas/llm-types.ts` has `action`, `tickers`, and narrative fields, but no enrichment confidence. Meanwhile the existing routing system already uses classification confidence plus historical support in `packages/delivery/src/push-policy.ts`.

That means the proposal is currently mixing three different notions of confidence:
- LLM judge confidence
- Classification confidence
- implied enrichment confidence that does not exist yet

That is dangerous. It sounds rigorous while actually being incoherent.

**Recommendation:**
- Do not add a brand new "confidence" concept to enrichment unless you can calibrate it
- Keep one canonical prediction confidence for routing
- Use enrichment for thesis clarity and ticker extraction
- Use historical support and confirmation count as the proof layer

In other words: **the gate should become stricter, but the reasoning stack should become simpler.**

---

### 3. From 20-30 Alerts/Day to 3-8 Alerts/Day

**For push notifications: good. For the app and Discord experience: risky.**

If you can consistently deliver 3-8 genuinely useful pushes per day, that is a better product than 25 mediocre ones. No question.

But if the user opens the app or Discord and sees almost nothing, the product will feel dead, fragile, or incomplete. A trader wants quiet notifications, not an empty product.

So you need explicit surface segmentation:

- **Push / Bark / Web Push:** 3-8/day, highest bar
- **Primary feed / Discord main channel:** more permissive, maybe 10-20/day
- **Database / scorecard / observability:** keep everything useful for later analysis
- **Digest layer:** morning premarket recap, midday watchlist recap, end-of-day recap

The current code already separates "push" from some delivery behavior, but Discord is still formatted like a full alert dump, not a clean feed product. Right now `packages/delivery/src/alert-router.ts` and `packages/delivery/src/push-policy.ts` are closer to a routing system than the plan acknowledges. Use that. Do not throw it away and replace it with a single hard gate.

**My rule:**

The app should feel selective, not silent.

If you want 3-8 pushes/day, then you need:
- a live feed that is broader than push
- watchlist recaps
- a visible "developing situations" lane so the product still feels alive between high-conviction setups

Without that, the quality improvement will be real, but engagement will fall.

---

### 4. Alert Card Redesign

**The plan is correct that the current Discord card is overloaded.**

The current formatter in `packages/delivery/src/discord-webhook.ts` tries to show everything: source, severity, tickers, signal, filing items, AI analysis, source link, historical stats, regime, disclaimer. That is too much for a first-glance product. It reads like an internal debug artifact, not a trader tool.

But I would not lead with a raw decimal confidence score like `0.9`. Traders do not trust an unexplained model score. It looks synthetic. It also creates a false precision problem.

Better structure:

1. **Header**
   `BA  |  Bullish Setup`

2. **Headline**
   Plain-English event title, short and direct

3. **Why it matters**
   One sentence only

4. **Evidence**
   One compact proof block:
   `12 similar cases | +3.2% avg 5-day move | 75% win rate`

5. **Risk**
   One sentence

6. **Source + freshness**
   Visible, but small

What to demote or remove from the default card:
- raw event body
- regime paragraph
- disclaimer block on every alert
- long "AI Analysis" section
- best/worst case examples unless the user clicks through

What to add:
- a stronger confirmation / provenance badge
- a market proxy when relevant (`XLE`, `KRE`, `QQQ`)
- a clear watchlist badge when the alert is relevant to a user-owned ticker

**Important:** the card should answer one question in under 3 seconds:

> Is this a tradable setup worth opening right now?

If the card cannot answer that fast, it is still too long.

---

### 5. What Is Missing?

Several important pieces are missing from the plan.

**1. False-negative measurement**

You are optimizing precision hard. Good. But where is recall measurement? If the gate blocks half the noisy alerts and also blocks half the future winners, you have not solved the product problem. You have just gone quiet.

You need a blocked-alert review loop:
- sample blocked alerts daily
- measure how many would have been useful in hindsight
- treat "missed good setups" as a first-class metric

**2. A market-level alert lane**

Not every valuable alert resolves to a single stock. You need a policy for index / sector / macro alerts:
- assign a proxy ticker or ETF when appropriate
- allow "market alerts" as a separate class
- do not force everything into single-name logic

**3. User-selectable alert modes**

There are at least two valid products hiding here:
- "Only my watchlist"
- "My watchlist + major off-watchlist opportunities"

The plan assumes one universal threshold. That is too rigid.

**4. Calibration and scorecard integration**

If you are going to show conviction, the scorecard has to validate it. The plan talks about confidence thresholds but not about calibration. Every threshold should be justified by real backtests, not gut feel.

**5. A notification budget**

The plan reduces volume, but it does not define a budget. You still need:
- daily max push count
- quiet hours
- escalation rules for truly exceptional market-wide alerts

**6. A cold-start strategy**

`isNotableTicker()` is fine as a stopgap. It is not a product strategy. "S&P 500 + Nasdaq 100" is a decent bootstrap, but do not confuse that with trader relevance. The real relevance layer is user intent plus measured usefulness.

---

### 6. Interaction with Watchlist-First UX

This is where the plan is most strategically incomplete.

The document treats watchlist filtering as a future expansion. I think that is backwards.

**Watchlist-first should shape the Delivery Gate from day one.**

Why:
- A mediocre alert on a watchlist name may still be valuable
- A strong alert on a random off-watchlist small cap may still be ignored
- User intent is one of the strongest relevance signals you have

So the right logic is not just "notable ticker or not." It is:

- **Watchlist ticker:** lower bar for delivery, especially for `🟡 Monitor`
- **Major market ticker / sector proxy:** medium bar
- **Off-watchlist random name:** highest bar, often feed-only

This also solves the "app feels dead" problem more elegantly. A user with a 20-name watchlist can still get a healthy stream of relevant updates without reopening the global firehose.

My product recommendation:

- Default push behavior: watchlist names only
- Optional setting: "also send major market setups"
- Feed behavior: watchlist first, global opportunities second
- Empty watchlist behavior: guided onboarding, not unrestricted firehose

The plan's `isNotableTicker()` function is acceptable for pre-watchlist bootstrapping, but it should be explicitly framed as a **temporary bridge** until watchlist-aware delivery is in place.

---

### Bottom Line

This plan correctly identifies the core issue: Event Radar is losing trust because it interrupts users for too many low-value events.

The solution is not "show less of everything." The solution is:
- push much less
- prove more
- personalize earlier
- keep the feed alive even when notifications are quiet

So yes, build the Delivery Gate. But make it a **channel-aware conviction gate**, not a blanket suppression layer.

If you implement this with surface segmentation, watchlist-aware thresholds, market-alert exceptions, and blocked-alert recall tracking, this will materially improve the product.

If you implement it as "only 3-8 alerts exist per day, full stop," you will improve precision but risk shrinking the product into silence.
