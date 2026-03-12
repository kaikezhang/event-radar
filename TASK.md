# Current Task: E.2 — Frontend + Backend Integration Fix

## CRITICAL ISSUES TO FIX

### 1. Backend: Remove ALL auth requirements
File: `packages/backend/src/plugins/auth.ts`
- Make ALL routes public (skip auth for everything)
- Keep the plugin but make it a no-op — just set `request.apiKeyAuthenticated = false` for all requests
- Add CORS headers for ALL responses: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS`, `Access-Control-Allow-Headers: *`
- OPTIONS requests return 204 immediately with CORS headers

### 2. Backend: Fix WebSocket authentication
File: `packages/backend/src/plugins/websocket.ts`
- Remove the API key verification from WebSocket upgrade handler
- Accept ALL WebSocket connections (no auth check)
- Keep the rest of the WebSocket event broadcasting logic

### 3. Frontend: Use relative API paths (for reverse proxy)
Files to modify:
- `packages/frontend/src/app/dashboard/page.tsx`
- `packages/frontend/src/hooks/use-events-websocket.ts`
- `packages/frontend/src/components/event-detail-panel.tsx`
- `packages/frontend/src/app/dashboard/history/page.tsx`
- `packages/frontend/src/app/dashboard/panel/[type]/page.tsx`
- Any other file that references `localhost:3001` or `NEXT_PUBLIC_API_URL`

Changes:
- API_URL should default to `''` (empty string = relative path through reverse proxy)
- For REST: `fetch('/api/events')` instead of `fetch('http://localhost:3001/api/events')`
- For WebSocket: detect current page host and use `ws://{window.location.host}/ws/events`
- Remove ALL hardcoded `localhost:3001` references
- Remove API key headers from fetch calls (auth is removed)

### 4. Frontend: Fix sidebar navigation
The sidebar links (History, Events, Alerts, Settings) return 404. Fix the routes:
- `/dashboard/history` — should work (already exists)
- `/dashboard/events` — needs a page or redirect to dashboard
- `/dashboard/alerts` — needs a page or redirect to dashboard  
- `/dashboard/settings` — needs a page or redirect to dashboard
- If pages don't exist yet, create simple placeholder pages

### 5. Frontend: Remove auth-provider dependency
- The `AuthProvider` should not gate any content
- `useAuth()` hook should always return `{ isAuthenticated: true, apiKey: '' }`
- Remove any localStorage auth token logic

## Reverse Proxy Architecture
A `proxy.mjs` at project root serves everything on port 3080:
- `/api/*`, `/ws/*`, `/health`, `/metrics` → backend :3001
- Everything else → frontend :3000

Frontend should ONLY use relative paths. Never reference `localhost:3001` directly.

## Testing
1. `pnpm --filter @event-radar/backend build` — must pass
2. `pnpm --filter @event-radar/frontend build` — must pass
3. Start backend: `pnpm --filter @event-radar/backend dev` (port 3001)
4. Start frontend: `pnpm --filter @event-radar/frontend start` (port 3000)
5. Start proxy: `node proxy.mjs` (port 3080)
6. Open http://localhost:3080 — should redirect to /dashboard
7. Dashboard should show events, stats should be non-zero
8. WebSocket should connect (status should show "Connected")
9. Sidebar links should not 404
10. NO console errors related to CORS, auth, or 404

## Git
- Branch: `fix/frontend-backend-integration`
- Commit, push, create PR
- **DO NOT merge. DO NOT run gh pr merge.**
