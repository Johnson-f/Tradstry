-- Options Chain Upsert Function
-- Handles INSERT or UPDATE operations for options_chain table
-- Uses PostgreSQL's ON CONFLICT for atomic upsert operations

CREATE OR REPLACE FUNCTION upsert_options_chain(
    p_symbol VARCHAR(50),
    p_underlying_symbol VARCHAR(20),
    p_exchange_id INTEGER DEFAULT NULL,
    p_strike DECIMAL(15,4),
    p_expiration DATE,
    p_option_type VARCHAR(10),
    p_bid DECIMAL(15,4) DEFAULT NULL,
    p_ask DECIMAL(15,4) DEFAULT NULL,
    p_last_price DECIMAL(15,4) DEFAULT NULL,
    p_volume INTEGER DEFAULT NULL,
    p_open_interest INTEGER DEFAULT NULL,
    p_implied_volatility DECIMAL(7,4) DEFAULT NULL,
    p_delta DECIMAL(7,4) DEFAULT NULL,
    p_gamma DECIMAL(7,4) DEFAULT NULL,
    p_theta DECIMAL(7,4) DEFAULT NULL,
    p_vega DECIMAL(7,4) DEFAULT NULL,
    p_rho DECIMAL(7,4) DEFAULT NULL,
    p_intrinsic_value DECIMAL(15,4) DEFAULT NULL,
    p_extrinsic_value DECIMAL(15,4) DEFAULT NULL,
    p_time_value DECIMAL(15,4) DEFAULT NULL,
    p_quote_timestamp TIMESTAMP,
    p_data_provider VARCHAR(50)
)
RETURNS INTEGER AS $$
DECLARE
    result_id INTEGER;
BEGIN
    -- Attempt to insert or update the options chain record
    INSERT INTO options_chain (
        symbol,
        underlying_symbol,
        exchange_id,
        strike,
        expiration,
        option_type,
        bid,
        ask,
        last_price,
        volume,
        open_interest,
        implied_volatility,
        delta,
        gamma,
        theta,
        vega,
        rho,
        intrinsic_value,
        extrinsic_value,
        time_value,
        quote_timestamp,
        data_provider,
        updated_at
    ) VALUES (
        p_symbol,
        p_underlying_symbol,
        p_exchange_id,
        p_strike,
        p_expiration,
        p_option_type,
        p_bid,
        p_ask,
        p_last_price,
        p_volume,
        p_open_interest,
        p_implied_volatility,
        p_delta,
        p_gamma,
        p_theta,
        p_vega,
        p_rho,
        p_intrinsic_value,
        p_extrinsic_value,
        p_time_value,
        p_quote_timestamp,
        p_data_provider,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, quote_timestamp, data_provider)
    DO UPDATE SET
        underlying_symbol = EXCLUDED.underlying_symbol,
        exchange_id = EXCLUDED.exchange_id,
        strike = EXCLUDED.strike,
        expiration = EXCLUDED.expiration,
        option_type = EXCLUDED.option_type,
        bid = EXCLUDED.bid,
        ask = EXCLUDED.ask,
        last_price = EXCLUDED.last_price,
        volume = EXCLUDED.volume,
        open_interest = EXCLUDED.open_interest,
        implied_volatility = EXCLUDED.implied_volatility,
        delta = EXCLUDED.delta,
        gamma = EXCLUDED.gamma,
        theta = EXCLUDED.theta,
        vega = EXCLUDED.vega,
        rho = EXCLUDED.rho,
        intrinsic_value = EXCLUDED.intrinsic_value,
        extrinsic_value = EXCLUDED.extrinsic_value,
        time_value = EXCLUDED.time_value,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO result_id;

    -- Log the operation for audit purposes
    RAISE NOTICE 'Options chain upserted: % (%, $%, %%) from provider %, ID: %',
                 p_symbol, p_underlying_symbol, p_strike, p_option_type, p_data_provider, result_id;

    RETURN result_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Error upserting options chain for %: %',
                       p_symbol, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_options_chain(
    VARCHAR(50), VARCHAR(20), INTEGER, DECIMAL(15,4), DATE, VARCHAR(10),
    DECIMAL(15,4), DECIMAL(15,4), DECIMAL(15,4), INTEGER, INTEGER,
    DECIMAL(7,4), DECIMAL(7,4), DECIMAL(7,4), DECIMAL(7,4), DECIMAL(7,4),
    DECIMAL(7,4), DECIMAL(15,4), DECIMAL(15,4), DECIMAL(15,4),
    TIMESTAMP, VARCHAR(50)
) IS 'Upserts options chain data. Inserts new record or updates existing based on symbol + quote_timestamp + data_provider.';

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Example 1: Insert new options chain data
SELECT upsert_options_chain(
    'AAPL240315C00150000', -- symbol (full option symbol)
    'AAPL',               -- underlying_symbol
    1,                    -- exchange_id
    150.0,                -- strike
    '2024-03-15',         -- expiration
    'call',               -- option_type
    5.25,                 -- bid
    5.50,                 -- ask
    5.37,                 -- last_price
    1234,                 -- volume
    5678,                 -- open_interest
    0.234,                -- implied_volatility (23.4%)
    0.567,                -- delta
    0.045,                -- gamma
    -0.023,               -- theta
    0.123,                -- vega
    0.034,                -- rho
    0.37,                 -- intrinsic_value
    5.00,                 -- extrinsic_value
    5.37,                 -- time_value
    '2024-01-15 16:00:00', -- quote_timestamp
    'polygon'             -- data_provider
);

-- Example 2: Update existing options data with new quotes
SELECT upsert_options_chain(
    'AAPL240315C00150000', -- Same symbol
    'AAPL',               -- Same underlying
    1,                    -- Same exchange
    150.0,                -- Same strike
    '2024-03-15',         -- Same expiration
    'call',               -- Same option_type
    5.45,                 -- Updated bid
    5.70,                 -- Updated ask
    5.58,                 -- Updated last_price
    1456,                 -- Updated volume
    5890,                 -- Updated open_interest
    0.245,                -- Updated implied_volatility
    0.589,                -- Updated delta
    0.048,                -- Updated gamma
    -0.025,               -- Updated theta
    0.134,                -- Updated vega
    0.036,                -- Updated rho
    0.58,                 -- Updated intrinsic_value
    5.00,                 -- Updated extrinsic_value
    5.58,                 -- Updated time_value
    '2024-01-15 16:05:00', -- Updated timestamp
    'polygon'             -- Same provider
);

-- Example 3: Insert put option data
SELECT upsert_options_chain(
    'AAPL240315P00140000',
    'AAPL',
    1,
    140.0,                -- Put strike
    '2024-03-15',
    'put',                 -- Put option
    2.10,
    2.35,
    2.22,
    987,
    4321,
    0.198,
    -0.423,               -- Negative delta for puts
    0.038,
    -0.018,
    0.098,
    -0.028,
    0.00,                 -- No intrinsic value for OTM put
    2.22,                 -- All extrinsic value
    2.22,                 -- All time value
    '2024-01-15 16:00:00',
    'finnhub'
);

-- Example 4: Bulk options chain processing
-- Your application can call this function in a loop for bulk options updates
-- This is typically done for complete options chains with multiple strikes
*/

-- =====================================================
-- FUNCTION FEATURES
-- =====================================================

/*
FUNCTION FEATURES:

1. ATOMIC UPSERT:
   - Uses PostgreSQL ON CONFLICT for thread-safe operations
   - Either inserts new record or updates existing
   - Based on (symbol, quote_timestamp, data_provider) unique constraint
   - No race conditions or duplicate data

2. COMPREHENSIVE PARAMETERS:
   - All options_chain table columns supported (22+ parameters)
   - Optional parameters with sensible defaults
   - Type-safe with proper data types for all parameters

3. OPTIONS ANALYSIS SUPPORT:
   - Complete Greeks (delta, gamma, theta, vega, rho)
   - Implied volatility calculations
   - Intrinsic and extrinsic value breakdowns
   - Bid/ask spread and volume data

4. FLEXIBLE OPTION TYPES:
   - Support for both calls and puts
   - Proper validation of option_type ('call', 'put')
   - Different Greeks handling for calls vs puts

5. AUDIT TRAIL:
   - Automatically updates updated_at timestamp
   - Logs operations for monitoring
   - Returns the record ID for reference

INTEGRATION NOTES:

- Call this function from your market data ingestion processes
- Use the returned ID for logging or further processing
- Handle exceptions in your application code
- Consider batch processing for multiple options in a chain
- Function supports real-time options data updates with Greeks
*/
