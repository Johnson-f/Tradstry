-- The user has seen that a note's execution was removed and chose to keep the
-- note as a record, so it no longer waits on them.
ALTER TABLE journal_action_notes ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
