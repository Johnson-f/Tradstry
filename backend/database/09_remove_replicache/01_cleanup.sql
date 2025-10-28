-- Remove Replicache-specific tables and version columns
-- This migration removes all Replicache infrastructure

-- Drop Replicache-specific tables
DROP TABLE IF EXISTS replicache_clients;
DROP TABLE IF EXISTS replicache_space_version;

-- Remove version columns from data tables
-- Note: SQLite does not support ALTER TABLE DROP COLUMN directly
-- We need to recreate the tables without version columns

-- For stocks table
-- Option 1: Create new table without version column and migrate data
CREATE TABLE stocks_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    trade_type TEXT NOT NULL,
    order_type TEXT NOT NULL,
    entry_price REAL NOT NULL,
    exit_price REAL,
    stop_loss REAL NOT NULL,
    commissions REAL NOT NULL DEFAULT 0.0,
    number_shares REAL NOT NULL,
    take_profit REAL,
    entry_date TEXT NOT NULL,
    exit_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_deleted INTEGER NOT NULL DEFAULT 0
);

INSERT INTO stocks_new SELECT 
    id, symbol, trade_type, order_type, entry_price, exit_price, stop_loss,
    commissions, number_shares, take_profit, entry_date, exit_date,
    created_at, updated_at, is_deleted
FROM stocks;

DROP TABLE stocks;
ALTER TABLE stocks_new RENAME TO stocks;

-- For options table
CREATE TABLE options_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    strategy_type TEXT NOT NULL,
    trade_direction TEXT NOT NULL,
    number_of_contracts INTEGER NOT NULL,
    option_type TEXT NOT NULL,
    strike_price REAL NOT NULL,
    expiration_date TEXT NOT NULL,
    entry_price REAL NOT NULL,
    exit_price REAL,
    total_premium REAL NOT NULL,
    commissions REAL NOT NULL DEFAULT 0.0,
    implied_volatility REAL NOT NULL,
    entry_date TEXT NOT NULL,
    exit_date TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_deleted INTEGER NOT NULL DEFAULT 0
);

INSERT INTO options_new SELECT 
    id, symbol, strategy_type, trade_direction, number_of_contracts, option_type,
    strike_price, expiration_date, entry_price, exit_price, total_premium,
    commissions, implied_volatility, entry_date, exit_date, status,
    created_at, updated_at, is_deleted
FROM options;

DROP TABLE options;
ALTER TABLE options_new RENAME TO options;

-- For trade_notes table
CREATE TABLE trade_notes_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    content TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO trade_notes_new SELECT 
    id, name, content, created_at, updated_at
FROM trade_notes;

DROP TABLE trade_notes;
ALTER TABLE trade_notes_new RENAME TO trade_notes;

-- For playbook table
CREATE TABLE playbook_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO playbook_new SELECT 
    id, name, description, created_at, updated_at
FROM playbook;

DROP TABLE playbook;
ALTER TABLE playbook_new RENAME TO playbook;

