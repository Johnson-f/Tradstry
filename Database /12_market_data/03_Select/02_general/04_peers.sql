-- =====================================================
-- REDESIGNED STOCK PEERS SELECT FUNCTIONS - NO PRICE DATA
-- Functions return symbols and metadata only - use stock_quotes for real-time prices
-- =====================================================

-- 1. GET PEERS FOR A SPECIFIC STOCK (symbols and metadata only)
-- Get all peers for a specific stock symbol
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

-- Get peers with company logos for UI display
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

-- Get just peer symbols for efficient batch price lookups
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

-- Get peer metadata for comparison - frontend joins with stock_quotes for prices
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

-- Get paginated peer results with metadata-based sorting
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
-- REDESIGNED USAGE EXAMPLES - NO PRICE DATA
-- =====================================================

/*
-- Get all peers for AAPL (symbols and metadata only)
SELECT * FROM get_stock_peers('AAPL');

-- Get peers with logos for UI display
SELECT * FROM get_peers_with_logos('AAPL');

-- Get just peer symbols for batch price lookup
SELECT * FROM get_peer_symbols('AAPL');

-- Get peer comparison metadata (join with stock_quotes for prices)
SELECT * FROM get_peer_comparison_metadata('AAPL');

-- Get paginated results (sorted by symbol name)
SELECT * FROM get_peers_paginated('AAPL', CURRENT_DATE, 0, 20, 'symbol', 'ASC');

-- Example: Frontend joins peers with stock_quotes for real-time prices
WITH peers AS (
    SELECT * FROM get_stock_peers('AAPL')
)
SELECT 
    p.peer_symbol,
    p.peer_name,
    p.logo,
    sq.price,
    sq.change,
    sq.percent_change
FROM peers p
LEFT JOIN stock_quotes sq ON p.peer_symbol = sq.symbol;
*/