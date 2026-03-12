# Dashboard Frontend Review

Date: 2026-03-12

Scope:
- Read all files in `packages/dashboard/src/`
- Compared against `TASK.md`
- Checked live backend responses from:
  - `GET http://localhost:3001/api/v1/dashboard`
  - `GET http://localhost:3001/api/v1/audit`
  - `GET http://localhost:3001/api/v1/audit/stats`
  - `GET http://localhost:3001/api/scanners/status`
  - `GET http://localhost:3001/health`

## Fixed HIGH Findings

### HIGH: Overview scanner health was using the lossy dashboard summary instead of the richer `/health` payload
- Root cause:
  - `packages/dashboard/src/pages/Overview.tsx` previously rendered `scanners.details` and `alerts` directly from `/api/v1/dashboard`.
  - The backend dashboard route applies a 5-minute stale override, which marked slow-polling scanners as down even when `/health` still reported them healthy with a 15m/30m cadence.
- Evidence:
  - On 2026-03-12, `/api/v1/dashboard` returned `whitehouse: down` with `last_scan: "11m ago"`.
  - At the same time, `/health` returned `whitehouse: healthy` with `currentIntervalMs: 900000`.
- Fix:
  - Overview now merges `/api/v1/dashboard` with `/health` via `buildScannerCards()` and rebuilds alerts from the displayed scanner state.
  - Scanner cards now show expected cadence to reduce false alarm interpretation.
- Code:
  - `packages/dashboard/src/pages/Overview.tsx:20-37`
  - `packages/dashboard/src/pages/Overview.tsx:67-123`
  - `packages/dashboard/src/lib/dashboard.ts:10-70`
  - `packages/dashboard/src/components/ScannerCard.tsx:21-64`

### HIGH: Audit contract handling was wrong for both `severity` and `delivery_channels`
- Root cause:
  - The frontend typed `delivery_channels` as `string[] | null`, but the backend returns JSON objects `{ channel, ok }[]`.
  - Severity styling assumed lowercase keys, while the live API returns uppercase values like `MEDIUM`, `HIGH`, and `CRITICAL`.
- Risk:
  - Delivered rows would render `[object Object]` in expanded details.
  - Severity colors silently failed for the actual backend payload.
- Fix:
  - Added explicit `AuditDeliveryChannel` typing.
  - Normalized severity before styling.
  - Formatted delivery channel objects into readable text.
- Code:
  - `packages/dashboard/src/types/api.ts:81-104`
  - `packages/dashboard/src/pages/AuditTrail.tsx:127-189`
  - `packages/dashboard/src/lib/dashboard.ts:72-84`

### HIGH: Source filtering was incomplete because the filter options were hardcoded
- Root cause:
  - The source dropdown only exposed a fixed shortlist, so valid sources such as `congress`, `analyst`, `earnings`, `doj-antitrust`, and others were not discoverable from the UI.
- Fix:
  - The source filter now builds options from known scanner names plus the currently loaded audit events.
- Code:
  - `packages/dashboard/src/pages/AuditTrail.tsx:20-45`
  - `packages/dashboard/src/lib/dashboard.ts:86-105`

### HIGH: Delivery empty state was factually wrong
- Root cause:
  - The UI said `No delivery channels configured` whenever `/api/v1/dashboard` returned `delivery: {}`.
  - Backend code builds `delivery` only from delivery-attempt metrics, so configured-but-unused channels do not appear there.
- Fix:
  - Reworded the state to `No delivery activity recorded yet` with a note explaining when channels appear.
- Code:
  - `packages/dashboard/src/pages/Overview.tsx:115-123`

## Remaining MEDIUM Findings

### MEDIUM: Backend is still not serving the built dashboard at `/`
- TASK.md exit criteria says the dashboard should load at `http://localhost:3001/` in production.
- On 2026-03-12, visiting `http://localhost:3001/` returned `{"message":"Route GET:/ not found","error":"Not Found","statusCode":404}`.
- This is outside `packages/dashboard/src/`, so it was not fixed in this review.

### MEDIUM: Historical page still misses spec items for enriched alerts
- TASK.md asks for recent enriched alerts to show confidence, match count, and pattern summary.
- The current page only shows title, source, ticker, time, confidence, and `reason`.
- Code:
  - `packages/dashboard/src/pages/Historical.tsx:56-99`

### MEDIUM: Background refetch failures are effectively silent
- All pages only show an error panel when there is no cached data. Once the first fetch succeeds, later polling failures leave stale data on screen with no visible warning.
- Code:
  - `packages/dashboard/src/pages/Overview.tsx:24-26`
  - `packages/dashboard/src/pages/AuditTrail.tsx:73-78`
  - `packages/dashboard/src/pages/Historical.tsx:19-21`

## Remaining LOW Findings

### LOW: The app forces a full SPA rerender every 10 seconds for the header pulse
- The `tick` state exists only to remount the pulse dot, but it rerenders the entire app tree on every interval.
- Code:
  - `packages/dashboard/src/App.tsx:16-24`
  - `packages/dashboard/src/App.tsx:54-58`

### LOW: Available query hooks are still unused
- `useAuditStats()` and `useScannersStatus()` exist but no page consumes them.
- This is not breaking, but it means part of the available backend surface is still dead weight in the frontend package.
- Code:
  - `packages/dashboard/src/hooks/queries.ts:25-36`

### LOW: Bundle size is acceptable but still front-loaded
- Current production build after the fixes:
  - `dist/assets/index-*.js`: about 234 kB raw
  - `dist/assets/charts-*.js`: about 374 kB raw
- `recharts` is split, but pages are still statically imported from `App.tsx`, so there is no route-level code splitting yet.
- Code:
  - `packages/dashboard/src/App.tsx:1-69`
  - `packages/dashboard/vite.config.ts:15-24`

## Contract Check Summary

`packages/dashboard/src/types/api.ts` is now aligned with the live backend on the reviewed points:
- `/api/v1/dashboard` shape matches the top-level `DashboardResponse`
- `/api/v1/audit` now correctly models `severity` as uppercase-compatible and `delivery_channels` as object payloads
- `/health` remains the best source for scanner cadence and non-lossy health detail

## Verification Run

- `pnpm --filter @event-radar/dashboard exec vitest run --config vitest.config.ts src/lib/dashboard.test.ts`
  - Passed: 11 tests
- `pnpm --filter @event-radar/dashboard build`
  - Passed
