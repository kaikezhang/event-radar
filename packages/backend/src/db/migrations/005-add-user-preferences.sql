CREATE TABLE IF NOT EXISTS user_preferences (
  user_id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  quiet_start TIME,
  quiet_end TIME,
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
  daily_push_cap INTEGER NOT NULL DEFAULT 20,
  push_non_watchlist BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
