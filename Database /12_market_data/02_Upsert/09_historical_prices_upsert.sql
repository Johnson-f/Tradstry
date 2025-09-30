CREATE OR REPLACE FUNCTION upsert_historical_price(
    p_symbol TEXT,
    p_timestamp_utc TIMESTAMP,
    p_time_interval TEXT,
    p_data_provider TEXT,
    
    -- Exchange parameters (for automatic exchange handling)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Price data parameters
    p_open DECIMAL(15,4) DEFAULT NULL,
    p_high DECIMAL(15,4) DEFAULT NULL,
    p_low DECIMAL(15,4) DEFAULT NULL,
    p_close DECIMAL(15,4) DEFAULT NULL,
    p_adjusted_close DECIMAL(15,4) DEFAULT NULL,
    p_volume BIGINT DEFAULT NULL,
    p_dividend DECIMAL(10,4) DEFAULT NULL,
    p_split_ratio DECIMAL(10,4) DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
    v_exchange_id INTEGER;
BEGIN
    -- Step 1: Validate time_interval parameter only
    IF p_time_interval NOT IN ('5m', '15m', '30m', '1h', '1d', '1wk', '1mo') THEN
        RAISE EXCEPTION 'Invalid time_interval: %. Must be one of: 5m, 15m, 30m, 1h, 1d, 1wk, 1mo', p_time_interval;
    END IF;

    -- Step 2: Handle exchange upsert if exchange data is provided
    IF p_exchange_code IS NOT NULL THEN
        SELECT upsert_exchange(
            p_exchange_code,
            p_exchange_name,
            p_exchange_country,
            p_exchange_timezone
        ) INTO v_exchange_id;
    END IF;

    -- Step 3: Insert/update historical price data (interval-only storage)
    INSERT INTO historical_prices (
        symbol, exchange_id, timestamp_utc, time_interval,
        open, high, low, close, adjusted_close, volume, 
        dividend, split_ratio, data_provider,
        created_at, updated_at
    )
    VALUES (
        p_symbol, v_exchange_id, p_timestamp_utc, p_time_interval,
        p_open, p_high, p_low, p_close, p_adjusted_close, p_volume, 
        COALESCE(p_dividend, 0), COALESCE(p_split_ratio, 1.0), p_data_provider,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, timestamp_utc, time_interval, data_provider) DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, historical_prices.exchange_id),
        open = COALESCE(EXCLUDED.open, historical_prices.open),
        high = COALESCE(EXCLUDED.high, historical_prices.high),
        low = COALESCE(EXCLUDED.low, historical_prices.low),
        close = COALESCE(EXCLUDED.close, historical_prices.close),
        adjusted_close = COALESCE(EXCLUDED.adjusted_close, historical_prices.adjusted_close),
        volume = COALESCE(EXCLUDED.volume, historical_prices.volume),
        dividend = COALESCE(EXCLUDED.dividend, historical_prices.dividend),
        split_ratio = COALESCE(EXCLUDED.split_ratio, historical_prices.split_ratio),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;


-- Example usage for 5-minute interval data:
-- SELECT upsert_historical_price(
--     'AAPL',                          -- symbol
--     '2025-09-12 14:55:00'::TIMESTAMP, -- timestamp_utc
--     '5m',                            -- time_interval (no range needed)
--     'alpha_vantage',                 -- data_provider
--     'NASDAQ',                        -- exchange_code
--     'NASDAQ Stock Market',           -- exchange_name
--     'US',                            -- exchange_country
--     'America/New_York',              -- exchange_timezone
--     394.15,                          -- open
--     394.16,                          -- high
--     393.7,                           -- low
--     393.75,                          -- close
--     NULL,                            -- adjusted_close (typically null for intraday)
--     218081,                          -- volume
--     NULL,                            -- dividend
--     1.0                              -- split_ratio
-- );

-- Example usage for daily data:
-- SELECT upsert_historical_price(
--     'AAPL',                          -- symbol
--     '2020-06-01 00:00:00'::TIMESTAMP, -- timestamp_utc (midnight for daily data)
--     '1d',                            -- time_interval (no range needed)
--     'alpha_vantage',                 -- data_provider
--     'NASDAQ',                        -- exchange_code
--     'NASDAQ Stock Market',           -- exchange_name
--     'US',                            -- exchange_country
--     'America/New_York',              -- exchange_timezone
--     57.2,                            -- open
--     72.51,                           -- high
--     56.94,                           -- low
--     71.99,                           -- close
--     71.99,                           -- adjusted_close
--     3836590500,                      -- volume
--     0.0,                             -- dividend
--     1.0                              -- split_ratio
-- );