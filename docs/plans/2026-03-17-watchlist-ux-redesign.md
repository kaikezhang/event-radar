# Watchlist & Ticker Search UX Redesign

**Date:** 2026-03-17
**Author:** Product Design Research
**Status:** Proposal — ready for engineering review

---

## 1. Current State Audit

### What Exists

| Layer | File | Functionality |
|-------|------|--------------|
| DB Schema | `packages/backend/src/db/schema.ts` (L450-468) | `watchlist` table: id, userId, ticker (VARCHAR 10), addedAt, notes. Unique constraint on (user, ticker). |
| API | `packages/backend/src/routes/watchlist.ts` | GET list, POST add (regex `^[A-Z]{1,5}$`), DELETE by ticker. Auth via API key. |
| API (events) | `packages/backend/src/routes/events.ts` (L211-227) | `?watchlist=true` filter on event feed. |
| Frontend Page | `packages/web/src/pages/Watchlist.tsx` | Add-ticker input, quick-add buttons (AAPL/NVDA/TSLA), list with event count + latest event + remove button. First-time onboarding flow. |
| Hook | `packages/web/src/hooks/useWatchlist.ts` | `useWatchlist()` — CRUD mutations + `isOnWatchlist()` helper. `useWatchlistSummary()` — 24h event count, latest event, highest signal. |
| Search Page | `packages/web/src/pages/Search.tsx` | Text search with 300ms debounce, popular tickers, recent searches in localStorage. **Not connected to watchlist add flow.** |
| Settings | `packages/web/src/pages/Settings.tsx` | `pushNonWatchlist` toggle, daily cap, quiet hours. |

### Pain Points (ranked by user impact)

1. **No ticker autocomplete or validation.** Users must know the exact symbol. Invalid tickers fail silently.
2. **Search ↔ Watchlist disconnect.** Discovery (Search page) and management (Watchlist page) are completely separate flows.
3. **No bulk operations.** Adding 10 tickers = 10 individual submissions.
4. **Flat, unsortable list.** No reordering, grouping, sections, or tags.
5. **Notes are write-once.** Set at add time, never editable after.
6. **No company name or context.** Ticker-only display — users see "NVDA" but not "NVIDIA Corporation | Semiconductors."
7. **No keyboard shortcuts.** Desktop users have no power-user path.
8. **No mobile gestures.** No swipe-to-remove or long-press-to-select.
9. **409 duplicate error not surfaced.** Adding an existing ticker shows no feedback.
10. **No import/export.** No way to bulk-load or back up a watchlist.

---

## 2. Industry Best Practices

### Competitive Landscape Summary

| Feature | Robinhood | TradingView | Webull | thinkorswim | Bloomberg | Yahoo Finance | Finviz |
|---------|-----------|-------------|--------|-------------|-----------|---------------|--------|
| Instant autocomplete | Yes | Yes (fuzzy) | Yes | Inline cell | Command-line | Yes | N/A (screener) |
| Search by company name | Yes | Yes | Yes | No | Yes | Yes | No |
| One-tap add | Yes | Yes | Yes | Type + Enter | Type + GO | Yes | N/A |
| Multiple watchlists | Yes | Yes | Yes | Yes | Yes | Yes (+ Portfolios) | Saved presets |
| Sections / tags | No | **Yes** (color flags, named sections) | No | No | No | No | No |
| Drag-to-reorder | No | **Yes** | No | No | No | Yes | No |
| Keyboard shortcuts | "/" to search | Full suite (arrows, Space, Alt+Z) | No | Customizable | Mnemonic codes | No | No |
| Swipe gestures (mobile) | Limited | No (web-first) | Yes | No | N/A | No | N/A |
| Smart / dynamic lists | No | No | No | **Scan → watchlist** | Screening | No | **Criteria-based** |
| CSV import/export | No | No | No | Yes | Yes | **Yes** | No |
| Linked context panels | **Yes** (Legend) | Yes (chart follows selection) | No | Yes | Yes | No | No |

### Key Patterns to Adopt

1. **TradingView sections + color flags** — lightweight, flexible grouping within a single list.
2. **Bloomberg progressive search** — instant autocomplete for known tickers → expand to full search for discovery.
3. **Robinhood Legend linked context** — selecting a ticker in watchlist updates event feed, timeline, and details panels.
4. **thinkorswim/Finviz smart lists** — criteria-based dynamic watchlists (maps to our scanner architecture).
5. **Yahoo Finance recent quotes** — automatic "recently viewed" list as a discovery breadcrumb.

---

## 3. Proposed Improvements

### 3.1 Unified Search Experience

**Current:** Separate Search page and Watchlist add input.
**Proposed:** A single, universal search component usable everywhere.

#### Wireframe: Search Overlay

```
┌─────────────────────────────────────────┐
│ 🔍  Search tickers...            ⌘K / / │  ← Trigger: click, ⌘K, or "/"
├─────────────────────────────────────────┤
│                                         │
│  RECENT                      [Clear]    │
│  ┌──────┐ ┌──────┐ ┌──────┐            │
│  │ NVDA │ │ AAPL │ │ TSLA │            │
│  └──────┘ └──────┘ └──────┘            │
│                                         │
│  TRENDING ON EVENT RADAR                │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│  │ SMCI │ │ PLTR │ │ MSTR │ │ ARM  │   │
│  └──────┘ └──────┘ └──────┘ └──────┘   │
│                                         │
└─────────────────────────────────────────┘
```

#### Wireframe: Active Search with Results

```
┌─────────────────────────────────────────┐
│ 🔍  NVI|                         ⌘K / / │
├─────────────────────────────────────────┤
│                                         │
│  NVDA    NVIDIA Corporation       [+ ✓] │  ← Already on watchlist (checkmark)
│          Semiconductors · NASDAQ        │
│                                         │
│  NVDI    NVIDIA Int'l ADR         [+ ]  │  ← Not on watchlist (add button)
│          ADR · OTC                      │
│                                         │
│  NVR     NVR Inc                  [+ ]  │
│          Homebuilding · NYSE            │
│                                         │
│  ──── See all results for "NVI" ────    │
│                                         │
└─────────────────────────────────────────┘
```

**Specs:**
- **Trigger:** Click search box, press `/` or `⌘K` from anywhere.
- **Empty state:** Recent searches (localStorage, max 10) + trending tickers (pulled from backend — tickers with highest event volume in 24h).
- **Typing:** Debounce at 150ms. Search by ticker symbol AND company name. Fuzzy match (e.g., "NVID" → NVIDIA).
- **Results:** Show ticker, company name, sector, exchange. Max 8 results. Inline watchlist status (checkmark if already added, "+" button if not).
- **One-tap add:** Click "+" to add directly from search results. No page navigation needed.
- **Keyboard:** Arrow keys to navigate results, Enter to add/open, Esc to close.

**Backend requirement:** New endpoint `GET /api/tickers/search?q=NVI` returning ticker, name, sector, exchange. Source: a static ticker reference table (see Work Package 1).

---

### 3.2 Watchlist Page Redesign

#### Wireframe: Redesigned Watchlist

```
┌─────────────────────────────────────────────────────────┐
│  My Watchlist                    [Edit] [Import] [🔍]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ▼ 🔴 High Conviction  (4)                    [+ Add]  │  ← Collapsible section
│  ┌─────────────────────────────────────────────────┐    │
│  │ ≡  NVDA   NVIDIA Corp      3 events │ 2h ago   │    │  ← Drag handle "≡"
│  │     📝 Earnings play                            │    │  ← Editable note
│  ├─────────────────────────────────────────────────┤    │
│  │ ≡  AAPL   Apple Inc        1 event  │ 5h ago   │    │
│  ├─────────────────────────────────────────────────┤    │
│  │ ≡  TSLA   Tesla Inc        5 events │ 30m ago  │    │
│  │     🔴 SEC Filing: 10-K                         │    │  ← Latest high-severity event
│  ├─────────────────────────────────────────────────┤    │
│  │ ≡  SMCI   Super Micro      2 events │ 1d ago   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ▶ 🟡 Watching  (6)                           [+ Add]  │  ← Collapsed section
│                                                         │
│  ▶ 🟢 Paper Trades  (3)                       [+ Add]  │
│                                                         │
│  ─── + New Section ───                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Wireframe: Edit Mode

```
┌─────────────────────────────────────────────────────────┐
│  My Watchlist                          [Done]           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ▼ 🔴 High Conviction  (4)           [Rename] [Delete] │
│  ┌─────────────────────────────────────────────────┐    │
│  │ [☑] ≡  NVDA   NVIDIA Corp                      │    │  ← Checkbox for bulk ops
│  │ [☐] ≡  AAPL   Apple Inc                        │    │
│  │ [☑] ≡  TSLA   Tesla Inc                        │    │
│  │ [☐] ≡  SMCI   Super Micro                      │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ── Selected: 2 ──  [Move to...] [Remove] [Flag 🔴🟡🟢] │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Specs:**
- **Sections:** Named, colored, collapsible groups. Default section: "Watchlist" (for migration). Users can create/rename/delete sections.
- **Drag-to-reorder:** Explicit grip handle (≡). Works within and across sections. Animated drop.
- **Inline notes:** Click to edit notes on any ticker. Auto-save on blur.
- **Edit mode:** Toggle reveals checkboxes. Bulk remove, bulk move-to-section, bulk flag.
- **Context row:** Each ticker shows company name, 24h event count, latest event severity, time-ago.
- **Click-through:** Clicking a ticker navigates to ticker detail/event feed filtered to that ticker.

**Mobile-specific:**
- Swipe left to reveal [Alert] [Move] [Remove] action buttons.
- Long-press to enter multi-select mode (no edit button needed).
- Sections collapse to save vertical space; tapping section header expands.

---

### 3.3 Quick-Add Improvements

**Current:** Text input + 3 hardcoded suggested tickers.
**Proposed:** Replace with the unified search component (3.1) embedded in watchlist page header.

Additionally, add contextual quick-add surfaces:

- **Event feed:** Each event card gets a "+" button next to its ticker if not already on watchlist.
- **Ticker profile page:** "Add to watchlist" / "On watchlist ✓" toggle in the header.
- **Search results page:** Inline "+" buttons (already covered in 3.1).

---

### 3.4 Smart Watchlists (Future Phase)

Inspired by thinkorswim's scan-to-watchlist and Finviz's criteria-based presets.

```
┌─────────────────────────────────────────┐
│  Smart Lists                            │
├─────────────────────────────────────────┤
│                                         │
│  📊  SEC Filings Today        (12)      │  ← Auto-populated by scanner
│  🔥  High Event Volume        (8)       │  ← Tickers with >5 events in 24h
│  ⚡  Recent Insider Activity   (5)       │  ← Based on event type filter
│                                         │
│  + Create Smart List...                 │
│  ┌─────────────────────────────────┐    │
│  │  Name: [                      ] │    │
│  │  Rule: Event type = [Insider ▼] │    │
│  │        AND Severity >= [High ▼] │    │
│  │        AND Time < [24h       ▼] │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

**Note:** This is a future-phase feature. It requires backend work to expose scanner results as queryable criteria. Flagging here for architectural consideration during the sections/DB migration.

---

### 3.5 Keyboard Shortcuts (Desktop)

| Shortcut | Action |
|----------|--------|
| `/` or `⌘K` | Open search overlay |
| `↑` / `↓` | Navigate watchlist items |
| `Enter` | Open selected ticker's event feed |
| `Delete` / `Backspace` | Remove selected ticker (with confirmation) |
| `Escape` | Close overlay / exit edit mode |
| `e` | Toggle edit mode |
| `n` | Focus notes field for selected ticker |

Display a "Keyboard shortcuts" help overlay accessible via `?`.

---

### 3.6 Import / Export

- **Export:** Download watchlist as CSV (`ticker, section, notes, addedAt`).
- **Import:** Upload CSV with at minimum a `ticker` column. Parse, validate against ticker reference, show preview with errors highlighted, then bulk-add.
- **Endpoint:** `POST /api/watchlist/bulk` accepting `{ tickers: [{ticker, section?, notes?}] }`.

---

## 4. Data Model Changes

### New: `ticker_reference` table

```sql
CREATE TABLE ticker_reference (
  ticker       VARCHAR(10) PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,     -- "NVIDIA Corporation"
  sector       VARCHAR(100),              -- "Technology"
  industry     VARCHAR(100),              -- "Semiconductors"
  exchange     VARCHAR(20),               -- "NASDAQ"
  updated_at   TIMESTAMP WITH TIME ZONE
);
-- Populate via a periodic sync job (e.g., daily from SEC EDGAR or a free ticker list).
-- Index: GIN trigram index on (ticker || ' ' || name) for fuzzy search.
```

### Modified: `watchlist` table

```sql
ALTER TABLE watchlist
  ADD COLUMN section_id  UUID REFERENCES watchlist_sections(id),
  ADD COLUMN sort_order  INTEGER DEFAULT 0,
  ADD COLUMN flags       VARCHAR(20)[];  -- e.g., ['red', 'star']
```

### New: `watchlist_sections` table

```sql
CREATE TABLE watchlist_sections (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    VARCHAR(100) NOT NULL REFERENCES users(id),
  name       VARCHAR(100) NOT NULL,
  color      VARCHAR(20) DEFAULT 'gray',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_ws_user_name ON watchlist_sections(user_id, name);
```

---

## 5. API Changes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/tickers/search?q=NVI` | Fuzzy ticker search. Returns ticker, name, sector, exchange. |
| GET | `/api/tickers/trending` | Top tickers by event volume in last 24h. |
| POST | `/api/watchlist/bulk` | Bulk add tickers `{tickers: [{ticker, section?, notes?}]}`. |
| PATCH | `/api/watchlist/:ticker` | Update notes, section, flags, sort_order. |
| GET | `/api/watchlist/sections` | List user's sections. |
| POST | `/api/watchlist/sections` | Create section `{name, color}`. |
| PATCH | `/api/watchlist/sections/:id` | Rename/recolor section. |
| DELETE | `/api/watchlist/sections/:id` | Delete section (tickers move to default). |
| PATCH | `/api/watchlist/reorder` | Bulk update sort_order `{items: [{ticker, sort_order, section_id}]}`. |
| GET | `/api/watchlist/export` | CSV download. |
| POST | `/api/watchlist/import` | CSV upload + bulk add. |

---

## 6. Implementation Plan

### Work Package 1: Ticker Reference & Search (Foundation)

**Scope:** Backend ticker reference table + search endpoint + frontend search component.

- Create `ticker_reference` table + Drizzle schema
- Seed script to populate ~8,000 US equities (source: SEC EDGAR company tickers JSON)
- `GET /api/tickers/search?q=` endpoint with trigram fuzzy search
- `GET /api/tickers/trending` endpoint (top tickers by 24h event count)
- Universal `<TickerSearch />` component (overlay, keyboard nav, recent searches, trending)
- Integrate search component into Watchlist page (replacing raw text input)
- Add "+" watchlist button inline in search results

**Estimated complexity:** Medium
**Dependencies:** None

---

### Work Package 2: Sections & Reordering

**Scope:** Sections data model + drag-and-drop + section CRUD.

- Create `watchlist_sections` table + schema
- Add `section_id`, `sort_order`, `flags` columns to `watchlist`
- Migration: create default "Watchlist" section for all existing users
- Section CRUD endpoints (create, rename, recolor, delete)
- `PATCH /api/watchlist/reorder` endpoint
- Frontend: collapsible section UI with color indicators
- Frontend: drag-to-reorder with `@dnd-kit/sortable` (or similar)
- Frontend: section header with rename/delete/add-ticker actions

**Estimated complexity:** Medium-High
**Dependencies:** WP1 (search component is used in section "+" add flow)

---

### Work Package 3: Edit Mode & Bulk Operations

**Scope:** Multi-select, bulk remove/move, inline note editing.

- `PATCH /api/watchlist/:ticker` endpoint (notes, flags, section)
- `POST /api/watchlist/bulk` endpoint
- Frontend: edit mode toggle with checkboxes
- Frontend: bulk action bar (remove, move-to-section, flag)
- Frontend: inline note editing (click-to-edit, auto-save)
- Frontend: swipe-to-reveal actions on mobile (using touch event handlers or a library like `react-swipeable`)
- Frontend: long-press to enter multi-select on mobile

**Estimated complexity:** Medium
**Dependencies:** WP2 (sections exist for "move to" flow)

---

### Work Package 4: Cross-Surface Integration

**Scope:** Add-to-watchlist buttons everywhere + keyboard shortcuts.

- Event feed cards: inline "+" button next to ticker (if not on watchlist)
- Ticker profile page: "Add to watchlist" / "On watchlist ✓" header toggle
- Search results page: integrate with unified search component
- Keyboard shortcut layer (`/`, `⌘K`, arrows, Delete, `e`, `?`)
- Keyboard shortcuts help overlay

**Estimated complexity:** Low-Medium
**Dependencies:** WP1 (search component), WP2 (sections for "add to which section?" prompt)

---

### Work Package 5: Import / Export

**Scope:** CSV export/import with validation preview.

- `GET /api/watchlist/export` — CSV generation
- `POST /api/watchlist/import` — CSV parsing, validation against `ticker_reference`, preview response
- Frontend: export button (direct download)
- Frontend: import flow — file upload → preview table with green (valid) / red (invalid) rows → confirm

**Estimated complexity:** Low
**Dependencies:** WP1 (ticker_reference for validation)

---

### Work Package 6: Smart Watchlists (Future)

**Scope:** Criteria-based dynamic lists. **Do not schedule yet** — park for post-launch.

- Define rule schema (event type, severity, time window, sector)
- Backend: evaluate rules against event stream to produce ticker lists
- Frontend: smart list builder UI
- Frontend: smart list display (read-only, auto-refreshing)

**Estimated complexity:** High
**Dependencies:** WP1-5 complete, scanner architecture review

---

## 7. Mobile Responsiveness Checklist

- [ ] Search overlay: full-screen on mobile (not a floating popover)
- [ ] Sections: tap header to expand/collapse, larger touch targets (min 44px)
- [ ] Swipe-to-reveal: left-swipe shows Remove / Move / Alert actions
- [ ] Long-press: enters multi-select mode with haptic feedback
- [ ] Drag-to-reorder: works with touch, with scroll-lock during drag
- [ ] Import/export: file picker works on mobile browsers
- [ ] Keyboard shortcuts: hidden on mobile (no `?` help overlay trigger)
- [ ] Bottom sheet for section picker (not a dropdown) when moving tickers

---

## 8. Success Metrics

| Metric | Current Baseline | Target |
|--------|-----------------|--------|
| Time to add first ticker (new user) | ~15s (must know symbol) | <5s (search + one-tap) |
| Watchlist items per user (avg) | Estimate: 3-5 | 10-15 (sections reduce cognitive load) |
| Search → watchlist add conversion | 0% (disconnected flows) | >30% of search sessions |
| Users with >1 section | 0% (feature doesn't exist) | >40% within 30 days |

---

## 9. Recommended Execution Order

```
WP1 (Search) → WP2 (Sections) → WP3 (Bulk Ops) → WP4 (Cross-surface) → WP5 (Import/Export)
                                                                            ↓
                                                                    WP6 (Smart Lists — future)
```

WP1 is the highest-impact, lowest-risk starting point. It unblocks every subsequent package and immediately addresses the #1 pain point (no autocomplete/validation).
