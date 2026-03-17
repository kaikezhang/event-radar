# TASK.md — WP1: Ticker Search & Autocomplete

> Reference: `docs/plans/2026-03-17-watchlist-ux-redesign.md` (Section 3.1 + WP1)

## Goal
Replace the raw text input on the Watchlist page with a universal search overlay that provides instant ticker autocomplete, company names, and one-tap watchlist add.

## What to Build

### Backend

#### 1. Ticker Reference Table + Migration

**File:** `packages/backend/src/db/schema.ts`

Add new table:
```typescript
export const tickerReference = pgTable('ticker_reference', {
  ticker: varchar('ticker', { length: 10 }).primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  sector: varchar('sector', { length: 100 }),
  industry: varchar('industry', { length: 100 }),
  exchange: varchar('exchange', { length: 20 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

**Migration:** Create a Drizzle migration for this table.

#### 2. Seed Script

**File:** `packages/backend/src/scripts/seed-tickers.ts`

- Fetch ticker data from SEC EDGAR company tickers JSON: `https://www.sec.gov/files/company_tickers.json`
- Parse and insert into `ticker_reference` table
- Only include US-listed equities (skip OTC, foreign, etc. if possible)
- Make it idempotent (upsert on ticker)
- Add a npm script in `packages/backend/package.json`: `"seed:tickers": "tsx src/scripts/seed-tickers.ts"`

#### 3. Search API Endpoint

**File:** `packages/backend/src/routes/tickers.ts`

```
GET /api/tickers/search?q=NVI&limit=8
```

- Search by ticker symbol (prefix match, case-insensitive) AND company name (contains, case-insensitive)
- Ticker prefix matches should rank higher than name matches
- Return: `{ data: [{ ticker, name, sector, exchange }] }`
- No auth required (public endpoint)
- Limit default 8, max 20

```
GET /api/tickers/trending?limit=8
```

- Return tickers with highest event count in last 24h from the `events` table
- Return: `{ data: [{ ticker, eventCount, name?, sector? }] }`
- Join with `ticker_reference` for name/sector if available
- No auth required

Register routes in the app.

#### 4. Watchlist Ticker Validation

Current `POST /api/watchlist` accepts any `^[A-Z]{1,5}$` string. Enhance:
- After regex validation, check if ticker exists in `ticker_reference`
- If not found, still allow it (user may know a valid ticker not in our DB) but return a `warning` field in response
- Change regex to `^[A-Z.]{1,10}$` to support tickers like `BRK.B`

### Frontend

#### 5. `<TickerSearch />` Component

**File:** `packages/web/src/components/TickerSearch.tsx`

A reusable search overlay component:

**Trigger:** Clicking the search input, pressing `/` or `⌘K` from anywhere.

**Empty state (no query):**
- "Recent" section: last 10 searched tickers from localStorage
- "Trending on Event Radar" section: from `/api/tickers/trending`

**With query:**
- Debounce at 150ms
- Call `/api/tickers/search?q=...`
- Display results as rows: `TICKER  Company Name  Sector · Exchange  [+ / ✓]`
- "+" button if not on watchlist → calls addToWatchlist → becomes "✓"
- "✓" shown if already on watchlist
- Arrow keys navigate results, Enter adds/opens, Escape closes

**Visual:**
- Full-screen overlay on mobile
- Centered modal/popover on desktop (like ⌘K palettes)
- Dark theme matching app (`bg-[#0a1628]` area)

#### 6. Integrate into Watchlist Page

**File:** `packages/web/src/pages/Watchlist.tsx`

- Replace the raw `<input>` + suggested tickers with `<TickerSearch />`
- Keep the onboarding flow for empty watchlist but use TickerSearch for the add action
- Show company name next to ticker in the watchlist items list (from ticker_reference data or inline in watchlist response)

#### 7. Watchlist API Enhancement

**File:** `packages/web/src/lib/api.ts`

Add API functions:
- `searchTickers(query: string, limit?: number)`
- `getTrendingTickers(limit?: number)`

**File:** `packages/web/src/hooks/useTickerSearch.ts`

Hook for the search component:
- Manages query state, debounce, API calls
- Manages recent searches in localStorage
- Exposes: `{ query, setQuery, results, isSearching, recentSearches, trending, clearRecent }`

#### 8. Global Keyboard Shortcut

Register `/` and `⌘K` (Ctrl+K on non-Mac) as global shortcuts that open the TickerSearch overlay from any page. Use a context provider or a top-level event listener.

### Testing

- Backend: unit tests for ticker search endpoint (prefix match, name match, ranking)
- Backend: unit test for trending endpoint
- Frontend: ensure existing watchlist tests still pass
- Verify the seed script runs successfully

## Do NOT Change
- Do NOT add sections/reordering yet (WP2)
- Do NOT add bulk operations (WP3)
- Do NOT modify the Search page (that's event search, separate from ticker search)
- Do NOT add import/export (WP5)

## PR
- Branch: `feat/wp1-ticker-search`
- Title: "feat: ticker search & autocomplete for watchlist (WP1)"
- CREATE PR AND STOP. DO NOT MERGE.
