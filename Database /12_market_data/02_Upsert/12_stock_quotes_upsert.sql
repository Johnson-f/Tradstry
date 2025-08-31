-- Stock Quotes Upsert Function
-- Handles INSERT or UPDATE operations for stock_quotes table
-- Uses PostgreSQL's ON CONFLICT for atomic upsert operations

CREATE OR REPLACE FUNCTION upsert_stock_quote(
    p_symbol VARCHAR(20),
    p_exchange_id INTEGER DEFAULT NULL,
    p_price DECIMAL(15,4) DEFAULT NULL,
    p_change_amount DECIMAL(15,4) DEFAULT NULL,
    p_change_percent DECIMAL(7,4) DEFAULT NULL,
    p_volume BIGINT DEFAULT NULL,
    p_open_price DECIMAL(15,4) DEFAULT NULL,
    p_high_price DECIMAL(15,4) DEFAULT NULL,
    p_low_price DECIMAL(15,4) DEFAULT NULL,
    p_previous_close DECIMAL(15,4) DEFAULT NULL,
    p_quote_timestamp TIMESTAMP,
    p_data_provider VARCHAR(50)
)
RETURNS INTEGER AS $$
DECLARE
    result_id INTEGER;
BEGIN
    -- Attempt to insert or update the stock quote record
    INSERT INTO stock_quotes (
        symbol,
        exchange_id,
        price,
        change_amount,
        change_percent,
        volume,
        open_price,
        high_price,
        low_price,
        previous_close,
        quote_timestamp,
        data_provider,
        updated_at
    ) VALUES (
        p_symbol,
        p_exchange_id,
        p_price,
        p_change_amount,
        p_change_percent,
        p_volume,
        p_open_price,
        p_high_price,
        p_low_price,
        p_previous_close,
        p_quote_timestamp,
        p_data_provider,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, quote_timestamp, data_provider)
    DO UPDATE SET
        exchange_id = EXCLUDED.exchange_id,
        price = EXCLUDED.price,
        change_amount = EXCLUDED.change_amount,
        change_percent = EXCLUDED.change_percent,
        volume = EXCLUDED.volume,
        open_price = EXCLUDED.open_price,
        high_price = EXCLUDED.high_price,
        low_price = EXCLUDED.low_price,
        previous_close = EXCLUDED.previous_close,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO result_id;

    -- Log the operation for audit purposes
    RAISE NOTICE 'Stock quote upserted for symbol % at % from provider %, ID: %',
                 p_symbol, p_quote_timestamp, p_data_provider, result_id;

    RETURN result_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Error upserting stock quote for symbol %: %',
                       p_symbol, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_stock_quote(
    VARCHAR(20), INTEGER, DECIMAL(15,4), DECIMAL(15,4), DECIMAL(7,4),
    BIGINT, DECIMAL(15,4), DECIMAL(15,4), DECIMAL(15,4), DECIMAL(15,4),
    TIMESTAMP, VARCHAR(50)
) IS 'Upserts stock quote data. Inserts new record or updates existing based on symbol + quote_timestamp + data_provider.';

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Example 1: Insert new stock quote
SELECT upsert_stock_quote(
    'AAPL',               -- symbol
    1,                    -- exchange_id
    185.92,               -- price
    2.34,                 -- change_amount
    1.28,                 -- change_percent (1.28%)
    45678900,             -- volume
    183.58,               -- open_price
    186.95,               -- high_price
    183.01,               -- low_price
    183.58,               -- previous_close
    '2024-01-15 16:00:00', -- quote_timestamp
    'alpha_vantage'       -- data_provider
);

-- Example 2: Update existing quote with latest data
SELECT upsert_stock_quote(
    'AAPL',               -- Same symbol
    1,                    -- Same exchange_id
    186.45,               -- Updated price
    2.87,                 -- Updated change_amount
    1.57,                 -- Updated change_percent
    48901234,             -- Updated volume
    183.58,               -- Same open_price
    187.34,               -- Updated high_price
    183.01,               -- Same low_price
    183.58,               -- Same previous_close
    '2024-01-15 16:05:00', -- Updated timestamp
    'alpha_vantage'       -- Same data_provider
);

-- Example 3: Handle after-hours trading
SELECT upsert_stock_quote(
    'NVDA',
    1,
    875.50,               -- After-hours price
    15.75,                -- Change from close
    1.83,                 -- Change percent
    1234567,              -- After-hours volume
    859.75,               -- Regular session open
    875.00,               -- Regular session high
    845.25,               -- Regular session low
    859.75,               -- Previous close
    '2024-01-15 18:30:00', -- After-hours timestamp
    'finnhub'
);

-- Example 4: Bulk quote updates
-- Your application can call this function in a loop for real-time quote updates
-- This is typically done for streaming price data
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
   - All stock_quotes table columns supported
   - Optional parameters with sensible defaults
   - Type-safe with proper data types for all parameters

3. REAL-TIME DATA SUPPORT:
   - Supports real-time quote updates
   - Handles after-hours trading data
   - Tracks price changes and volume updates

4. MULTI-PROVIDER SUPPORT:
   - Allows same stock to be quoted from different providers
   - Enables data comparison and validation
   - Tracks which provider delivered the quote

5. AUDIT TRAIL:
   - Automatically updates updated_at timestamp
   - Logs operations for monitoring
   - Returns the record ID for reference

INTEGRATION NOTES:

- Call this function from your market data ingestion processes
- Use the returned ID for logging or further processing
- Handle exceptions in your application code
- Consider batch processing for multiple stock quotes
- Function supports real-time streaming quote updates
*/
