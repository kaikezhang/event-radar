# ⚠️ DO NOT MERGE THIS PR. CREATE PR AND STOP.

# TASK: Fix remaining unsubscribe issues in Redis EventBus (Round 3)

**⚠️ DO NOT MERGE. Only commit, push, and update the existing PR #175.**

## Context
Codex re-reviewed PR #175 and found 3 remaining issues. You are on branch `fix/redis-eventbus-unsubscribe-leak`. Fix all three, commit, push. The PR will update automatically.

## Issues to Fix

### 1. Stranded pending messages after unsubscribe
**Problem**: When the loop exits without acking, messages stay pending forever. The implementation only reads new messages (`XREADGROUP ... '>'`), never reclaims pending ones.
**Fix**: When a new subscriber registers via `subscribe()` or `subscribeTopic()`, if there are pending messages for this consumer, reclaim them first using `XAUTOCLAIM` or `XREADGROUP ... '0'` before switching to `'>'`. This ensures stranded messages from a previous subscriber are delivered to the next one.

### 2. Test not deterministic for in-flight race
**Problem**: The test unsubscribes then publishes, but if the read loop already exited, the test passes on both old and new code — it doesn't actually test the race.
**Fix**: Rewrite the test to:
- Make `xreadgroup` mock hold/block (e.g. return a pending Promise)
- Call `unsub()` while `xreadgroup` is blocked
- Then resolve `xreadgroup` with a batch of messages
- Assert: messages are NOT acked, handler is NOT called

### 3. Per-message handler check within a batch
**Problem**: `loopState.running` is only checked once per `xreadgroup()` result. If unsubscribe happens mid-batch, remaining messages in the batch are still processed and acked.
**Fix**: Inside the message iteration loop, before processing each message, check if handlers are still present. If handlers array is empty, stop processing and do NOT ack remaining messages in the batch.

## Requirements
- All tests pass: `pnpm --filter @event-radar/shared test`
- Build passes: `pnpm --filter @event-radar/shared build`
- Commit message: `fix: address round 3 review — pending reclaim, deterministic test, per-message check`

## ⚠️ DO NOT MERGE. DO NOT CREATE A NEW PR. Just commit and push to this branch.
