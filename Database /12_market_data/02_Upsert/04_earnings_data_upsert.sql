-- Updated Earnings Data Upsert Function to match company function pattern
-- Upserts earnings data with conflict resolution on symbol, fiscal_year, fiscal_quarter, and data_provider

-- Tested 

CREATE OR REPLACE FUNCTION upsert_earnings_data(
    -- Required parameters (no defaults)
    p_symbol VARCHAR(20),
    p_fiscal_year INTEGER,
    p_fiscal_quarter INTEGER,
    p_reported_date DATE,
    p_data_provider VARCHAR(50),
    
    -- Exchange parameters (simplified, matching company function)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Optional earnings parameters (with defaults)
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
    p_revenue_beat_miss_met VARCHAR(10) DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_earnings_id INTEGER;
    v_exchange_id BIGINT;
BEGIN
    -- Step 1: Handle exchange upsert if exchange data is provided
    IF p_exchange_code IS NOT NULL THEN
        -- Call the exchange upsert function
        SELECT upsert_exchange(
            p_exchange_code,
            p_exchange_name,
            p_exchange_country,
            p_exchange_timezone
        ) INTO v_exchange_id;
    END IF;

    -- Step 2: Insert/update earnings data
    INSERT INTO earnings_data (
        symbol, exchange_id, fiscal_year, fiscal_quarter, reported_date,
        report_type, eps, eps_estimated, eps_surprise, eps_surprise_percent,
        revenue, revenue_estimated, revenue_surprise, revenue_surprise_percent,
        net_income, gross_profit, operating_income, ebitda, operating_margin,
        net_margin, year_over_year_eps_growth, year_over_year_revenue_growth,
        guidance, next_year_eps_guidance, next_year_revenue_guidance,
        conference_call_date, transcript_url, audio_url, eps_beat_miss_met,
        revenue_beat_miss_met, data_provider, created_at, updated_at
    ) VALUES (
        p_symbol, v_exchange_id, p_fiscal_year, p_fiscal_quarter, p_reported_date,
        p_report_type, p_eps, p_eps_estimated, p_eps_surprise, p_eps_surprise_percent,
        p_revenue, p_revenue_estimated, p_revenue_surprise, p_revenue_surprise_percent,
        p_net_income, p_gross_profit, p_operating_income, p_ebitda, p_operating_margin,
        p_net_margin, p_year_over_year_eps_growth, p_year_over_year_revenue_growth,
        p_guidance, p_next_year_eps_guidance, p_next_year_revenue_guidance,
        p_conference_call_date, p_transcript_url, p_audio_url, p_eps_beat_miss_met,
        p_revenue_beat_miss_met, p_data_provider, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, fiscal_year, fiscal_quarter, data_provider) 
    DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, earnings_data.exchange_id),
        reported_date = COALESCE(EXCLUDED.reported_date, earnings_data.reported_date),
        report_type = COALESCE(EXCLUDED.report_type, earnings_data.report_type),
        eps = COALESCE(EXCLUDED.eps, earnings_data.eps),
        eps_estimated = COALESCE(EXCLUDED.eps_estimated, earnings_data.eps_estimated),
        eps_surprise = COALESCE(EXCLUDED.eps_surprise, earnings_data.eps_surprise),
        eps_surprise_percent = COALESCE(EXCLUDED.eps_surprise_percent, earnings_data.eps_surprise_percent),
        revenue = COALESCE(EXCLUDED.revenue, earnings_data.revenue),
        revenue_estimated = COALESCE(EXCLUDED.revenue_estimated, earnings_data.revenue_estimated),
        revenue_surprise = COALESCE(EXCLUDED.revenue_surprise, earnings_data.revenue_surprise),
        revenue_surprise_percent = COALESCE(EXCLUDED.revenue_surprise_percent, earnings_data.revenue_surprise_percent),
        net_income = COALESCE(EXCLUDED.net_income, earnings_data.net_income),
        gross_profit = COALESCE(EXCLUDED.gross_profit, earnings_data.gross_profit),
        operating_income = COALESCE(EXCLUDED.operating_income, earnings_data.operating_income),
        ebitda = COALESCE(EXCLUDED.ebitda, earnings_data.ebitda),
        operating_margin = COALESCE(EXCLUDED.operating_margin, earnings_data.operating_margin),
        net_margin = COALESCE(EXCLUDED.net_margin, earnings_data.net_margin),
        year_over_year_eps_growth = COALESCE(EXCLUDED.year_over_year_eps_growth, earnings_data.year_over_year_eps_growth),
        year_over_year_revenue_growth = COALESCE(EXCLUDED.year_over_year_revenue_growth, earnings_data.year_over_year_revenue_growth),
        guidance = COALESCE(EXCLUDED.guidance, earnings_data.guidance),
        next_year_eps_guidance = COALESCE(EXCLUDED.next_year_eps_guidance, earnings_data.next_year_eps_guidance),
        next_year_revenue_guidance = COALESCE(EXCLUDED.next_year_revenue_guidance, earnings_data.next_year_revenue_guidance),
        conference_call_date = COALESCE(EXCLUDED.conference_call_date, earnings_data.conference_call_date),
        transcript_url = COALESCE(EXCLUDED.transcript_url, earnings_data.transcript_url),
        audio_url = COALESCE(EXCLUDED.audio_url, earnings_data.audio_url),
        eps_beat_miss_met = COALESCE(EXCLUDED.eps_beat_miss_met, earnings_data.eps_beat_miss_met),
        revenue_beat_miss_met = COALESCE(EXCLUDED.revenue_beat_miss_met, earnings_data.revenue_beat_miss_met),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_earnings_id;

    RETURN v_earnings_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_earnings_data IS 'Upserts earnings data with conflict resolution on symbol, fiscal_year, fiscal_quarter, and data_provider. Handles exchange upsert automatically.';

-- Test script for Supabase SQL Editor 
/*
-- Test insert: new earnings data with automatic exchange handling
SELECT upsert_earnings_data(
    p_symbol => 'AAPL',
    p_fiscal_year => 2025,
    p_fiscal_quarter => 2,
    p_reported_date => '2025-04-24',
    p_data_provider => 'YahooFinance',
    
    -- Exchange information (replaces p_exchange_id)
    p_exchange_code => 'NASDAQ',
    p_exchange_name => 'NASDAQ Stock Market',
    p_exchange_country => 'USA',
    p_exchange_timezone => 'America/New_York',
    
    -- Earnings data information
    p_report_type => 'quarterly',
    p_eps => 1.85,
    p_eps_estimated => 1.82,
    p_eps_surprise => 0.03,
    p_eps_surprise_percent => 1.65,
    p_revenue => 125000000000,
    p_revenue_estimated => 123000000000,
    p_revenue_surprise => 2000000000,
    p_revenue_surprise_percent => 1.63,
    p_net_income => 28000000000,
    p_gross_profit => 55000000000,
    p_operating_income => 32000000000,
    p_ebitda => 35000000000,
    p_operating_margin => 0.256,
    p_net_margin => 0.224,
    p_year_over_year_eps_growth => 0.085,
    p_year_over_year_revenue_growth => 0.065,
    p_guidance => 'Strong growth expected in services and iPhone sales',
    p_conference_call_date => '2025-04-24 17:00:00',
    p_transcript_url => 'https://investor.apple.com/transcript-q2-2025',
    p_audio_url => 'https://investor.apple.com/audio-q2-2025',
    p_eps_beat_miss_met => 'beat',
    p_revenue_beat_miss_met => 'beat'
);
*/