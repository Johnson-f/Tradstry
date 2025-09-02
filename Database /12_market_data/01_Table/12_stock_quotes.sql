-- Stock Quotes Table - GLOBAL SHARED DATA
-- This table stores market data accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores real-time and historical stock quote data from market data providers

CREATE TABLE IF NOT EXISTS stock_quotes (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Core market data (shared globally)
    price DECIMAL(15,4),
    change_amount DECIMAL(15,4),
    change_percent DECIMAL(7,4),
    volume BIGINT,
    open_price DECIMAL(15,4),
    high_price DECIMAL(15,4),
    low_price DECIMAL(15,4),
    previous_close DECIMAL(15,4),

    -- Metadata
    quote_timestamp TIMESTAMP NOT NULL,
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one quote per symbol per timestamp per provider
    UNIQUE(symbol, quote_timestamp, data_provider)
);

 -- Global indexes for cross-user queries
CREATE INDEX IF NOT EXISTS idx_stock_quotes_symbol_timestamp ON stock_quotes (symbol, quote_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_stock_quotes_provider ON stock_quotes (data_provider);
CREATE INDEX IF NOT EXISTS idx_stock_quotes_timestamp ON stock_quotes (quote_timestamp DESC);

-- Add table comment
COMMENT ON TABLE stock_quotes IS 'Real-time and historical stock quote data from multiple market data providers';

-- Add column comments
COMMENT ON COLUMN stock_quotes.symbol IS 'Stock ticker symbol (e.g., AAPL, GOOGL)';
COMMENT ON COLUMN stock_quotes.exchange_id IS 'Foreign key to exchanges table';
COMMENT ON COLUMN stock_quotes.price IS 'Current/last traded price';
COMMENT ON COLUMN stock_quotes.change_amount IS 'Price change from previous close';
COMMENT ON COLUMN stock_quotes.change_percent IS 'Percentage change from previous close';
COMMENT ON COLUMN stock_quotes.volume IS 'Trading volume for the period';
COMMENT ON COLUMN stock_quotes.open_price IS 'Opening price for the trading period';
COMMENT ON COLUMN stock_quotes.high_price IS 'Highest price during the period';
COMMENT ON COLUMN stock_quotes.low_price IS 'Lowest price during the period';
COMMENT ON COLUMN stock_quotes.previous_close IS 'Previous trading session close price';
COMMENT ON COLUMN stock_quotes.quote_timestamp IS 'Timestamp when this quote was captured';
COMMENT ON COLUMN stock_quotes.data_provider IS 'Market data provider (alpha_vantage, finnhub, polygon, etc.)';

-- =====================================================
-- STOCK QUOTES TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from stock_quotes table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from stock_quotes table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON stock_quotes TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON stock_quotes FROM PUBLIC;
REVOKE UPDATE ON stock_quotes FROM PUBLIC;
REVOKE DELETE ON stock_quotes FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE stock_quotes ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "stock_quotes_select_policy" ON stock_quotes
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "stock_quotes_insert_policy" ON stock_quotes
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "stock_quotes_update_policy" ON stock_quotes
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "stock_quotes_delete_policy" ON stock_quotes
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR STOCK_QUOTES TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for analysis and display
   - Users cannot modify the integrity of market data
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic market data updates

3. DATA INTEGRITY:
   - Market data should be treated as immutable by users
   - Only trusted sources can update pricing information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/
