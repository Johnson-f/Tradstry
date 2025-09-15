-- ----------------------------------------------------------------------------
-- Function: get_historical_prices
-- Query historical price data from the historical_prices table with range/interval filtering
-- Supports all configured range/interval combinations for market data visualization
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_historical_prices(
    p_symbol TEXT,
    p_time_range TEXT,
    p_time_interval TEXT,
    p_data_provider TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 1000
) RETURNS TABLE (
    id BIGINT,
    symbol VARCHAR(20),
    exchange_id INTEGER,
    timestamp_utc TIMESTAMP,
    date_only DATE,
    time_range VARCHAR(10),
    time_interval VARCHAR(10),
    open DECIMAL(15,4),
    high DECIMAL(15,4),
    low DECIMAL(15,4),
    close DECIMAL(15,4),
    volume BIGINT,
    adjusted_close DECIMAL(15,4),
    dividend DECIMAL(10,4),
    split_ratio DECIMAL(10,4),
    data_provider VARCHAR(50),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
) AS $$
BEGIN
    -- Validate time_range parameter
    IF p_time_range NOT IN ('1d', '5d', '1mo', '3mo', '6mo', 'ytd', '1y', '2y', '5y', '10y', 'max') THEN
        RAISE EXCEPTION 'Invalid time_range: %. Must be one of: 1d, 5d, 1mo, 3mo, 6mo, ytd, 1y, 2y, 5y, 10y, max', p_time_range;
    END IF;

    -- Validate time_interval parameter
    IF p_time_interval NOT IN ('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1wk', '1mo') THEN
        RAISE EXCEPTION 'Invalid time_interval: %. Must be one of: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1wk, 1mo', p_time_interval;
    END IF;

    -- Validate range/interval combinations based on your configuration
    IF (p_time_range = '1d' AND p_time_interval NOT IN ('1m', '5m', '15m', '30m')) OR
       (p_time_range = '5d' AND p_time_interval NOT IN ('5m', '15m', '30m', '1h')) OR
       (p_time_range = '1mo' AND p_time_interval NOT IN ('30m', '1h', '4h', '1d')) OR
       (p_time_range = '6mo' AND p_time_interval NOT IN ('1h', '1d', '1mo')) OR
       (p_time_range = 'ytd' AND p_time_interval NOT IN ('1h', '1d', '1mo')) OR
       (p_time_range = '1y' AND p_time_interval NOT IN ('1h', '1d', '1mo')) OR
       (p_time_range = '5y' AND p_time_interval NOT IN ('1d', '1mo')) OR
       (p_time_range = 'max' AND p_time_interval NOT IN ('1mo')) THEN
        RAISE EXCEPTION 'Invalid range/interval combination: % range does not support % interval', p_time_range, p_time_interval;
    END IF;

    -- Return the query results
    RETURN QUERY
    SELECT 
        hp.id,
        hp.symbol,
        hp.exchange_id,
        hp.timestamp_utc,
        hp.date_only,
        hp.time_range,
        hp.time_interval,
        hp.open,
        hp.high,
        hp.low,
        hp.close,
        hp.volume,
        hp.adjusted_close,
        hp.dividend,
        hp.split_ratio,
        hp.data_provider,
        hp.created_at,
        hp.updated_at
    FROM historical_prices hp
    WHERE hp.symbol = p_symbol
      AND hp.time_range = p_time_range
      AND hp.time_interval = p_time_interval
      AND (p_data_provider IS NULL OR hp.data_provider = p_data_provider)
    ORDER BY hp.timestamp_utc DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function: get_historical_prices_by_symbol
-- Get all available range/interval combinations for a specific symbol
-- Useful for discovering what data is available for a symbol
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_historical_prices_by_symbol(
    p_symbol TEXT
) RETURNS TABLE (
    time_range VARCHAR(10),
    time_interval VARCHAR(10),
    data_count BIGINT,
    earliest_date TIMESTAMP,
    latest_date TIMESTAMP,
    data_providers TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        hp.time_range,
        hp.time_interval,
        COUNT(*) as data_count,
        MIN(hp.timestamp_utc) as earliest_date,
        MAX(hp.timestamp_utc) as latest_date,
        ARRAY_AGG(DISTINCT hp.data_provider) as data_providers
    FROM historical_prices hp
    WHERE hp.symbol = p_symbol
    GROUP BY hp.time_range, hp.time_interval
    ORDER BY 
        CASE hp.time_range
            WHEN '1d' THEN 1
            WHEN '5d' THEN 2
            WHEN '1mo' THEN 3
            WHEN '3mo' THEN 4
            WHEN '6mo' THEN 5
            WHEN 'ytd' THEN 6
            WHEN '1y' THEN 7
            WHEN '2y' THEN 8
            WHEN '5y' THEN 9
            WHEN '10y' THEN 10
            WHEN 'max' THEN 11
            ELSE 99
        END,
        CASE hp.time_interval
            WHEN '1m' THEN 1
            WHEN '5m' THEN 2
            WHEN '15m' THEN 3
            WHEN '30m' THEN 4
            WHEN '1h' THEN 5
            WHEN '4h' THEN 6
            WHEN '1d' THEN 7
            WHEN '1wk' THEN 8
            WHEN '1mo' THEN 9
            ELSE 99
        END;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function: get_latest_historical_prices
-- Get the most recent historical price data for a symbol across all ranges/intervals
-- Useful for getting current price snapshots
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_latest_historical_prices(
    p_symbol TEXT,
    p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
    timestamp_utc TIMESTAMP,
    time_range VARCHAR(10),
    time_interval VARCHAR(10),
    open DECIMAL(15,4),
    high DECIMAL(15,4),
    low DECIMAL(15,4),
    close DECIMAL(15,4),
    volume BIGINT,
    adjusted_close DECIMAL(15,4),
    data_provider VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        hp.timestamp_utc,
        hp.time_range,
        hp.time_interval,
        hp.open,
        hp.high,
        hp.low,
        hp.close,
        hp.volume,
        hp.adjusted_close,
        hp.data_provider
    FROM historical_prices hp
    WHERE hp.symbol = p_symbol
    ORDER BY hp.timestamp_utc DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function: get_historical_price_range
-- Get historical prices within a specific date range for analysis
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_historical_price_range(
    p_symbol TEXT,
    p_time_range TEXT,
    p_time_interval TEXT,
    p_start_date TIMESTAMP,
    p_end_date TIMESTAMP,
    p_data_provider TEXT DEFAULT NULL
) RETURNS TABLE (
    timestamp_utc TIMESTAMP,
    open DECIMAL(15,4),
    high DECIMAL(15,4),
    low DECIMAL(15,4),
    close DECIMAL(15,4),
    volume BIGINT,
    adjusted_close DECIMAL(15,4)
) AS $$
BEGIN
    -- Validate parameters
    IF p_time_range NOT IN ('1d', '5d', '1mo', '3mo', '6mo', 'ytd', '1y', '2y', '5y', '10y', 'max') THEN
        RAISE EXCEPTION 'Invalid time_range: %', p_time_range;
    END IF;

    IF p_time_interval NOT IN ('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1wk', '1mo') THEN
        RAISE EXCEPTION 'Invalid time_interval: %', p_time_interval;
    END IF;

    RETURN QUERY
    SELECT 
        hp.timestamp_utc,
        hp.open,
        hp.high,
        hp.low,
        hp.close,
        hp.volume,
        hp.adjusted_close
    FROM historical_prices hp
    WHERE hp.symbol = p_symbol
      AND hp.time_range = p_time_range
      AND hp.time_interval = p_time_interval
      AND hp.timestamp_utc >= p_start_date
      AND hp.timestamp_utc <= p_end_date
      AND (p_data_provider IS NULL OR hp.data_provider = p_data_provider)
    ORDER BY hp.timestamp_utc ASC;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Example Usage:
-- ----------------------------------------------------------------------------

/*
-- Get 1-minute interval data for AAPL from the 1-day range
SELECT * FROM get_historical_prices('AAPL', '1d', '1m') LIMIT 100;

-- Get 1-hour interval data for TSLA from the 5-day range
SELECT * FROM get_historical_prices('TSLA', '5d', '1h') LIMIT 100;

-- Get daily data for GOOGL from the 1-year range
SELECT * FROM get_historical_prices('GOOGL', '1y', '1d') LIMIT 365;

-- Get monthly data for SPY from the max range
SELECT * FROM get_historical_prices('SPY', 'max', '1mo');

-- Check what data is available for a specific symbol
SELECT * FROM get_historical_prices_by_symbol('AAPL');

-- Get the latest prices for a symbol
SELECT * FROM get_latest_historical_prices('AAPL', 5);

-- Get data within a specific date range
SELECT * FROM get_historical_price_range(
    'AAPL', 
    '1mo', 
    '1d', 
    '2025-08-01 00:00:00'::TIMESTAMP, 
    '2025-09-01 00:00:00'::TIMESTAMP
);
*/