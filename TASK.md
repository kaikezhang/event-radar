# Current Task: Add version to health endpoint

## Goal
Add `version` field to `/api/v1/health` response, read from package.json.

## Requirements
1. In `packages/backend/src/app.ts`, read version from `../../package.json` and add `version` to health response.
2. Add 1 test: GET /api/v1/health returns `version` as a string matching semver pattern.

## Verification
- `pnpm build && pnpm --filter @event-radar/backend lint` passes
- Test passes
- Branch `feat/health-version`, create PR to main
- **DO NOT merge the PR. DO NOT run gh pr merge.**
