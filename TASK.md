# ⚠️ DO NOT MERGE THIS PR. CREATE COMMITS AND PUSH ONLY.

# TASK: Fix PR #190 Round 2 Review Issues

## Context
PR #190 (feat/sprint-8-notification-channels) was re-reviewed by Codex. Issues 2 and 5 are resolved. Issues 1, 3, 4, 6 still need fixes. You are on branch `feat/sprint-8-notification-channels`. Fix all remaining issues, commit, and push.

## Remaining Issues

### 1. Auth security — API key path rejects valid callers (BLOCKING)
**Problem**: In `AUTH_REQUIRED=false` mode, valid API-key requests get `userId = 'default'`, then `requireAuth` middleware rejects `default` unconditionally. So both anonymous AND valid API-key callers are rejected.
**Fix**: The notification-settings routes should accept requests with a valid API key OR a real authenticated user. Update `requireAuth` or create a new middleware that:
- Allows requests with valid API key (even if userId is 'default')
- Allows requests with real authenticated userId (not 'default')
- Rejects truly unauthenticated requests (no API key, no auth token)

### 3. Retry/backoff — missing failure logging detail
**Problem**: Failed deliveries only increment `errors++` counter. 4xx/5xx/429 failures don't log status code, response body, or user context.
**Fix**: Add structured logging for webhook delivery failures including: HTTP status, response body (truncated), userId, webhookUrl (masked), eventId. Use the project's existing logger pattern.

### 4. Delivery accounting — user webhook outside main accounting path
**Problem**: User webhook delivery doesn't contribute to `okCount`/`failCount`, `channels`, or `auditLog.record()`. Downstream audit consumers can't see this channel.
**Fix**: Integrate user webhook delivery into the same delivery accounting path as bark/discord/telegram. It should:
- Contribute to `routeResult.deliveries` 
- Appear in `channels` array
- Be recorded in audit log via `auditLog.record()`

### 6. Test coverage gaps
**Fix**: Add tests for:
- Route auth: anonymous requests rejected, API-key requests allowed
- Invalid webhook payload validation
- 429/Retry-After handling in webhook delivery
- Pipeline integration: user_discord_webhook channel in delivery accounting

### Also fix existing test failures
14 tests are currently failing:
- `delivery.test.ts` (3 failures)
- `breaking-news-scanner.test.ts` (3 failures) 
- `congress-scanner.test.ts` (4 failures)
- `analyst-scanner.test.ts` (4 failures)

These may be caused by schema/type changes in this PR. Fix them.

## Requirements
- `pnpm --filter @event-radar/backend build` must pass
- `pnpm --filter @event-radar/backend test` must pass (ALL tests green)
- Commit message: `fix: resolve remaining PR #190 review issues (auth, logging, accounting, tests)`

## ⚠️ DO NOT MERGE. Push commits to the branch only.
