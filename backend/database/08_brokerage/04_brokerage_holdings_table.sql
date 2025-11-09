-- Brokerage holdings table
CREATE TABLE IF NOT EXISTS brokerage_holdings (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    quantity REAL NOT NULL,
    average_cost REAL,
    current_price REAL,
    market_value REAL,
    currency TEXT DEFAULT 'USD',
    last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    raw_data TEXT,
    FOREIGN KEY (account_id) REFERENCES brokerage_accounts(id) ON DELETE CASCADE,
    UNIQUE(account_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_brokerage_holdings_account_id ON brokerage_holdings(account_id);
CREATE INDEX IF NOT EXISTS idx_brokerage_holdings_symbol ON brokerage_holdings(symbol);

