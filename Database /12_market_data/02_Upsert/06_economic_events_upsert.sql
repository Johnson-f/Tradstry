-- Economic Events Upsert Function
-- Upserts economic events data with conflict resolution on event_id and data_provider

CREATE OR REPLACE FUNCTION upsert_economic_events(
    p_event_id VARCHAR(100),
    p_country VARCHAR(5),
    p_event_name VARCHAR(255),
    p_data_provider VARCHAR(50),
    p_event_timestamp TIMESTAMP,
    p_event_period VARCHAR(100) DEFAULT NULL,
    p_actual DECIMAL(15,4) DEFAULT NULL,
    p_previous DECIMAL(15,4) DEFAULT NULL,
    p_forecast DECIMAL(15,4) DEFAULT NULL,
    p_unit VARCHAR(50) DEFAULT NULL,
    p_importance INTEGER DEFAULT NULL,
    p_last_update TIMESTAMP DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_url TEXT DEFAULT NULL,
    p_category VARCHAR(50) DEFAULT NULL,
    p_frequency VARCHAR(20) DEFAULT NULL,
    p_source VARCHAR(100) DEFAULT NULL,
    p_currency VARCHAR(3) DEFAULT 'USD',
    p_market_impact VARCHAR(20) DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT 'scheduled',
    p_revised BOOLEAN DEFAULT FALSE
) RETURNS INTEGER AS $$
DECLARE
    v_event_id INTEGER;
BEGIN
    INSERT INTO economic_events (
        event_id, country, event_name, event_period, actual, previous,
        forecast, unit, importance, event_timestamp, last_update,
        description, url, category, frequency, source, currency,
        market_impact, status, revised, data_provider, created_at, updated_at
    ) VALUES (
        p_event_id, p_country, p_event_name, p_event_period, p_actual, p_previous,
        p_forecast, p_unit, p_importance, p_event_timestamp, p_last_update,
        p_description, p_url, p_category, p_frequency, p_source, p_currency,
        p_market_impact, p_status, p_revised, p_data_provider, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (event_id, data_provider) 
    DO UPDATE SET
        country = COALESCE(EXCLUDED.country, economic_events.country),
        event_name = COALESCE(EXCLUDED.event_name, economic_events.event_name),
        event_period = COALESCE(EXCLUDED.event_period, economic_events.event_period),
        actual = COALESCE(EXCLUDED.actual, economic_events.actual),
        previous = COALESCE(EXCLUDED.previous, economic_events.previous),
        forecast = COALESCE(EXCLUDED.forecast, economic_events.forecast),
        unit = COALESCE(EXCLUDED.unit, economic_events.unit),
        importance = COALESCE(EXCLUDED.importance, economic_events.importance),
        event_timestamp = COALESCE(EXCLUDED.event_timestamp, economic_events.event_timestamp),
        last_update = COALESCE(EXCLUDED.last_update, economic_events.last_update),
        description = COALESCE(EXCLUDED.description, economic_events.description),
        url = COALESCE(EXCLUDED.url, economic_events.url),
        category = COALESCE(EXCLUDED.category, economic_events.category),
        frequency = COALESCE(EXCLUDED.frequency, economic_events.frequency),
        source = COALESCE(EXCLUDED.source, economic_events.source),
        currency = COALESCE(EXCLUDED.currency, economic_events.currency),
        market_impact = COALESCE(EXCLUDED.market_impact, economic_events.market_impact),
        status = COALESCE(EXCLUDED.status, economic_events.status),
        revised = COALESCE(EXCLUDED.revised, economic_events.revised),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_economic_events IS 'Upserts economic events data with conflict resolution on event_id and data_provider';
