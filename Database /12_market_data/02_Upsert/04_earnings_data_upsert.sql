-- Earnings Data Upsert Function
-- Handles INSERT or UPDATE operations for earnings_data table
-- Uses PostgreSQL's ON CONFLICT for atomic upsert operations

CREATE OR REPLACE FUNCTION upsert_earnings_data(
    p_symbol VARCHAR(20),
    p_exchange_id INTEGER DEFAULT NULL,
    p_fiscal_year INTEGER,
    p_fiscal_quarter INTEGER,
    p_reported_date DATE,
    p_report_type VARCHAR(20) DEFAULT 'quarterly',
    p_eps DECIMAL(10,4) DEFAULT NULL,
    p_eps_estimated DECIMAL(10,4) DEFAULT NULL,
    p_eps_surprise DECIMAL(10,4) DEFAULT NULL,
    p_eps_surprise_percent DECIMAL(7,4) DEFAULT NULL,
    p_revenue BIGINT DEFAULT NULL,
    p_revenue_estimated BIGINT DEFAULT NULL,
    p_revenue_surprise BIGINT DEFAULT NULL,
    p_revenue_surprise_percent DECIMAL(7,4) DEFAULT NULL,
    p_net_income BIGINT DEFAULT NULL,
    p_gross_profit BIGINT DEFAULT NULL,
    p_operating_income BIGINT DEFAULT NULL,
    p_ebitda BIGINT DEFAULT NULL,
    p_operating_margin DECIMAL(7,4) DEFAULT NULL,
    p_net_margin DECIMAL(7,4) DEFAULT NULL,
    p_year_over_year_eps_growth DECIMAL(7,4) DEFAULT NULL,
    p_year_over_year_revenue_growth DECIMAL(7,4) DEFAULT NULL,
    p_guidance TEXT DEFAULT NULL,
    p_next_year_eps_guidance DECIMAL(10,4) DEFAULT NULL,
    p_next_year_revenue_guidance BIGINT DEFAULT NULL,
    p_conference_call_date TIMESTAMP DEFAULT NULL,
    p_transcript_url TEXT DEFAULT NULL,
    p_audio_url TEXT DEFAULT NULL,
    p_eps_beat_miss_met VARCHAR(10) DEFAULT NULL,
    p_revenue_beat_miss_met VARCHAR(10) DEFAULT NULL,
    p_data_provider VARCHAR(50)
)
RETURNS INTEGER AS $$
DECLARE
    result_id INTEGER;
BEGIN
    -- Attempt to insert or update the earnings data record
    INSERT INTO earnings_data (
        symbol,
        exchange_id,
        fiscal_year,
        fiscal_quarter,
        reported_date,
        report_type,
        eps,
        eps_estimated,
        eps_surprise,
        eps_surprise_percent,
        revenue,
        revenue_estimated,
        revenue_surprise,
        revenue_surprise_percent,
        net_income,
        gross_profit,
        operating_income,
        ebitda,
        operating_margin,
        net_margin,
        year_over_year_eps_growth,
        year_over_year_revenue_growth,
        guidance,
        next_year_eps_guidance,
        next_year_revenue_guidance,
        conference_call_date,
        transcript_url,
        audio_url,
        eps_beat_miss_met,
        revenue_beat_miss_met,
        data_provider,
        updated_at
    ) VALUES (
        p_symbol,
        p_exchange_id,
        p_fiscal_year,
        p_fiscal_quarter,
        p_reported_date,
        p_report_type,
        p_eps,
        p_eps_estimated,
        p_eps_surprise,
        p_eps_surprise_percent,
        p_revenue,
        p_revenue_estimated,
        p_revenue_surprise,
        p_revenue_surprise_percent,
        p_net_income,
        p_gross_profit,
        p_operating_income,
        p_ebitda,
        p_operating_margin,
        p_net_margin,
        p_year_over_year_eps_growth,
        p_year_over_year_revenue_growth,
        p_guidance,
        p_next_year_eps_guidance,
        p_next_year_revenue_guidance,
        p_conference_call_date,
        p_transcript_url,
        p_audio_url,
        p_eps_beat_miss_met,
        p_revenue_beat_miss_met,
        p_data_provider,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, fiscal_year, fiscal_quarter, data_provider)
    DO UPDATE SET
        exchange_id = EXCLUDED.exchange_id,
        reported_date = EXCLUDED.reported_date,
        report_type = EXCLUDED.report_type,
        eps = EXCLUDED.eps,
        eps_estimated = EXCLUDED.eps_estimated,
        eps_surprise = EXCLUDED.eps_surprise,
        eps_surprise_percent = EXCLUDED.eps_surprise_percent,
        revenue = EXCLUDED.revenue,
        revenue_estimated = EXCLUDED.revenue_estimated,
        revenue_surprise = EXCLUDED.revenue_surprise,
        revenue_surprise_percent = EXCLUDED.revenue_surprise_percent,
        net_income = EXCLUDED.net_income,
        gross_profit = EXCLUDED.gross_profit,
        operating_income = EXCLUDED.operating_income,
        ebitda = EXCLUDED.ebitda,
        operating_margin = EXCLUDED.operating_margin,
        net_margin = EXCLUDED.net_margin,
        year_over_year_eps_growth = EXCLUDED.year_over_year_eps_growth,
        year_over_year_revenue_growth = EXCLUDED.year_over_year_revenue_growth,
        guidance = EXCLUDED.guidance,
        next_year_eps_guidance = EXCLUDED.next_year_eps_guidance,
        next_year_revenue_guidance = EXCLUDED.next_year_revenue_guidance,
        conference_call_date = EXCLUDED.conference_call_date,
        transcript_url = EXCLUDED.transcript_url,
        audio_url = EXCLUDED.audio_url,
        eps_beat_miss_met = EXCLUDED.eps_beat_miss_met,
        revenue_beat_miss_met = EXCLUDED.revenue_beat_miss_met,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO result_id;

    -- Log the operation for audit purposes
    RAISE NOTICE 'Earnings data upserted for symbol % Q% % from provider %, ID: %',
                 p_symbol, p_fiscal_quarter, p_fiscal_year, p_data_provider, result_id;

    RETURN result_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Error upserting earnings data for symbol % Q% %: %',
                       p_symbol, p_fiscal_quarter, p_fiscal_year, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_earnings_data(
    VARCHAR(20), INTEGER, INTEGER, INTEGER, DATE, VARCHAR(20),
    DECIMAL(10,4), DECIMAL(10,4), DECIMAL(10,4), DECIMAL(7,4),
    BIGINT, BIGINT, BIGINT, DECIMAL(7,4), BIGINT, BIGINT, BIGINT, BIGINT,
    DECIMAL(7,4), DECIMAL(7,4), DECIMAL(7,4), DECIMAL(7,4),
    TEXT, DECIMAL(10,4), BIGINT, TIMESTAMP, TEXT, TEXT,
    VARCHAR(10), VARCHAR(10), VARCHAR(50)
) IS 'Upserts earnings data. Inserts new record or updates existing based on symbol + fiscal_year + fiscal_quarter + data_provider.';

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Example 1: Insert preliminary earnings estimates
SELECT upsert_earnings_data(
    'AAPL',           -- symbol
    1,               -- exchange_id
    2024,            -- fiscal_year
    1,               -- fiscal_quarter
    '2024-01-25',    -- reported_date
    'quarterly',     -- report_type
    NULL,            -- eps (not reported yet)
    2.05,            -- eps_estimated
    NULL,            -- eps_surprise
    NULL,            -- eps_surprise_percent
    NULL,            -- revenue
    118500000000,    -- revenue_estimated
    NULL,            -- revenue_surprise
    NULL,            -- revenue_surprise_percent
    NULL,            -- net_income
    NULL,            -- gross_profit
    NULL,            -- operating_income
    NULL,            -- ebitda
    NULL,            -- operating_margin
    NULL,            -- net_margin
    NULL,            -- year_over_year_eps_growth
    NULL,            -- year_over_year_revenue_growth
    NULL,            -- guidance
    NULL,            -- next_year_eps_guidance
    NULL,            -- next_year_revenue_guidance
    '2024-01-25 16:30:00', -- conference_call_date
    'https://apple.com/investor/transcript', -- transcript_url
    'https://apple.com/investor/audio', -- audio_url
    NULL,            -- eps_beat_miss_met
    NULL,            -- revenue_beat_miss_met
    'finnhub'        -- data_provider
);

-- Example 2: Update with actual earnings results
SELECT upsert_earnings_data(
    'AAPL',
    1,
    2024,            -- Same fiscal year
    1,               -- Same fiscal quarter
    '2024-01-25',    -- Same reported date
    'quarterly',
    2.46,            -- Actual EPS reported
    2.05,            -- eps_estimated (unchanged)
    0.41,            -- eps_surprise (2.46 - 2.05)
    0.20,            -- eps_surprise_percent (20%)
    119400000000,    -- Actual revenue
    118500000000,    -- revenue_estimated
    900000000,       -- revenue_surprise
    0.0076,          -- revenue_surprise_percent (0.76%)
    29998000000,     -- net_income
    42137000000,     -- gross_profit
    33916000000,     -- operating_income
    36517000000,     -- ebitda
    0.284,           -- operating_margin (28.4%)
    0.251,           -- net_margin (25.1%)
    0.12,            -- year_over_year_eps_growth (12%)
    0.08,            -- year_over_year_revenue_growth (8%)
    'Management expects...', -- guidance
    6.50,            -- next_year_eps_guidance
    360000000000,    -- next_year_revenue_guidance
    '2024-01-25 16:30:00',
    'https://apple.com/investor/transcript',
    'https://apple.com/investor/audio',
    'beat',           -- eps_beat_miss_met
    'beat',           -- revenue_beat_miss_met
    'finnhub'         -- Same provider
);

-- Example 3: Annual report data
SELECT upsert_earnings_data(
    'AAPL', 1, 2023, NULL, '2023-11-03', 'annual',
    6.13, 6.08, 0.05, 0.008, 383285000000, 380000000000,
    3285000000, 0.0086, 97000000000, 169148000000, 114301000000,
    123136000000, 0.298, 0.253, 0.05, 0.02,
    'Fiscal 2024 guidance...', 6.50, 360000000000,
    '2023-11-03 14:00:00', NULL, NULL, 'beat', 'beat', 'fmp'
);

-- Batch processing example
-- Your application can call this function in a loop for bulk earnings updates
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
   - All earnings_data table columns supported
   - Optional parameters with sensible defaults
   - Type-safe with proper data types for all parameters

3. BEAT/MISS/MET TRACKING:
   - Supports beat/miss/met status for both EPS and revenue
   - Enables quick filtering of earnings performance
   - Supports analysis of earnings consistency

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
- Function supports both quarterly and annual earnings data
*/
