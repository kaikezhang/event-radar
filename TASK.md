# TASK.md — Dashboard Frontend

## Goal

Build a single-page admin dashboard for Event Radar that visualizes system status, pipeline health, and event audit trail. The dashboard connects to the existing backend APIs.

## Tech Stack

- **Framework**: React 19 + Vite
- **UI**: Tailwind CSS + shadcn/ui (dark mode only)
- **Charts**: Recharts (lightweight, React-native)
- **State**: React Query (TanStack Query) for API data fetching
- **Package**: `packages/dashboard/` in the existing monorepo
- **Build**: Vite, output to `packages/dashboard/dist/`
- **Serve**: Backend serves the built dashboard at `/` (static files from dist/)

## Backend APIs Available

All APIs are at `http://localhost:3001`. No auth needed for these endpoints.

### 1. `GET /api/v1/dashboard`
System overview — scanners, pipeline funnel, historical stats, delivery, alerts.

### 2. `GET /api/v1/audit?limit=50&outcome=filtered&source=breaking-news&ticker=TSLA&search=crash`
Per-event pipeline audit trail. Filterable by outcome, source, ticker, text search.

### 3. `GET /api/v1/audit/stats`
24h breakdown of pipeline outcomes by category.

### 4. `GET /api/scanners/status`
Detailed scanner health with timing and error info.

### 5. `GET /health`
Basic health check with all scanner details and DB status.

### 6. `GET /metrics`
Prometheus text format metrics (for reference, not displayed directly).

## Pages / Sections

### Page 1: Overview (default)

**Top Bar:**
- System status badge (healthy/degraded/down)
- Uptime
- Grace period indicator (if active)
- Memory usage
- Last event time

**Scanner Grid (2 columns):**
- Card per scanner showing: name, status (color dot), last scan time, error count
- Degraded/down scanners highlighted in orange/red
- Backoff indicator

**Pipeline Funnel (center, large):**
- Vertical funnel visualization:
  ```
  Ingested:     1,250  ████████████████████████████████
  Deduplicated:   980  ████████████████████████████
  Unique:         270  ████████
  Filter Passed:   75  ███
  Delivered:       75  ███
  ```
- Conversion rate at bottom

**Filter Breakdown (pie/donut chart):**
- Slices: stale, retrospective, keyword, social_noise, cooldown, llm_gatekeeper, etc.
- Shows where events are being blocked

**Delivery Status:**
- Per-channel: sent count, error count, status dot
- Historical enrichment hit rate

**Active Alerts:**
- List of system warnings (scanner down, backoff, etc.)

### Page 2: Audit Trail

**Filter Bar:**
- Dropdown: outcome (all / delivered / filtered / deduped / grace_period)
- Dropdown: source (all / breaking-news / stocktwits / whitehouse / etc.)
- Text input: search in title
- Text input: ticker filter

**Event Table:**
- Columns: Time, Source, Title, Severity, Ticker, Outcome, Stopped At, Reason
- Color-coded outcome badges:
  - delivered → green
  - filtered → red
  - deduped → gray
  - grace_period → yellow
  - error → red outline
- Click row → expand to show full details (delivery channels, historical match, confidence, duration)

**Auto-refresh** every 10 seconds with smooth update (no flicker).

### Page 3: Historical Intelligence

**Stats:**
- Total historical events count
- Enrichment hit rate
- Market context (VIX, SPY, regime)

**Recent Enriched Alerts:**
- List of recent delivered events that had historical matches
- Show confidence, match count, pattern summary

## Design Requirements

- **Dark mode only** — dark background (#0a0a0a), muted borders, high contrast text
- **Terminal/hacker aesthetic** — monospace numbers, subtle green accents for healthy, amber for warnings, red for errors
- **Responsive** — works on 1440p+ monitors, no mobile needed
- **Auto-refresh** — all data polls every 10s, no manual refresh needed
- **No auth** — internal admin tool, no login needed

## File Structure

```
packages/dashboard/
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  src/
    main.tsx
    App.tsx
    api/         — API client functions
    components/  — Reusable UI components
    pages/       — Overview, Audit, Historical
    hooks/       — useQuery hooks
    lib/         — Utilities
```

## Docker Integration

Add to `docker-compose.yml`:
- Build dashboard: `pnpm --filter dashboard build`
- Backend serves `packages/dashboard/dist/` as static files at `/`
- OR: separate nginx container serving the built files

## Key Constraints

- Do NOT install a full UI framework (Material, Ant, Chakra). Use shadcn/ui only.
- Do NOT use SSR. This is a pure SPA (Vite + React).
- Do NOT add authentication. This is an internal tool.
- DO use TypeScript strict mode.
- DO make API base URL configurable via env var (default: same origin).
- DO handle loading and error states gracefully.
- DO use React Query for all data fetching with 10s refetch interval.

## Exit Criteria

- Dashboard loads at `http://localhost:5173` (dev) or `http://localhost:3001/` (production)
- All 3 pages functional with real API data
- Pipeline funnel chart renders correctly
- Audit trail table with working filters
- Scanner status cards with color-coded health
- Auto-refresh every 10s without flicker
- All TypeScript, no errors, builds clean
