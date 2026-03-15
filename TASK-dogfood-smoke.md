# Current Task — Phase 4 Launch Readiness: Watchlist/Push Smoke-Test Loop

Branch: `feat/phase4-dogfood-smoke-fixes`

## Goal
Run a product-minded smoke-test pass over the newly built watchlist-first + push-enabled flow, then fix the most obvious friction points found.

This task is NOT a broad redesign.
It is a targeted launch-readiness pass.

## The user flow to validate
Use the current app/product surfaces and validate this path conceptually/in code:
1. user opens web app
2. user sees watchlist-first onboarding
3. user adds first ticker
4. user sees push CTA / settings path
5. user can understand how to enable push
6. user lands from a notification into event detail
7. event detail is understandable and trustworthy

## Scope

### 1) Audit the main flow in packages/web
Review the current implementation for:
- watchlist onboarding
- settings push UX
- event detail landing flow
- navigation between them

Identify the most obvious product friction points and fix only the top issues.

### 2) Fixes allowed in this task
Good examples:
- broken / awkward navigation between watchlist and settings
- confusing CTA wording
- missing empty-state links
- inconsistent labels between watchlist, settings, and event detail
- obvious polish issues in the first-run flow
- small route/deep-link issues
- lightweight UX paper-cuts

### 3) Keep scope narrow
Do NOT redesign the app.
Do NOT add major new backend features.
Do NOT create a giant QA checklist page.

### 4) Add a smoke-test note
Create or update a small markdown note under `docs/plans/` or `docs/` summarizing:
- the flow reviewed
- what friction points were fixed
- what is still deferred

Keep it concise and practical.

### 5) Verification
Run at minimum:
```bash
pnpm --filter @event-radar/web build
pnpm build
```

### 6) Commit
Single commit:
```bash
git commit -m "feat(web): polish watchlist-to-push smoke-test flow"
```
