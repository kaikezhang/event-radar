# TASK.md — WP8: Notification Budget & Quiet Hours

> Reference: `docs/plans/2026-03-15-phase3-productization-v2.md` (WP8)

## Goal
Users control when and how often they get push notifications. "When Event Radar pings you at 2am, you KNOW it matters."

## Schema

### `user_preferences` table
```sql
CREATE TABLE user_preferences (
  user_id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  quiet_start TIME,                    -- e.g., '23:00' (null = no quiet hours)
  quiet_end TIME,                      -- e.g., '08:00'
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  daily_push_cap INTEGER DEFAULT 20,   -- max pushes per day (0 = unlimited)
  push_non_watchlist BOOLEAN DEFAULT FALSE,  -- opt-in for non-watchlist alerts
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Add Drizzle schema definition in `packages/backend/src/db/schema.ts`.
Create migration SQL in `packages/backend/src/db/migrations/`.
Update `packages/backend/src/__tests__/helpers/test-db.ts` to create this table.

## Backend

### Preferences API
- `GET /api/v1/preferences` — returns current user's preferences (or defaults if none set)
- `PUT /api/v1/preferences` — upsert preferences. Body: `{ quietStart?, quietEnd?, timezone?, dailyPushCap?, pushNonWatchlist? }`
- Both require auth (or API key in AUTH_REQUIRED=false mode)

### Push Delivery Logic — update `packages/delivery/src/web-push-channel.ts`
Before sending each push notification:
1. Load user preferences for the subscription's user
2. **Quiet hours check**: convert current time to user's timezone. If within quiet window:
   - Only `🔴 High-Quality Setup` alerts pass through
   - All others suppressed (log + metric `push_quiet_suppressed_total`)
3. **Daily cap check**: count pushes sent to this user today (UTC day). If >= `daily_push_cap`:
   - Suppress with metric `push_cap_suppressed_total`
   - Exception: `🔴 High-Quality Setup` always passes regardless of cap
4. **Non-watchlist check**: already implemented in WP3 — just wire it to read from `user_preferences.push_non_watchlist` instead of hardcoded false

### Push tracking
- Need to track pushes sent per user per day
- Option A: counter in `user_preferences` table (reset daily) — simple but needs cleanup job
- Option B: count from `deliveries` table if it tracks per-user pushes
- Option C: in-memory Map with daily reset — simplest for MVP
- **Choose Option C** for MVP: `Map<userId, { date: string, count: number }>`

## Frontend — Settings Page (`packages/web/src/pages/Settings.tsx`)

### Quiet Hours Section
- Toggle: "Enable quiet hours" (on/off)
- When on: start time picker + end time picker
- Timezone dropdown (default America/New_York, common US timezones)
- Hint: "During quiet hours, only 🔴 High-Quality Setup alerts will push through"

### Daily Push Limit Section  
- Slider or dropdown: 5 / 10 / 20 / 50 / Unlimited
- Default: 20
- Hint: "🔴 High-Quality Setup alerts always push regardless of daily limit"

### Non-Watchlist Alerts Section
- Toggle: "Alert me for tickers outside my watchlist" (default off)
- Hint: "When enabled, high-confidence alerts for any ticker will push to you"

### Save
- Auto-save on change (debounced 500ms) with toast notification
- Or explicit "Save preferences" button

## Testing
- Test: quiet hours suppresses medium/low alerts
- Test: quiet hours allows high-quality setup alerts through
- Test: daily cap suppresses after limit reached
- Test: daily cap doesn't suppress high-quality setup
- Test: preferences API CRUD
- Test: timezone conversion correct
- Test: Settings page renders all controls

## PR
- Branch: `feat/wp8-notification-budget` (already created)
- Title: "feat: notification budget with quiet hours and daily push cap (WP8)"
- Run ALL tests before creating PR
- Create PR and STOP. Do not merge.
