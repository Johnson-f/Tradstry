-- Earnings Calendar Upsert Function
-- Upserts earnings calendar data with conflict resolution on symbol, fiscal_year, fiscal_quarter, and data_provider

CREATE OR REPLACE FUNCTION upsert_earnings_calendar(
    p_symbol VARCHAR(20),
    p_data_provider VARCHAR(50),
    p_earnings_date DATE,
    p_fiscal_year INTEGER,
    p_fiscal_quarter INTEGER,
    p_exchange_id INTEGER DEFAULT NULL,
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
    p_market_cap_at_time BIGINT DEFAULT NULL,
    p_sector VARCHAR(100) DEFAULT NULL,
    p_industry VARCHAR(100) DEFAULT NULL,
    p_conference_call_date TIMESTAMP DEFAULT NULL,
    p_conference_call_time TIME DEFAULT NULL,
    p_webcast_url TEXT DEFAULT NULL,
    p_transcript_available BOOLEAN DEFAULT FALSE,
    p_status VARCHAR(20) DEFAULT 'scheduled',
    p_last_updated TIMESTAMP DEFAULT NULL,
    p_update_source VARCHAR(100) DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_earnings_id INTEGER;
BEGIN
    INSERT INTO earnings_calendar (
        symbol, exchange_id, earnings_date, time_of_day, eps, eps_estimated,
        eps_surprise, eps_surprise_percent, revenue, revenue_estimated,
        revenue_surprise, revenue_surprise_percent, fiscal_date_ending,
        fiscal_year, fiscal_quarter, market_cap_at_time, sector, industry,
        conference_call_date, conference_call_time, webcast_url,
        transcript_available, status, last_updated, update_source,
        data_provider, created_at, updated_at
    ) VALUES (
        p_symbol, p_exchange_id, p_earnings_date, p_time_of_day, p_eps, p_eps_estimated,
        p_eps_surprise, p_eps_surprise_percent, p_revenue, p_revenue_estimated,
        p_revenue_surprise, p_revenue_surprise_percent, p_fiscal_date_ending,
        p_fiscal_year, p_fiscal_quarter, p_market_cap_at_time, p_sector, p_industry,
        p_conference_call_date, p_conference_call_time, p_webcast_url,
        p_transcript_available, p_status, p_last_updated, p_update_source,
        p_data_provider, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, fiscal_year, fiscal_quarter, data_provider) 
    DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, earnings_calendar.exchange_id),
        earnings_date = COALESCE(EXCLUDED.earnings_date, earnings_calendar.earnings_date),
        time_of_day = COALESCE(EXCLUDED.time_of_day, earnings_calendar.time_of_day),
        eps = COALESCE(EXCLUDED.eps, earnings_calendar.eps),
        eps_estimated = COALESCE(EXCLUDED.eps_estimated, earnings_calendar.eps_estimated),
        eps_surprise = COALESCE(EXCLUDED.eps_surprise, earnings_calendar.eps_surprise),
        eps_surprise_percent = COALESCE(EXCLUDED.eps_surprise_percent, earnings_calendar.eps_surprise_percent),
        revenue = COALESCE(EXCLUDED.revenue, earnings_calendar.revenue),
        revenue_estimated = COALESCE(EXCLUDED.revenue_estimated, earnings_calendar.revenue_estimated),
        revenue_surprise = COALESCE(EXCLUDED.revenue_surprise, earnings_calendar.revenue_surprise),
        revenue_surprise_percent = COALESCE(EXCLUDED.revenue_surprise_percent, earnings_calendar.revenue_surprise_percent),
        fiscal_date_ending = COALESCE(EXCLUDED.fiscal_date_ending, earnings_calendar.fiscal_date_ending),
        market_cap_at_time = COALESCE(EXCLUDED.market_cap_at_time, earnings_calendar.market_cap_at_time),
        sector = COALESCE(EXCLUDED.sector, earnings_calendar.sector),
        industry = COALESCE(EXCLUDED.industry, earnings_calendar.industry),
        conference_call_date = COALESCE(EXCLUDED.conference_call_date, earnings_calendar.conference_call_date),
        conference_call_time = COALESCE(EXCLUDED.conference_call_time, earnings_calendar.conference_call_time),
        webcast_url = COALESCE(EXCLUDED.webcast_url, earnings_calendar.webcast_url),
        transcript_available = COALESCE(EXCLUDED.transcript_available, earnings_calendar.transcript_available),
        status = COALESCE(EXCLUDED.status, earnings_calendar.status),
        last_updated = COALESCE(EXCLUDED.last_updated, earnings_calendar.last_updated),
        update_source = COALESCE(EXCLUDED.update_source, earnings_calendar.update_source),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_earnings_id;

    RETURN v_earnings_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_earnings_calendar IS 'Upserts earnings calendar data with conflict resolution on symbol, fiscal_year, fiscal_quarter, and data_provider';
