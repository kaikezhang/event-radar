-- WP2: Watchlist Sections & Reordering
-- Creates watchlist_sections table and adds section_id + sort_order to watchlist

-- 1. Create watchlist_sections table
CREATE TABLE IF NOT EXISTS watchlist_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT 'gray',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_user_name ON watchlist_sections (user_id, name);

-- 2. Add section_id and sort_order columns to watchlist
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES watchlist_sections(id) ON DELETE SET NULL;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 3. Create a default "Watchlist" section for every existing user who has watchlist items
INSERT INTO watchlist_sections (user_id, name, color, sort_order)
SELECT DISTINCT w.user_id, 'Watchlist', 'gray', 0
FROM watchlist w
WHERE NOT EXISTS (
  SELECT 1 FROM watchlist_sections ws
  WHERE ws.user_id = w.user_id AND ws.name = 'Watchlist'
)
ON CONFLICT DO NOTHING;

-- 4. Set all existing watchlist items' section_id to their user's default section
UPDATE watchlist w
SET section_id = ws.id
FROM watchlist_sections ws
WHERE ws.user_id = w.user_id
  AND ws.name = 'Watchlist'
  AND w.section_id IS NULL;
