-- 1. GET TOP GAINERS

-- Get top gainers for a specific date
CREATE OR REPLACE FUNCTION get_top_gainers(
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    name VARCHAR(255),
    price DECIMAL(15,4),
    change DECIMAL(15,4),
    percent_change DECIMAL(8,4),
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.symbol,
        m.name,
        m.price,
        m.change,
        m.percent_change,
        m.fetch_timestamp
    FROM market_movers m
    WHERE m.mover_type = 'gainer'
      AND m.data_date = p_data_date
      AND m.percent_change > 0
    ORDER BY m.percent_change DESC
    LIMIT p_limit;
END;
$$;


-- 2. GET TOP LOSERS

-- Get top losers for a specific date
CREATE OR REPLACE FUNCTION get_top_losers(
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    name VARCHAR(255),
    price DECIMAL(15,4),
    change DECIMAL(15,4),
    percent_change DECIMAL(8,4),
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.symbol,
        m.name,
        m.price,
        m.change,
        m.percent_change,
        m.fetch_timestamp
    FROM market_movers m
    WHERE m.mover_type = 'loser'
      AND m.data_date = p_data_date
      AND m.percent_change < 0
    ORDER BY m.percent_change ASC
    LIMIT p_limit;
END;
$$;

-- 3. GET MOST ACTIVE STOCKS

-- Get most active stocks for a specific date
CREATE OR REPLACE FUNCTION get_most_active(
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    name VARCHAR(255),
    price DECIMAL(15,4),
    change DECIMAL(15,4),
    percent_change DECIMAL(8,4),
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.symbol,
        m.name,
        m.price,
        m.change,
        m.percent_change,
        m.fetch_timestamp
    FROM market_movers m
    WHERE m.mover_type = 'active'
      AND m.data_date = p_data_date
    ORDER BY ABS(m.change) DESC -- Sort by absolute change for actives
    LIMIT p_limit;
END;
$$;


-- USUAGE EXAMPLE 

/*
-- Get top 10 gainers for today


-- Get top 15 losers for a specific date
SELECT * FROM get_top_losers('2024-01-15', 15);

-- Get most active stocks
SELECT * FROM get_most_active();

-- Get all gainers for today
SELECT * FROM get_market_movers_by_type('gainer');

-- Get market mover data for AAPL
SELECT * FROM get_market_mover_by_symbol('AAPL');

-- Get summary of all market movers
SELECT * FROM get_market_movers_summary();

-- Get paginated results (page 2, 10 items per page)
SELECT * FROM get_market_movers_paginated('gainer', CURRENT_DATE, 10, 10, 'percent_change', 'DESC');

-- Get all market movers sorted by symbol
SELECT * FROM get_market_movers_paginated(NULL, CURRENT_DATE, 0, 100, 'symbol', 'ASC');
*/