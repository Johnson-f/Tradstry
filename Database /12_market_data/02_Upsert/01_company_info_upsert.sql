-- Company Info Upsert Function
-- Handles INSERT or UPDATE operations for company_info table
-- Uses PostgreSQL's ON CONFLICT for atomic upsert operations

CREATE OR REPLACE FUNCTION upsert_company_info(
    p_symbol VARCHAR(20),
    p_exchange_id INTEGER DEFAULT NULL,
    p_name VARCHAR(255) DEFAULT NULL,
    p_company_name VARCHAR(255) DEFAULT NULL,
    p_exchange VARCHAR(50) DEFAULT NULL,
    p_sector VARCHAR(100) DEFAULT NULL,
    p_industry VARCHAR(100) DEFAULT NULL,
    p_market_cap BIGINT DEFAULT NULL,
    p_employees INTEGER DEFAULT NULL,
    p_revenue BIGINT DEFAULT NULL,
    p_net_income BIGINT DEFAULT NULL,
    p_pe_ratio DECIMAL(10,2) DEFAULT NULL,
    p_pb_ratio DECIMAL(10,2) DEFAULT NULL,
    p_dividend_yield DECIMAL(7,4) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_website VARCHAR(500) DEFAULT NULL,
    p_ceo VARCHAR(255) DEFAULT NULL,
    p_headquarters VARCHAR(255) DEFAULT NULL,
    p_founded VARCHAR(50) DEFAULT NULL,
    p_phone VARCHAR(50) DEFAULT NULL,
    p_email VARCHAR(255) DEFAULT NULL,
    p_ipo_date DATE DEFAULT NULL,
    p_currency VARCHAR(3) DEFAULT 'USD',
    p_fiscal_year_end VARCHAR(10) DEFAULT NULL,
    p_data_provider VARCHAR(50)
)
RETURNS INTEGER AS $$
DECLARE
    result_id INTEGER;
BEGIN
    -- Attempt to insert or update the company info record
    INSERT INTO company_info (
        symbol,
        exchange_id,
        name,
        company_name,
        exchange,
        sector,
        industry,
        market_cap,
        employees,
        revenue,
        net_income,
        pe_ratio,
        pb_ratio,
        dividend_yield,
        description,
        website,
        ceo,
        headquarters,
        founded,
        phone,
        email,
        ipo_date,
        currency,
        fiscal_year_end,
        data_provider,
        updated_at
    ) VALUES (
        p_symbol,
        p_exchange_id,
        p_name,
        p_company_name,
        p_exchange,
        p_sector,
        p_industry,
        p_market_cap,
        p_employees,
        p_revenue,
        p_net_income,
        p_pe_ratio,
        p_pb_ratio,
        p_dividend_yield,
        p_description,
        p_website,
        p_ceo,
        p_headquarters,
        p_founded,
        p_phone,
        p_email,
        p_ipo_date,
        p_currency,
        p_fiscal_year_end,
        p_data_provider,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, data_provider)
    DO UPDATE SET
        exchange_id = EXCLUDED.exchange_id,
        name = EXCLUDED.name,
        company_name = EXCLUDED.company_name,
        exchange = EXCLUDED.exchange,
        sector = EXCLUDED.sector,
        industry = EXCLUDED.industry,
        market_cap = EXCLUDED.market_cap,
        employees = EXCLUDED.employees,
        revenue = EXCLUDED.revenue,
        net_income = EXCLUDED.net_income,
        pe_ratio = EXCLUDED.pe_ratio,
        pb_ratio = EXCLUDED.pb_ratio,
        dividend_yield = EXCLUDED.dividend_yield,
        description = EXCLUDED.description,
        website = EXCLUDED.website,
        ceo = EXCLUDED.ceo,
        headquarters = EXCLUDED.headquarters,
        founded = EXCLUDED.founded,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        ipo_date = EXCLUDED.ipo_date,
        currency = EXCLUDED.currency,
        fiscal_year_end = EXCLUDED.fiscal_year_end,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO result_id;

    -- Log the operation for audit purposes
    RAISE NOTICE 'Company info upserted for symbol % from provider %, ID: %',
                 p_symbol, p_data_provider, result_id;

    RETURN result_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Error upserting company info for symbol %: %',
                       p_symbol, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_company_info(
    VARCHAR(20), INTEGER, VARCHAR(255), VARCHAR(255), VARCHAR(50),
    VARCHAR(100), VARCHAR(100), BIGINT, INTEGER, BIGINT, BIGINT,
    DECIMAL(10,2), DECIMAL(10,2), DECIMAL(7,4), TEXT, VARCHAR(500),
    VARCHAR(255), VARCHAR(255), VARCHAR(50), VARCHAR(50), VARCHAR(255),
    DATE, VARCHAR(3), VARCHAR(10), VARCHAR(50)
) IS 'Upserts company information data. Inserts new record or updates existing based on symbol + data_provider.';

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Example 1: Insert new company info
SELECT upsert_company_info(
    'AAPL',           -- symbol
    1,               -- exchange_id
    'Apple Inc.',    -- name
    'Apple Inc.',    -- company_name
    'NASDAQ',        -- exchange
    'Technology',    -- sector
    'Consumer Electronics', -- industry
    2500000000000,   -- market_cap
    147000,          -- employees
    NULL,            -- revenue
    NULL,            -- net_income
    28.5,            -- pe_ratio
    8.2,             -- pb_ratio
    0.005,           -- dividend_yield
    'Apple Inc. designs...', -- description
    'https://www.apple.com', -- website
    'Tim Cook',      -- ceo
    'Cupertino, California', -- headquarters
    '1976',          -- founded
    NULL,            -- phone
    NULL,            -- email
    '1980-12-12',    -- ipo_date
    'USD',           -- currency
    '09-30',         -- fiscal_year_end
    'fmp'            -- data_provider
);

-- Example 2: Update existing company info (same function call)
SELECT upsert_company_info(
    'AAPL',
    1,
    'Apple Inc.',
    'Apple Inc.',
    'NASDAQ',
    'Technology',
    'Consumer Electronics',
    2600000000000,   -- Updated market cap
    150000,          -- Updated employee count
    365817000000,    -- Updated revenue
    93736000000,     -- Updated net income
    30.2,            -- Updated P/E ratio
    9.1,             -- Updated P/B ratio
    0.0048,          -- Updated dividend yield
    'Apple Inc. designs...', -- description
    'https://www.apple.com', -- website
    'Tim Cook',      -- ceo
    'Cupertino, California', -- headquarters
    '1976',          -- founded
    NULL,            -- phone
    NULL,            -- email
    '1980-12-12',    -- ipo_date
    'USD',           -- currency
    '09-30',         -- fiscal_year_end
    'fmp'            -- data_provider
);

-- Example 3: Batch upsert multiple companies
-- (This would typically be called from your application code)

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
   - No race conditions or duplicate data

2. COMPREHENSIVE PARAMETERS:
   - All company_info table columns supported
   - Optional parameters with sensible defaults
   - Handles NULL values appropriately

3. AUDIT TRAIL:
   - Automatically updates updated_at timestamp
   - Logs operations for monitoring
   - Returns the record ID for reference

4. ERROR HANDLING:
   - Comprehensive exception handling
   - Meaningful error messages
   - Transaction-safe operations

5. PERFORMANCE:
   - Efficient upsert operation
   - Minimal database round trips
   - Optimized for bulk operations

INTEGRATION NOTES:

- Call this function from your market data ingestion processes
- Use the returned ID for logging or further processing
- Handle exceptions in your application code
- Consider batch processing for multiple companies
*/
