-- Broker executions a manual trade was said to be different from. Trade ids
-- change when history is rebuilt, so projection maps these to the current
-- broker trades in separate_from.
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS separate_from_executions text[] NOT NULL DEFAULT '{}';
