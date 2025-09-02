-- Historical Prices Table - GLOBAL SHARED DATA
-- This table stores historical price data accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores OHLCV and adjusted price data from market data providers

CREATE TABLE IF NOT EXISTS historical_prices (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Core OHLCV data (shared globally)
    date DATE NOT NULL,
    open DECIMAL(15,4),
    high DECIMAL(15,4),
    low DECIMAL(15,4),
    close DECIMAL(15,4),
    volume BIGINT,
    adjusted_close DECIMAL(15,4),

    -- Corporate actions and adjustments
    dividend DECIMAL(10,4) DEFAULT 0,
    split_ratio DECIMAL(10,4) DEFAULT 1.0,

    -- Metadata
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per symbol per date per provider
    UNIQUE(symbol, date, data_provider)
);

 -- Time series indexes for fast historical queries
CREATE INDEX IF NOT EXISTS idx_historical_prices_symbol_date ON historical_prices (symbol, date DESC);
CREATE INDEX IF NOT EXISTS idx_historical_prices_date ON historical_prices (date DESC);
CREATE INDEX IF NOT EXISTS idx_historical_prices_provider ON historical_prices (data_provider);
CREATE INDEX IF NOT EXISTS idx_historical_prices_symbol_provider ON historical_prices (symbol, data_provider);

-- Add table comment
COMMENT ON TABLE historical_prices IS 'Historical OHLCV price data from multiple market data providers';

-- Add column comments
COMMENT ON COLUMN historical_prices.symbol IS 'Stock ticker symbol (e.g., AAPL, GOOGL)';
COMMENT ON COLUMN historical_prices.exchange_id IS 'Foreign key to exchanges table';
COMMENT ON COLUMN historical_prices.date IS 'Trading date for this price data';
COMMENT ON COLUMN historical_prices.open IS 'Opening price for the trading day';
COMMENT ON COLUMN historical_prices.high IS 'Highest price during the trading day';
COMMENT ON COLUMN historical_prices.low IS 'Lowest price during the trading day';
COMMENT ON COLUMN historical_prices.close IS 'Closing price for the trading day';
COMMENT ON COLUMN historical_prices.volume IS 'Trading volume for the day';
COMMENT ON COLUMN historical_prices.adjusted_close IS 'Split and dividend adjusted closing price';
COMMENT ON COLUMN historical_prices.dividend IS 'Dividend amount paid on this date';
COMMENT ON COLUMN historical_prices.split_ratio IS 'Stock split ratio (e.g., 2.0 for 2:1 split)';
COMMENT ON COLUMN historical_prices.data_provider IS 'Market data provider (alpha_vantage, finnhub, polygon, etc.)';

-- =====================================================
-- HISTORICAL PRICES TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from historical_prices table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from historical_prices table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON historical_prices TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON historical_prices FROM PUBLIC;
REVOKE UPDATE ON historical_prices FROM PUBLIC;
REVOKE DELETE ON historical_prices FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE historical_prices ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "historical_prices_select_policy" ON historical_prices
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "historical_prices_insert_policy" ON historical_prices
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "historical_prices_update_policy" ON historical_prices
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "historical_prices_delete_policy" ON historical_prices
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR HISTORICAL_PRICES TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for analysis and display
   - Users cannot modify historical price integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic market data updates

3. DATA INTEGRITY:
   - Historical data should be treated as immutable by users
   - Only trusted sources can update price information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/
