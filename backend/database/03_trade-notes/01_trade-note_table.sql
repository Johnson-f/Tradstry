-- The database design on Turso is per user, so no need for user_id in the table

CREATE TABLE IF NOT EXISTS trade_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes 

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);

-- Create index on updated_at for sorting
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);

