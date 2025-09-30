-- MARKET MOVERS SELECT FUNCTIONS - LATEST AVAILABLE DATE FALLBACK
-- These functions return the most recent data when today's data is not available

-- 1. GET TOP GAINERS (LATEST AVAILABLE DATE)
CREATE OR REPLACE FUNCTION get_top_gainers_latest(
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
DECLARE
    latest_date DATE;
BEGIN
    -- Get the most recent data_date for gainers
    SELECT MAX(data_date) INTO latest_date
    FROM market_movers
    WHERE mover_type = 'gainer';
    
    -- If no data exists at all, return empty
    IF latest_date IS NULL THEN
        RETURN;
    END IF;
    
    -- Return data for the most recent date
    RETURN QUERY
    SELECT 
        m.symbol,
        m.name,
        m.rank_position,
        m.fetch_timestamp
    FROM market_movers m
    WHERE m.mover_type = 'gainer'
      AND m.data_date = latest_date
    ORDER BY m.rank_position ASC NULLS LAST
    LIMIT p_limit;
END;
$$;


-- 2. GET TOP LOSERS (LATEST AVAILABLE DATE)
CREATE OR REPLACE FUNCTION get_top_losers_latest(
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
DECLARE
    latest_date DATE;
BEGIN
    -- Get the most recent data_date for losers
    SELECT MAX(data_date) INTO latest_date
    FROM market_movers
    WHERE mover_type = 'loser';
    
    -- If no data exists at all, return empty
    IF latest_date IS NULL THEN
        RETURN;
    END IF;
    
    -- Return data for the most recent date
    RETURN QUERY
    SELECT 
        m.symbol,
        m.name,
        m.rank_position,
        m.fetch_timestamp
    FROM market_movers m
    WHERE m.mover_type = 'loser'
      AND m.data_date = latest_date
    ORDER BY m.rank_position ASC NULLS LAST
    LIMIT p_limit;
END;
$$;


-- 3. GET MOST ACTIVE (LATEST AVAILABLE DATE)
CREATE OR REPLACE FUNCTION get_most_active_latest(
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
DECLARE
    latest_date DATE;
BEGIN
    -- Get the most recent data_date for active stocks
    SELECT MAX(data_date) INTO latest_date
    FROM market_movers
    WHERE mover_type = 'active';
    
    -- If no data exists at all, return empty
    IF latest_date IS NULL THEN
        RETURN;
    END IF;
    
    -- Return data for the most recent date
    RETURN QUERY
    SELECT 
        m.symbol,
        m.name,
        m.rank_position,
        m.fetch_timestamp
    FROM market_movers m
    WHERE m.mover_type = 'active'
      AND m.data_date = latest_date
    ORDER BY m.rank_position ASC NULLS LAST
    LIMIT p_limit;
END;
$$;


-- USAGE EXAMPLES

/*
-- Get top 10 gainers from the most recent available date
SELECT * FROM get_top_gainers_latest();

-- Get top 15 losers from the most recent available date
SELECT * FROM get_top_losers_latest(15);

-- Get most active stocks from the most recent available date
SELECT * FROM get_most_active_latest();

-- This is useful when:
-- 1. Market is closed and you don't have today's data yet
-- 2. Data population jobs failed
-- 3. You want to show the most recent data available
*/
