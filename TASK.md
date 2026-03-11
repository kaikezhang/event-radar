# Current Task: Add uptime to health endpoint

## Goal
Add `uptimeSeconds` (number) to the `/api/v1/health` response. Calculate as seconds since server start.

## Requirements
1. In `packages/backend/src/app.ts`, capture `Date.now()` at startup, return `uptimeSeconds: Math.floor((Date.now() - startTime) / 1000)` in health response.
2. Add 1 test: GET /api/v1/health returns `uptimeSeconds` as a non-negative number.

## Verification
- `pnpm build && pnpm --filter @event-radar/backend lint` passes
- Test passes
- Branch `feat/health-uptime`, create PR to main
- **DO NOT merge. DO NOT run `gh pr merge`.**
