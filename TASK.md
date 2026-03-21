# ⚠️ DO NOT MERGE THIS PR. CREATE COMMITS AND PUSH ONLY.

# TASK: Fix PR #190 Review Issues — Discord Webhook Notification Channel

You are on branch `feat/sprint-8-notification-channels`. Fix all 5 issues from Codex's review, add tests, commit, and push. **DO NOT MERGE.**

## Issue 1: 🚨 SECURITY — Public webhook endpoints (BLOCKING)
**Files**: `packages/backend/src/routes/notification-settings.ts`
**Problem**: `requireApiKey` allows anonymous access when `AUTH_REQUIRED` is unset/false (default). The notification-settings GET/PUT and `/test-discord` endpoints are publicly readable/writable — anyone can read the Discord webhook URL and trigger outbound posts.
**Fix**: Add proper authentication check. When `AUTH_REQUIRED` is false and `request.userId === 'default'`, these endpoints should still require a valid API key or return 401. Consider adding a dedicated `requireAuth` middleware that rejects the `default` anonymous user for sensitive routes.

## Issue 2: Schema mismatch — user_id type and FK
**Files**: `packages/backend/drizzle/0006_add-user-notification-settings.sql`, `packages/backend/src/db/schema.ts`
**Problem**: `user_notification_settings.user_id` is `varchar(255)` with no foreign key. Other user tables use `varchar(100)` + FK to `users.id`.
**Fix**: Change to `varchar(100)` and add a foreign key reference to `users(id)`. Follow the pattern used by `user_preferences`, `watchlist`, `push_subscriptions`.

## Issue 3: No retry/backoff for webhook delivery
**Files**: `packages/backend/src/services/user-webhook-delivery.ts`
**Problem**: Every network/Discord error is treated as permanent failure. No timeout, no retry, no 429/Retry-After handling. Transient failures silently drop alerts.
**Fix**: Add retry with exponential backoff (max 3 retries). Handle Discord 429 responses by respecting `Retry-After` header. Add a delivery timeout (10s). Log failures with enough detail for debugging.

## Issue 4: Delivery accounting gap
**Files**: `packages/backend/src/event-pipeline.ts`
**Problem**: User webhook send uses `void ...catch(...)` fire-and-forget, outside delivery metrics. Failures are invisible and sends can be lost on shutdown.
**Fix**: Integrate webhook delivery into the same delivery accounting path as other channels. Track success/failure in delivery metrics. Await the webhook send (with timeout) instead of fire-and-forget.

## Issue 5: 🚨 UX data loss — Settings page swallows load errors
**Files**: `packages/web/src/pages/Settings.tsx`
**Problem**: Load failure for channel settings is silently treated as "not yet created". Clicking Save then POSTs null values, wiping existing webhook URL.
**Fix**: Show a visible error state when load fails. Disable the Save button until initial state is successfully loaded. Add a retry button for load failures.

## Issue 6: Missing tests
**Problem**: No test files added for the new routes/services.
**Fix**: Add tests in `packages/backend/src/__tests__/` for:
- Notification settings route auth behavior (reject anonymous, allow authenticated)
- Webhook URL validation
- Delivery retry/failure handling
- Pipeline integration (webhook delivery in accounting path)

## Requirements
- All existing tests must pass
- Build must pass: `pnpm --filter @event-radar/backend build && pnpm --filter @event-radar/web build`
- Commit message: `fix: address PR #190 review — auth, schema, retry, delivery accounting, UX`

## ⚠️ REMINDER: DO NOT MERGE. PUSH ONLY.
