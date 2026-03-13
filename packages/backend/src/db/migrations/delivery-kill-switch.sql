-- Delivery Kill Switch table
-- Singleton row (id=1) to persist kill switch state across restarts

CREATE TABLE IF NOT EXISTS delivery_kill_switch (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  activated_at  TIMESTAMPTZ,
  reason        TEXT,
  updated_by    VARCHAR(50),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure singleton row exists
INSERT INTO delivery_kill_switch (id, enabled, updated_at)
VALUES (1, FALSE, now())
ON CONFLICT (id) DO NOTHING;
