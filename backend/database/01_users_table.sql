-- Central registry table for storing user database credentials
-- This table stores information about each user's individual Turso database
CREATE TABLE IF NOT EXISTS user_databases (
  user_id TEXT PRIMARY KEY,      -- Clerk user ID (e.g., "user_2Yg1FvXq9g9eQ8xM8Qh9tL2vT3K")
  email TEXT NOT NULL,           -- User's email address from Clerk
  db_name TEXT NOT NULL,         -- Database name (typically matches user_id)
  db_url TEXT NOT NULL,          -- Turso database URL
  db_token TEXT NOT NULL,        -- Turso database access token
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups by email
CREATE INDEX IF NOT EXISTS idx_user_databases_email ON user_databases(email);

