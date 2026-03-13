# TASK.md — Phase 2: Dashboard MVP Enhancement

## Overview

Upgrade the existing web app (`packages/web`) from a basic feed into a full-featured dashboard with real-time updates, search, watchlist, charts, and filtering. The ops dashboard (`packages/dashboard`) is already functional — this phase focuses on the **user-facing** app.

## Task A: WebSocket Real-Time Feed + Sound Alerts (Codex)

Add WebSocket support so the feed updates in real-time without manual refresh.

### Backend — WebSocket Server

1. **Add WebSocket upgrade** to the existing Fastify server in `packages/backend/src/app.ts`
   - Use `@fastify/websocket` plugin
   - Endpoint: `GET /ws/events` — streams new events as they enter the pipeline
   - Hook into `EventBus` — subscribe to `event:classified` (after classification, before delivery)
   - Each WS message: JSON `{ type: "event", data: <Event> }` or `{ type: "ping" }`
   - Server-side heartbeat ping every 30s to keep connections alive
   - Auth: accept `?apiKey=xxx` query param (use existing auth-middleware logic)
   - No backpressure needed for MVP — just broadcast to all connected clients
   - Track connected client count in `/health` response

2. **File**: `packages/backend/src/plugins/websocket.ts` (Fastify plugin)
3. **Tests**: At least 3 tests — connection, event broadcast, auth rejection

### Frontend — Real-Time Feed

4. **WebSocket hook**: Create `packages/web/src/hooks/useWebSocket.ts`
   - Connect to `ws://<host>/ws/events` on mount
   - Auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s)
   - Connection status indicator in the header (🟢 connected / 🟡 reconnecting / 🔴 disconnected)
   - Prepend new events to the existing alert list (don't replace — merge)
   - Show `PillBanner` with count of new events since last scroll-to-top

5. **Sound alerts**: Add `packages/web/src/hooks/useAlertSound.ts`
   - Play a short notification sound when a new HIGH/CRITICAL event arrives via WS
   - Use Web Audio API (no external audio files — generate a simple tone)
   - Configurable in Settings page: on/off toggle + volume slider
   - Store preference in localStorage
   - Respect browser autoplay policy (require user interaction first)
   - Quiet hours: disable sound between configurable hours (default 22:00-08:00 local time)

6. **Tests**: At least 5 tests total for WS hook + sound

### Registration

- Add `@fastify/websocket` to `packages/backend/package.json`
- Register WS plugin in `app.ts`

---

## Task B: Search + Watchlist + Filter Presets (CC)

Implement the Search, Watchlist, and saved filter presets features.

### Backend — Search Endpoint

1. **Full-text search**: Add `GET /api/events/search?q=<query>&limit=20`
   - Search across event `title`, `body`, and `tickers` columns
   - Use PostgreSQL `tsvector` / `to_tsquery` for full-text search
   - Add GIN index on a generated `search_vector` column
   - Support ticker prefix search: if query matches `^[A-Z]{1,5}$`, also filter by ticker
   - Return results sorted by relevance (ts_rank), with recency as tiebreaker
   - File: add to existing `packages/backend/src/routes/events.ts`

2. **Watchlist endpoints**: Add to `packages/backend/src/routes/`
   - `GET /api/watchlist` — list user's watchlist tickers
   - `POST /api/watchlist` — add ticker `{ ticker: "AAPL" }`
   - `DELETE /api/watchlist/:ticker` — remove ticker
   - `GET /api/events?watchlist=true` — filter events to only watchlist tickers
   - Storage: new `watchlist` table in `packages/backend/src/db/schema.ts`
     ```
     watchlist: { id, ticker (varchar 10), addedAt (timestamp), notes (text, nullable) }
     ```
   - For MVP, single-user (no user_id column needed — auth is API key based)
   - File: `packages/backend/src/routes/watchlist.ts`

3. **DB migration**: Add search_vector column + watchlist table
   - File: add to `packages/backend/src/db/schema.ts`
   - Drizzle migration or `db:push`

4. **Tests**: At least 8 tests — search relevance, ticker prefix, watchlist CRUD, watchlist filter

### Frontend — Search Page

5. **Search page** (`packages/web/src/pages/Search.tsx`):
   - Search input with debounced API calls (300ms)
   - Results displayed as `AlertCard` list
   - Ticker autocomplete: show matching tickers as pills below input
   - Click ticker pill → navigate to `/ticker/:symbol`
   - Recent searches stored in localStorage (last 10)
   - Empty state with popular tickers suggestion

### Frontend — Watchlist Page

6. **Watchlist page** (`packages/web/src/pages/Watchlist.tsx`):
   - List of watched tickers with latest event count (24h)
   - Add ticker via input + button
   - Remove ticker via swipe or ✕ button
   - Click ticker → navigate to `/ticker/:symbol`
   - Quick "Add to watchlist" button on `AlertCard` and `TickerProfile` pages
   - Data persisted via API (not just localStorage)

### Frontend — Filter Presets

7. **Filter bar** on Feed page:
   - Filter by: severity (multi-select), source (multi-select), ticker
   - Saved presets: "My Watchlist", "High Conviction" (HIGH+CRITICAL), "Full Firehose" (no filter)
   - Custom presets: save current filter as named preset
   - Presets stored in localStorage
   - Filter state reflected in URL query params (shareable links)
   - Add filter chips below the header showing active filters

8. **Tests**: At least 5 frontend tests

---

## Task C: TradingView Chart Panel (Codex)

Add a candlestick chart with event markers to the TickerProfile page.

### Implementation

1. **Chart component**: `packages/web/src/components/EventChart.tsx`
   - Use `lightweight-charts` package (TradingView's open-source library)
   - Display candlestick chart for the selected ticker
   - Price data source: use a free API — Yahoo Finance via `yfinance` proxy endpoint or Alpha Vantage
   - Add backend proxy: `GET /api/price/:ticker?range=1m` → returns OHLCV data
     - Use `yahoo-finance2` npm package for price data
     - Cache responses for 5 minutes (in-memory)
     - File: `packages/backend/src/routes/price.ts`

2. **Event markers**: Overlay event markers on the chart
   - Green triangle (▲) for bullish direction events
   - Red triangle (▼) for bearish direction events  
   - Gray circle (●) for neutral/unknown direction
   - Click marker → show tooltip with event title + severity
   - Click tooltip → navigate to `/event/:id`

3. **Integration**: Add `EventChart` to `TickerProfile` page
   - Show chart above the event list
   - Chart height: 300px, responsive width
   - Time range selector: 1W, 1M, 3M, 6M, 1Y
   - Dark theme matching the app's color scheme

4. **Dependencies**: Add `lightweight-charts` to `packages/web/package.json`, `yahoo-finance2` to `packages/backend/package.json`

5. **Tests**: At least 3 tests — price endpoint, chart render, marker positioning

---

## General Rules

- TypeScript strict mode, ESM with `.js` extensions in imports
- Follow existing patterns for consistency
- Run `pnpm test` — all tests must pass (currently 951 tests across 61 files)
- Run `pnpm lint` — no lint errors
- Create feature branch + PR. Do NOT push to main.
- Do NOT merge PRs.
- Use existing UI patterns from `packages/web` — same color scheme, component style, Tailwind classes
- Mobile-first responsive design (the web app is designed for phone-first viewing)
