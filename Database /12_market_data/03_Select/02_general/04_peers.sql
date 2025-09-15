-- =====================================================
-- STOCK PEERS SELECT FUNCTIONS
-- =====================================================
-- Functions to retrieve stock peer data with various filtering and sorting options

-- 1. GET PEERS FOR A SPECIFIC STOCK

-- Get all peers for a specific stock symbol
CREATE OR REPLACE FUNCTION get_stock_peers(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    peer_symbol VARCHAR(20),
    peer_name VARCHAR(255),
    price DECIMAL(15,4),
    change DECIMAL(15,4),
    percent_change DECIMAL(8,4),
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
        p.price,
        p.change,
        p.percent_change,
        p.logo,
        p.fetch_timestamp
    FROM stock_peers p
    WHERE p.peer_of = UPPER(p_symbol)
      AND p.data_date = p_data_date
    ORDER BY p.percent_change DESC
    LIMIT p_limit;
END;
$$;

-- 2. GET TOP PERFORMING PEERS

-- Get top performing peers for a specific stock
CREATE OR REPLACE FUNCTION get_top_performing_peers(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    peer_symbol VARCHAR(20),
    peer_name VARCHAR(255),
    price DECIMAL(15,4),
    change DECIMAL(15,4),
    percent_change DECIMAL(8,4),
    logo VARCHAR(500)
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.symbol,
        p.name,
        p.price,
        p.change,
        p.percent_change,
        p.logo
    FROM stock_peers p
    WHERE p.peer_of = UPPER(p_symbol)
      AND p.data_date = p_data_date
      AND p.percent_change > 0
    ORDER BY p.percent_change DESC
    LIMIT p_limit;
END;
$$;

-- 3. GET WORST PERFORMING PEERS

-- Get worst performing peers for a specific stock
CREATE OR REPLACE FUNCTION get_worst_performing_peers(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    peer_symbol VARCHAR(20),
    peer_name VARCHAR(255),
    price DECIMAL(15,4),
    change DECIMAL(15,4),
    percent_change DECIMAL(8,4),
    logo VARCHAR(500)
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.symbol,
        p.name,
        p.price,
        p.change,
        p.percent_change,
        p.logo
    FROM stock_peers p
    WHERE p.peer_of = UPPER(p_symbol)
      AND p.data_date = p_data_date
      AND p.percent_change < 0
    ORDER BY p.percent_change ASC
    LIMIT p_limit;
END;
$$;

-- 4. GET PEER COMPARISON DATA

-- Get peer comparison with the main stock data
CREATE OR REPLACE FUNCTION get_peer_comparison(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    symbol VARCHAR(20),
    name VARCHAR(255),
    price DECIMAL(15,4),
    change DECIMAL(15,4),
    percent_change DECIMAL(8,4),
    logo VARCHAR(500),
    is_main_stock BOOLEAN,
    peer_rank INTEGER
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH peer_data AS (
        -- Get peer data
        SELECT 
            p.symbol,
            p.name,
            p.price,
            p.change,
            p.percent_change,
            p.logo,
            FALSE as is_main_stock,
            ROW_NUMBER() OVER (ORDER BY p.percent_change DESC) as peer_rank
        FROM stock_peers p
        WHERE p.peer_of = UPPER(p_symbol)
          AND p.data_date = p_data_date
        
        UNION ALL
        
        -- Get main stock data from company_info (try multiple providers)
        SELECT 
            c.symbol,
            c.name,
            c.price,
            c.change,
            c.percent_change,
            c.logo,
            TRUE as is_main_stock,
            0 as peer_rank
        FROM company_info c
        WHERE c.symbol = UPPER(p_symbol)
          AND c.data_provider IN ('finance-query', 'yahoo_finance', 'finnhub')
        ORDER BY 
            CASE c.data_provider 
                WHEN 'finance-query' THEN 1
                WHEN 'yahoo_finance' THEN 2
                WHEN 'finnhub' THEN 3
                ELSE 4
            END
        LIMIT 1
    )
    SELECT * FROM peer_data
    ORDER BY is_main_stock DESC, peer_rank ASC;
END;
$$;



-- 7. GET PAGINATED PEERS

-- Get paginated peer results with sorting options
CREATE OR REPLACE FUNCTION get_peers_paginated(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_offset INTEGER DEFAULT 0,
    p_limit INTEGER DEFAULT 20,
    p_sort_column VARCHAR(50) DEFAULT 'percent_change',
    p_sort_direction VARCHAR(4) DEFAULT 'DESC'
)
RETURNS TABLE (
    peer_symbol VARCHAR(20),
    peer_name VARCHAR(255),
    price DECIMAL(15,4),
    change DECIMAL(15,4),
    percent_change DECIMAL(8,4),
    logo VARCHAR(500),
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
DECLARE
    query_text TEXT;
BEGIN
    -- Build dynamic query with sorting
    query_text := format('
        SELECT 
            p.symbol,
            p.name,
            p.price,
            p.change,
            p.percent_change,
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
-- USAGE EXAMPLES
-- =====================================================

/*
-- Get all peers for AAPL
SELECT * FROM get_stock_peers('AAPL');

-- Get paginated results (page 2, 10 items per page, sorted by price)
SELECT * FROM get_peers_paginated('AAPL', CURRENT_DATE, 10, 10, 'price', 'DESC');

-- Get peers sorted by symbol name
SELECT * FROM get_peers_paginated('AAPL', CURRENT_DATE, 0, 20, 'symbol', 'ASC');
*/