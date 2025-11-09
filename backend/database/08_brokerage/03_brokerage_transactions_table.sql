-- Brokerage transactions table
CREATE TABLE IF NOT EXISTS brokerage_transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    snaptrade_transaction_id TEXT NOT NULL,
    symbol TEXT,
    transaction_type TEXT,
    quantity REAL,
    price REAL,
    amount REAL,
    currency TEXT DEFAULT 'USD',
    trade_date TIMESTAMP NOT NULL,
    settlement_date TIMESTAMP,
    fees REAL,
    raw_data TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES brokerage_accounts(id) ON DELETE CASCADE,
    UNIQUE(account_id, snaptrade_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_brokerage_transactions_account_id ON brokerage_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_brokerage_transactions_trade_date ON brokerage_transactions(trade_date);
CREATE INDEX IF NOT EXISTS idx_brokerage_transactions_symbol ON brokerage_transactions(symbol);

