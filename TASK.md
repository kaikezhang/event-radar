# TASK.md — Production Polish: Remaining UX + Quality Issues

## ⚠️ DO NOT MERGE ANY PRs. Create PR and STOP.

## Overview
Fix remaining issues from CrowdTest + owner evaluation to get closer to production-ready.
These are smaller, high-impact improvements.

## 1. Production frontend build (not dev mode)
- The frontend is running in Vite dev mode with HMR scripts exposed
- Create a production serve setup:
  - File: `packages/web/package.json` — add a `serve` script: `"serve": "vite preview --port 4173"`
  - Or better: build first, then serve the dist folder
  - `vite preview` serves the production build on the specified port
- This removes HMR scripts, enables code splitting, minification

## 2. Fix event deduplication display
- Some events appear multiple times in the feed from different sources about the same topic
- File: `packages/web/src/pages/Feed/FeedList.tsx` or feed data layer
- Group events about the same ticker within a 2-hour window
- Show as: "NVDA · 3 related events" with expandable detail
- Or at minimum: add a visual indicator "Also reported by: SEC EDGAR, Breaking News"

## 3. Light mode support (or at least don't break)
- CrowdTest noted: some components assume dark theme
- File: `packages/web/src/index.css` or theme config
- At minimum: ensure the app doesn't look broken if someone has light mode OS preference
- Quick fix: force dark mode via `<html class="dark">` and CSS `color-scheme: dark`
- Or if time allows: implement a basic light theme toggle in Settings

## 4. Mobile back button on event detail
- File: `packages/web/src/pages/EventDetail/index.tsx`
- No back button on mobile event detail pages
- Add a "← Back" button at the top of event detail on mobile viewports
- Use `useNavigate(-1)` from react-router

## 5. Keyboard shortcut hints in UI
- File: `packages/web/src/components/BottomNav.tsx` or feed header
- Only 6 keyboard shortcuts, discoverable only via `?` key
- Add subtle hint text somewhere visible: "Press ? for keyboard shortcuts"
- Or show shortcut hints on hover for primary actions

## 6. Fix WebSocket reconnection — infinite retry
- File: `packages/web/src/hooks/useWebSocket.ts` or connection context
- Current: max 5 reconnect attempts before giving up
- For a trading app, WebSocket should retry indefinitely with exponential backoff
- Change max attempts to Infinity (or a very large number like 1000)
- Cap backoff at 30 seconds

## Testing
- `pnpm --filter @event-radar/web test` — all tests must pass
- `pnpm --filter @event-radar/web build` — must succeed (especially important for task 1)
- Test on mobile viewport (375px) for task 4

## PR
- Branch: `feat/production-polish`
- Title: `feat: production polish — mobile nav, WebSocket retry, keyboard hints, light mode guard`
- **DO NOT MERGE. Create PR and stop.**
