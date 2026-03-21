# TASK: Fix Redis EventBus Review Issues (PR #174)

## Context
PR #174 (`feat/redis-streams-eventbus`) was reviewed by Codex. Three issues were found. You are on the `feat/redis-streams-eventbus` branch already. Fix all issues, commit, and push. **Do NOT merge. Do NOT create a new PR.**

## Issues to Fix

### 1. 🚨 PRODUCTION BLOCKER — Raw event read loop never starts
**File**: `packages/shared/src/redis-event-bus.ts`
**Problem**: `startReadLoop()` sets `this.running = true` globally. When `subscribeTopic()` is called before `subscribe()` (which happens in `packages/backend/src/app.ts` — websocket plugin subscribes to `event:classified` before the pipeline wires up), the `running` flag is already `true`. So `subscribe()` sees `this.running === true` and skips starting the raw event read loop. Result: raw events pile up in Redis but are never consumed.
**Fix**: Remove the single global `running` flag. Track running state per-stream (each `startReadLoop` should manage its own loop lifecycle independently). The `subscribe()` guard should only check if the *raw event* loop is already running, not a global flag.

### 2. ⚠️ Topic fanout semantics broken — consumer group = work queue
**File**: `packages/shared/src/redis-event-bus.ts`
**Problem**: All instances share `GROUP_NAME = 'pipeline-workers'` for topic streams. `XREADGROUP` with a shared group means each message goes to ONE consumer only (work queue semantics). But `InMemoryEventBus` broadcasts to ALL subscribers. The websocket plugin needs every backend instance to see `event:classified` events so all connected clients get updates.
**Fix**: For **topic streams**, use per-instance consumer group names (e.g. `topic-${process.pid}-${randomId}`) so every instance gets every message (fanout/broadcast). For the **raw event stream** (`event-radar:events`), keep the shared `pipeline-workers` group (work queue is correct there — only one worker should process each raw event).

### 3. ⚠️ Unsubscribe leaks — messages consumed after last handler removed
**File**: `packages/shared/src/redis-event-bus.ts`  
**Problem**: When the last handler is unsubscribed, the read loop keeps running. It reads and XACKs messages with no handlers to deliver to, silently losing events.
**Fix**: When the last handler for a stream is removed, stop that stream's read loop. Use per-stream `AbortController` or per-stream running flag. On stop, the loop should break out of its `while` loop and clean up.

## Requirements
- All existing tests must pass: `pnpm --filter @event-radar/shared test`
- Build must pass: `pnpm --filter @event-radar/shared build`
- Add tests for:
  - `subscribeTopic()` called before `subscribe()` — both loops must run
  - Unsubscribe last handler stops the loop
  - Multiple topic subscribers all receive the same message (fanout)
- Keep the public API surface identical (subscribe, subscribeTopic, publish, publishTopic, shutdown)
- Commit message: `fix: resolve Redis EventBus review issues (running flag, fanout, unsubscribe)`

## DO NOT
- Do not merge or create a new PR
- Do not modify files outside `packages/shared/`
- Do not change the InMemoryEventBus
