-- Historical Prices Upsert Function
-- Handles INSERT or UPDATE operations for historical_prices table
-- Uses PostgreSQL's ON CONFLICT for atomic upsert operations

CREATE OR REPLACE FUNCTION upsert_historical_price(
    p_symbol VARCHAR(20),
    p_exchange_id INTEGER DEFAULT NULL,
    p_date DATE,
    p_open DECIMAL(15,4) DEFAULT NULL,
    p_high DECIMAL(15,4) DEFAULT NULL,
    p_low DECIMAL(15,4) DEFAULT NULL,
    p_close DECIMAL(15,4) DEFAULT NULL,
    p_volume BIGINT DEFAULT NULL,
    p_adjusted_close DECIMAL(15,4) DEFAULT NULL,
    p_dividend DECIMAL(10,4) DEFAULT 0,
    p_split_ratio DECIMAL(10,4) DEFAULT 1.0,
    p_data_provider VARCHAR(50)
)
RETURNS INTEGER AS $$
DECLARE
    result_id INTEGER;
BEGIN
    -- Attempt to insert or update the historical price record
    INSERT INTO historical_prices (
        symbol,
        exchange_id,
        date,
        open,
        high,
        low,
        close,
        volume,
        adjusted_close,
        dividend,
        split_ratio,
        data_provider,
        updated_at
    ) VALUES (
        p_symbol,
        p_exchange_id,
        p_date,
        p_open,
        p_high,
        p_low,
        p_close,
        p_volume,
        p_adjusted_close,
        p_dividend,
        p_split_ratio,
        p_data_provider,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, date, data_provider)
    DO UPDATE SET
        exchange_id = EXCLUDED.exchange_id,
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        adjusted_close = EXCLUDED.adjusted_close,
        dividend = EXCLUDED.dividend,
        split_ratio = EXCLUDED.split_ratio,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO result_id;

    -- Log the operation for audit purposes
    RAISE NOTICE 'Historical price upserted for symbol % on % from provider %, ID: %',
                 p_symbol, p_date, p_data_provider, result_id;

    RETURN result_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Error upserting historical price for symbol % on %: %',
                       p_symbol, p_date, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_historical_price(
    VARCHAR(20), INTEGER, DATE, DECIMAL(15,4), DECIMAL(15,4),
    DECIMAL(15,4), DECIMAL(15,4), BIGINT, DECIMAL(15,4),
    DECIMAL(10,4), DECIMAL(10,4), VARCHAR(50)
) IS 'Upserts historical price data. Inserts new record or updates existing based on symbol + date + data_provider.';

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Example 1: Insert new historical price data
SELECT upsert_historical_price(
    'AAPL',           -- symbol
    1,               -- exchange_id
    '2024-01-15',    -- date
    185.92,          -- open
    187.34,          -- high
    183.01,          -- low
    184.25,          -- close
    45123456,        -- volume
    184.25,          -- adjusted_close
    0.00,            -- dividend
    1.0,             -- split_ratio
    'alpha_vantage'  -- data_provider
);

-- Example 2: Update existing historical price with adjusted data
SELECT upsert_historical_price(
    'AAPL',           -- Same symbol
    1,               -- Same exchange_id
    '2024-01-15',    -- Same date
    185.92,          -- Same open
    187.34,          -- Same high
    183.01,          -- Same low
    184.25,          -- Same close
    45123456,        -- Same volume
    182.85,          -- Updated adjusted_close (after split adjustment)
    0.00,            -- Same dividend
    1.0,             -- Same split_ratio
    'alpha_vantage'  -- Same data_provider
);

-- Example 3: Insert price data with dividend
SELECT upsert_historical_price(
    'MSFT',
    1,
    '2024-02-21',    -- Dividend payment date
    401.25,
    402.10,
    397.80,
    399.75,
    34567890,
    399.75,
    0.75,            -- Quarterly dividend of $0.75
    1.0,
    'finnhub'
);

-- Example 4: Insert price data with stock split
SELECT upsert_historical_price(
    'NVDA',
    1,
    '2024-06-10',    -- Day before 10-for-1 split
    1200.50,
    1250.75,
    1180.25,
    1225.00,
    67890123,
    122.50,          -- Adjusted for 10-for-1 split
    0.00,
    0.1,             -- 10-for-1 split ratio
    'polygon'
);

-- Example 5: Batch insert historical prices
-- Your application can loop through daily price data and call this function
-- This is typically done in bulk data ingestion processes

-- Error handling example
-- The function will raise an exception if there's an error
-- Your application should handle this appropriately
*/

-- =====================================================
-- FUNCTION FEATURES
-- =====================================================

/*
FUNCTION FEATURES:

1. ATOMIC UPSERT:
   - Uses PostgreSQL ON CONFLICT for thread-safe operations
   - Either inserts new record or updates existing
   - Based on (symbol, date, data_provider) unique constraint
   - No race conditions or duplicate data

2. COMPREHENSIVE PARAMETERS:
   - All historical_prices table columns supported
   - Optional parameters with sensible defaults
   - Type-safe with proper data types for all parameters

3. CORPORATE ACTIONS SUPPORT:
   - Dividend tracking with dividend amounts
   - Stock split ratio adjustments
   - Adjusted close price calculations

4. TIME SERIES OPTIMIZATION:
   - Designed for efficient time series queries
   - Supports date range filtering and analysis
   - Optimized for historical chart generation

5. AUDIT TRAIL:
   - Automatically updates updated_at timestamp
   - Logs operations for monitoring
   - Returns the record ID for reference

INTEGRATION NOTES:

- Call this function from your market data ingestion processes
- Use the returned ID for logging or further processing
- Handle exceptions in your application code
- Consider batch processing for multiple historical price updates
- Function supports corporate actions like dividends and stock splits
*/
