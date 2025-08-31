-- Economic Indicators Upsert Function
-- Handles INSERT or UPDATE operations for economic_indicators table
-- Uses PostgreSQL's ON CONFLICT for atomic upsert operations

CREATE OR REPLACE FUNCTION upsert_economic_indicator(
    p_indicator_code VARCHAR(50),
    p_indicator_name VARCHAR(255),
    p_country VARCHAR(5),
    p_value DECIMAL(15,4) DEFAULT NULL,
    p_previous_value DECIMAL(15,4) DEFAULT NULL,
    p_change_value DECIMAL(15,4) DEFAULT NULL,
    p_change_percent DECIMAL(7,4) DEFAULT NULL,
    p_year_over_year_change DECIMAL(7,4) DEFAULT NULL,
    p_period_date DATE,
    p_period_type VARCHAR(20) DEFAULT NULL,
    p_frequency VARCHAR(20) DEFAULT NULL,
    p_unit VARCHAR(50) DEFAULT NULL,
    p_currency VARCHAR(3) DEFAULT 'USD',
    p_seasonal_adjustment BOOLEAN DEFAULT TRUE,
    p_preliminary BOOLEAN DEFAULT FALSE,
    p_importance_level INTEGER DEFAULT 2,
    p_market_impact VARCHAR(20) DEFAULT 'medium',
    p_consensus_estimate DECIMAL(15,4) DEFAULT NULL,
    p_surprise DECIMAL(15,4) DEFAULT NULL,
    p_release_date TIMESTAMP DEFAULT NULL,
    p_next_release_date TIMESTAMP DEFAULT NULL,
    p_source_agency VARCHAR(100) DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT 'final',
    p_last_revised TIMESTAMP DEFAULT NULL,
    p_revision_count INTEGER DEFAULT 0,
    p_data_provider VARCHAR(50)
)
RETURNS INTEGER AS $$
DECLARE
    result_id INTEGER;
BEGIN
    -- Attempt to insert or update the economic indicator record
    INSERT INTO economic_indicators (
        indicator_code,
        indicator_name,
        country,
        value,
        previous_value,
        change_value,
        change_percent,
        year_over_year_change,
        period_date,
        period_type,
        frequency,
        unit,
        currency,
        seasonal_adjustment,
        preliminary,
        importance_level,
        market_impact,
        consensus_estimate,
        surprise,
        release_date,
        next_release_date,
        source_agency,
        status,
        last_revised,
        revision_count,
        data_provider,
        updated_at
    ) VALUES (
        p_indicator_code,
        p_indicator_name,
        p_country,
        p_value,
        p_previous_value,
        p_change_value,
        p_change_percent,
        p_year_over_year_change,
        p_period_date,
        p_period_type,
        p_frequency,
        p_unit,
        p_currency,
        p_seasonal_adjustment,
        p_preliminary,
        p_importance_level,
        p_market_impact,
        p_consensus_estimate,
        p_surprise,
        p_release_date,
        p_next_release_date,
        p_source_agency,
        p_status,
        p_last_revised,
        p_revision_count,
        p_data_provider,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (indicator_code, country, period_date, data_provider)
    DO UPDATE SET
        indicator_name = EXCLUDED.indicator_name,
        value = EXCLUDED.value,
        previous_value = EXCLUDED.previous_value,
        change_value = EXCLUDED.change_value,
        change_percent = EXCLUDED.change_percent,
        year_over_year_change = EXCLUDED.year_over_year_change,
        period_type = EXCLUDED.period_type,
        frequency = EXCLUDED.frequency,
        unit = EXCLUDED.unit,
        currency = EXCLUDED.currency,
        seasonal_adjustment = EXCLUDED.seasonal_adjustment,
        preliminary = EXCLUDED.preliminary,
        importance_level = EXCLUDED.importance_level,
        market_impact = EXCLUDED.market_impact,
        consensus_estimate = EXCLUDED.consensus_estimate,
        surprise = EXCLUDED.surprise,
        release_date = EXCLUDED.release_date,
        next_release_date = EXCLUDED.next_release_date,
        source_agency = EXCLUDED.source_agency,
        status = EXCLUDED.status,
        last_revised = EXCLUDED.last_revised,
        revision_count = EXCLUDED.revision_count,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO result_id;

    -- Log the operation for audit purposes
    RAISE NOTICE 'Economic indicator upserted: % (% - %) % from provider %, ID: %',
                 p_indicator_name, p_indicator_code, p_country, p_period_date, p_data_provider, result_id;

    RETURN result_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Error upserting economic indicator % (%): %',
                       p_indicator_name, p_indicator_code, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_economic_indicator(
    VARCHAR(50), VARCHAR(255), VARCHAR(5), DECIMAL(15,4), DECIMAL(15,4),
    DECIMAL(15,4), DECIMAL(7,4), DECIMAL(7,4), DATE, VARCHAR(20),
    VARCHAR(20), VARCHAR(50), VARCHAR(3), BOOLEAN, BOOLEAN, INTEGER,
    VARCHAR(20), DECIMAL(15,4), DECIMAL(15,4), TIMESTAMP, TIMESTAMP,
    VARCHAR(100), VARCHAR(20), TIMESTAMP, INTEGER, VARCHAR(50)
) IS 'Upserts economic indicator data. Inserts new record or updates existing based on indicator_code + country + period_date + data_provider.';

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Example 1: Insert new economic indicator data
SELECT upsert_economic_indicator(
    'GDP',                    -- indicator_code
    'Gross Domestic Product', -- indicator_name
    'US',                     -- country
    28630.0,                  -- value (in billions)
    28230.0,                  -- previous_value
    400.0,                    -- change_value
    1.4,                      -- change_percent (1.4%)
    2.5,                      -- year_over_year_change (2.5%)
    '2024-01-01',             -- period_date
    'quarterly',              -- period_type
    'quarterly',              -- frequency
    'Billions',               -- unit
    'USD',                    -- currency
    TRUE,                     -- seasonal_adjustment
    FALSE,                    -- preliminary
    3,                        -- importance_level (High)
    'high',                   -- market_impact
    28500.0,                  -- consensus_estimate
    130.0,                    -- surprise (28630 - 28500)
    '2024-01-25 13:30:00',    -- release_date
    '2024-04-25 13:30:00',    -- next_release_date
    'Bureau of Economic Analysis', -- source_agency
    'final',                  -- status
    NULL,                     -- last_revised
    0,                        -- revision_count
    'alpha_vantage'           -- data_provider
);

-- Example 2: Update with revised data
SELECT upsert_economic_indicator(
    'GDP',                    -- Same indicator_code
    'Gross Domestic Product', -- Same name
    'US',                     -- Same country
    28700.0,                  -- Revised value
    28230.0,                  -- Same previous
    470.0,                    -- Revised change
    1.7,                      -- Revised percentage
    2.7,                      -- Revised YoY change
    '2024-01-01',             -- Same period_date
    'quarterly',
    'quarterly',
    'Billions',
    'USD',
    TRUE,
    FALSE,
    3,
    'high',
    28500.0,                  -- Same consensus
    200.0,                    -- Revised surprise
    '2024-01-25 13:30:00',
    '2024-04-25 13:30:00',
    'Bureau of Economic Analysis',
    'revised',                -- Status changed to revised
    CURRENT_TIMESTAMP,        -- Last revised timestamp
    1,                        -- Revision count incremented
    'alpha_vantage'           -- Same provider
);

-- Example 3: Insert unemployment data
SELECT upsert_economic_indicator(
    'UNEMPLOYMENT',
    'Unemployment Rate',
    'US',
    3.7,                      -- 3.7%
    3.5,                      -- Previous 3.5%
    0.2,                      -- Change +0.2%
    5.7,                      -- Percent change
    -12.5,                    -- Year-over-year change
    '2024-01-01',
    'monthly',
    'monthly',
    '%',
    'USD',
    TRUE,
    FALSE,
    3,
    'high',
    3.6,                      -- Consensus 3.6%
    0.1,                      -- Surprise +0.1%
    '2024-02-02 13:30:00',
    '2024-03-08 13:30:00',
    'Bureau of Labor Statistics',
    'final',
    NULL,
    0,
    'finnhub'
);

-- Example 4: Insert inflation data
SELECT upsert_economic_indicator(
    'CPI',
    'Consumer Price Index',
    'EU',
    2.9,                      -- 2.9%
    2.7,                      -- Previous 2.7%
    0.2,                      -- Change +0.2%
    7.4,                      -- Percent change
    2.5,                      -- Year-over-year change
    '2024-01-01',
    'monthly',
    'monthly',
    '%',
    'EUR',
    TRUE,
    FALSE,
    3,
    'high',
    2.8,                      -- Consensus 2.8%
    0.1,                      -- Surprise +0.1%
    '2024-02-01 11:00:00',
    '2024-03-01 11:00:00',
    'Eurostat',
    'final',
    NULL,
    0,
    'fmp'
);

-- Batch processing example
-- Your application can call this function in a loop for bulk economic indicators
*/

-- =====================================================
-- FUNCTION FEATURES
-- =====================================================

/*
FUNCTION FEATURES:

1. ATOMIC UPSERT:
   - Uses PostgreSQL ON CONFLICT for thread-safe operations
   - Either inserts new record or updates existing
   - Based on (indicator_code, country, period_date, data_provider) unique constraint
   - No race conditions or duplicate data

2. COMPREHENSIVE PARAMETERS:
   - All economic_indicators table columns supported
   - Optional parameters with sensible defaults
   - Type-safe with proper data types for all parameters

3. SURPRISE CALCULATIONS:
   - Stores consensus estimates and calculates surprises
   - Supports preliminary vs final data status
   - Tracks revisions and revision counts

4. GLOBAL ECONOMIC SUPPORT:
   - Multi-country support (US, EU, GB, etc.)
   - Various economic indicators (GDP, CPI, unemployment, etc.)
   - Different frequencies (monthly, quarterly, annual, weekly)
   - Multiple data sources and providers

5. AUDIT TRAIL:
   - Automatically updates updated_at timestamp
   - Logs operations for monitoring
   - Returns the record ID for reference

INTEGRATION NOTES:

- Call this function from your market data ingestion processes
- Use the returned ID for logging or further processing
- Handle exceptions in your application code
- Consider batch processing for multiple economic indicators
- Function supports the full economic data lifecycle from preliminary to final with revisions
*/
