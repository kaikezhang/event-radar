# TASK: Fix in-flight batch leak after unsubscribe in Redis EventBus

## Context
PR #174 was merged with a remaining issue: the unsubscribe path doesn't fully prevent in-flight message processing. This is a follow-up fix on branch `fix/redis-eventbus-unsubscribe-leak`.

## Problem

After `xreadgroup()` returns with messages, if all handlers were removed while `xreadgroup` was blocking:
1. The spread copy `[...handlers]` is empty, yet messages are still `XACK`ed → silently consumed with no delivery
2. For raw streams, the loop closes over the handler array reference, so an already-unsubscribed handler could still run for the final batch

## Required Fix

In `packages/shared/src/redis-event-bus.ts`:

1. After `xreadgroup()` returns and before processing messages, re-check whether handlers still exist for this stream. If no handlers remain, **do NOT process or XACK** the messages — break out of the loop immediately. The unprocessed messages remain pending in the consumer group for the next subscriber.

2. In `packages/shared/src/__tests__/redis-event-bus.test.ts`, add a test that:
   - Subscribes a handler
   - Unsubscribes it  
   - Publishes a message AFTER unsubscribe
   - Asserts the message is NOT acked/consumed (remains pending in stream)

## Requirements
- All tests pass: `pnpm --filter @event-radar/shared test`
- Build passes: `pnpm --filter @event-radar/shared build`
- Create a PR titled "fix: handle in-flight batch after unsubscribe in Redis EventBus"
- Commit message: `fix: handle in-flight batch after unsubscribe in Redis EventBus`

## DO NOT
- Do not merge the PR
- Do not modify files outside `packages/shared/`
