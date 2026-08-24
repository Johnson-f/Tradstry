-- Settled billing model: useful Free, paid Pro, and internal Founder access.
-- This corrects the provisional free/pro/pro_plus rows from migration 0023
-- without editing an applied migration.

ALTER TABLE plan_limits
  ADD COLUMN IF NOT EXISTS workspace_limit INTEGER,
  ADD COLUMN IF NOT EXISTS brokerage_history_days INTEGER,
  ADD COLUMN IF NOT EXISTS advanced_analytics BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS universal_definitions BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mcp_access BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS desktop_access BOOLEAN NOT NULL DEFAULT false;

DELETE FROM plan_limits WHERE plan = 'pro_plus';

UPDATE users SET plan = 'pro' WHERE plan = 'pro_plus';

INSERT INTO plan_limits (
  plan, ai_actions_per_month, brokerage_connections, data_bytes, media_bytes,
  workspace_limit, brokerage_history_days, advanced_analytics,
  universal_definitions, mcp_access, desktop_access
) VALUES
  ('free', 15, 1, NULL, (50 * 1024 * 1024)::bigint, 6, 365, false, false, false, false),
  ('pro', 300, 5, NULL, (1024 * 1024 * 1024)::bigint, NULL, NULL, true, true, true, true)
ON CONFLICT (plan) DO UPDATE SET
  ai_actions_per_month = EXCLUDED.ai_actions_per_month,
  brokerage_connections = EXCLUDED.brokerage_connections,
  data_bytes = EXCLUDED.data_bytes,
  media_bytes = EXCLUDED.media_bytes,
  workspace_limit = EXCLUDED.workspace_limit,
  brokerage_history_days = EXCLUDED.brokerage_history_days,
  advanced_analytics = EXCLUDED.advanced_analytics,
  universal_definitions = EXCLUDED.universal_definitions,
  mcp_access = EXCLUDED.mcp_access,
  desktop_access = EXCLUDED.desktop_access;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
ALTER TABLE users
  ADD CONSTRAINT users_plan_check CHECK (plan IN ('free', 'pro', 'founder'));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS paddle_checkout_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS paddle_checkout_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paddle_checkout_cadence TEXT;

CREATE TABLE IF NOT EXISTS founder_grants (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  granted_by TEXT NOT NULL,
  note TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

ALTER TABLE paddle_webhook_events
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

DROP INDEX IF EXISTS paddle_webhook_events_claimable_idx;
CREATE INDEX IF NOT EXISTS paddle_webhook_events_claimable_idx
  ON paddle_webhook_events (next_attempt_at, occurred_at)
  INCLUDE (attempts)
  WHERE processed_at IS NULL;
