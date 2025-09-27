-- Caching Table - GLOBAL SHARED DATA
-- This table stores cached market data for performance optimization
-- NO user ownership - data is shared across the entire platform
-- Stores OHLC (Open, High, Low, Close) and volume data for quick access

-- Eliminate this table 

CREATE TABLE IF NOT EXISTS caching (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Core OHLC data (shared globally) 
    open DECIMAL(15,4),
    high DECIMAL(15,4),
    low DECIMAL(15,4),
    adjclose DECIMAL(15,4),
    volume BIGINT,

    -- Time period information
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    period_type VARCHAR(20) NOT NULL, -- '1min', '5min', '1hour', '1day', etc.
    
    -- Metadata
    data_provider VARCHAR(50) NOT NULL,
    cache_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one cache entry per symbol per period per provider
    UNIQUE(symbol, period_start, period_type, data_provider)
);

-- Global indexes for cross-user queries and performance
CREATE INDEX IF NOT EXISTS idx_caching_symbol_period ON caching (symbol, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_caching_symbol_type ON caching (symbol, period_type);
CREATE INDEX IF NOT EXISTS idx_caching_provider ON caching (data_provider);
CREATE INDEX IF NOT EXISTS idx_caching_timestamp ON caching (cache_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_caching_period_range ON caching (period_start, period_end);

-- Add table comment
COMMENT ON TABLE caching IS 'Cached OHLC and volume data for performance optimization across multiple timeframes';

-- Add column comments
COMMENT ON COLUMN caching.symbol IS 'Stock ticker symbol (e.g., AAPL, GOOGL)';
COMMENT ON COLUMN caching.exchange_id IS 'Foreign key to exchanges table';
COMMENT ON COLUMN caching.open IS 'Opening price for the period';
COMMENT ON COLUMN caching.high IS 'Highest price during the period';
COMMENT ON COLUMN caching.low IS 'Lowest price during the period';
COMMENT ON COLUMN caching.adjclose IS 'Adjusted closing price for the period';
COMMENT ON COLUMN caching.volume IS 'Trading volume for the period';
COMMENT ON COLUMN caching.period_start IS 'Start timestamp of the data period';
COMMENT ON COLUMN caching.period_end IS 'End timestamp of the data period';
COMMENT ON COLUMN caching.period_type IS 'Type of time period (1min, 5min, 1hour, 1day, etc.)';
COMMENT ON COLUMN caching.data_provider IS 'Market data provider (alpha_vantage, finnhub, polygon, etc.)';
COMMENT ON COLUMN caching.cache_timestamp IS 'Timestamp when this data was cached';

-- =====================================================
-- CACHING TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from caching table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from caching table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON caching TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON caching FROM PUBLIC;
REVOKE UPDATE ON caching FROM PUBLIC;
REVOKE DELETE ON caching FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE caching ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "caching_select_policy" ON caching
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "caching_insert_policy" ON caching
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "caching_update_policy" ON caching
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "caching_delete_policy" ON caching
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR CACHING TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT cached data for analysis and display
   - Users cannot modify the integrity of cached market data
   - Prevents accidental or malicious cache corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and caching processes can INSERT/UPDATE
   - Maintains cache accuracy and consistency
   - Supports automatic cache refresh and cleanup operations

3. CACHE INTEGRITY:
   - Cached data should be treated as immutable by users
   - Only trusted cache management systems can update data
   - Supports performance optimization without security compromise

4. PERFORMANCE OPTIMIZATION:
   - Cached data reduces load on external market data APIs
   - Multiple timeframe support for different analysis needs
   - Efficient indexing for fast retrieval

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure cache management processes can still write data
- Consider implementing cache expiration and cleanup policies
- Monitor cache hit rates and performance improvements
*/