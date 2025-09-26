-- =====================================================
-- FIX GET_PEER_COMPARISON FUNCTION TYPE MISMATCH
-- =====================================================
-- Fix the type mismatch error where ROW_NUMBER() returns BIGINT
-- but the function expects INTEGER in column 8 (peer_rank)

-- Drop and recreate the function with correct return type
DROP FUNCTION IF EXISTS get_peer_comparison(VARCHAR(20), DATE);

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
    peer_rank BIGINT  -- Changed from INTEGER to BIGINT to match ROW_NUMBER() return type
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
            0::BIGINT as peer_rank  -- Explicitly cast to BIGINT
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

-- Add function comment
COMMENT ON FUNCTION get_peer_comparison(VARCHAR(20), DATE) IS 'Get peer comparison data including main stock and ranked peers by performance. Fixed type mismatch for peer_rank column.';
