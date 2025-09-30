-- =====================================================
-- REDESIGNED STOCK QUOTES FUNCTION - NO PRICE DATA
-- Fetches stock symbol metadata and tracking information only
-- Use external APIs for real-time prices
-- =====================================================

CREATE OR REPLACE FUNCTION get_stock_quotes(
    p_symbol VARCHAR(20),
    p_quote_date DATE DEFAULT CURRENT_DATE,
    p_data_provider VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    symbol VARCHAR(20),
    quote_date DATE,
    quote_timestamp TIMESTAMP,
    data_provider VARCHAR(50),
    exchange_id INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        UPPER(p_symbol)::VARCHAR(20) as symbol,
        p_quote_date as quote_date,
        sq.quote_timestamp,
        sq.data_provider,
        sq.exchange_id
    FROM stock_quotes sq
    WHERE sq.symbol = UPPER(p_symbol)
    AND DATE(sq.quote_timestamp) = p_quote_date
    AND (p_data_provider IS NULL OR sq.data_provider = p_data_provider)
    ORDER BY sq.quote_timestamp DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- REDESIGNED USAGE EXAMPLES - NO PRICE DATA
-- =====================================================

/*
-- Get stock symbol metadata for Apple on a specific date (NO PRICE DATA)
SELECT * FROM get_stock_quotes('AAPL', '2024-01-15');

-- Get current day stock tracking info
SELECT * FROM get_stock_quotes('MSFT');

-- Frontend usage pattern: Get symbols → fetch prices from external APIs
-- 1. Get tracked symbols: SELECT * FROM get_tracked_symbols();
-- 2. Frontend calls external API for real-time prices using the symbols
-- 3. Frontend combines symbol metadata with real-time prices from APIs
*/