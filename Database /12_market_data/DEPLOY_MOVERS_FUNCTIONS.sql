-- ================================================================
-- MARKET MOVERS FUNCTIONS DEPLOYMENT SCRIPT
-- ================================================================
-- This script ensures all market movers functions are properly deployed
-- Run this script in your Supabase SQL editor to fix the PGRST202 error

-- Drop existing functions first (clean slate)
DROP FUNCTION IF EXISTS get_top_gainers(DATE, INTEGER);
DROP FUNCTION IF EXISTS get_top_losers(DATE, INTEGER);
DROP FUNCTION IF EXISTS get_most_active(DATE, INTEGER);
DROP FUNCTION IF EXISTS get_top_gainers_latest(INTEGER);
DROP FUNCTION IF EXISTS get_top_losers_latest(INTEGER);
DROP FUNCTION IF EXISTS get_most_active_latest(INTEGER);

-- ================================================================
-- STANDARD FUNCTIONS (DATE-SPECIFIC)
-- ================================================================

-- 1. GET TOP GAINERS (symbols and rankings only)
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


-- ================================================================
-- LATEST AVAILABLE DATE FALLBACK FUNCTIONS
-- ================================================================

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


-- ================================================================
-- VERIFICATION QUERIES
-- ================================================================

-- Test the functions (uncomment to run):
/*
-- Test standard functions
SELECT * FROM get_top_gainers(CURRENT_DATE, 10);
SELECT * FROM get_top_losers(CURRENT_DATE, 10);
SELECT * FROM get_most_active(CURRENT_DATE, 10);

-- Test latest fallback functions
SELECT * FROM get_top_gainers_latest(10);
SELECT * FROM get_top_losers_latest(10);
SELECT * FROM get_most_active_latest(10);
*/

-- Show function metadata
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%mover%'
ORDER BY routine_name;
