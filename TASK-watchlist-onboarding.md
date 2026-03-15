# Current Task — Phase 4 Launch Flow: Watchlist / Onboarding UX

Branch: `feat/phase4-watchlist-onboarding`

## Goal
Turn the web app into a clearer watchlist-first product for first-time users.

This task should improve the user’s first-run path:
- understand what Event Radar does
- add first ticker(s) to watchlist
- understand why enabling push matters

## Scope

### 1) Watchlist empty state / onboarding state
Update the existing watchlist-related web surfaces so that when the user has no watchlist yet, the app gives a clear product-guided first step.

Minimum goals:
- explain that Event Radar is best used watchlist-first
- prompt user to add their first ticker
- explain that high-confidence alerts can be pushed to the device

### 2) Add-ticker UX polish
Polish the first-ticker / add-ticker flow.

Goals:
- obvious entry point to add a ticker
- better empty-state copy
- clear success state after adding first ticker
- keep it simple and mobile-first

### 3) Push CTA in onboarding context
Add a light CTA that connects watchlist setup with push setup.

Do not force push enablement, but make the value proposition clear.

### 4) Keep scope narrow
Do NOT build full auth.
Do NOT redesign the whole app.
Do NOT create a long tutorial wizard.

### 5) Verification
Run at minimum:
```bash
pnpm --filter @event-radar/web build
pnpm build
```

### 6) Commit
Single commit:
```bash
git commit -m "feat(web): add watchlist-first onboarding flow"
```
