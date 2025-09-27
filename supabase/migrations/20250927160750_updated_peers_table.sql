-- STOCK PEERS TABLE REDESIGN - REMOVE PRICE DATA
-- Drop and recreate table with new structure

DROP TABLE IF EXISTS stock_peers CASCADE;

-- =====================================================
-- STOCK PEERS TABLE - REDESIGNED: NO PRICE DATA
-- =====================================================
-- Table to store stock peers data (companies in similar sectors/industries)
-- REMOVED: price, change, percent_change (use stock_quotes for real-time prices)
-- Data source: finance-query.onrender.com API endpoints

CREATE TABLE IF NOT EXISTS stock_peers (
    id SERIAL PRIMARY KEY,
    
    -- Stock identification (ticker symbols stored as text, not numbers)
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    
    -- Logo/branding (kept for UI display)
    logo VARCHAR(500), -- URL to company logo
    
    -- Peer relationship tracking
    peer_of VARCHAR(20) NOT NULL, -- The symbol this is a peer of
    
    -- Data tracking and metadata
    data_provider VARCHAR(50) DEFAULT 'finance_query',
    fetch_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_date DATE DEFAULT CURRENT_DATE,
    
    -- Audit timestamps
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

-- Performance index for peer lookups (no price sorting needed)
CREATE INDEX IF NOT EXISTS idx_stock_peers_logo ON stock_peers(logo) WHERE logo IS NOT NULL;

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
-- REDESIGNED STOCK PEERS SELECT FUNCTIONS - NO PRICE DATA
-- Functions return symbols and metadata only - use stock_quotes for real-time prices
-- =====================================================

-- Drop existing functions first
DROP FUNCTION IF EXISTS get_stock_peers;
DROP FUNCTION IF EXISTS get_top_performing_peers;
DROP FUNCTION IF EXISTS get_worst_performing_peers;
DROP FUNCTION IF EXISTS get_peer_comparison;
DROP FUNCTION IF EXISTS get_peers_paginated;

-- 1. GET PEERS FOR A SPECIFIC STOCK (symbols and metadata only)
CREATE OR REPLACE FUNCTION get_stock_peers(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    peer_symbol VARCHAR(20),
    peer_name VARCHAR(255),
    logo VARCHAR(500),
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.symbol,
        p.name,
        p.logo,
        p.fetch_timestamp
    FROM stock_peers p
    WHERE p.peer_of = UPPER(p_symbol)
      AND p.data_date = p_data_date
    ORDER BY p.symbol ASC
    LIMIT p_limit;
END;
$$;

-- 2. GET PEERS WITH LOGOS (for UI display)
CREATE OR REPLACE FUNCTION get_peers_with_logos(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    peer_symbol VARCHAR(20),
    peer_name VARCHAR(255),
    logo VARCHAR(500),
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.symbol,
        p.name,
        p.logo,
        p.fetch_timestamp
    FROM stock_peers p
    WHERE p.peer_of = UPPER(p_symbol)
      AND p.data_date = p_data_date
      AND p.logo IS NOT NULL
    ORDER BY p.name ASC
    LIMIT p_limit;
END;
$$;

-- 3. GET PEER SYMBOLS ONLY (for batch price lookups)
CREATE OR REPLACE FUNCTION get_peer_symbols(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    peer_symbol VARCHAR(20)
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.symbol
    FROM stock_peers p
    WHERE p.peer_of = UPPER(p_symbol)
      AND p.data_date = p_data_date
    ORDER BY p.symbol ASC;
END;
$$;

-- 4. GET PEER METADATA FOR COMPARISON (no price data)
CREATE OR REPLACE FUNCTION get_peer_comparison_metadata(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    symbol VARCHAR(20),
    name VARCHAR(255),
    logo VARCHAR(500),
    is_main_stock BOOLEAN,
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH peer_data AS (
        -- Get peer metadata only
        SELECT 
            p.symbol,
            p.name,
            p.logo,
            FALSE as is_main_stock,
            p.fetch_timestamp
        FROM stock_peers p
        WHERE p.peer_of = UPPER(p_symbol)
          AND p.data_date = p_data_date
        
        UNION ALL
        
        -- Get main stock metadata from company_info
        SELECT 
            c.symbol,
            c.name,
            c.logo,
            TRUE as is_main_stock,
            c.updated_at as fetch_timestamp
        FROM company_info c
        WHERE c.symbol = UPPER(p_symbol)
        ORDER BY c.updated_at DESC
        LIMIT 1
    )
    SELECT * FROM peer_data
    ORDER BY is_main_stock DESC, symbol ASC;
END;
$$;

-- 5. GET PAGINATED PEERS (redesigned without price data)
CREATE OR REPLACE FUNCTION get_peers_paginated(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_offset INTEGER DEFAULT 0,
    p_limit INTEGER DEFAULT 20,
    p_sort_column VARCHAR(50) DEFAULT 'symbol',
    p_sort_direction VARCHAR(4) DEFAULT 'ASC'
)
RETURNS TABLE (
    peer_symbol VARCHAR(20),
    peer_name VARCHAR(255),
    logo VARCHAR(500),
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
DECLARE
    query_text TEXT;
BEGIN
    -- Build dynamic query with sorting (metadata fields only)
    query_text := format('
        SELECT 
            p.symbol,
            p.name,
            p.logo,
            p.fetch_timestamp
        FROM stock_peers p
        WHERE p.peer_of = UPPER($1)
          AND p.data_date = $2
        ORDER BY %I %s
        LIMIT $3 OFFSET $4',
        p_sort_column, 
        CASE WHEN UPPER(p_sort_direction) = 'ASC' THEN 'ASC' ELSE 'DESC' END
    );
    
    RETURN QUERY EXECUTE query_text 
    USING p_symbol, p_data_date, p_limit, p_offset;
END;
$$;

-- =====================================================
-- TABLE COMMENTS
-- =====================================================

COMMENT ON TABLE stock_peers IS 'Stock peers data (similar companies) - REDESIGNED: stores metadata only, no price data';
COMMENT ON COLUMN stock_peers.symbol IS 'Peer stock ticker symbol (stored as TEXT, not number)';
COMMENT ON COLUMN stock_peers.name IS 'Peer company name';
COMMENT ON COLUMN stock_peers.logo IS 'URL to peer company logo for UI display';
COMMENT ON COLUMN stock_peers.peer_of IS 'The ticker symbol this company is a peer of';
COMMENT ON COLUMN stock_peers.data_provider IS 'Market data provider source';
COMMENT ON COLUMN stock_peers.fetch_timestamp IS 'When this peer data was fetched from API';
COMMENT ON COLUMN stock_peers.data_date IS 'Trading date this peer relationship data represents';
