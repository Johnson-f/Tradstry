-- Brokerage accounts table
CREATE TABLE IF NOT EXISTS brokerage_accounts (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    snaptrade_account_id TEXT NOT NULL,
    account_number TEXT,
    account_name TEXT,
    account_type TEXT,
    balance REAL,
    currency TEXT DEFAULT 'USD',
    institution_name TEXT,
    raw_data TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (connection_id) REFERENCES brokerage_connections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_brokerage_accounts_connection_id ON brokerage_accounts(connection_id);
CREATE INDEX IF NOT EXISTS idx_brokerage_accounts_snaptrade_account_id ON brokerage_accounts(snaptrade_account_id);

