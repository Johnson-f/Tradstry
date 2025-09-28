-- =====================================================
-- MARKET MOVERS TABLE - REDESIGNED: NO PRICE DATA
-- =====================================================
-- Table to store market movers data (actives, gainers, losers)
-- REMOVED: price, change, percent_change (use stock_quotes for real-time prices)
-- Data source: finance-query.onrender.com API endpoints

CREATE TABLE IF NOT EXISTS market_movers (
    id SERIAL PRIMARY KEY,
    
    -- Stock identification (ticker symbols stored as text, not numbers)
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    
    -- Mover classification (ranking and position tracking)
    mover_type VARCHAR(20) NOT NULL CHECK (mover_type IN ('active', 'gainer', 'loser')),
    rank_position INTEGER, -- Position in the leaderboard (1st, 2nd, etc.)
    
    -- Data tracking and metadata
    data_provider VARCHAR(50) DEFAULT 'finance_query',
    fetch_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_date DATE DEFAULT CURRENT_DATE,
    
    -- Audit timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one record per symbol per mover type per date
    UNIQUE(symbol, mover_type, data_date)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_market_movers_symbol ON market_movers(symbol);
CREATE INDEX IF NOT EXISTS idx_market_movers_type ON market_movers(mover_type);
CREATE INDEX IF NOT EXISTS idx_market_movers_date ON market_movers(data_date);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_market_movers_type_date ON market_movers(mover_type, data_date);
CREATE INDEX IF NOT EXISTS idx_market_movers_symbol_type ON market_movers(symbol, mover_type);
CREATE INDEX IF NOT EXISTS idx_market_movers_fetch_timestamp ON market_movers(fetch_timestamp);

-- Performance index for ranking
CREATE INDEX IF NOT EXISTS idx_market_movers_rank ON market_movers(mover_type, data_date, rank_position);
CREATE INDEX IF NOT EXISTS idx_market_movers_type_rank ON market_movers(mover_type, rank_position);

-- =====================================================
-- CONSTRAINTS AND TRIGGERS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_market_movers_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_market_movers_timestamp
    BEFORE UPDATE ON market_movers
    FOR EACH ROW
    EXECUTE FUNCTION update_market_movers_timestamp();

-- =====================================================
-- MARKET MOVERS TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from market_movers table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from market_movers table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON market_movers TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON market_movers FROM PUBLIC;
REVOKE UPDATE ON market_movers FROM PUBLIC;
REVOKE DELETE ON market_movers FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE market_movers ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "market_movers_select_policy" ON market_movers
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "market_movers_insert_policy" ON market_movers
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "market_movers_update_policy" ON market_movers
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "market_movers_delete_policy" ON market_movers
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR MARKET MOVERS TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT market movers data for analysis and display
   - Users cannot modify the integrity of market movers data
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data fetching processes can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic data refresh from finance-query API

3. DATA INTEGRITY:
   - Market movers data should be treated as immutable by users
   - Only trusted data management systems can update data
   - Supports performance optimization without security compromise

4. PERFORMANCE OPTIMIZATION:
   - Cached market movers data reduces load on external APIs
   - Supports real-time market analysis without rate limiting
   - Efficient indexing for fast retrieval by mover type and date

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure data fetching processes can still write data
- Consider implementing data expiration and cleanup policies
- Monitor API usage and cache hit rates for performance improvements
*/

-- =====================================================
-- SAMPLE USAGE QUERIES
-- =====================================================

-- Get today's top 10 gainers (by rank position)
-- SELECT * FROM market_movers WHERE mover_type = 'gainer' AND data_date = CURRENT_DATE ORDER BY rank_position ASC LIMIT 10;

-- Get today's top 10 losers (by rank position) 
-- SELECT * FROM market_movers WHERE mover_type = 'loser' AND data_date = CURRENT_DATE ORDER BY rank_position ASC LIMIT 10;

-- Get today's most active stocks (by rank position)
-- SELECT * FROM market_movers WHERE mover_type = 'active' AND data_date = CURRENT_DATE ORDER BY rank_position ASC LIMIT 10;

-- Get all mover entries for a specific symbol
-- SELECT * FROM market_movers WHERE symbol = 'AAPL' AND data_date = CURRENT_DATE;

-- Get symbols by mover type for joining with stock_quotes for real-time prices
-- SELECT symbol, rank_position FROM market_movers WHERE mover_type = 'gainer' AND data_date = CURRENT_DATE ORDER BY rank_position;