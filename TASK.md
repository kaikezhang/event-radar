# Current Task: E.1 — Frontend Cleanup (Remove Auth + Fix CSS + Polish)

## Problem
1. Dashboard requires API key login — unnecessary, this is a personal tool
2. CSS/styles broken in production build (Tailwind v4 + Next.js 15 compatibility)
3. WebSocket connection fails through Cloudflare tunnel
4. Overall UI needs polish

## Requirements

### 1. Remove API Key Authentication (CRITICAL)
- Remove the login/auth gate page entirely
- Dashboard should load directly without any auth prompt
- Remove `auth-provider.tsx` or make it a no-op
- Remove API key input from the landing page
- Hardcode API key `er-dev-2026` in the frontend API client (or read from env)
- All API calls should include `X-Api-Key: er-dev-2026` header automatically
- Landing page (`/`) should redirect straight to `/dashboard`
- Remove any auth-related localStorage/cookie logic

### 2. Fix Production CSS (CRITICAL)
- Tailwind v4 styles not rendering in production build (`next build` + `next start`)
- Check `postcss.config.mjs` — may need `@tailwindcss/postcss` plugin
- Check if `globals.css` imports are correct for Tailwind v4
- Verify dark mode class is applied to `<html>` (should default to dark)
- Test: `pnpm --filter @event-radar/frontend build && pnpm --filter @event-radar/frontend start` should show styled pages

### 3. Fix WebSocket for External Access
- WebSocket URL should be configurable and support wss:// for tunnel access
- When accessed via HTTPS (Cloudflare tunnel), auto-detect and use wss://
- Fallback: use polling if WebSocket fails to connect
- Add reconnection logic with exponential backoff

### 4. UI Polish
- Default to dark theme
- Make sure sidebar navigation works properly
- Event cards should show: severity badge (colored), title, source, timestamp, ticker
- Stats cards at top should show real numbers from API
- "Disconnected" status should show "Connected" when API is reachable

## Verification
- `pnpm --filter @event-radar/frontend build` succeeds
- `pnpm --filter @event-radar/frontend start` — visit http://localhost:3000
  - Should go directly to dashboard (no auth prompt)
  - Styles should render correctly (dark theme, cards, badges)
  - Stats should show real event counts
  - Event list should show events from API
- Create branch `feat/frontend-cleanup`, commit, push, create PR
- **DO NOT merge. DO NOT run gh pr merge.**
