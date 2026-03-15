# Current Task — Phase 4 Launch Flow: Event Detail / Alert Consumption Polish

Branch: `feat/phase4-event-detail-polish`

## Goal
Improve the event-detail experience so that when a user lands from an alert or push, the page immediately answers:
- what happened
- why it matters now
- why I was notified
- why this is trustworthy

## Scope

### 1) Event detail information hierarchy polish
Refine the current event detail page so the key layers are easier to consume:
- catalyst / event summary
- market context
- historical analog / pattern context
- trust / scorecard context

### 2) Alert-consumption UX
Assume the user may arrive from a push notification.
The page should quickly orient them.

Good targets:
- better section order
- clearer labels
- visible “why this matters now” area
- visible trust block / scorecard interpretation

### 3) Notification landing friendliness
If there is a lightweight way to improve the deep-linked landing experience (e.g. anchor/section prominence, better headings, fewer ambiguous blocks), do it.
Do not redesign routing.

### 4) Keep scope narrow
- no giant visual redesign
- no backend changes unless absolutely tiny and necessary
- no second dashboard page

### 5) Verification
Run at minimum:
```bash
pnpm --filter @event-radar/web build
pnpm build
```

### 6) Commit
Single commit:
```bash
git commit -m "feat(web): polish event detail alert-consumption flow"
```
