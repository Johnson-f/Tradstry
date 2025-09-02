-- Updated Earnings Calendar Upsert Function to match company function pattern
-- Upserts earnings calendar data with conflict resolution on symbol, fiscal_year, fiscal_quarter, and data_provider

-- Tested 

CREATE OR REPLACE FUNCTION upsert_earnings_calendar(
    -- Required parameters (no defaults)
    p_symbol VARCHAR(20),
    p_data_provider VARCHAR(50),
    p_earnings_date DATE,
    p_fiscal_year INTEGER,
    p_fiscal_quarter INTEGER,
    
    -- Exchange parameters (simplified, matching company function)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Optional earnings parameters (with defaults)
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
    v_dividend_id INTEGER;
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

    -- Step 2: Insert/update dividend data
    INSERT INTO dividend_data (
        symbol, exchange_id, declaration_date, ex_dividend_date, record_date,
        payment_date, dividend_amount, dividend_type, currency, frequency,
        dividend_status, dividend_yield, payout_ratio, consecutive_years,
        qualified_dividend, tax_rate, fiscal_year, fiscal_quarter, data_provider,
        created_at, updated_at
    ) VALUES (
        p_symbol, v_exchange_id, p_declaration_date, p_ex_dividend_date, p_record_date,
        p_payment_date, p_dividend_amount, p_dividend_type, p_currency, p_frequency,
        p_dividend_status, p_dividend_yield, p_payout_ratio, p_consecutive_years,
        p_qualified_dividend, p_tax_rate, p_fiscal_year, p_fiscal_quarter, p_data_provider,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, ex_dividend_date, data_provider) 
    DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, dividend_data.exchange_id),
        declaration_date = COALESCE(EXCLUDED.declaration_date, dividend_data.declaration_date),
        record_date = COALESCE(EXCLUDED.record_date, dividend_data.record_date),
        payment_date = COALESCE(EXCLUDED.payment_date, dividend_data.payment_date),
        dividend_amount = COALESCE(EXCLUDED.dividend_amount, dividend_data.dividend_amount),
        dividend_type = COALESCE(EXCLUDED.dividend_type, dividend_data.dividend_type),
        currency = COALESCE(EXCLUDED.currency, dividend_data.currency),
        frequency = COALESCE(EXCLUDED.frequency, dividend_data.frequency),
        dividend_status = COALESCE(EXCLUDED.dividend_status, dividend_data.dividend_status),
        dividend_yield = COALESCE(EXCLUDED.dividend_yield, dividend_data.dividend_yield),
        payout_ratio = COALESCE(EXCLUDED.payout_ratio, dividend_data.payout_ratio),
        consecutive_years = COALESCE(EXCLUDED.consecutive_years, dividend_data.consecutive_years),
        qualified_dividend = COALESCE(EXCLUDED.qualified_dividend, dividend_data.qualified_dividend),
        tax_rate = COALESCE(EXCLUDED.tax_rate, dividend_data.tax_rate),
        fiscal_year = COALESCE(EXCLUDED.fiscal_year, dividend_data.fiscal_year),
        fiscal_quarter = COALESCE(EXCLUDED.fiscal_quarter, dividend_data.fiscal_quarter),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_dividend_id;

    RETURN v_dividend_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_dividend_data IS 'Upserts dividend data with conflict resolution on symbol, ex_dividend_date, and data_provider. Handles exchange upsert automatically.';

-- Test script for Supabase SQL Editor 
/*
-- Test insert: new dividend with automatic exchange handling
SELECT upsert_dividend_data(
    p_symbol => 'AAPL',
    p_data_provider => 'YahooFinance',
    p_ex_dividend_date => '2025-02-07',
    p_dividend_amount => 0.25,
    
    -- Exchange information (replaces p_exchange_id)
    p_exchange_code => 'NASDAQ',
    p_exchange_name => 'NASDAQ Stock Market',
    p_exchange_country => 'USA',
    p_exchange_timezone => 'America/New_York',
    
    -- Dividend information
    p_declaration_date => '2025-01-15',
    p_record_date => '2025-02-10',
    p_payment_date => '2025-02-14',
    p_dividend_type => 'regular',
    p_currency => 'USD',
    p_frequency => 'quarterly',
    p_dividend_status => 'active',
    p_dividend_yield => 0.0065,
    p_payout_ratio => 0.25,
    p_consecutive_years => 12,
    p_qualified_dividend => TRUE,
    p_fiscal_year => 2025,
    p_fiscal_quarter => 1
);
*/