-- Earnings Calendar Upsert Function
-- Handles INSERT or UPDATE operations for earnings_calendar table
-- Uses PostgreSQL's ON CONFLICT for atomic upsert operations

CREATE OR REPLACE FUNCTION upsert_earnings_calendar(
    p_symbol VARCHAR(20),
    p_exchange_id INTEGER DEFAULT NULL,
    p_earnings_date DATE,
    p_time_of_day VARCHAR(10) DEFAULT NULL,
    p_eps DECIMAL(10,4) DEFAULT NULL,
    p_eps_estimated DECIMAL(10,4) DEFAULT NULL,
    p_eps_surprise DECIMAL(10,4) DEFAULT NULL,
    p_eps_surprise_percent DECIMAL(7,4) DEFAULT NULL,
    p_revenue BIGINT DEFAULT NULL,
    p_revenue_estimated BIGINT DEFAULT NULL,
    p_revenue_surprise BIGINT DEFAULT NULL,
    p_revenue_surprise_percent DECIMAL(7,4) DEFAULT NULL,
    p_fiscal_date_ending DATE DEFAULT NULL,
    p_fiscal_year INTEGER,
    p_fiscal_quarter INTEGER,
    p_market_cap_at_time BIGINT DEFAULT NULL,
    p_sector VARCHAR(100) DEFAULT NULL,
    p_industry VARCHAR(100) DEFAULT NULL,
    p_conference_call_date TIMESTAMP DEFAULT NULL,
    p_conference_call_time TIME DEFAULT NULL,
    p_webcast_url TEXT DEFAULT NULL,
    p_transcript_available BOOLEAN DEFAULT FALSE,
    p_status VARCHAR(20) DEFAULT 'scheduled',
    p_last_updated TIMESTAMP DEFAULT NULL,
    p_update_source VARCHAR(100) DEFAULT NULL,
    p_data_provider VARCHAR(50)
)
RETURNS INTEGER AS $$
DECLARE
    result_id INTEGER;
BEGIN
    -- Attempt to insert or update the earnings calendar record
    INSERT INTO earnings_calendar (
        symbol,
        exchange_id,
        earnings_date,
        time_of_day,
        eps,
        eps_estimated,
        eps_surprise,
        eps_surprise_percent,
        revenue,
        revenue_estimated,
        revenue_surprise,
        revenue_surprise_percent,
        fiscal_date_ending,
        fiscal_year,
        fiscal_quarter,
        market_cap_at_time,
        sector,
        industry,
        conference_call_date,
        conference_call_time,
        webcast_url,
        transcript_available,
        status,
        last_updated,
        update_source,
        data_provider,
        updated_at
    ) VALUES (
        p_symbol,
        p_exchange_id,
        p_earnings_date,
        p_time_of_day,
        p_eps,
        p_eps_estimated,
        p_eps_surprise,
        p_eps_surprise_percent,
        p_revenue,
        p_revenue_estimated,
        p_revenue_surprise,
        p_revenue_surprise_percent,
        p_fiscal_date_ending,
        p_fiscal_year,
        p_fiscal_quarter,
        p_market_cap_at_time,
        p_sector,
        p_industry,
        p_conference_call_date,
        p_conference_call_time,
        p_webcast_url,
        p_transcript_available,
        p_status,
        p_last_updated,
        p_update_source,
        p_data_provider,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, fiscal_year, fiscal_quarter, data_provider)
    DO UPDATE SET
        exchange_id = EXCLUDED.exchange_id,
        earnings_date = EXCLUDED.earnings_date,
        time_of_day = EXCLUDED.time_of_day,
        eps = EXCLUDED.eps,
        eps_estimated = EXCLUDED.eps_estimated,
        eps_surprise = EXCLUDED.eps_surprise,
        eps_surprise_percent = EXCLUDED.eps_surprise_percent,
        revenue = EXCLUDED.revenue,
        revenue_estimated = EXCLUDED.revenue_estimated,
        revenue_surprise = EXCLUDED.revenue_surprise,
        revenue_surprise_percent = EXCLUDED.revenue_surprise_percent,
        fiscal_date_ending = EXCLUDED.fiscal_date_ending,
        market_cap_at_time = EXCLUDED.market_cap_at_time,
        sector = EXCLUDED.sector,
        industry = EXCLUDED.industry,
        conference_call_date = EXCLUDED.conference_call_date,
        conference_call_time = EXCLUDED.conference_call_time,
        webcast_url = EXCLUDED.webcast_url,
        transcript_available = EXCLUDED.transcript_available,
        status = EXCLUDED.status,
        last_updated = EXCLUDED.last_updated,
        update_source = EXCLUDED.update_source,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO result_id;

    -- Log the operation for audit purposes
    RAISE NOTICE 'Earnings calendar upserted for symbol % Q% % from provider %, ID: %',
                 p_symbol, p_fiscal_quarter, p_fiscal_year, p_data_provider, result_id;

    RETURN result_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Error upserting earnings calendar for symbol % Q% %: %',
                       p_symbol, p_fiscal_quarter, p_fiscal_year, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_earnings_calendar(
    VARCHAR(20), INTEGER, DATE, VARCHAR(10), DECIMAL(10,4), DECIMAL(10,4),
    DECIMAL(10,4), DECIMAL(7,4), BIGINT, BIGINT, BIGINT, DECIMAL(7,4),
    DATE, INTEGER, INTEGER, BIGINT, VARCHAR(100), VARCHAR(100),
    TIMESTAMP, TIME, TEXT, BOOLEAN, VARCHAR(20), TIMESTAMP, VARCHAR(100), VARCHAR(50)
) IS 'Upserts earnings calendar data. Inserts new record or updates existing based on symbol + fiscal_year + fiscal_quarter + data_provider.';

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Example 1: Insert new earnings calendar entry
SELECT upsert_earnings_calendar(
    'AAPL',           -- symbol
    1,               -- exchange_id
    '2024-01-25',    -- earnings_date
    'amc',           -- time_of_day
    NULL,            -- eps (not reported yet)
    2.05,            -- eps_estimated
    NULL,            -- eps_surprise
    NULL,            -- eps_surprise_percent
    NULL,            -- revenue
    118500000000,    -- revenue_estimated
    NULL,            -- revenue_surprise
    NULL,            -- revenue_surprise_percent
    '2023-12-30',    -- fiscal_date_ending
    2024,            -- fiscal_year
    1,               -- fiscal_quarter
    2500000000000,   -- market_cap_at_time
    'Technology',    -- sector
    'Consumer Electronics', -- industry
    '2024-01-25 16:30:00', -- conference_call_date
    '16:30:00',      -- conference_call_time
    'https://apple.com/investor/earnings-call', -- webcast_url
    FALSE,           -- transcript_available
    'scheduled',     -- status
    CURRENT_TIMESTAMP, -- last_updated
    'initial_import', -- update_source
    'finnhub'        -- data_provider
);

-- Example 2: Update with actual earnings results
SELECT upsert_earnings_calendar(
    'AAPL',
    1,
    '2024-01-25',    -- Same date
    'amc',
    2.46,            -- Actual EPS reported
    2.05,            -- eps_estimated (unchanged)
    0.41,            -- eps_surprise (2.46 - 2.05)
    0.20,            -- eps_surprise_percent (20%)
    119400000000,    -- Actual revenue
    118500000000,    -- revenue_estimated
    900000000,       -- revenue_surprise
    0.0076,          -- revenue_surprise_percent (0.76%)
    '2023-12-30',
    2024,            -- Same fiscal year
    1,               -- Same fiscal quarter
    2500000000000,
    'Technology',
    'Consumer Electronics',
    '2024-01-25 16:30:00',
    '16:30:00',
    'https://apple.com/investor/earnings-call',
    TRUE,            -- Transcript now available
    'reported',      -- Status changed to reported
    CURRENT_TIMESTAMP,
    'earnings_release',
    'finnhub'        -- Same provider
);

-- Example 3: Handle status changes (postponement)
SELECT upsert_earnings_calendar(
    'AAPL', 1, '2024-01-30', 'bmo', NULL, 2.05, NULL, NULL,
    NULL, 118500000000, NULL, NULL, '2023-12-30', 2024, 1,
    2500000000000, 'Technology', 'Consumer Electronics',
    NULL, NULL, NULL, FALSE, 'postponed', CURRENT_TIMESTAMP,
    'earnings_postponement', 'finnhub'
);

-- Batch processing example
-- Your application can call this function in a loop for bulk calendar updates
*/

-- =====================================================
-- FUNCTION FEATURES
-- =====================================================

/*
FUNCTION FEATURES:

1. ATOMIC UPSERT:
   - Uses PostgreSQL ON CONFLICT for thread-safe operations
   - Either inserts new record or updates existing
   - Based on (symbol, fiscal_year, fiscal_quarter, data_provider) unique constraint
   - No race conditions or duplicate data

2. COMPREHENSIVE PARAMETERS:
   - All earnings_calendar table columns supported
   - Optional parameters with sensible defaults
   - Type-safe with proper data types for all parameters

3. STATUS TRACKING:
   - Supports status changes (scheduled → confirmed → reported)
   - Tracks update sources and timestamps
   - Enables audit trail for earnings data changes

4. SURPRISE CALCULATIONS:
   - Stores both actual and estimated values
   - Pre-calculates surprise amounts and percentages
   - Enables quick analysis of earnings beats/misses

5. AUDIT TRAIL:
   - Automatically updates updated_at timestamp
   - Logs operations for monitoring
   - Returns the record ID for reference

INTEGRATION NOTES:

- Call this function from your market data ingestion processes
- Use the returned ID for logging or further processing
- Handle exceptions in your application code
- Consider batch processing for multiple earnings updates
- Function supports the full earnings lifecycle from scheduling to reporting
*/
