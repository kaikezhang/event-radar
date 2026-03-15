Review written to `docs/reviews/2026-03-15-phase3-eng-review.md`.

**Top 5 findings that would break production:**

1. **Auth has no refresh token revocation** — no table, no logout endpoint, no token family tracking. A leaked refresh token = 30 days of unrevocable access. The `resolveRequestUserId()` silently falls back to `'default'` user on any auth failure, which means data leakage between users.

2. **Push notifications will silently stop** when WP3 (language rename) deploys — `push-policy.ts` hardcodes `'🔴 ACT NOW'` string comparison. Rename the labels without updating all consumers atomically and `shouldPush` is always `false`.

3. **Event bus is fire-and-forget** — `EventEmitter.emit()` doesn't await async handlers. Adding a `ConcurrencyLimiter` that returns promises doesn't help when the emit site ignores them. Events that fail in the pipeline are lost with no retry.

4. **WP4a (immediate tick) without WP4b (fetch timeout) = stuck scanner on startup** — the plan lists them as parallel, but if `tick()` fires immediately and the API hangs, the scanner blocks indefinitely. Fetch timeout must ship first.

5. **Cooldown persistence format change** from `ticker` → `ticker:eventType` keys silently invalidates the existing cooldown file on deploy, causing a burst of duplicate alerts.

The review also covers NYSE holiday edge cases (Good Friday computation, early closings), multi-source confirmation race conditions, JWT in localStorage XSS risk, missing rate limiting on auth endpoints, and a recommended reordering of implementation to respect actual dependencies.
