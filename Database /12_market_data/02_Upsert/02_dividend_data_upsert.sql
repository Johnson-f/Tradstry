-- Dividend Data Upsert Function
-- Handles INSERT or UPDATE operations for dividend_data table
-- Uses PostgreSQL's ON CONFLICT for atomic upsert operations

CREATE OR REPLACE FUNCTION upsert_dividend_data(
    p_symbol VARCHAR(20),
    p_exchange_id INTEGER DEFAULT NULL,
    p_declaration_date DATE DEFAULT NULL,
    p_ex_dividend_date DATE,
    p_record_date DATE DEFAULT NULL,
    p_payment_date DATE DEFAULT NULL,
    p_dividend_amount DECIMAL(10,4),
    p_dividend_type VARCHAR(20) DEFAULT 'regular',
    p_currency VARCHAR(3) DEFAULT 'USD',
    p_frequency VARCHAR(20) DEFAULT NULL,
    p_dividend_status VARCHAR(20) DEFAULT 'active',
    p_dividend_yield DECIMAL(7,4) DEFAULT NULL,
    p_payout_ratio DECIMAL(7,4) DEFAULT NULL,
    p_consecutive_years INTEGER DEFAULT NULL,
    p_qualified_dividend BOOLEAN DEFAULT TRUE,
    p_tax_rate DECIMAL(7,4) DEFAULT NULL,
    p_fiscal_year INTEGER DEFAULT NULL,
    p_fiscal_quarter INTEGER DEFAULT NULL,
    p_data_provider VARCHAR(50)
)
RETURNS INTEGER AS $$
DECLARE
    result_id INTEGER;
BEGIN
    -- Attempt to insert or update the dividend data record
    INSERT INTO dividend_data (
        symbol,
        exchange_id,
        declaration_date,
        ex_dividend_date,
        record_date,
        payment_date,
        dividend_amount,
        dividend_type,
        currency,
        frequency,
        dividend_status,
        dividend_yield,
        payout_ratio,
        consecutive_years,
        qualified_dividend,
        tax_rate,
        fiscal_year,
        fiscal_quarter,
        data_provider,
        updated_at
    ) VALUES (
        p_symbol,
        p_exchange_id,
        p_declaration_date,
        p_ex_dividend_date,
        p_record_date,
        p_payment_date,
        p_dividend_amount,
        p_dividend_type,
        p_currency,
        p_frequency,
        p_dividend_status,
        p_dividend_yield,
        p_payout_ratio,
        p_consecutive_years,
        p_qualified_dividend,
        p_tax_rate,
        p_fiscal_year,
        p_fiscal_quarter,
        p_data_provider,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, ex_dividend_date, data_provider)
    DO UPDATE SET
        exchange_id = EXCLUDED.exchange_id,
        declaration_date = EXCLUDED.declaration_date,
        record_date = EXCLUDED.record_date,
        payment_date = EXCLUDED.payment_date,
        dividend_amount = EXCLUDED.dividend_amount,
        dividend_type = EXCLUDED.dividend_type,
        currency = EXCLUDED.currency,
        frequency = EXCLUDED.frequency,
        dividend_status = EXCLUDED.dividend_status,
        dividend_yield = EXCLUDED.dividend_yield,
        payout_ratio = EXCLUDED.payout_ratio,
        consecutive_years = EXCLUDED.consecutive_years,
        qualified_dividend = EXCLUDED.qualified_dividend,
        tax_rate = EXCLUDED.tax_rate,
        fiscal_year = EXCLUDED.fiscal_year,
        fiscal_quarter = EXCLUDED.fiscal_quarter,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO result_id;

    -- Log the operation for audit purposes
    RAISE NOTICE 'Dividend data upserted for symbol % ex-dividend date % from provider %, ID: %',
                 p_symbol, p_ex_dividend_date, p_data_provider, result_id;

    RETURN result_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Error upserting dividend data for symbol % ex-dividend %: %',
                       p_symbol, p_ex_dividend_date, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_dividend_data(
    VARCHAR(20), INTEGER, DATE, DATE, DATE, DATE, DECIMAL(10,4),
    VARCHAR(20), VARCHAR(3), VARCHAR(20), VARCHAR(20), DECIMAL(7,4),
    DECIMAL(7,4), INTEGER, BOOLEAN, DECIMAL(7,4), INTEGER, INTEGER, VARCHAR(50)
) IS 'Upserts dividend data. Inserts new record or updates existing based on symbol + ex_dividend_date + data_provider.';

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Example 1: Insert new dividend data
SELECT upsert_dividend_data(
    'AAPL',           -- symbol
    1,               -- exchange_id
    '2024-02-01',    -- declaration_date
    '2024-02-09',    -- ex_dividend_date
    '2024-02-12',    -- record_date
    '2024-02-16',    -- payment_date
    0.24,            -- dividend_amount
    'quarterly',     -- dividend_type
    'USD',           -- currency
    'quarterly',     -- frequency
    'active',        -- dividend_status
    0.0052,          -- dividend_yield
    0.25,            -- payout_ratio
    10,              -- consecutive_years
    TRUE,            -- qualified_dividend
    0.15,            -- tax_rate
    2024,            -- fiscal_year
    1,               -- fiscal_quarter
    'fmp'            -- data_provider
);

-- Example 2: Update existing dividend data
SELECT upsert_dividend_data(
    'AAPL',
    1,
    '2024-02-01',
    '2024-02-09',    -- Same ex-dividend date
    '2024-02-12',
    '2024-02-16',
    0.25,            -- Updated dividend amount
    'quarterly',
    'USD',
    'quarterly',
    'active',
    0.0055,          -- Updated yield
    0.26,            -- Updated payout ratio
    11,              -- Updated consecutive years
    TRUE,
    0.15,
    2024,
    1,
    'fmp'            -- Same provider
);

-- Example 3: Handle different providers for same dividend
-- Provider A (e.g., fmp)
SELECT upsert_dividend_data('AAPL', 1, '2024-02-01', '2024-02-09', '2024-02-12', '2024-02-16', 0.24, 'quarterly', 'USD', 'quarterly', 'active', 0.0052, 0.25, 10, TRUE, 0.15, 2024, 1, 'fmp');

-- Provider B (e.g., alpha_vantage) - creates separate record
SELECT upsert_dividend_data('AAPL', 1, '2024-02-01', '2024-02-09', '2024-02-12', '2024-02-16', 0.24, 'quarterly', 'USD', 'quarterly', 'active', 0.0051, 0.25, 10, TRUE, 0.15, 2024, 1, 'alpha_vantage');

-- Batch processing example
-- Your application can call this function in a loop for bulk dividend updates
*/

-- =====================================================
-- FUNCTION FEATURES
-- =====================================================

/*
FUNCTION FEATURES:

1. ATOMIC UPSERT:
   - Uses PostgreSQL ON CONFLICT for thread-safe operations
   - Either inserts new record or updates existing
   - Based on (symbol, ex_dividend_date, data_provider) unique constraint
   - No race conditions or duplicate data

2. COMPREHENSIVE PARAMETERS:
   - All dividend_data table columns supported
   - Optional parameters with sensible defaults
   - Type-safe with proper data types for all parameters

3. MULTI-PROVIDER SUPPORT:
   - Allows same dividend to be stored from different providers
   - Each provider can have slightly different data
   - Enables data comparison and validation

4. AUDIT TRAIL:
   - Automatically updates updated_at timestamp
   - Logs operations for monitoring
   - Returns the record ID for reference

5. ERROR HANDLING:
   - Comprehensive exception handling
   - Meaningful error messages with context
   - Transaction-safe operations

INTEGRATION NOTES:

- Call this function from your market data ingestion processes
- Use the returned ID for logging or further processing
- Handle exceptions in your application code
- Consider batch processing for multiple dividend updates
- Different providers may have slightly different data for the same dividend
*/
