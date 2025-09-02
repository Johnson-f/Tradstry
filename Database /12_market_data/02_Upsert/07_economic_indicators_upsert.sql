-- Economic Indicators Upsert Function
-- Upserts economic indicators data with conflict resolution on indicator_code, country, period_date, and data_provider

CREATE OR REPLACE FUNCTION upsert_economic_indicators(
    p_indicator_code VARCHAR(50),
    p_indicator_name VARCHAR(255),
    p_country VARCHAR(5),
    p_period_date DATE,
    p_data_provider VARCHAR(50),
    p_value DECIMAL(15,4) DEFAULT NULL,
    p_previous_value DECIMAL(15,4) DEFAULT NULL,
    p_change_value DECIMAL(15,4) DEFAULT NULL,
    p_change_percent DECIMAL(7,4) DEFAULT NULL,
    p_year_over_year_change DECIMAL(7,4) DEFAULT NULL,
    p_period_type VARCHAR(20) DEFAULT NULL,
    p_frequency VARCHAR(20) DEFAULT NULL,
    p_unit VARCHAR(50) DEFAULT NULL,
    p_currency VARCHAR(3) DEFAULT 'USD',
    p_seasonal_adjustment BOOLEAN DEFAULT TRUE,
    p_preliminary BOOLEAN DEFAULT FALSE,
    p_importance_level INTEGER DEFAULT NULL,
    p_market_impact VARCHAR(20) DEFAULT NULL,
    p_consensus_estimate DECIMAL(15,4) DEFAULT NULL,
    p_surprise DECIMAL(15,4) DEFAULT NULL,
    p_release_date TIMESTAMP DEFAULT NULL,
    p_next_release_date TIMESTAMP DEFAULT NULL,
    p_source_agency VARCHAR(100) DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT 'final',
    p_last_revised TIMESTAMP DEFAULT NULL,
    p_revision_count INTEGER DEFAULT 0
) RETURNS INTEGER AS $$
DECLARE
    v_indicator_id INTEGER;
BEGIN
    INSERT INTO economic_indicators (
        indicator_code, indicator_name, country, value, previous_value,
        change_value, change_percent, year_over_year_change, period_date,
        period_type, frequency, unit, currency, seasonal_adjustment,
        preliminary, importance_level, market_impact, consensus_estimate,
        surprise, release_date, next_release_date, source_agency, status,
        last_revised, revision_count, data_provider, created_at, updated_at
    ) VALUES (
        p_indicator_code, p_indicator_name, p_country, p_value, p_previous_value,
        p_change_value, p_change_percent, p_year_over_year_change, p_period_date,
        p_period_type, p_frequency, p_unit, p_currency, p_seasonal_adjustment,
        p_preliminary, p_importance_level, p_market_impact, p_consensus_estimate,
        p_surprise, p_release_date, p_next_release_date, p_source_agency, p_status,
        p_last_revised, p_revision_count, p_data_provider, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (indicator_code, country, period_date, data_provider) 
    DO UPDATE SET
        indicator_name = COALESCE(EXCLUDED.indicator_name, economic_indicators.indicator_name),
        value = COALESCE(EXCLUDED.value, economic_indicators.value),
        previous_value = COALESCE(EXCLUDED.previous_value, economic_indicators.previous_value),
        change_value = COALESCE(EXCLUDED.change_value, economic_indicators.change_value),
        change_percent = COALESCE(EXCLUDED.change_percent, economic_indicators.change_percent),
        year_over_year_change = COALESCE(EXCLUDED.year_over_year_change, economic_indicators.year_over_year_change),
        period_type = COALESCE(EXCLUDED.period_type, economic_indicators.period_type),
        frequency = COALESCE(EXCLUDED.frequency, economic_indicators.frequency),
        unit = COALESCE(EXCLUDED.unit, economic_indicators.unit),
        currency = COALESCE(EXCLUDED.currency, economic_indicators.currency),
        seasonal_adjustment = COALESCE(EXCLUDED.seasonal_adjustment, economic_indicators.seasonal_adjustment),
        preliminary = COALESCE(EXCLUDED.preliminary, economic_indicators.preliminary),
        importance_level = COALESCE(EXCLUDED.importance_level, economic_indicators.importance_level),
        market_impact = COALESCE(EXCLUDED.market_impact, economic_indicators.market_impact),
        consensus_estimate = COALESCE(EXCLUDED.consensus_estimate, economic_indicators.consensus_estimate),
        surprise = COALESCE(EXCLUDED.surprise, economic_indicators.surprise),
        release_date = COALESCE(EXCLUDED.release_date, economic_indicators.release_date),
        next_release_date = COALESCE(EXCLUDED.next_release_date, economic_indicators.next_release_date),
        source_agency = COALESCE(EXCLUDED.source_agency, economic_indicators.source_agency),
        status = COALESCE(EXCLUDED.status, economic_indicators.status),
        last_revised = COALESCE(EXCLUDED.last_revised, economic_indicators.last_revised),
        revision_count = COALESCE(EXCLUDED.revision_count, economic_indicators.revision_count),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_indicator_id;

    RETURN v_indicator_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_economic_indicators IS 'Upserts economic indicators data with conflict resolution on indicator_code, country, period_date, and data_provider';
