-- ----------------------------------------------------------------------------
-- Function: upsert_options_chain (Updated to match options_chain table structure)
-- ----------------------------------------------------------------------------

-- Tested 

CREATE OR REPLACE FUNCTION upsert_options_chain(
    -- Required parameters (no defaults)
    p_symbol TEXT,
    p_underlying_symbol TEXT,
    p_expiration DATE,
    p_strike NUMERIC,
    p_option_type TEXT,
    p_data_provider TEXT,
    
    -- Exchange parameters (simplified, matching company function)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Optional options parameters (with defaults)
    p_bid NUMERIC DEFAULT NULL,
    p_ask NUMERIC DEFAULT NULL,
    p_last_price NUMERIC DEFAULT NULL,
    p_volume INTEGER DEFAULT NULL,
    p_open_interest INTEGER DEFAULT NULL,
    p_implied_volatility NUMERIC DEFAULT NULL,
    p_delta NUMERIC DEFAULT NULL,
    p_gamma NUMERIC DEFAULT NULL,
    p_theta NUMERIC DEFAULT NULL,
    p_vega NUMERIC DEFAULT NULL,
    p_rho NUMERIC DEFAULT NULL,
    p_intrinsic_value NUMERIC DEFAULT NULL,
    p_extrinsic_value NUMERIC DEFAULT NULL,
    p_time_value NUMERIC DEFAULT NULL,
    p_quote_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
    v_exchange_id BIGINT;
BEGIN
    -- Step 1: Handle exchange upsert if exchange data is provided
    IF p_exchange_code IS NOT NULL THEN
        -- Call the exchange upsert function
        SELECT upsert_exchange(
            p_exchange_code,
            p_exchange_name,
            p_exchange_country,
            p_exchange_timezone
        ) INTO v_exchange_id;
    END IF;

    -- Step 2: Insert/update options chain data
    INSERT INTO options_chain (
        symbol, underlying_symbol, exchange_id, strike, expiration, option_type,
        bid, ask, last_price, volume, open_interest, implied_volatility,
        delta, gamma, theta, vega, rho, intrinsic_value, extrinsic_value, time_value,
        quote_timestamp, data_provider, created_at, updated_at
    )
    VALUES (
        p_symbol, p_underlying_symbol, v_exchange_id, p_strike, p_expiration, p_option_type,
        p_bid, p_ask, p_last_price, p_volume, p_open_interest, p_implied_volatility,
        p_delta, p_gamma, p_theta, p_vega, p_rho, p_intrinsic_value, p_extrinsic_value, p_time_value,
        p_quote_timestamp, p_data_provider, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, quote_timestamp, data_provider) DO UPDATE SET
        underlying_symbol = COALESCE(EXCLUDED.underlying_symbol, options_chain.underlying_symbol),
        exchange_id = COALESCE(EXCLUDED.exchange_id, options_chain.exchange_id),
        strike = COALESCE(EXCLUDED.strike, options_chain.strike),
        expiration = COALESCE(EXCLUDED.expiration, options_chain.expiration),
        option_type = COALESCE(EXCLUDED.option_type, options_chain.option_type),
        bid = COALESCE(EXCLUDED.bid, options_chain.bid),
        ask = COALESCE(EXCLUDED.ask, options_chain.ask),
        last_price = COALESCE(EXCLUDED.last_price, options_chain.last_price),
        volume = COALESCE(EXCLUDED.volume, options_chain.volume),
        open_interest = COALESCE(EXCLUDED.open_interest, options_chain.open_interest),
        implied_volatility = COALESCE(EXCLUDED.implied_volatility, options_chain.implied_volatility),
        delta = COALESCE(EXCLUDED.delta, options_chain.delta),
        gamma = COALESCE(EXCLUDED.gamma, options_chain.gamma),
        theta = COALESCE(EXCLUDED.theta, options_chain.theta),
        vega = COALESCE(EXCLUDED.vega, options_chain.vega),
        rho = COALESCE(EXCLUDED.rho, options_chain.rho),
        intrinsic_value = COALESCE(EXCLUDED.intrinsic_value, options_chain.intrinsic_value),
        extrinsic_value = COALESCE(EXCLUDED.extrinsic_value, options_chain.extrinsic_value),
        time_value = COALESCE(EXCLUDED.time_value, options_chain.time_value),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_options_chain IS 'Upserts options chain data with conflict resolution on symbol, quote_timestamp, and data_provider. Handles exchange upsert automatically.';
-- ----------------------------------------------------------------------------
-- Test script for Supabase SQL Editor 
-- ----------------------------------------------------------------------------
/*
-- Test insert: new options chain with automatic exchange handling
SELECT upsert_options_chain(
    p_symbol => 'AAPL240315C00150000',
    p_underlying_symbol => 'AAPL',
    p_expiration => '2024-03-15'::DATE,
    p_strike => 150.00,
    p_option_type => 'call',
    p_data_provider => 'polygon',
    
    -- Exchange information
    p_exchange_code => 'NASDAQ',
    p_exchange_name => 'NASDAQ Stock Market',
    p_exchange_country => 'USA',
    p_exchange_timezone => 'America/New_York',
    
    -- Options data
    p_bid => 12.40,
    p_ask => 12.60,
    p_last_price => 12.50,
    p_volume => 150,
    p_open_interest => 1250,
    p_implied_volatility => 0.25,
    p_delta => 0.65,
    p_gamma => 0.012,
    p_theta => -0.08,
    p_vega => 0.15,
    p_rho => 0.45,
    p_intrinsic_value => 5.00,
    p_extrinsic_value => 2.50,
    p_time_value => 7.50,
    p_quote_timestamp => NOW()::TIMESTAMP  -- Cast to TIMESTAMP instead of TIMESTAMP WITH TIME ZONE
);
);

-- Test update: same option with new price data
SELECT upsert_options_chain(
    p_symbol => 'AAPL240315C00150000',
    p_underlying_symbol => 'AAPL',
    p_expiration => '2024-03-15',
    p_strike => 150.00,
    p_option_type => 'call',
    p_data_provider => 'polygon',
    p_last_price => 13.25,
    p_bid => 13.15,
    p_ask => 13.35,
    p_volume => 275
);
*/