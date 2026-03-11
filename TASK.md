# Current Task: Add Health Check Timestamp

## Goal
Add a `startedAt` timestamp to the existing `/api/v1/health` endpoint response.

## Requirements

1. In `packages/backend/src/app.ts`, find the health check route and add `startedAt: new Date().toISOString()` to the response (capture the time at server startup, not per-request).

2. Add 1 test in `packages/backend/src/__tests__/health.test.ts`:
   - GET /api/v1/health returns 200 with `startedAt` as valid ISO string

## Verification
- `pnpm build && pnpm --filter @event-radar/backend lint` must pass
- Test passes
- Create branch `feat/health-timestamp`, commit, push, create PR
- **DO NOT merge the PR. DO NOT run gh pr merge.**
