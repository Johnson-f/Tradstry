-- Economic Events Upsert Function
-- Handles INSERT or UPDATE operations for economic_events table
-- Uses PostgreSQL's ON CONFLICT for atomic upsert operations

CREATE OR REPLACE FUNCTION upsert_economic_event(
    p_event_id VARCHAR(100),
    p_country VARCHAR(5),
    p_event_name VARCHAR(255),
    p_event_period VARCHAR(100) DEFAULT NULL,
    p_actual DECIMAL(15,4) DEFAULT NULL,
    p_previous DECIMAL(15,4) DEFAULT NULL,
    p_forecast DECIMAL(15,4) DEFAULT NULL,
    p_unit VARCHAR(50) DEFAULT NULL,
    p_importance INTEGER DEFAULT 2,
    p_event_timestamp TIMESTAMP,
    p_last_update TIMESTAMP DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_url TEXT DEFAULT NULL,
    p_category VARCHAR(50) DEFAULT NULL,
    p_frequency VARCHAR(20) DEFAULT NULL,
    p_source VARCHAR(100) DEFAULT NULL,
    p_currency VARCHAR(3) DEFAULT 'USD',
    p_market_impact VARCHAR(20) DEFAULT 'medium',
    p_status VARCHAR(20) DEFAULT 'scheduled',
    p_revised BOOLEAN DEFAULT FALSE,
    p_data_provider VARCHAR(50)
)
RETURNS INTEGER AS $$
DECLARE
    result_id INTEGER;
BEGIN
    -- Attempt to insert or update the economic event record
    INSERT INTO economic_events (
        event_id,
        country,
        event_name,
        event_period,
        actual,
        previous,
        forecast,
        unit,
        importance,
        event_timestamp,
        last_update,
        description,
        url,
        category,
        frequency,
        source,
        currency,
        market_impact,
        status,
        revised,
        data_provider,
        updated_at
    ) VALUES (
        p_event_id,
        p_country,
        p_event_name,
        p_event_period,
        p_actual,
        p_previous,
        p_forecast,
        p_unit,
        p_importance,
        p_event_timestamp,
        p_last_update,
        p_description,
        p_url,
        p_category,
        p_frequency,
        p_source,
        p_currency,
        p_market_impact,
        p_status,
        p_revised,
        p_data_provider,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (event_id, data_provider)
    DO UPDATE SET
        country = EXCLUDED.country,
        event_name = EXCLUDED.event_name,
        event_period = EXCLUDED.event_period,
        actual = EXCLUDED.actual,
        previous = EXCLUDED.previous,
        forecast = EXCLUDED.forecast,
        unit = EXCLUDED.unit,
        importance = EXCLUDED.importance,
        event_timestamp = EXCLUDED.event_timestamp,
        last_update = EXCLUDED.last_update,
        description = EXCLUDED.description,
        url = EXCLUDED.url,
        category = EXCLUDED.category,
        frequency = EXCLUDED.frequency,
        source = EXCLUDED.source,
        currency = EXCLUDED.currency,
        market_impact = EXCLUDED.market_impact,
        status = EXCLUDED.status,
        revised = EXCLUDED.revised,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO result_id;

    -- Log the operation for audit purposes
    RAISE NOTICE 'Economic event upserted: % (% - %) from provider %, ID: %',
                 p_event_name, p_event_id, p_country, p_data_provider, result_id;

    RETURN result_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Error upserting economic event % (%): %',
                       p_event_name, p_event_id, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_economic_event(
    VARCHAR(100), VARCHAR(5), VARCHAR(255), VARCHAR(100), DECIMAL(15,4),
    DECIMAL(15,4), DECIMAL(15,4), VARCHAR(50), INTEGER, TIMESTAMP,
    TIMESTAMP, TEXT, TEXT, VARCHAR(50), VARCHAR(20), VARCHAR(100),
    VARCHAR(3), VARCHAR(20), VARCHAR(20), BOOLEAN, VARCHAR(50)
) IS 'Upserts economic event data. Inserts new record or updates existing based on event_id + data_provider.';

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Example 1: Insert new scheduled economic event
SELECT upsert_economic_event(
    'US_NFP_JAN2024',     -- event_id
    'US',                 -- country
    'Non-Farm Payrolls',  -- event_name
    'January 2024',      -- event_period
    NULL,                 -- actual (not released yet)
    225000,              -- previous
    220000,              -- forecast
    'Thousands',         -- unit
    3,                   -- importance (High)
    '2024-02-02 13:30:00', -- event_timestamp
    NULL,                 -- last_update
    'Change in the number of employed people during the previous month, excluding farm workers', -- description
    'https://tradingeconomics.com/united-states/non-farm-payrolls', -- url
    'employment',         -- category
    'monthly',            -- frequency
    'Bureau of Labor Statistics', -- source
    'USD',                -- currency
    'high',               -- market_impact
    'scheduled',          -- status
    FALSE,                -- revised
    'finnhub'             -- data_provider
);

-- Example 2: Update event with actual results
SELECT upsert_economic_event(
    'US_NFP_JAN2024',     -- Same event_id
    'US',
    'Non-Farm Payrolls',
    'January 2024',
    216000,              -- Actual result released
    225000,              -- Previous (unchanged)
    220000,              -- Forecast (unchanged)
    'Thousands',
    3,
    '2024-02-02 13:30:00', -- Same timestamp
    CURRENT_TIMESTAMP,   -- Last update timestamp
    'Change in the number of employed people during the previous month, excluding farm workers',
    'https://tradingeconomics.com/united-states/non-farm-payrolls',
    'employment',
    'monthly',
    'Bureau of Labor Statistics',
    'USD',
    'high',
    'released',           -- Status changed to released
    FALSE,
    'finnhub'             -- Same provider
);

-- Example 3: Handle revised data
SELECT upsert_economic_event(
    'US_GDP_Q42023',
    'US',
    'Gross Domestic Product',
    'Q4 2023',
    2.7,                 -- Revised actual
    3.3,                 -- Previous actual
    2.8,                 -- Forecast
    '%',
    3,
    '2024-01-25 13:30:00',
    CURRENT_TIMESTAMP,
    'Quarterly GDP growth rate',
    'https://www.bea.gov/',
    'GDP',
    'quarterly',
    'Bureau of Economic Analysis',
    'USD',
    'high',
    'revised',           -- Status shows revision
    TRUE,                -- This is a revision
    'alpha_vantage'
);

-- Example 4: Eurozone inflation data
SELECT upsert_economic_event(
    'EU_CPI_DEC2023',
    'EU',
    'Consumer Price Index',
    'December 2023',
    2.9,
    2.7,
    2.8,
    '%',
    3,
    '2024-01-02 11:00:00',
    CURRENT_TIMESTAMP,
    'Eurozone CPI inflation rate',
    'https://ec.europa.eu/eurostat',
    'inflation',
    'monthly',
    'Eurostat',
    'EUR',
    'high',
    'released',
    FALSE,
    'fmp'
);

-- Batch processing example
-- Your application can call this function in a loop for bulk economic events
*/

-- =====================================================
-- FUNCTION FEATURES
-- =====================================================

/*
FUNCTION FEATURES:

1. ATOMIC UPSERT:
   - Uses PostgreSQL ON CONFLICT for thread-safe operations
   - Either inserts new record or updates existing
   - Based on (event_id, data_provider) unique constraint
   - No race conditions or duplicate data

2. COMPREHENSIVE PARAMETERS:
   - All economic_events table columns supported
   - Optional parameters with sensible defaults
   - Type-safe with proper data types for all parameters

3. STATUS TRACKING:
   - Supports status changes (scheduled → released → revised)
   - Tracks revisions and update timestamps
   - Enables audit trail for economic data changes

4. GLOBAL ECONOMIC SUPPORT:
   - Multi-country support (US, EU, GB, etc.)
   - Various economic categories (employment, inflation, GDP, etc.)
   - Different frequencies (monthly, quarterly, annual)
   - Multiple data sources and providers

5. AUDIT TRAIL:
   - Automatically updates updated_at timestamp
   - Logs operations for monitoring
   - Returns the record ID for reference

INTEGRATION NOTES:

- Call this function from your market data ingestion processes
- Use the returned ID for logging or further processing
- Handle exceptions in your application code
- Consider batch processing for multiple economic events
- Function supports the full economic event lifecycle from scheduling to revisions
*/
