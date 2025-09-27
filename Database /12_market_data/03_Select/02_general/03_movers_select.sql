-- REDESIGNED MARKET MOVERS SELECT FUNCTIONS - NO PRICE DATA
-- Functions return symbols and rankings only - use stock_quotes for real-time prices

-- 1. GET TOP GAINERS (symbols and rankings only)

-- Get top gainers for a specific date
CREATE OR REPLACE FUNCTION get_top_gainers(
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    name VARCHAR(255),
    rank_position INTEGER,
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.symbol,
        m.name,
        m.rank_position,
        m.fetch_timestamp
    FROM market_movers m
    WHERE m.mover_type = 'gainer'
      AND m.data_date = p_data_date
    ORDER BY m.rank_position ASC NULLS LAST
    LIMIT p_limit;
END;
$$;


-- 2. GET TOP LOSERS (symbols and rankings only)

-- Get top losers for a specific date
CREATE OR REPLACE FUNCTION get_top_losers(
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    name VARCHAR(255),
    rank_position INTEGER,
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.symbol,
        m.name,
        m.rank_position,
        m.fetch_timestamp
    FROM market_movers m
    WHERE m.mover_type = 'loser'
      AND m.data_date = p_data_date
    ORDER BY m.rank_position ASC NULLS LAST
    LIMIT p_limit;
END;
$$;

-- 3. GET MOST ACTIVE STOCKS (symbols and rankings only)

-- Get most active stocks for a specific date
CREATE OR REPLACE FUNCTION get_most_active(
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    name VARCHAR(255),
    rank_position INTEGER,
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.symbol,
        m.name,
        m.rank_position,
        m.fetch_timestamp
    FROM market_movers m
    WHERE m.mover_type = 'active'
      AND m.data_date = p_data_date
    ORDER BY m.rank_position ASC NULLS LAST
    LIMIT p_limit;
END;
$$;


-- REDESIGNED USAGE EXAMPLES - SYMBOLS AND RANKINGS ONLY

/*
-- Get top 10 gainers for today (symbols and rankings)
SELECT * FROM get_top_gainers();

-- Get top 15 losers for a specific date (symbols and rankings)
SELECT * FROM get_top_losers('2024-01-15', 15);

-- Get most active stocks (symbols and rankings)
SELECT * FROM get_most_active();

-- To get actual prices, join with stock_quotes table:
SELECT 
    mm.symbol, 
    mm.name, 
    mm.rank_position,
    sq.price, 
    sq.change, 
    sq.percent_change
FROM get_top_gainers() mm
LEFT JOIN stock_quotes sq ON mm.symbol = sq.symbol;

-- Get all movers for a symbol across different categories
SELECT * FROM market_movers WHERE symbol = 'AAPL' AND data_date = CURRENT_DATE;
*/