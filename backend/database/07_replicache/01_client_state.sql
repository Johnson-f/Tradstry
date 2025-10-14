-- Replicache client state tracking tables
-- These tables track client synchronization state for Replicache

CREATE TABLE IF NOT EXISTS replicache_clients (
  client_group_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  last_mutation_id INTEGER NOT NULL DEFAULT 0,
  last_modified_version INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (client_group_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_replicache_clients_user_id ON replicache_clients(user_id);

CREATE TABLE IF NOT EXISTS replicache_space_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO replicache_space_version (id, version) VALUES (1, 0);

-- Add version columns to existing tables for LWW conflict resolution
-- Note: These will be added to existing tables during migration

-- For stocks table
-- ALTER TABLE stocks ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

-- For options table  
-- ALTER TABLE options ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

-- For trade_notes table
-- ALTER TABLE trade_notes ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

-- For playbook table
-- ALTER TABLE playbook ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
