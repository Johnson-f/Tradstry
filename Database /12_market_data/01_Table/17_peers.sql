-- =====================================================
-- STOCK PEERS TABLE
-- =====================================================
-- Table to store stock peers data (companies in similar sectors/industries)
-- Data source: finance-query.onrender.com API endpoints

CREATE TABLE IF NOT EXISTS stock_peers (
    id SERIAL PRIMARY KEY,
    
    -- Stock identification
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    
    -- Price data
    price DECIMAL(15,4),
    change DECIMAL(15,4),
    percent_change DECIMAL(8,4), -- Store as decimal (e.g., 1.76 for 1.76%)
    
    -- Logo/branding
    logo VARCHAR(500), -- URL to company logo
    
    -- Peer relationship
    peer_of VARCHAR(20) NOT NULL, -- The symbol this is a peer of
    
    -- Data tracking
    data_provider VARCHAR(50) DEFAULT 'finance_query',
    fetch_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_date DATE DEFAULT CURRENT_DATE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per symbol per peer relationship per provider
    UNIQUE(symbol, peer_of, data_provider)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_stock_peers_symbol ON stock_peers(symbol);
CREATE INDEX IF NOT EXISTS idx_stock_peers_peer_of ON stock_peers(peer_of);
CREATE INDEX IF NOT EXISTS idx_stock_peers_date ON stock_peers(data_date);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_stock_peers_peer_of_date ON stock_peers(peer_of, data_date);
CREATE INDEX IF NOT EXISTS idx_stock_peers_symbol_peer ON stock_peers(symbol, peer_of);
CREATE INDEX IF NOT EXISTS idx_stock_peers_fetch_timestamp ON stock_peers(fetch_timestamp);

-- Performance index for sorting by price change
CREATE INDEX IF NOT EXISTS idx_stock_peers_percent_change ON stock_peers(percent_change DESC);

-- =====================================================
-- CONSTRAINTS AND TRIGGERS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_stock_peers_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stock_peers_timestamp
    BEFORE UPDATE ON stock_peers
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_peers_timestamp();

-- =====================================================
-- STOCK PEERS TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from stock_peers table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from stock_peers table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON stock_peers TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON stock_peers FROM PUBLIC;
REVOKE UPDATE ON stock_peers FROM PUBLIC;
REVOKE DELETE ON stock_peers FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE stock_peers ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "stock_peers_select_policy" ON stock_peers
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "stock_peers_insert_policy" ON stock_peers
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "stock_peers_update_policy" ON stock_peers
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "stock_peers_delete_policy" ON stock_peers
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR STOCK PEERS TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT stock peers data for analysis and comparison
   - Users cannot modify the integrity of peers data
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data fetching processes can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic data refresh from finance-query API

3. DATA INTEGRITY:
   - Stock peers data should be treated as immutable by users
   - Only trusted data management systems can update data
   - Supports performance optimization without security compromise

4. PERFORMANCE OPTIMIZATION:
   - Cached peers data reduces load on external APIs
   - Supports real-time peer comparison without rate limiting
   - Efficient indexing for fast retrieval by peer relationships

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

-- Get all peers for a specific stock (e.g., AAPL)
-- SELECT * FROM stock_peers WHERE peer_of = 'AAPL' AND data_date = CURRENT_DATE ORDER BY percent_change DESC;

-- Get peers with positive performance
-- SELECT * FROM stock_peers WHERE peer_of = 'AAPL' AND data_date = CURRENT_DATE AND percent_change > 0 ORDER BY percent_change DESC;

-- Get top performing peers
-- SELECT * FROM stock_peers WHERE peer_of = 'AAPL' AND data_date = CURRENT_DATE ORDER BY percent_change DESC LIMIT 5;

-- Get all peer relationships for multiple stocks
-- SELECT * FROM stock_peers WHERE peer_of IN ('AAPL', 'MSFT', 'GOOGL') AND data_date = CURRENT_DATE ORDER BY peer_of, percent_change DESC;