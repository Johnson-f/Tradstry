-- ----------------------------------------------------------------------------
-- Function: upsert_historical_price
-- Updated to match the new historical_prices table structure
-- ----------------------------------------------------------------------------

-- Tested 

CREATE OR REPLACE FUNCTION upsert_historical_price(
    p_symbol TEXT,
    p_date DATE,
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
    -- Step 1: Handle exchange upsert if exchange data is provided
    IF p_exchange_code IS NOT NULL THEN
        SELECT upsert_exchange(
            p_exchange_code,
            p_exchange_name,
            p_exchange_country,
            p_exchange_timezone
        ) INTO v_exchange_id;
    END IF;

    -- Step 2: Insert/update historical price data
    INSERT INTO historical_prices (
        symbol, exchange_id, date, open, high, low, close, adjusted_close, volume, 
        dividend, split_ratio, data_provider,
        created_at, updated_at
    )
    VALUES (
        p_symbol, v_exchange_id, p_date, p_open, p_high, p_low, p_close, p_adjusted_close, p_volume, 
        COALESCE(p_dividend, 0), COALESCE(p_split_ratio, 1.0), p_data_provider,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, date, data_provider) DO UPDATE SET
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


-- Example usage:
-- SELECT upsert_historical_price(
--     'AAPL',                    -- symbol
--     '2024-01-15'::DATE,        -- date
--     'alpha_vantage',           -- data_provider
--     'NASDAQ',                  -- exchange_code
--     'NASDAQ Stock Market',     -- exchange_name
--     'US',                      -- exchange_country
--     'America/New_York',        -- exchange_timezone
--     150.25,                    -- open
--     152.75,                    -- high
--     149.80,                    -- low
--     151.50,                    -- close
--     151.50,                    -- adjusted_close
--     25000000,                  -- volume
--     0.25,                      -- dividend
--     1.0                        -- split_ratio
-- );