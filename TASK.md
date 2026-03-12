# Current Task: B.1 — Frontend ↔ Backend Connection

## Context
Backend is running on port 3001 with real data flowing in (221+ events from Breaking News + StockTwits). Frontend needs to connect to the live API.

## Goal
Make the Dashboard display real events from the running backend.

## Requirements

### 1. Environment Configuration
- Frontend needs `NEXT_PUBLIC_API_URL=http://localhost:3001` and `NEXT_PUBLIC_WS_URL=ws://localhost:3001`
- Create `.env.local` in `packages/frontend/` with these values
- Verify all API calls in frontend use these env vars (not hardcoded URLs)

### 2. API Integration Audit
- Check all `fetch()` calls in frontend components
- Ensure they use the correct API paths (`/api/events`, not `/api/v1/events`)
- Ensure API key is passed via `X-Api-Key` header or query param
- The API key is `er-dev-2026`

### 3. WebSocket Connection
- Verify WebSocket connects to `ws://localhost:3001/ws/events?apiKey=er-dev-2026`
- Test live event feed updates in real-time

### 4. Dashboard Smoke Test
- Start frontend dev server (`pnpm --filter @event-radar/frontend dev`)
- Visit http://localhost:3000/dashboard
- Verify: event list shows real events (not dummy data)
- Verify: severity badges display correctly
- Verify: source filters work
- Verify: WebSocket live updates work

### 5. Fix any rendering issues
- Missing fields, null handling, date formatting
- Empty states for sources with no events yet

## Verification
- Frontend builds: `pnpm --filter @event-radar/frontend build`
- Frontend dev server shows real events from backend
- Create branch `feat/frontend-connect`, commit, push, create PR
- **DO NOT merge. DO NOT run gh pr merge.**
