-- Updated company function for SELECTIVE REAL-TIME DATA
-- REMOVED: price, pre_market_price, after_hours_price, change, percent_change
-- KEPT: open, high, low, volume, avg_volume, year_high, year_low

CREATE OR REPLACE FUNCTION upsert_company_info(
    p_symbol VARCHAR(20),
    p_data_provider VARCHAR(50),
    
    -- Exchange parameters (simplified)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Basic company information
    p_name VARCHAR(255) DEFAULT NULL,
    p_company_name VARCHAR(255) DEFAULT NULL,
    p_exchange VARCHAR(50) DEFAULT NULL,
    p_sector VARCHAR(100) DEFAULT NULL,
    p_industry VARCHAR(100) DEFAULT NULL,
    p_about TEXT DEFAULT NULL,
    p_employees INTEGER DEFAULT NULL,
    p_logo VARCHAR(500) DEFAULT NULL,
    
    -- Daily price data (kept for trading analysis)
    p_open DECIMAL(15,4) DEFAULT NULL,
    p_high DECIMAL(15,4) DEFAULT NULL,
    p_low DECIMAL(15,4) DEFAULT NULL,
    p_year_high DECIMAL(15,4) DEFAULT NULL,
    p_year_low DECIMAL(15,4) DEFAULT NULL,
    
    -- Volume and trading metrics
    p_volume BIGINT DEFAULT NULL,
    p_avg_volume BIGINT DEFAULT NULL,

    -- Financial ratios and metrics
    p_market_cap BIGINT DEFAULT NULL,
    p_beta DECIMAL(8,4) DEFAULT NULL,
    p_pe_ratio DECIMAL(10,2) DEFAULT NULL,
    p_eps DECIMAL(10,4) DEFAULT NULL,

    -- Dividend information
    p_dividend DECIMAL(10,4) DEFAULT NULL,
    p_yield DECIMAL(7,4) DEFAULT NULL,
    p_ex_dividend DATE DEFAULT NULL,
    p_last_dividend DECIMAL(10,4) DEFAULT NULL,

    -- Fund-specific metrics
    p_net_assets BIGINT DEFAULT NULL,
    p_nav DECIMAL(15,4) DEFAULT NULL,
    p_expense_ratio DECIMAL(7,4) DEFAULT NULL,

    -- Corporate events
    p_earnings_date DATE DEFAULT NULL,

    -- Performance returns
    p_five_day_return DECIMAL(8,4) DEFAULT NULL,
    p_one_month_return DECIMAL(8,4) DEFAULT NULL,
    p_three_month_return DECIMAL(8,4) DEFAULT NULL,
    p_six_month_return DECIMAL(8,4) DEFAULT NULL,
    p_ytd_return DECIMAL(8,4) DEFAULT NULL,
    p_year_return DECIMAL(8,4) DEFAULT NULL,
    p_five_year_return DECIMAL(8,4) DEFAULT NULL,
    p_ten_year_return DECIMAL(8,4) DEFAULT NULL,
    p_max_return DECIMAL(8,4) DEFAULT NULL,

    -- Additional metadata
    p_ipo_date DATE DEFAULT NULL,
    p_currency VARCHAR(3) DEFAULT 'USD',
    p_fiscal_year_end VARCHAR(10) DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_company_id INTEGER;
    v_exchange_id BIGINT;
BEGIN
    -- Step 1: Handle exchange upsert if exchange data is provided
    IF p_exchange_code IS NOT NULL THEN
        -- Call the corrected exchange upsert function with all required parameters
        SELECT upsert_exchange(
            p_exchange_code,
            p_exchange_name,
            p_exchange_country,
            p_exchange_timezone,
            p_currency,  -- Add currency parameter
            p_data_provider  -- Add data_provider parameter
        ) INTO v_exchange_id;
    END IF;

    -- Step 2: Insert/update company info - SELECTIVE REAL-TIME DATA
    INSERT INTO company_info (
        symbol, exchange_id, name, company_name, exchange, sector, industry, about, employees, logo,
        open, high, low, year_high, year_low, volume, avg_volume, market_cap, beta, pe_ratio, eps,
        dividend, yield, ex_dividend, last_dividend,
        net_assets, nav, expense_ratio, earnings_date,
        five_day_return, one_month_return, three_month_return, six_month_return, ytd_return, year_return,
        five_year_return, ten_year_return, max_return,
        ipo_date, currency, fiscal_year_end, data_provider,
        created_at, updated_at
    ) VALUES (
        p_symbol, v_exchange_id, p_name, p_company_name, p_exchange, p_sector, p_industry, p_about, p_employees, p_logo,
        p_open, p_high, p_low, p_year_high, p_year_low, p_volume, p_avg_volume, p_market_cap, p_beta, p_pe_ratio, p_eps,
        p_dividend, p_yield, p_ex_dividend, p_last_dividend,
        p_net_assets, p_nav, p_expense_ratio, p_earnings_date,
        p_five_day_return, p_one_month_return, p_three_month_return, p_six_month_return, p_ytd_return, p_year_return,
        p_five_year_return, p_ten_year_return, p_max_return,
        p_ipo_date, p_currency, p_fiscal_year_end, p_data_provider,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, data_provider)
    DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, company_info.exchange_id),
        name = COALESCE(EXCLUDED.name, company_info.name),
        company_name = COALESCE(EXCLUDED.company_name, company_info.company_name),
        exchange = COALESCE(EXCLUDED.exchange, company_info.exchange),
        industry = COALESCE(EXCLUDED.industry, company_info.industry),
        about = COALESCE(EXCLUDED.about, company_info.about),
        employees = COALESCE(EXCLUDED.employees, company_info.employees),
        logo = COALESCE(EXCLUDED.logo, company_info.logo),

        -- Daily price data (kept for trading analysis)
        open = COALESCE(EXCLUDED.open, company_info.open),
        high = COALESCE(EXCLUDED.high, company_info.high),
        low = COALESCE(EXCLUDED.low, company_info.low),
        year_high = COALESCE(EXCLUDED.year_high, company_info.year_high),
        year_low = COALESCE(EXCLUDED.year_low, company_info.year_low),
        
        -- Volume and trading metrics
        volume = COALESCE(EXCLUDED.volume, company_info.volume),
        avg_volume = COALESCE(EXCLUDED.avg_volume, company_info.avg_volume),

        -- Financial ratios and metrics
        market_cap = COALESCE(EXCLUDED.market_cap, company_info.market_cap),
        beta = COALESCE(EXCLUDED.beta, company_info.beta),
        pe_ratio = COALESCE(EXCLUDED.pe_ratio, company_info.pe_ratio),
        eps = COALESCE(EXCLUDED.eps, company_info.eps),

        -- Dividend information
        dividend = COALESCE(EXCLUDED.dividend, company_info.dividend),
        yield = COALESCE(EXCLUDED.yield, company_info.yield),
        ex_dividend = COALESCE(EXCLUDED.ex_dividend, company_info.ex_dividend),
        last_dividend = COALESCE(EXCLUDED.last_dividend, company_info.last_dividend),

        -- Fund-specific metrics
        net_assets = COALESCE(EXCLUDED.net_assets, company_info.net_assets),
        nav = COALESCE(EXCLUDED.nav, company_info.nav),
        expense_ratio = COALESCE(EXCLUDED.expense_ratio, company_info.expense_ratio),

        -- Corporate events
        earnings_date = COALESCE(EXCLUDED.earnings_date, company_info.earnings_date),

        -- Performance returns
        five_day_return = COALESCE(EXCLUDED.five_day_return, company_info.five_day_return),
        one_month_return = COALESCE(EXCLUDED.one_month_return, company_info.one_month_return),
        three_month_return = COALESCE(EXCLUDED.three_month_return, company_info.three_month_return),
        six_month_return = COALESCE(EXCLUDED.six_month_return, company_info.six_month_return),
        ytd_return = COALESCE(EXCLUDED.ytd_return, company_info.ytd_return),
        year_return = COALESCE(EXCLUDED.year_return, company_info.year_return),
        five_year_return = COALESCE(EXCLUDED.five_year_return, company_info.five_year_return),
        ten_year_return = COALESCE(EXCLUDED.ten_year_return, company_info.ten_year_return),
        max_return = COALESCE(EXCLUDED.max_return, company_info.max_return),

        -- Metadata fields
        ipo_date = COALESCE(EXCLUDED.ipo_date, company_info.ipo_date),
        currency = COALESCE(EXCLUDED.currency, company_info.currency),
        fiscal_year_end = COALESCE(EXCLUDED.fiscal_year_end, company_info.fiscal_year_end),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_company_id;
    RETURN v_company_id;
END;
$$ LANGUAGE plpgsql;


-- Test script for selective real-time company_info upsert 
/*
-- Test insert: selective price data (NO current price, change, percent_change)
SELECT upsert_company_info(
    p_symbol => 'AAPL',
    p_data_provider => 'YahooFinance',
    
    -- Exchange information
    p_exchange_code => 'NASDAQ',
    p_exchange_name => 'NASDAQ Stock Market',
    p_exchange_country => 'USA',
    p_exchange_timezone => 'America/New_York',
    
    -- Basic company information
    p_name => 'Apple',
    p_company_name => 'Apple Inc.',
    p_exchange => 'NASDAQ',
    p_sector => 'Technology',
    p_industry => 'Consumer Electronics',
    p_about => 'Apple Inc. designs, manufactures, and markets consumer electronics, computer software, and online services.',
    p_employees => 164000,
    p_logo => 'https://logo.clearbit.com/apple.com',
    
    -- Daily price data (kept for trading analysis)
    p_open => 183.10,
    p_high => 186.40,
    p_low => 182.75,
    p_year_high => 199.62,
    p_year_low => 164.08,
    
    -- Volume and trading metrics
    p_volume => 54320000,
    p_avg_volume => 58750000,

    -- Financial ratios and metrics
    p_market_cap => 2850000000000,
    p_beta => 1.25,
    p_pe_ratio => 28.45,
    p_eps => 6.52,

    -- Dividend information
    p_dividend => 0.96,
    p_yield => 0.0052,
    p_ex_dividend => '2024-02-09',
    p_last_dividend => 0.24,

    -- Performance returns
    p_five_day_return => 0.0234,
    p_one_month_return => 0.0567,
    p_three_month_return => 0.1245,
    p_six_month_return => 0.0892,
    p_ytd_return => 0.1567,
    p_year_return => 0.2134,
    p_five_year_return => 1.8765,
    p_ten_year_return => 8.9234,
    p_max_return => 12.4567,

    -- Metadata fields
    p_ipo_date => '1980-12-12',
    p_currency => 'USD',
    p_fiscal_year_end => '09-30'
);
*/

-- Updated Dividend Data Upsert Function to match dividend_data table schema
-- Upserts dividend data with conflict resolution on symbol, ex_dividend_date, and data_provider

-- Tested 

CREATE OR REPLACE FUNCTION upsert_dividend_data(
    -- Required parameters (no defaults)
    p_symbol VARCHAR(20),
    p_data_provider VARCHAR(50),
    p_ex_dividend_date DATE,
    p_dividend_amount DECIMAL(10,4),
    
    -- Exchange parameters (simplified, matching company function)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Optional dividend parameters (with defaults matching table schema)
    p_declaration_date DATE DEFAULT NULL,
    p_record_date DATE DEFAULT NULL,
    p_payment_date DATE DEFAULT NULL,
    p_dividend_type VARCHAR(20) DEFAULT 'regular',
    p_currency VARCHAR(3) DEFAULT 'USD',
    p_frequency VARCHAR(20) DEFAULT NULL,
    p_dividend_status VARCHAR(20) DEFAULT 'active',
    p_dividend_yield DECIMAL(7,4) DEFAULT NULL,
    p_payout_ratio DECIMAL(7,4) DEFAULT NULL,
    p_consecutive_years INTEGER DEFAULT NULL,
    p_qualified_dividend BOOLEAN DEFAULT TRUE,
    p_tax_rate DECIMAL(7,4) DEFAULT NULL,
    p_fiscal_year INTEGER DEFAULT NULL,
    p_fiscal_quarter INTEGER DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_dividend_id INTEGER;
    v_exchange_id INTEGER;  -- Changed from BIGINT to INTEGER to match table schema
BEGIN
    -- Step 1: Handle exchange upsert if exchange data is provided
    IF p_exchange_code IS NOT NULL THEN
        -- Call the exchange upsert function with all required parameters
        SELECT upsert_exchange(
            p_exchange_code,
            p_exchange_name,
            p_exchange_country,
            p_exchange_timezone,
            p_currency,
            p_data_provider
        ) INTO v_exchange_id;
    END IF;

    -- Step 2: Insert/update dividend data
    INSERT INTO dividend_data (
        symbol, 
        exchange_id, 
        declaration_date, 
        ex_dividend_date, 
        record_date,
        payment_date, 
        dividend_amount, 
        dividend_type, 
        currency, 
        frequency,
        dividend_status, 
        dividend_yield, 
        payout_ratio, 
        consecutive_years,
        qualified_dividend, 
        tax_rate, 
        fiscal_year, 
        fiscal_quarter, 
        data_provider,
        created_at, 
        updated_at
    ) VALUES (
        p_symbol, 
        v_exchange_id, 
        p_declaration_date, 
        p_ex_dividend_date, 
        p_record_date,
        p_payment_date, 
        p_dividend_amount, 
        p_dividend_type, 
        p_currency, 
        p_frequency,
        p_dividend_status, 
        p_dividend_yield, 
        p_payout_ratio, 
        p_consecutive_years,
        p_qualified_dividend, 
        p_tax_rate, 
        p_fiscal_year, 
        p_fiscal_quarter, 
        p_data_provider,
        CURRENT_TIMESTAMP, 
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, ex_dividend_date, data_provider) 
    DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, dividend_data.exchange_id),
        declaration_date = COALESCE(EXCLUDED.declaration_date, dividend_data.declaration_date),
        record_date = COALESCE(EXCLUDED.record_date, dividend_data.record_date),
        payment_date = COALESCE(EXCLUDED.payment_date, dividend_data.payment_date),
        dividend_amount = EXCLUDED.dividend_amount,  -- Always update amount (required field)
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

-- =====================================================
-- TEST SCRIPT FOR SUPABASE SQL EDITOR
-- =====================================================

/*
-- Test 1: Insert new dividend with automatic exchange handling
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
) AS dividend_id;

-- Test 2: Update existing dividend (same symbol, ex_dividend_date, data_provider)
SELECT upsert_dividend_data(
    p_symbol => 'AAPL',
    p_data_provider => 'YahooFinance',
    p_ex_dividend_date => '2025-02-07',
    p_dividend_amount => 0.26,  -- Updated amount
    p_dividend_yield => 0.0070,  -- Updated yield
    p_payout_ratio => 0.26       -- Updated payout ratio
) AS updated_dividend_id;

-- Test 3: Minimal required parameters only
SELECT upsert_dividend_data(
    p_symbol => 'MSFT',
    p_data_provider => 'AlphaVantage',
    p_ex_dividend_date => '2025-02-15',
    p_dividend_amount => 0.75
) AS minimal_dividend_id;

-- Test 4: Special dividend
SELECT upsert_dividend_data(
    p_symbol => 'GOOGL',
    p_data_provider => 'Finnhub',
    p_ex_dividend_date => '2025-03-01',
    p_dividend_amount => 2.50,
    p_dividend_type => 'special',
    p_frequency => 'one-time'
) AS special_dividend_id;

-- Verify the insertions
SELECT 
    id,
    symbol,
    ex_dividend_date,
    dividend_amount,
    dividend_type,
    frequency,
    data_provider,
    created_at
FROM dividend_data 
ORDER BY created_at DESC 
LIMIT 10;
*/

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
    p_update_source VARCHAR(100) DEFAULT NULL,
    p_logo VARCHAR(500) DEFAULT NULL
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

    -- Step 2: Insert/update earnings calendar data
    INSERT INTO earnings_calendar (
        symbol, exchange_id, earnings_date, time_of_day, eps, eps_estimated,
        eps_surprise, eps_surprise_percent, revenue, revenue_estimated, revenue_surprise,
        revenue_surprise_percent, fiscal_date_ending, fiscal_year, fiscal_quarter,
        market_cap_at_time, sector, industry, conference_call_date, conference_call_time,
        webcast_url, transcript_available, status, last_updated, update_source,
        data_provider, logo, created_at, updated_at
    ) VALUES (
        p_symbol, v_exchange_id, p_earnings_date, p_time_of_day, p_eps, p_eps_estimated,
        p_eps_surprise, p_eps_surprise_percent, p_revenue, p_revenue_estimated, p_revenue_surprise,
        p_revenue_surprise_percent, p_fiscal_date_ending, p_fiscal_year, p_fiscal_quarter,
        p_market_cap_at_time, p_sector, p_industry, p_conference_call_date, p_conference_call_time,
        p_webcast_url, p_transcript_available, p_status, p_last_updated, p_update_source,
        p_data_provider, p_logo, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
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
        logo = COALESCE(EXCLUDED.logo, earnings_calendar.logo),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_earnings_id;

    RETURN v_earnings_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_earnings_calendar IS 'Upserts earnings calendar data with conflict resolution on symbol, fiscal_year, fiscal_quarter, and data_provider. Handles exchange upsert automatically.';

-- Test script for Supabase SQL Editor 
/*
-- Test insert: new earnings calendar entry with automatic exchange handling
SELECT upsert_earnings_calendar(
    p_symbol => 'AAPL',
    p_data_provider => 'AlphaVantage',
    p_earnings_date => '2025-01-30',
    p_fiscal_year => 2025,
    p_fiscal_quarter => 1,
    
    -- Exchange information (replaces p_exchange_id)
    p_exchange_code => 'NASDAQ',
    p_exchange_name => 'NASDAQ Stock Market',
    p_exchange_country => 'USA',
    p_exchange_timezone => 'America/New_York',
    
    -- Earnings information
    p_time_of_day => 'amc',
    p_eps_estimated => 2.35,
    p_revenue_estimated => 124000000000,
    p_sector => 'Technology',
    p_industry => 'Consumer Electronics',
    p_status => 'scheduled',
    p_logo => 'https://logo.clearbit.com/apple.com'
);
*/

-- =====================================================
-- WATCHLIST UPSERT FUNCTIONS
-- =====================================================

-- Upsert a watchlist for the authenticated user
CREATE OR REPLACE FUNCTION upsert_watchlist(
    p_name VARCHAR(255)
)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO watchlist (user_id, name)
    VALUES (auth.uid(), p_name)
    ON CONFLICT (user_id, name) DO UPDATE
    SET updated_at = CURRENT_TIMESTAMP
    RETURNING id;
$$;

-- Upsert a watchlist item (only if user owns the watchlist)
CREATE OR REPLACE FUNCTION upsert_watchlist_item(
    p_watchlist_id INTEGER,
    p_symbol VARCHAR(20),
    p_company_name VARCHAR(255),
    p_price DECIMAL(15, 4),
    p_percent_change DECIMAL(8, 4)
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item_id INTEGER;
    v_watchlist_owner UUID;
BEGIN
    -- Verify the watchlist belongs to the authenticated user
    SELECT user_id INTO v_watchlist_owner
    FROM watchlist
    WHERE id = p_watchlist_id;
    
    IF v_watchlist_owner IS NULL THEN
        RAISE EXCEPTION 'Watchlist not found';
    END IF;
    
    IF v_watchlist_owner != auth.uid() THEN
        RAISE EXCEPTION 'Access denied: You do not own this watchlist';
    END IF;
    
    INSERT INTO watchlist_items (watchlist_id, user_id, symbol, company_name, price, percent_change)
    VALUES (p_watchlist_id, auth.uid(), p_symbol, p_company_name, p_price, p_percent_change)
    ON CONFLICT (watchlist_id, symbol) DO UPDATE
    SET company_name = p_company_name,
        price = p_price,
        percent_change = p_percent_change,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_item_id;

    RETURN v_item_id;
END;
$$;

-- Updated Earnings Transcripts Upsert Function to match new API-based schema
-- Upserts earnings transcripts data with conflict resolution on symbol, year, quarter, and source
-- Redesigned to match finance-query.onrender.com API response structure

CREATE OR REPLACE FUNCTION upsert_earnings_transcripts(
    -- Required parameters matching API structure (no defaults)
    p_symbol VARCHAR(20),
    p_quarter VARCHAR(10),              -- Q1, Q2, Q3, Q4 (matches API)
    p_year INTEGER,                     -- Fiscal year (matches API)
    p_date TIMESTAMP,                   -- Earnings call date (matches API)
    p_transcript TEXT,                  -- Complete transcript text (matches API)
    p_participants JSONB,               -- Array of participant names (matches API)
    
    -- API metadata parameters
    p_source VARCHAR(50) DEFAULT 'finance-query-api',
    p_transcripts_id INTEGER DEFAULT NULL,
    p_retrieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Exchange parameters (for automatic exchange handling)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Optional parameters (with defaults matching table schema)
    p_exchange_id INTEGER DEFAULT NULL,
    p_transcript_length INTEGER DEFAULT NULL,
    p_transcript_language VARCHAR(5) DEFAULT 'en',
    p_reported_eps DECIMAL(10,4) DEFAULT NULL,
    p_reported_revenue BIGINT DEFAULT NULL,
    p_guidance_eps DECIMAL(10,4) DEFAULT NULL,
    p_guidance_revenue BIGINT DEFAULT NULL,
    p_overall_sentiment DECIMAL(3,2) DEFAULT NULL,
    p_confidence_score DECIMAL(3,2) DEFAULT NULL,
    p_key_themes TEXT[] DEFAULT NULL,
    p_risk_factors TEXT[] DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_transcript_id INTEGER;
    v_exchange_id INTEGER;  -- Changed from BIGINT to INTEGER to match table schema
BEGIN
    -- Step 1: Handle exchange upsert if exchange data is provided
    IF p_exchange_code IS NOT NULL THEN
        SELECT upsert_exchange(
            p_exchange_code,
            p_exchange_name,
            p_exchange_country,
            p_exchange_timezone
        ) INTO v_exchange_id;
    ELSE
        v_exchange_id := p_exchange_id;
    END IF;

    -- Step 2: Insert/update earnings transcript data (updated for new schema)
    INSERT INTO earnings_transcripts (
        symbol, 
        exchange_id, 
        quarter, 
        year, 
        date,
        transcript, 
        participants, 
        source,
        transcripts_id,
        retrieved_at,
        transcript_length, 
        transcript_language,
        reported_eps, 
        reported_revenue, 
        guidance_eps,
        guidance_revenue, 
        overall_sentiment, 
        confidence_score, 
        key_themes,
        risk_factors, 
        created_at, 
        updated_at
    ) VALUES (
        p_symbol, 
        v_exchange_id, 
        p_quarter, 
        p_year, 
        p_date,
        p_transcript, 
        p_participants, 
        p_source,
        p_transcripts_id,
        p_retrieved_at,
        p_transcript_length, 
        p_transcript_language,
        p_reported_eps, 
        p_reported_revenue, 
        p_guidance_eps,
        p_guidance_revenue, 
        p_overall_sentiment, 
        p_confidence_score, 
        p_key_themes,
        p_risk_factors, 
        CURRENT_TIMESTAMP, 
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, year, quarter, source) 
    DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, earnings_transcripts.exchange_id),
        date = EXCLUDED.date,  -- Always update (required field)
        transcript = EXCLUDED.transcript,  -- Always update (required field)
        participants = EXCLUDED.participants,  -- Always update (required field)
        transcripts_id = COALESCE(EXCLUDED.transcripts_id, earnings_transcripts.transcripts_id),
        retrieved_at = EXCLUDED.retrieved_at,  -- Always update to track latest retrieval
        transcript_length = COALESCE(EXCLUDED.transcript_length, earnings_transcripts.transcript_length),
        transcript_language = COALESCE(EXCLUDED.transcript_language, earnings_transcripts.transcript_language),
        reported_eps = COALESCE(EXCLUDED.reported_eps, earnings_transcripts.reported_eps),
        reported_revenue = COALESCE(EXCLUDED.reported_revenue, earnings_transcripts.reported_revenue),
        guidance_eps = COALESCE(EXCLUDED.guidance_eps, earnings_transcripts.guidance_eps),
        guidance_revenue = COALESCE(EXCLUDED.guidance_revenue, earnings_transcripts.guidance_revenue),
        overall_sentiment = COALESCE(EXCLUDED.overall_sentiment, earnings_transcripts.overall_sentiment),
        confidence_score = COALESCE(EXCLUDED.confidence_score, earnings_transcripts.confidence_score),
        key_themes = COALESCE(EXCLUDED.key_themes, earnings_transcripts.key_themes),
        risk_factors = COALESCE(EXCLUDED.risk_factors, earnings_transcripts.risk_factors),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_transcript_id;

    RETURN v_transcript_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comments
COMMENT ON FUNCTION upsert_earnings_transcripts IS 'Upserts earnings transcripts data from finance-query API with conflict resolution on symbol, year, quarter, and source. Participants stored as JSONB array. Handles exchange upsert automatically.';


-- =====================================================
-- TEST SCRIPT FOR SUPABASE SQL EDITOR
-- =====================================================

/*
-- Test 1: Insert new earnings transcript matching API structure
SELECT upsert_earnings_transcripts(
    p_symbol => 'TSLA',
    p_quarter => 'Q3',
    p_year => 2024,
    p_date => '2024-09-15T00:00:00'::timestamp,
    p_transcript => 'Travis Axelrod: Good afternoon, everyone, and welcome to Tesla''s Third Quarter 2024 Q&A webcast...',
    p_participants => '["Travis Axelrod", "Elon Musk", "Ashok Elluswamy", "Vaibhav Taneja", "Lars Moravy", "Ferragu Pierre", "Adam Jonas"]'::jsonb,
    
    -- API metadata
    p_source => 'finance-query-api',
    p_transcripts_id => 303380,
    p_retrieved_at => '2025-09-23T14:41:46.502327'::timestamp,
    
    -- Exchange information
    p_exchange_code => 'NASDAQ',
    p_exchange_name => 'NASDAQ Stock Market',
    p_exchange_country => 'USA',
    p_exchange_timezone => 'America/New_York',
    
    -- Optional analysis data
    p_transcript_length => 50000,
    p_reported_eps => 0.72,
    p_reported_revenue => 25182000000,
    p_overall_sentiment => 0.85,
    p_confidence_score => 0.92,
    p_key_themes => ARRAY['Cybercab', 'FSD improvements', 'Energy storage growth', 'Optimus development'],
    p_risk_factors => ARRAY['Regulatory approval delays', 'Competition in EV market']
) AS transcript_id;

-- Test 2: Update existing transcript (same symbol, year, quarter, source)
SELECT upsert_earnings_transcripts(
    p_symbol => 'TSLA',
    p_quarter => 'Q3',
    p_year => 2024,
    p_date => '2024-09-15T00:00:00'::timestamp,
    p_transcript => 'Updated transcript with additional Q&A section...',
    p_participants => '["Travis Axelrod", "Elon Musk", "Ashok Elluswamy", "Vaibhav Taneja"]'::jsonb,
    p_overall_sentiment => 0.90,  -- Updated sentiment
    p_confidence_score => 0.95    -- Updated confidence
) AS updated_transcript_id;

-- Test 3: Minimal required parameters only
SELECT upsert_earnings_transcripts(
    p_symbol => 'AAPL',
    p_quarter => 'Q1',
    p_year => 2025,
    p_date => '2025-01-30T17:00:00'::timestamp,
    p_transcript => 'Apple Q1 2025 earnings transcript...',
    p_participants => '["Tim Cook", "Luca Maestri"]'::jsonb
) AS minimal_transcript_id;

-- Test 4: Query participants using JSONB operators
-- Find transcripts where Elon Musk participated
SELECT id, symbol, quarter, year, participants 
FROM earnings_transcripts 
WHERE participants ? 'Elon Musk';

-- Find all participants for a specific transcript
SELECT 
    symbol,
    quarter, 
    year,
    jsonb_array_elements_text(participants) AS participant_name
FROM earnings_transcripts 
WHERE symbol = 'TSLA' AND year = 2024 AND quarter = 'Q3';

-- Verify the insertions (updated for new schema)
SELECT 
    et.id,
    et.symbol,
    et.quarter,
    et.year,
    et.date,
    et.source,
    et.transcripts_id,
    et.overall_sentiment,
    et.participants,
    et.created_at
FROM earnings_transcripts et
ORDER BY et.created_at DESC 
LIMIT 5;

-- Example: RAG integration - Index transcript for AI context retrieval
-- This would be called by your backend service to enable AI chat context
SELECT upsert_rag_market_document(
    p_user_id => 'system',  -- System-generated content
    p_document_type => 'earnings_transcript',
    p_title => 'TSLA Q3 2024 Earnings Call',
    p_content => 'Travis Axelrod: Good afternoon, everyone, and welcome to Tesla''s Third Quarter 2024 Q&A webcast...',
    p_symbol => 'TSLA',
    p_metadata => jsonb_build_object(
        'quarter', 'Q3',
        'year', 2024,
        'participants', '["Travis Axelrod", "Elon Musk", "Ashok Elluswamy"]'::jsonb,
        'sentiment', 0.85,
        'source', 'finance-query-api'
    ),
    p_expires_at => (CURRENT_DATE + INTERVAL '2 years')::timestamp  -- Keep for 2 years
) AS rag_document_id;
*/

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

CREATE OR REPLACE FUNCTION upsert_historical_price(
    p_symbol TEXT,
    p_timestamp_utc TIMESTAMP,
    p_time_interval TEXT,
    p_data_provider TEXT,
    
    -- Exchange parameters (for automatic exchange handling)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Price data parameters
    p_open DECIMAL(15,4) DEFAULT NULL,
    p_high DECIMAL(15,4) DEFAULT NULL,
    p_low DECIMAL(15,4) DEFAULT NULL,
    p_close DECIMAL(15,4) DEFAULT NULL,
    p_adjusted_close DECIMAL(15,4) DEFAULT NULL,
    p_volume BIGINT DEFAULT NULL,
    p_dividend DECIMAL(10,4) DEFAULT NULL,
    p_split_ratio DECIMAL(10,4) DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
    v_exchange_id INTEGER;
BEGIN
    -- Step 1: Validate time_interval parameter only
    IF p_time_interval NOT IN ('5m', '15m', '30m', '1h', '1d', '1wk', '1mo') THEN
        RAISE EXCEPTION 'Invalid time_interval: %. Must be one of: 5m, 15m, 30m, 1h, 1d, 1wk, 1mo', p_time_interval;
    END IF;

    -- Step 2: Handle exchange upsert if exchange data is provided
    IF p_exchange_code IS NOT NULL THEN
        SELECT upsert_exchange(
            p_exchange_code,
            p_exchange_name,
            p_exchange_country,
            p_exchange_timezone
        ) INTO v_exchange_id;
    END IF;

    -- Step 3: Insert/update historical price data (interval-only storage)
    INSERT INTO historical_prices (
        symbol, exchange_id, timestamp_utc, time_interval,
        open, high, low, close, adjusted_close, volume, 
        dividend, split_ratio, data_provider,
        created_at, updated_at
    )
    VALUES (
        p_symbol, v_exchange_id, p_timestamp_utc, p_time_interval,
        p_open, p_high, p_low, p_close, p_adjusted_close, p_volume, 
        COALESCE(p_dividend, 0), COALESCE(p_split_ratio, 1.0), p_data_provider,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, timestamp_utc, time_interval, data_provider) DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, historical_prices.exchange_id),
        open = COALESCE(EXCLUDED.open, historical_prices.open),
        high = COALESCE(EXCLUDED.high, historical_prices.high),
        low = COALESCE(EXCLUDED.low, historical_prices.low),
        close = COALESCE(EXCLUDED.close, historical_prices.close),
        adjusted_close = COALESCE(EXCLUDED.adjusted_close, historical_prices.adjusted_close),
        volume = COALESCE(EXCLUDED.volume, historical_prices.volume),
        dividend = COALESCE(EXCLUDED.dividend, historical_prices.dividend),
        split_ratio = COALESCE(EXCLUDED.split_ratio, historical_prices.split_ratio),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;


-- Example usage for 5-minute interval data:
-- SELECT upsert_historical_price(
--     'AAPL',                          -- symbol
--     '2025-09-12 14:55:00'::TIMESTAMP, -- timestamp_utc
--     '5m',                            -- time_interval (no range needed)
--     'alpha_vantage',                 -- data_provider
--     'NASDAQ',                        -- exchange_code
--     'NASDAQ Stock Market',           -- exchange_name
--     'US',                            -- exchange_country
--     'America/New_York',              -- exchange_timezone
--     394.15,                          -- open
--     394.16,                          -- high
--     393.7,                           -- low
--     393.75,                          -- close
--     NULL,                            -- adjusted_close (typically null for intraday)
--     218081,                          -- volume
--     NULL,                            -- dividend
--     1.0                              -- split_ratio
-- );

-- Example usage for daily data:
-- SELECT upsert_historical_price(
--     'AAPL',                          -- symbol
--     '2020-06-01 00:00:00'::TIMESTAMP, -- timestamp_utc (midnight for daily data)
--     '1d',                            -- time_interval (no range needed)
--     'alpha_vantage',                 -- data_provider
--     'NASDAQ',                        -- exchange_code
--     'NASDAQ Stock Market',           -- exchange_name
--     'US',                            -- exchange_country
--     'America/New_York',              -- exchange_timezone
--     57.2,                            -- open
--     72.51,                           -- high
--     56.94,                           -- low
--     71.99,                           -- close
--     71.99,                           -- adjusted_close
--     3836590500,                      -- volume
--     0.0,                             -- dividend
--     1.0                              -- split_ratio
-- );

-- ----------------------------------------------------------------------------
-- Function: upsert_finance_news (For finance-query.onrender.com API)
-- ----------------------------------------------------------------------------
-- This function handles inserting/updating finance news data from the 
-- finance-query API with proper conflict resolution and stock symbol tracking

CREATE OR REPLACE FUNCTION upsert_finance_news(
    -- Required parameters from finance-query API
    p_title TEXT,
    p_news_url TEXT,
    p_source_name TEXT,
    p_time_published TEXT,
    p_published_at TIMESTAMP,
    
    -- Optional parameters from API
    p_image_url TEXT DEFAULT NULL,
    
    -- Calculated parameters (from Edge Function processing)
    p_sentiment_score NUMERIC DEFAULT NULL,
    p_relevance_score NUMERIC DEFAULT NULL,
    p_sentiment_confidence NUMERIC DEFAULT NULL,
    p_mentioned_symbols TEXT[] DEFAULT NULL,
    p_primary_symbols TEXT[] DEFAULT NULL,
    p_word_count INTEGER DEFAULT 0,
    
    -- Metadata parameters
    p_language VARCHAR(5) DEFAULT 'en',
    p_category VARCHAR(50) DEFAULT 'financial'
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    -- Insert/update finance news article
    INSERT INTO finance_news (
        title, news_url, source_name, image_url, time_published, published_at,
        sentiment_score, relevance_score, sentiment_confidence, mentioned_symbols,
        primary_symbols, word_count, language, category, api_fetch_timestamp,
        created_at, updated_at
    )
    VALUES (
        p_title, p_news_url, p_source_name, p_image_url, p_time_published, p_published_at,
        p_sentiment_score, p_relevance_score, p_sentiment_confidence, p_mentioned_symbols,
        p_primary_symbols, p_word_count, p_language, p_category, CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (news_url) DO UPDATE SET
        title = COALESCE(EXCLUDED.title, finance_news.title),
        source_name = COALESCE(EXCLUDED.source_name, finance_news.source_name),
        image_url = COALESCE(EXCLUDED.image_url, finance_news.image_url),
        time_published = COALESCE(EXCLUDED.time_published, finance_news.time_published),
        published_at = COALESCE(EXCLUDED.published_at, finance_news.published_at),
        sentiment_score = COALESCE(EXCLUDED.sentiment_score, finance_news.sentiment_score),
        relevance_score = COALESCE(EXCLUDED.relevance_score, finance_news.relevance_score),
        sentiment_confidence = COALESCE(EXCLUDED.sentiment_confidence, finance_news.sentiment_confidence),
        mentioned_symbols = COALESCE(EXCLUDED.mentioned_symbols, finance_news.mentioned_symbols),
        primary_symbols = COALESCE(EXCLUDED.primary_symbols, finance_news.primary_symbols),
        word_count = COALESCE(EXCLUDED.word_count, finance_news.word_count),
        language = COALESCE(EXCLUDED.language, finance_news.language),
        category = COALESCE(EXCLUDED.category, finance_news.category),
        api_fetch_timestamp = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_finance_news IS 'Upserts finance news data from finance-query API with conflict resolution on news_url. Handles sentiment analysis and stock symbol tracking.';

-- ----------------------------------------------------------------------------
-- Function: upsert_finance_news_stock_relationship
-- ----------------------------------------------------------------------------
-- This function creates relationships between finance news and stock symbols

CREATE OR REPLACE FUNCTION upsert_finance_news_stock(
    -- Required parameters
    p_finance_news_id BIGINT,
    p_stock_symbol VARCHAR(10),
    
    -- Optional parameters
    p_mention_type VARCHAR(20) DEFAULT 'mentioned',
    p_sentiment_impact NUMERIC DEFAULT NULL,
    p_confidence_score NUMERIC DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    -- Insert/update finance news stock relationship
    INSERT INTO finance_news_stocks (
        finance_news_id, stock_symbol, mention_type, sentiment_impact, 
        confidence_score, created_at
    )
    VALUES (
        p_finance_news_id, p_stock_symbol, p_mention_type, p_sentiment_impact,
        p_confidence_score, CURRENT_TIMESTAMP
    )
    ON CONFLICT (finance_news_id, stock_symbol) DO UPDATE SET
        mention_type = COALESCE(EXCLUDED.mention_type, finance_news_stocks.mention_type),
        sentiment_impact = COALESCE(EXCLUDED.sentiment_impact, finance_news_stocks.sentiment_impact),
        confidence_score = COALESCE(EXCLUDED.confidence_score, finance_news_stocks.confidence_score);
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_finance_news_stock IS 'Upserts finance news stock relationship with conflict resolution on finance_news_id and stock_symbol.';

-- ----------------------------------------------------------------------------
-- Bulk function: Process finance news with stock symbols
-- ----------------------------------------------------------------------------
-- This function combines news upsert with automatic stock relationship creation

CREATE OR REPLACE FUNCTION process_finance_news_with_symbols(
    -- News data
    p_title TEXT,
    p_news_url TEXT,
    p_source_name TEXT,
    p_time_published TEXT,
    p_published_at TIMESTAMP,
    p_image_url TEXT DEFAULT NULL,
    p_sentiment_score NUMERIC DEFAULT NULL,
    p_relevance_score NUMERIC DEFAULT NULL,
    p_sentiment_confidence NUMERIC DEFAULT NULL,
    p_mentioned_symbols TEXT[] DEFAULT NULL,
    p_primary_symbols TEXT[] DEFAULT NULL,
    p_word_count INTEGER DEFAULT 0,
    p_language VARCHAR(5) DEFAULT 'en',
    p_category VARCHAR(50) DEFAULT 'financial'
) RETURNS BIGINT AS $$
DECLARE
    v_news_id BIGINT;
    v_symbol TEXT;
    v_mention_type TEXT;
BEGIN
    -- Insert the news article first
    v_news_id := upsert_finance_news(
        p_title, p_news_url, p_source_name, p_time_published, p_published_at,
        p_image_url, p_sentiment_score, p_relevance_score, p_sentiment_confidence,
        p_mentioned_symbols, p_primary_symbols, p_word_count, p_language, p_category
    );
    
    -- Process primary symbols (high confidence)
    IF p_primary_symbols IS NOT NULL THEN
        FOREACH v_symbol IN ARRAY p_primary_symbols
        LOOP
            PERFORM upsert_finance_news_stock(
                v_news_id, v_symbol, 'primary', p_sentiment_score, 0.9
            );
        END LOOP;
    END IF;
    
    -- Process mentioned symbols (lower confidence)
    IF p_mentioned_symbols IS NOT NULL THEN
        FOREACH v_symbol IN ARRAY p_mentioned_symbols
        LOOP
            -- Only add if not already added as primary
            IF p_primary_symbols IS NULL OR NOT (v_symbol = ANY(p_primary_symbols)) THEN
                PERFORM upsert_finance_news_stock(
                    v_news_id, v_symbol, 'mentioned', p_sentiment_score * 0.7, 0.6
                );
            END IF;
        END LOOP;
    END IF;
    
    RETURN v_news_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION process_finance_news_with_symbols IS 'Complete processing of finance news including automatic stock symbol relationship creation';

-- ----------------------------------------------------------------------------
-- Test script for Supabase SQL Editor 
-- ----------------------------------------------------------------------------
/*
-- Test insert: new finance news article
SELECT upsert_finance_news(
    p_title => 'Apple Stock Surges After Strong Earnings Report',
    p_news_url => 'https://finance-query.onrender.com/news/apple-earnings-2024',
    p_source_name => 'Reuters',
    p_time_published => '2 hours ago',
    p_published_at => NOW() - INTERVAL '2 hours',
    p_image_url => 'https://example.com/apple-chart.jpg',
    p_sentiment_score => 0.75,
    p_relevance_score => 0.95,
    p_sentiment_confidence => 0.88,
    p_mentioned_symbols => ARRAY['AAPL', 'MSFT', 'GOOGL'],
    p_primary_symbols => ARRAY['AAPL'],
    p_word_count => 45,
    p_language => 'en',
    p_category => 'earnings'
);

-- Test bulk processing with automatic stock relationships
SELECT process_finance_news_with_symbols(
    p_title => 'Tesla Reports Q4 Delivery Numbers Beat Expectations',
    p_news_url => 'https://finance-query.onrender.com/news/tesla-q4-deliveries',
    p_source_name => 'MarketWatch',
    p_time_published => '1 hour ago',
    p_published_at => NOW() - INTERVAL '1 hour',
    p_sentiment_score => 0.85,
    p_relevance_score => 0.92,
    p_sentiment_confidence => 0.91,
    p_mentioned_symbols => ARRAY['TSLA', 'F', 'GM'],
    p_primary_symbols => ARRAY['TSLA'],
    p_word_count => 52
);

-- Query to verify data
SELECT f.title, f.source_name, f.sentiment_score, 
       array_agg(fns.stock_symbol) as symbols
FROM finance_news f
LEFT JOIN finance_news_stocks fns ON f.id = fns.finance_news_id
WHERE f.created_at >= NOW() - INTERVAL '1 day'
GROUP BY f.id, f.title, f.source_name, f.sentiment_score
ORDER BY f.published_at DESC;
*/

-- ----------------------------------------------------------------------------
-- Function: upsert_news_article (Updated to match news_articles table structure)
-- ----------------------------------------------------------------------------

-- Tested 

CREATE OR REPLACE FUNCTION upsert_news_article(
    -- Required parameters (no defaults)
    p_title TEXT,
    p_published_at TIMESTAMP,
    p_data_provider TEXT,
    
    -- Optional content parameters
    p_summary TEXT DEFAULT NULL,
    p_content TEXT DEFAULT NULL,
    p_url TEXT DEFAULT NULL,
    p_source VARCHAR(100) DEFAULT NULL,
    p_author VARCHAR(255) DEFAULT NULL,
    p_category VARCHAR(50) DEFAULT NULL,
    
    -- Sentiment and analysis parameters
    p_sentiment NUMERIC DEFAULT NULL,
    p_relevance_score NUMERIC DEFAULT NULL,
    p_sentiment_confidence NUMERIC DEFAULT NULL,
    
    -- Content metadata parameters
    p_language VARCHAR(5) DEFAULT 'en',
    p_word_count INTEGER DEFAULT NULL,
    p_image_url TEXT DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    -- Insert/update news article
    INSERT INTO news_articles (
        title, summary, content, url, source, published_at, author, category,
        sentiment, relevance_score, sentiment_confidence, language, word_count,
        image_url, tags, data_provider, created_at, updated_at
    )
    VALUES (
        p_title, p_summary, p_content, p_url, p_source, p_published_at, p_author, p_category,
        p_sentiment, p_relevance_score, p_sentiment_confidence, p_language, p_word_count,
        p_image_url, p_tags, p_data_provider, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (url) DO UPDATE SET
        title = COALESCE(EXCLUDED.title, news_articles.title),
        summary = COALESCE(EXCLUDED.summary, news_articles.summary),
        content = COALESCE(EXCLUDED.content, news_articles.content),
        source = COALESCE(EXCLUDED.source, news_articles.source),
        published_at = COALESCE(EXCLUDED.published_at, news_articles.published_at),
        author = COALESCE(EXCLUDED.author, news_articles.author),
        category = COALESCE(EXCLUDED.category, news_articles.category),
        sentiment = COALESCE(EXCLUDED.sentiment, news_articles.sentiment),
        relevance_score = COALESCE(EXCLUDED.relevance_score, news_articles.relevance_score),
        sentiment_confidence = COALESCE(EXCLUDED.sentiment_confidence, news_articles.sentiment_confidence),
        language = COALESCE(EXCLUDED.language, news_articles.language),
        word_count = COALESCE(EXCLUDED.word_count, news_articles.word_count),
        image_url = COALESCE(EXCLUDED.image_url, news_articles.image_url),
        tags = COALESCE(EXCLUDED.tags, news_articles.tags),
        data_provider = COALESCE(EXCLUDED.data_provider, news_articles.data_provider),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_news_article IS 'Upserts news article data with conflict resolution on url. Handles all news metadata and sentiment analysis.';

-- ----------------------------------------------------------------------------
-- Updated News Stock Upsert Function to match news_stocks table structure
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_news_stock(
    -- Required parameters (no defaults)
    p_news_id INTEGER,
    p_stock_id INTEGER,
    
    -- Optional parameters
    p_mention_type VARCHAR(20) DEFAULT 'mentioned',
    p_sentiment_impact NUMERIC DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    -- Insert/update news stock relationship
    INSERT INTO news_stocks (
        news_id, stock_id, mention_type, sentiment_impact, created_at
    )
    VALUES (
        p_news_id, p_stock_id, p_mention_type, p_sentiment_impact, CURRENT_TIMESTAMP
    )
    ON CONFLICT (news_id, stock_id) DO UPDATE SET
        mention_type = COALESCE(EXCLUDED.mention_type, news_stocks.mention_type),
        sentiment_impact = COALESCE(EXCLUDED.sentiment_impact, news_stocks.sentiment_impact);
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_news_stock IS 'Upserts news stock relationship with conflict resolution on news_id and stock_id.';


-- ----------------------------------------------------------------------------
-- Test script for Supabase SQL Editor 
-- ----------------------------------------------------------------------------
/*
-- Test insert: new news article
SELECT upsert_news_article(
    p_title => 'Apple Reports Strong Q4 Earnings',
    p_published_at => '2024-03-15 10:30:00'::TIMESTAMP,
    p_data_provider => 'finnhub',
    
    -- Content data
    p_summary => 'Apple Inc. reported better-than-expected quarterly earnings...',
    p_content => 'Full article content here...',
    p_url => 'https://example.com/apple-earnings-q4-2024',
    p_source => 'Reuters',
    p_author => 'John Smith',
    p_category => 'earnings',
    
    -- Sentiment analysis
    p_sentiment => 0.75,
    p_relevance_score => 0.95,
    p_sentiment_confidence => 0.88,
    
    -- Metadata
    p_language => 'en',
    p_word_count => 1250,
    p_image_url => 'https://example.com/apple-logo.jpg',
    p_tags => ARRAY['Apple', 'earnings', 'technology', 'Q4']
);

-- Test insert: link news article to stock (assuming news article ID = 1, stock ID = 1)
SELECT upsert_news_stock(
    p_news_id => 1,
    p_stock_id => 1,
    p_mention_type => 'primary',
    p_sentiment_impact => 0.80
);
*/

-- ----------------------------------------------------------------------------
-- Function: upsert_options_chain (Updated to match options_chain table structure)
-- ----------------------------------------------------------------------------

-- Tested 

CREATE OR REPLACE FUNCTION upsert_options_chain(
    -- Required parameters (no defaults)
    p_symbol TEXT,
    p_underlying_symbol TEXT,
    p_expiration DATE,
    p_strike NUMERIC,
    p_option_type TEXT,
    p_data_provider TEXT,
    
    -- Exchange parameters (simplified, matching company function)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Optional options parameters (with defaults)
    p_bid NUMERIC DEFAULT NULL,
    p_ask NUMERIC DEFAULT NULL,
    p_last_price NUMERIC DEFAULT NULL,
    p_volume INTEGER DEFAULT NULL,
    p_open_interest INTEGER DEFAULT NULL,
    p_implied_volatility NUMERIC DEFAULT NULL,
    p_delta NUMERIC DEFAULT NULL,
    p_gamma NUMERIC DEFAULT NULL,
    p_theta NUMERIC DEFAULT NULL,
    p_vega NUMERIC DEFAULT NULL,
    p_rho NUMERIC DEFAULT NULL,
    p_intrinsic_value NUMERIC DEFAULT NULL,
    p_extrinsic_value NUMERIC DEFAULT NULL,
    p_time_value NUMERIC DEFAULT NULL,
    p_quote_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
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

    -- Step 2: Insert/update options chain data
    INSERT INTO options_chain (
        symbol, underlying_symbol, exchange_id, strike, expiration, option_type,
        bid, ask, last_price, volume, open_interest, implied_volatility,
        delta, gamma, theta, vega, rho, intrinsic_value, extrinsic_value, time_value,
        quote_timestamp, data_provider, created_at, updated_at
    )
    VALUES (
        p_symbol, p_underlying_symbol, v_exchange_id, p_strike, p_expiration, p_option_type,
        p_bid, p_ask, p_last_price, p_volume, p_open_interest, p_implied_volatility,
        p_delta, p_gamma, p_theta, p_vega, p_rho, p_intrinsic_value, p_extrinsic_value, p_time_value,
        p_quote_timestamp, p_data_provider, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, quote_timestamp, data_provider) DO UPDATE SET
        underlying_symbol = COALESCE(EXCLUDED.underlying_symbol, options_chain.underlying_symbol),
        exchange_id = COALESCE(EXCLUDED.exchange_id, options_chain.exchange_id),
        strike = COALESCE(EXCLUDED.strike, options_chain.strike),
        expiration = COALESCE(EXCLUDED.expiration, options_chain.expiration),
        option_type = COALESCE(EXCLUDED.option_type, options_chain.option_type),
        bid = COALESCE(EXCLUDED.bid, options_chain.bid),
        ask = COALESCE(EXCLUDED.ask, options_chain.ask),
        last_price = COALESCE(EXCLUDED.last_price, options_chain.last_price),
        volume = COALESCE(EXCLUDED.volume, options_chain.volume),
        open_interest = COALESCE(EXCLUDED.open_interest, options_chain.open_interest),
        implied_volatility = COALESCE(EXCLUDED.implied_volatility, options_chain.implied_volatility),
        delta = COALESCE(EXCLUDED.delta, options_chain.delta),
        gamma = COALESCE(EXCLUDED.gamma, options_chain.gamma),
        theta = COALESCE(EXCLUDED.theta, options_chain.theta),
        vega = COALESCE(EXCLUDED.vega, options_chain.vega),
        rho = COALESCE(EXCLUDED.rho, options_chain.rho),
        intrinsic_value = COALESCE(EXCLUDED.intrinsic_value, options_chain.intrinsic_value),
        extrinsic_value = COALESCE(EXCLUDED.extrinsic_value, options_chain.extrinsic_value),
        time_value = COALESCE(EXCLUDED.time_value, options_chain.time_value),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_options_chain IS 'Upserts options chain data with conflict resolution on symbol, quote_timestamp, and data_provider. Handles exchange upsert automatically.';
-- ----------------------------------------------------------------------------
-- Test script for Supabase SQL Editor 
-- ----------------------------------------------------------------------------
/*
-- Test insert: new options chain with automatic exchange handling
SELECT upsert_options_chain(
    p_symbol => 'AAPL240315C00150000',
    p_underlying_symbol => 'AAPL',
    p_expiration => '2024-03-15'::DATE,
    p_strike => 150.00,
    p_option_type => 'call',
    p_data_provider => 'polygon',
    
    -- Exchange information
    p_exchange_code => 'NASDAQ',
    p_exchange_name => 'NASDAQ Stock Market',
    p_exchange_country => 'USA',
    p_exchange_timezone => 'America/New_York',
    
    -- Options data
    p_bid => 12.40,
    p_ask => 12.60,
    p_last_price => 12.50,
    p_volume => 150,
    p_open_interest => 1250,
    p_implied_volatility => 0.25,
    p_delta => 0.65,
    p_gamma => 0.012,
    p_theta => -0.08,
    p_vega => 0.15,
    p_rho => 0.45,
    p_intrinsic_value => 5.00,
    p_extrinsic_value => 2.50,
    p_time_value => 7.50,
    p_quote_timestamp => NOW()::TIMESTAMP  -- Cast to TIMESTAMP instead of TIMESTAMP WITH TIME ZONE
);
);

-- Test update: same option with new price data
SELECT upsert_options_chain(
    p_symbol => 'AAPL240315C00150000',
    p_underlying_symbol => 'AAPL',
    p_expiration => '2024-03-15',
    p_strike => 150.00,
    p_option_type => 'call',
    p_data_provider => 'polygon',
    p_last_price => 13.25,
    p_bid => 13.15,
    p_ask => 13.35,
    p_volume => 275
);
*/

-- ----------------------------------------------------------------------------
-- Function: upsert_exchange
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_exchange(
    p_exchange_code TEXT,
    p_exchange_name TEXT,
    p_country TEXT,
    p_timezone TEXT,
    p_currency TEXT,
    p_data_provider TEXT
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO exchanges (
        exchange_code, exchange_name, country, timezone, currency, data_provider
    )
    VALUES (
        p_exchange_code, p_exchange_name, p_country, p_timezone, p_currency, p_data_provider
    )
    ON CONFLICT (exchange_code, data_provider) DO UPDATE SET
        exchange_name = COALESCE(p_exchange_name, excluded.exchange_name),
        country = COALESCE(p_country, excluded.country),
        timezone = COALESCE(p_timezone, excluded.timezone),
        currency = COALESCE(p_currency, excluded.currency),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Holders Data Upsert Functions
-- Comprehensive upsert functions for all holder types from finance-query API
-- Handles institutional, mutual fund, and insider data
-- =============================================

-- =============================================
-- Function: upsert_institutional_holder
-- Upserts institutional holder data
-- =============================================

CREATE OR REPLACE FUNCTION upsert_institutional_holder(
    p_symbol VARCHAR(10),
    p_holder_name VARCHAR(500),
    p_shares BIGINT,
    p_date_reported TIMESTAMPTZ,
    p_value BIGINT DEFAULT NULL,
    p_data_source VARCHAR(50) DEFAULT 'finance_api'
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    -- Insert or update institutional holder data
    INSERT INTO public.holders (
        symbol,
        holder_type,
        holder_name,
        shares,
        value,
        date_reported,
        data_source
    ) VALUES (
        p_symbol,
        'institutional',
        p_holder_name,
        p_shares,
        p_value,
        p_date_reported,
        p_data_source
    )
    ON CONFLICT (symbol, holder_type, holder_name, date_reported)
    WHERE holder_type = 'institutional'
    DO UPDATE SET
        shares = EXCLUDED.shares,
        value = EXCLUDED.value,
        data_source = EXCLUDED.data_source,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: upsert_mutualfund_holder
-- Upserts mutual fund holder data
-- =============================================

CREATE OR REPLACE FUNCTION upsert_mutualfund_holder(
    p_symbol VARCHAR(10),
    p_holder_name VARCHAR(500),
    p_shares BIGINT,
    p_date_reported TIMESTAMPTZ,
    p_value BIGINT DEFAULT NULL,
    p_data_source VARCHAR(50) DEFAULT 'finance_api'
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    -- Insert or update mutual fund holder data
    INSERT INTO public.holders (
        symbol,
        holder_type,
        holder_name,
        shares,
        value,
        date_reported,
        data_source
    ) VALUES (
        p_symbol,
        'mutualfund',
        p_holder_name,
        p_shares,
        p_value,
        p_date_reported,
        p_data_source
    )
    ON CONFLICT (symbol, holder_type, holder_name, date_reported)
    WHERE holder_type = 'mutualfund'
    DO UPDATE SET
        shares = EXCLUDED.shares,
        value = EXCLUDED.value,
        data_source = EXCLUDED.data_source,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: upsert_insider_transaction
-- Upserts insider transaction data
-- =============================================

CREATE OR REPLACE FUNCTION upsert_insider_transaction(
    p_symbol VARCHAR(10),
    p_insider_name VARCHAR(500),
    p_insider_position VARCHAR(100),
    p_transaction_type VARCHAR(50),
    p_shares BIGINT,
    p_date_reported TIMESTAMPTZ,
    p_value BIGINT DEFAULT NULL,
    p_ownership_type VARCHAR(10) DEFAULT NULL,
    p_data_source VARCHAR(50) DEFAULT 'finance_api'
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    -- Insert or update insider transaction data
    INSERT INTO public.holders (
        symbol,
        holder_type,
        holder_name,
        insider_position,
        transaction_type,
        shares,
        value,
        date_reported,
        ownership_type,
        data_source
    ) VALUES (
        p_symbol,
        'insider_transactions',
        p_insider_name,
        p_insider_position,
        p_transaction_type,
        p_shares,
        p_value,
        p_date_reported,
        p_ownership_type,
        p_data_source
    )
    ON CONFLICT (symbol, holder_type, holder_name, date_reported, transaction_type, shares, value)
    WHERE holder_type = 'insider_transactions'
    DO UPDATE SET
        insider_position = EXCLUDED.insider_position,
        ownership_type = EXCLUDED.ownership_type,
        data_source = EXCLUDED.data_source,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: upsert_insider_purchases
-- Upserts insider purchases summary data
-- =============================================

CREATE OR REPLACE FUNCTION upsert_insider_purchases(
    p_symbol VARCHAR(10),
    p_summary_period VARCHAR(10),
    p_purchases_shares BIGINT,
    p_purchases_transactions INTEGER,
    p_sales_shares BIGINT,
    p_sales_transactions INTEGER,
    p_net_shares BIGINT,
    p_net_transactions INTEGER,
    p_total_insider_shares BIGINT,
    p_net_percent_insider_shares DECIMAL(10,6),
    p_buy_percent_insider_shares DECIMAL(10,6),
    p_sell_percent_insider_shares DECIMAL(10,6),
    p_data_source VARCHAR(50) DEFAULT 'finance_api'
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    -- Insert or update insider purchases summary data
    INSERT INTO public.holders (
        symbol,
        holder_type,
        summary_period,
        purchases_shares,
        purchases_transactions,
        sales_shares,
        sales_transactions,
        net_shares,
        net_transactions,
        total_insider_shares,
        net_percent_insider_shares,
        buy_percent_insider_shares,
        sell_percent_insider_shares,
        data_source
    ) VALUES (
        p_symbol,
        'insider_purchases',
        p_summary_period,
        p_purchases_shares,
        p_purchases_transactions,
        p_sales_shares,
        p_sales_transactions,
        p_net_shares,
        p_net_transactions,
        p_total_insider_shares,
        p_net_percent_insider_shares,
        p_buy_percent_insider_shares,
        p_sell_percent_insider_shares,
        p_data_source
    )
    ON CONFLICT (symbol, holder_type, summary_period)
    WHERE holder_type = 'insider_purchases'
    DO UPDATE SET
        purchases_shares = EXCLUDED.purchases_shares,
        purchases_transactions = EXCLUDED.purchases_transactions,
        sales_shares = EXCLUDED.sales_shares,
        sales_transactions = EXCLUDED.sales_transactions,
        net_shares = EXCLUDED.net_shares,
        net_transactions = EXCLUDED.net_transactions,
        total_insider_shares = EXCLUDED.total_insider_shares,
        net_percent_insider_shares = EXCLUDED.net_percent_insider_shares,
        buy_percent_insider_shares = EXCLUDED.buy_percent_insider_shares,
        sell_percent_insider_shares = EXCLUDED.sell_percent_insider_shares,
        data_source = EXCLUDED.data_source,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: upsert_insider_roster
-- Upserts insider roster data
-- =============================================

CREATE OR REPLACE FUNCTION upsert_insider_roster(
    p_symbol VARCHAR(10),
    p_insider_name VARCHAR(500),
    p_insider_position VARCHAR(100),
    p_most_recent_transaction VARCHAR(100),
    p_latest_transaction_date TIMESTAMPTZ,
    p_shares_owned_directly BIGINT,
    p_shares_owned_indirectly BIGINT DEFAULT NULL,
    p_position_direct_date TIMESTAMPTZ DEFAULT NULL,
    p_data_source VARCHAR(50) DEFAULT 'finance_api'
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    -- Insert or update insider roster data
    INSERT INTO public.holders (
        symbol,
        holder_type,
        holder_name,
        insider_position,
        most_recent_transaction,
        latest_transaction_date,
        shares_owned_directly,
        shares_owned_indirectly,
        position_direct_date,
        data_source
    ) VALUES (
        p_symbol,
        'insider_roster',
        p_insider_name,
        p_insider_position,
        p_most_recent_transaction,
        p_latest_transaction_date,
        p_shares_owned_directly,
        p_shares_owned_indirectly,
        p_position_direct_date,
        p_data_source
    )
    ON CONFLICT (symbol, holder_type, holder_name)
    WHERE holder_type = 'insider_roster'
    DO UPDATE SET
        insider_position = EXCLUDED.insider_position,
        most_recent_transaction = EXCLUDED.most_recent_transaction,
        latest_transaction_date = EXCLUDED.latest_transaction_date,
        shares_owned_directly = EXCLUDED.shares_owned_directly,
        shares_owned_indirectly = EXCLUDED.shares_owned_indirectly,
        position_direct_date = EXCLUDED.position_direct_date,
        data_source = EXCLUDED.data_source,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: upsert_holders_batch
-- Batch upsert function for processing multiple holders at once
-- =============================================

CREATE OR REPLACE FUNCTION upsert_holders_batch(
    p_holders_data JSONB
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB := '{"success": true, "inserted": 0, "updated": 0, "errors": []}'::jsonb;
    v_holder JSONB;
    v_holder_type TEXT;
    v_count INTEGER := 0;
    v_error_count INTEGER := 0;
BEGIN
    -- Process each holder in the batch
    FOR v_holder IN SELECT * FROM jsonb_array_elements(p_holders_data)
    LOOP
        BEGIN
            v_holder_type := v_holder->>'holder_type';

            CASE v_holder_type
                WHEN 'institutional' THEN
                    PERFORM upsert_institutional_holder(
                        v_holder->>'symbol',
                        v_holder->>'holder_name',
                        (v_holder->>'shares')::BIGINT,
                        (v_holder->>'date_reported')::TIMESTAMPTZ,
                        (v_holder->>'value')::BIGINT,
                        COALESCE(v_holder->>'data_source', 'finance_api')
                    );

                WHEN 'mutualfund' THEN
                    PERFORM upsert_mutualfund_holder(
                        v_holder->>'symbol',
                        v_holder->>'holder_name',
                        (v_holder->>'shares')::BIGINT,
                        (v_holder->>'date_reported')::TIMESTAMPTZ,
                        (v_holder->>'value')::BIGINT,
                        COALESCE(v_holder->>'data_source', 'finance_api')
                    );

                WHEN 'insider_transactions' THEN
                    PERFORM upsert_insider_transaction(
                        v_holder->>'symbol',
                        v_holder->>'insider_name',
                        v_holder->>'insider_position',
                        v_holder->>'transaction_type',
                        (v_holder->>'shares')::BIGINT,
                        (v_holder->>'value')::BIGINT,
                        (v_holder->>'date_reported')::TIMESTAMPTZ,
                        v_holder->>'ownership_type',
                        COALESCE(v_holder->>'data_source', 'finance_api')
                    );

                WHEN 'insider_purchases' THEN
                    PERFORM upsert_insider_purchases(
                        v_holder->>'symbol',
                        v_holder->>'summary_period',
                        (v_holder->>'purchases_shares')::BIGINT,
                        (v_holder->>'purchases_transactions')::INTEGER,
                        (v_holder->>'sales_shares')::BIGINT,
                        (v_holder->>'sales_transactions')::INTEGER,
                        (v_holder->>'net_shares')::BIGINT,
                        (v_holder->>'net_transactions')::INTEGER,
                        (v_holder->>'total_insider_shares')::BIGINT,
                        (v_holder->>'net_percent_insider_shares')::DECIMAL(10,6),
                        (v_holder->>'buy_percent_insider_shares')::DECIMAL(10,6),
                        (v_holder->>'sell_percent_insider_shares')::DECIMAL(10,6),
                        COALESCE(v_holder->>'data_source', 'finance_api')
                    );

                WHEN 'insider_roster' THEN
                    PERFORM upsert_insider_roster(
                        v_holder->>'symbol',
                        v_holder->>'insider_name',
                        v_holder->>'insider_position',
                        v_holder->>'most_recent_transaction',
                        (v_holder->>'latest_transaction_date')::TIMESTAMPTZ,
                        (v_holder->>'shares_owned_directly')::BIGINT,
                        (v_holder->>'shares_owned_indirectly')::BIGINT,
                        (v_holder->>'position_direct_date')::TIMESTAMPTZ,
                        COALESCE(v_holder->>'data_source', 'finance_api')
                    );

                ELSE
                    RAISE EXCEPTION 'Unknown holder type: %', v_holder_type;
            END CASE;

            v_count := v_count + 1;

        EXCEPTION WHEN OTHERS THEN
            v_error_count := v_error_count + 1;
            v_result := jsonb_set(v_result, '{errors}', (v_result->'errors') || jsonb_build_object(
                'holder', v_holder,
                'error', SQLERRM
            )::jsonb);
        END;
    END LOOP;

    -- Update result counts
    v_result := jsonb_set(v_result, '{inserted}', to_jsonb(v_count));
    v_result := jsonb_set(v_result, '{updated}', to_jsonb(v_count)); -- Upsert handles both
    v_result := jsonb_set(v_result, '{success}', to_jsonb(v_error_count = 0));

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: get_holders_summary
-- Returns summary statistics for holders data
-- =============================================

CREATE OR REPLACE FUNCTION get_holders_summary(
    p_symbol VARCHAR(10) DEFAULT NULL
) RETURNS TABLE (
    symbol VARCHAR(10),
    holder_type VARCHAR(20),
    total_holders BIGINT,
    total_shares BIGINT,
    total_value BIGINT,
    last_updated TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        h.symbol,
        h.holder_type,
        COUNT(*)::BIGINT as total_holders,
        COALESCE(SUM(h.shares), 0)::BIGINT as total_shares,
        COALESCE(SUM(h.value), 0)::BIGINT as total_value,
        MAX(h.updated_at) as last_updated
    FROM public.holders h
    WHERE (p_symbol IS NULL OR h.symbol = p_symbol)
    GROUP BY h.symbol, h.holder_type
    ORDER BY h.symbol, h.holder_type;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: cleanup_old_holders_data
-- Removes old holder data based on retention period
-- =============================================

CREATE OR REPLACE FUNCTION cleanup_old_holders_data(
    p_retention_days INTEGER DEFAULT 365,
    p_symbol VARCHAR(10) DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete old holder data (keeping data for institutional and mutual fund holders)
    DELETE FROM public.holders
    WHERE (p_symbol IS NULL OR symbol = p_symbol)
      AND holder_type IN ('institutional', 'mutualfund')
      AND date_reported < (CURRENT_TIMESTAMP - INTERVAL '1 day' * p_retention_days);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- GRANT EXECUTE PERMISSIONS
-- =============================================

-- Grant execute permissions on upsert functions to appropriate roles
-- These functions should only be callable by system processes, not regular users
GRANT EXECUTE ON FUNCTION upsert_institutional_holder TO service_role;
GRANT EXECUTE ON FUNCTION upsert_mutualfund_holder TO service_role;
GRANT EXECUTE ON FUNCTION upsert_insider_transaction TO service_role;
GRANT EXECUTE ON FUNCTION upsert_insider_purchases TO service_role;
GRANT EXECUTE ON FUNCTION upsert_insider_roster TO service_role;
GRANT EXECUTE ON FUNCTION upsert_holders_batch TO service_role;
GRANT EXECUTE ON FUNCTION get_holders_summary TO PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_old_holders_data TO service_role;

-- =============================================
-- USAGE EXAMPLES AND TESTING
-- =============================================

/*
USAGE EXAMPLES:

-- Insert institutional holder data
SELECT upsert_institutional_holder(
    'AAPL',
    'Vanguard Group Inc',
    1415932804,
    '2025-06-30T00:00:00Z'::timestamptz,
    36197344705000  -- value in cents
);

-- Insert insider transaction
SELECT upsert_insider_transaction(
    'AAPL',
    'COOK TIMOTHY D',
    'Chief Executive Officer',
    'Sale',
    108136,
    24184658,
    '2025-04-02T00:00:00Z'::timestamptz,
    'D'
);

-- Batch upsert from JSON data
SELECT upsert_holders_batch('[
    {
        "holder_type": "institutional",
        "symbol": "AAPL",
        "holder_name": "Vanguard Group Inc",
        "shares": 1415932804,
        "date_reported": "2025-06-30T00:00:00Z",
        "value": 36197344705000
    },
    {
        "holder_type": "insider_transactions",
        "symbol": "AAPL",
        "insider_name": "COOK TIMOTHY D",
        "insider_position": "Chief Executive Officer",
        "transaction_type": "Sale",
        "shares": 108136,
        "value": 24184658,
        "date_reported": "2025-04-02T00:00:00Z",
        "ownership_type": "D"
    }
]'::jsonb);

-- Get summary statistics
SELECT * FROM get_holders_summary('AAPL');

-- Cleanup old data (older than 1 year)
SELECT cleanup_old_holders_data(365, 'AAPL');
*/

-- ----------------------------------------------------------------------------
-- Function: upsert_stock_quote (Updated to match stock_quotes table structure)
-- ----------------------------------------------------------------------------

-- Tested 

CREATE OR REPLACE FUNCTION upsert_stock_quote(
    -- Required parameters (no defaults)
    p_symbol TEXT,
    p_quote_timestamp TIMESTAMP,
    p_data_provider TEXT,
    
    -- Exchange parameters (for automatic exchange handling)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Optional quote parameters (matching table columns)
    p_price NUMERIC DEFAULT NULL,
    p_change_amount NUMERIC DEFAULT NULL,
    p_change_percent NUMERIC DEFAULT NULL,
    p_volume BIGINT DEFAULT NULL,
    p_open_price NUMERIC DEFAULT NULL,
    p_high_price NUMERIC DEFAULT NULL,
    p_low_price NUMERIC DEFAULT NULL,
    p_previous_close NUMERIC DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
    v_exchange_id BIGINT;
BEGIN
    -- Step 1: Handle exchange upsert if exchange data is provided
    IF p_exchange_code IS NOT NULL THEN
        SELECT upsert_exchange(
            p_exchange_code,
            p_exchange_name,
            p_exchange_country,
            p_exchange_timezone
        ) INTO v_exchange_id;
    END IF;

    -- Step 2: Insert/update stock quote
    INSERT INTO stock_quotes (
        symbol, exchange_id, price, change_amount, change_percent, volume,
        open_price, high_price, low_price, previous_close,
        quote_timestamp, data_provider, created_at, updated_at
    )
    VALUES (
        p_symbol, v_exchange_id, p_price, p_change_amount, p_change_percent, p_volume,
        p_open_price, p_high_price, p_low_price, p_previous_close,
        p_quote_timestamp, p_data_provider, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, quote_timestamp, data_provider) DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, stock_quotes.exchange_id),
        price = COALESCE(EXCLUDED.price, stock_quotes.price),
        change_amount = COALESCE(EXCLUDED.change_amount, stock_quotes.change_amount),
        change_percent = COALESCE(EXCLUDED.change_percent, stock_quotes.change_percent),
        volume = COALESCE(EXCLUDED.volume, stock_quotes.volume),
        open_price = COALESCE(EXCLUDED.open_price, stock_quotes.open_price),
        high_price = COALESCE(EXCLUDED.high_price, stock_quotes.high_price),
        low_price = COALESCE(EXCLUDED.low_price, stock_quotes.low_price),
        previous_close = COALESCE(EXCLUDED.previous_close, stock_quotes.previous_close),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_stock_quote IS 'Upserts stock quote data with conflict resolution on symbol, quote_timestamp, and data_provider. Handles exchange upsert automatically.';

-- ----------------------------------------------------------------------------
-- Test script for Supabase SQL Editor 
-- ----------------------------------------------------------------------------
/*
-- Test insert: new stock quote with automatic exchange handling
SELECT upsert_stock_quote(
    p_symbol => 'AAPL',
    p_quote_timestamp => '2024-03-15 15:30:00'::TIMESTAMP,
    p_data_provider => 'polygon',
    
    -- Exchange information
    p_exchange_code => 'NASDAQ',
    p_exchange_name => 'NASDAQ Stock Market',
    p_exchange_country => 'USA',
    p_exchange_timezone => 'America/New_York',
    
    -- Stock quote data
    p_price => 175.50,
    p_change_amount => 2.75,
    p_change_percent => 1.59,
    p_volume => 45000000,
    p_open_price => 173.25,
    p_high_price => 176.80,
    p_low_price => 172.90,
    p_previous_close => 172.75
);

-- Test update: same stock with new price data
SELECT upsert_stock_quote(
    p_symbol => 'AAPL',
    p_quote_timestamp => '2024-03-15 16:00:00'::TIMESTAMP,
    p_data_provider => 'polygon',
    p_price => 176.25,
    p_change_amount => 3.50,
    p_change_percent => 2.02,
    p_volume => 47500000
);
*/

-- DAILY EARNINGS SUMMARY FUNCTION
-- This function fetches daily earnings data from:
-- 1. earnings_calendar - for scheduled/upcoming earnings
-- Returns: number of stocks reporting, companies, news, sentiment, relevance, mention type, sentiment impact, confidence score, and quarters

CREATE OR REPLACE FUNCTION get_daily_earnings_summary(
    target_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    earnings_date DATE,
    total_companies_reporting INTEGER,
    companies_scheduled JSONB,
    companies_reported JSONB,
    quarterly_breakdown JSONB,
    summary_stats JSONB,
    news_summary JSONB
) 
LANGUAGE plpgsql 
AS $$
BEGIN
    RETURN QUERY
    WITH scheduled_earnings AS (
        -- Get companies scheduled to report earnings on the target date
        SELECT 
            ec.earnings_date,
            ec.symbol,
            ec.fiscal_year,
            ec.fiscal_quarter,
            ec.time_of_day,
            ec.status,
            ec.sector,
            ec.industry,
            ec.eps_estimated,
            ec.revenue_estimated
        FROM earnings_calendar ec
        WHERE ec.earnings_date = target_date
            AND ec.status IN ('scheduled', 'confirmed')
    ),
    combined_data AS (
        -- Use only scheduled earnings (earnings_data table deleted)
        SELECT 
            target_date as earnings_date,
            se.symbol,
            se.fiscal_year,
            se.fiscal_quarter,
            se.time_of_day,
            se.status,
            se.sector,
            se.industry,
            se.eps_estimated as scheduled_eps_estimate,
            se.revenue_estimated as scheduled_revenue_estimate,
            NULL::NUMERIC as actual_eps,
            NULL::NUMERIC as eps_surprise_percent,
            NULL::BIGINT as actual_revenue,
            NULL::NUMERIC as revenue_surprise_percent,
            NULL::TEXT as eps_beat_miss_met,
            NULL::TEXT as revenue_beat_miss_met,
            'scheduled' as report_status
        FROM scheduled_earnings se
    ),
    stock_news AS (
        -- Get recent news for stocks appearing in earnings data using finance_news_stocks relationship table
        SELECT 
            cd.symbol,
            jsonb_agg(
                jsonb_build_object(
                    'title', fn.title,
                    'news_url', fn.news_url,
                    'source', fn.source_name,
                    'published_at', fn.published_at,
                    'sentiment_score', fn.sentiment_score,
                    'relevance_score', fn.relevance_score,
                    'time_published', fn.time_published,
                    'image_url', fn.image_url,
                    'mention_type', fns.mention_type,
                    'sentiment_impact', fns.sentiment_impact,
                    'confidence_score', fns.confidence_score
                ) ORDER BY fn.published_at DESC
            ) as news_articles,
            COUNT(fn.id) as news_count,
            AVG(fn.sentiment_score) as avg_sentiment,
            AVG(fns.sentiment_impact) as avg_sentiment_impact,
            MAX(fn.published_at) as latest_news_date
        FROM combined_data cd
        LEFT JOIN finance_news_stocks fns ON cd.symbol = fns.stock_symbol
        LEFT JOIN finance_news fn ON fns.finance_news_id = fn.id
        WHERE fn.published_at >= (target_date - INTERVAL '7 days')  -- Get news from past week
            AND fn.published_at <= (target_date + INTERVAL '1 day')  -- Include day after earnings
        GROUP BY cd.symbol
    ),
    quarterly_stats AS (
        -- Pre-calculate quarterly breakdown to avoid nested aggregates
        SELECT 
            CONCAT('Q', cd.fiscal_quarter, '_', cd.fiscal_year) as quarter_key,
            cd.fiscal_quarter,
            cd.fiscal_year,
            COUNT(*) as company_count,
            jsonb_agg(cd.symbol) as companies
        FROM combined_data cd
        WHERE cd.fiscal_quarter IS NOT NULL
        GROUP BY cd.fiscal_quarter, cd.fiscal_year
    )
    SELECT 
        target_date as earnings_date,
        
        -- Total number of companies reporting/scheduled
        COUNT(*)::INTEGER as total_companies_reporting,
        
        -- Detailed breakdown of scheduled companies
        jsonb_agg(
            CASE WHEN cd.report_status = 'scheduled' THEN
                jsonb_build_object(
                    'symbol', cd.symbol,
                    'fiscal_year', cd.fiscal_year,
                    'fiscal_quarter', cd.fiscal_quarter,
                    'time_of_day', cd.time_of_day,
                    'status', cd.status,
                    'sector', cd.sector,
                    'industry', cd.industry,
                    'eps_estimated', cd.scheduled_eps_estimate,
                    'revenue_estimated', cd.scheduled_revenue_estimate,
                    'news_count', COALESCE(sn.news_count, 0),
                    'avg_sentiment', sn.avg_sentiment,
                    'latest_news_date', sn.latest_news_date,
                    'recent_news', COALESCE(sn.news_articles, '[]'::jsonb)
                )
            END
        ) FILTER (WHERE cd.report_status = 'scheduled') as companies_scheduled,
        
        -- Detailed breakdown of companies that have reported
        jsonb_agg(
            CASE WHEN cd.report_status = 'reported' THEN
                jsonb_build_object(
                    'symbol', cd.symbol,
                    'fiscal_year', cd.fiscal_year,
                    'fiscal_quarter', cd.fiscal_quarter,
                    'actual_eps', cd.actual_eps,
                    'eps_surprise_percent', cd.eps_surprise_percent,
                    'actual_revenue', cd.actual_revenue,
                    'revenue_surprise_percent', cd.revenue_surprise_percent,
                    'eps_beat_miss_met', cd.eps_beat_miss_met,
                    'revenue_beat_miss_met', cd.revenue_beat_miss_met,
                    'news_count', COALESCE(sn.news_count, 0),
                    'avg_sentiment', sn.avg_sentiment,
                    'latest_news_date', sn.latest_news_date,
                    'recent_news', COALESCE(sn.news_articles, '[]'::jsonb)
                )
            END
        ) FILTER (WHERE cd.report_status = 'reported') as companies_reported,
        
        -- Quarterly breakdown (fixed - no nested aggregates)
        (
            SELECT jsonb_object_agg(
                qs.quarter_key,
                jsonb_build_object(
                    'quarter', qs.fiscal_quarter,
                    'year', qs.fiscal_year,
                    'company_count', qs.company_count,
                    'companies', qs.companies
                )
            )
            FROM quarterly_stats qs
        ) as quarterly_breakdown,
        
        -- Summary statistics
        jsonb_build_object(
            'total_scheduled', COUNT(*) FILTER (WHERE cd.report_status = 'scheduled'),
            'total_reported', COUNT(*) FILTER (WHERE cd.report_status = 'reported'),
            'quarters_represented', COUNT(DISTINCT CONCAT(cd.fiscal_quarter, '_', cd.fiscal_year)),
            'sectors_represented', COUNT(DISTINCT cd.sector),
            'avg_eps_surprise', ROUND(AVG(cd.eps_surprise_percent), 2),
            'eps_beats', COUNT(*) FILTER (WHERE cd.eps_beat_miss_met = 'beat'),
            'eps_misses', COUNT(*) FILTER (WHERE cd.eps_beat_miss_met = 'miss'),
            'eps_meets', COUNT(*) FILTER (WHERE cd.eps_beat_miss_met = 'met'),
            'revenue_beats', COUNT(*) FILTER (WHERE cd.revenue_beat_miss_met = 'beat'),
            'revenue_misses', COUNT(*) FILTER (WHERE cd.revenue_beat_miss_met = 'miss'),
            'revenue_meets', COUNT(*) FILTER (WHERE cd.revenue_beat_miss_met = 'met'),
            'companies_with_news', COUNT(*) FILTER (WHERE sn.news_count > 0),
            'total_news_articles', COALESCE(SUM(sn.news_count), 0),
            'avg_news_sentiment', ROUND(AVG(sn.avg_sentiment), 3)
        ) as summary_stats,
        
        -- News summary aggregation
        jsonb_build_object(
            'total_articles_found', COALESCE(SUM(sn.news_count), 0),
            'companies_with_news', COUNT(*) FILTER (WHERE sn.news_count > 0),
            'avg_sentiment_all_stocks', ROUND(AVG(sn.avg_sentiment), 3),
            'most_recent_news', MAX(sn.latest_news_date),
            'sentiment_distribution', jsonb_build_object(
                'positive', COUNT(*) FILTER (WHERE sn.avg_sentiment > 0.1),
                'neutral', COUNT(*) FILTER (WHERE sn.avg_sentiment BETWEEN -0.1 AND 0.1),
                'negative', COUNT(*) FILTER (WHERE sn.avg_sentiment < -0.1)
            ),
            'top_news_by_relevance', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'symbol', fns2.stock_symbol,
                        'title', fn2.title,
                        'source', fn2.source_name,
                        'published_at', fn2.published_at,
                        'sentiment_score', fn2.sentiment_score,
                        'relevance_score', fn2.relevance_score,
                        'mention_type', fns2.mention_type,
                        'sentiment_impact', fns2.sentiment_impact,
                        'confidence_score', fns2.confidence_score
                    ) ORDER BY fn2.relevance_score DESC, fn2.published_at DESC
                )
                FROM finance_news fn2
                JOIN finance_news_stocks fns2 ON fn2.id = fns2.finance_news_id
                WHERE EXISTS (
                    SELECT 1 FROM combined_data cd2 
                    WHERE cd2.symbol = fns2.stock_symbol
                )
                AND fn2.published_at >= (target_date - INTERVAL '7 days')
                AND fn2.published_at <= (target_date + INTERVAL '1 day')
                LIMIT 10
            )
        ) as news_summary
        
    FROM combined_data cd
    LEFT JOIN stock_news sn ON cd.symbol = sn.symbol;
END;
$$;

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_date_symbol ON earnings_calendar (earnings_date, symbol);
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_fiscal ON earnings_calendar (fiscal_year, fiscal_quarter, symbol);

-- Grant permissions for the functions
GRANT EXECUTE ON FUNCTION get_daily_earnings_summary(DATE) TO PUBLIC;


-- USAGE EXAMPLES
/*
-- Get comprehensive daily earnings summary for today
SELECT * FROM get_daily_earnings_summary();

-- Get daily earnings summary for a specific date
SELECT * FROM get_daily_earnings_summary('2024-01-15');
*/

-- COMPANY_INFO SELECT FUNCTIONS - SELECTIVE REAL-TIME DATA
-- Functions retrieve selective price data (NO current price, change, percent_change)

-- 1. GET COMPANY INFO BY SYMBOL - WITH DAILY PRICE DATA
CREATE OR REPLACE FUNCTION get_company_info_by_symbol(
    p_symbol VARCHAR(20),
    p_data_provider VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    exchange_id INTEGER,
    name VARCHAR(255),
    company_name VARCHAR(255),
    exchange VARCHAR(50),
    sector VARCHAR(100),
    industry VARCHAR(100),
    about TEXT,
    employees INTEGER,
    logo VARCHAR(500),

    -- Daily price data (kept for trading analysis)
    open DECIMAL(15,4),
    high DECIMAL(15,4),
    low DECIMAL(15,4),
    year_high DECIMAL(15,4),
    year_low DECIMAL(15,4),

    -- Volume and trading metrics
    volume BIGINT,
    avg_volume BIGINT,

    -- Financial ratios and metrics
    market_cap BIGINT,
    beta DECIMAL(8,4),
    pe_ratio DECIMAL(10,2),
    eps DECIMAL(10,4),

    -- Dividend information
    dividend DECIMAL(10,4),
    yield DECIMAL(7,4),
    ex_dividend DATE,
    last_dividend DECIMAL(10,4),

    -- Fund-specific metrics
    net_assets BIGINT,
    nav DECIMAL(15,4),
    expense_ratio DECIMAL(7,4),

    -- Corporate events
    earnings_date DATE,

    -- Performance returns
    five_day_return DECIMAL(8,4),
    one_month_return DECIMAL(8,4),
    three_month_return DECIMAL(8,4),
    six_month_return DECIMAL(8,4),
    ytd_return DECIMAL(8,4),
    year_return DECIMAL(8,4),
    five_year_return DECIMAL(8,4),
    ten_year_return DECIMAL(8,4),
    max_return DECIMAL(8,4),

    -- Metadata fields
    ipo_date DATE,
    currency VARCHAR(3),
    fiscal_year_end VARCHAR(10),
    data_provider VARCHAR(50),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
) AS $$
BEGIN
    IF p_data_provider IS NOT NULL THEN
        RETURN QUERY
        SELECT
            ci.id, ci.symbol, ci.exchange_id, ci.name, ci.company_name,
            ci.exchange, ci.sector, ci.industry, ci.about, ci.employees, ci.logo,

            -- Daily price data (kept for trading analysis)
            ci.open, ci.high, ci.low, ci.year_high, ci.year_low,

            -- Volume and trading metrics
            ci.volume, ci.avg_volume,

            -- Financial ratios and metrics
            ci.market_cap, ci.beta, ci.pe_ratio, ci.eps,

            -- Dividend information
            ci.dividend, ci.yield, ci.ex_dividend, ci.last_dividend,

            -- Fund-specific metrics
            ci.net_assets, ci.nav, ci.expense_ratio,

            -- Corporate events
            ci.earnings_date,

            -- Performance returns
            ci.five_day_return, ci.one_month_return, ci.three_month_return, ci.six_month_return,
            ci.ytd_return, ci.year_return, ci.five_year_return, ci.ten_year_return, ci.max_return,

            -- Metadata fields
            ci.ipo_date, ci.currency, ci.fiscal_year_end, ci.data_provider, ci.created_at, ci.updated_at
        FROM company_info ci
        WHERE ci.symbol = UPPER(p_symbol)
        AND ci.data_provider = p_data_provider;
    ELSE
        RETURN QUERY
        SELECT
            ci.id, ci.symbol, ci.exchange_id, ci.name, ci.company_name,
            ci.exchange, ci.sector, ci.industry, ci.about, ci.employees, ci.logo,

            -- Daily price data (kept for trading analysis)
            ci.open, ci.high, ci.low, ci.year_high, ci.year_low,

            -- Volume and trading metrics
            ci.volume, ci.avg_volume,

            -- Financial ratios and metrics
            ci.market_cap, ci.beta, ci.pe_ratio, ci.eps,

            -- Dividend information
            ci.dividend, ci.yield, ci.ex_dividend, ci.last_dividend,

            -- Fund-specific metrics
            ci.net_assets, ci.nav, ci.expense_ratio,

            -- Corporate events
            ci.earnings_date,

            -- Performance returns
            ci.five_day_return, ci.one_month_return, ci.three_month_return, ci.six_month_return,
            ci.ytd_return, ci.year_return, ci.five_year_return, ci.ten_year_return, ci.max_return,

            -- Metadata fields
            ci.ipo_date, ci.currency, ci.fiscal_year_end, ci.data_provider, ci.created_at, ci.updated_at
        FROM company_info ci
        WHERE ci.symbol = UPPER(p_symbol)
        ORDER BY ci.updated_at DESC
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- 2. GET COMPANIES BY SECTOR AND/OR INDUSTRY - WITH SELECTIVE PRICE DATA

CREATE OR REPLACE FUNCTION get_companies_by_sector_industry(
    p_sector VARCHAR(100) DEFAULT NULL,
    p_industry VARCHAR(100) DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    name VARCHAR(255),
    company_name VARCHAR(255),
    exchange VARCHAR(50),
    sector VARCHAR(100),
    industry VARCHAR(100),
    market_cap BIGINT,
    high DECIMAL(15,4),
    low DECIMAL(15,4),
    volume BIGINT,
    avg_volume BIGINT,
    pe_ratio DECIMAL(10,2),
    yield DECIMAL(7,4),
    ytd_return DECIMAL(8,4),
    year_return DECIMAL(8,4),
    data_provider VARCHAR(50),
    updated_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ci.id, ci.symbol, ci.name, ci.company_name, ci.exchange,
        ci.sector, ci.industry, ci.market_cap, ci.high, ci.low, ci.volume, ci.avg_volume,
        ci.pe_ratio, ci.yield, ci.ytd_return, ci.year_return,
        ci.data_provider, ci.updated_at
    FROM company_info ci
    WHERE (p_sector IS NULL OR ci.sector = p_sector)
    AND (p_industry IS NULL OR ci.industry = p_industry)
    ORDER BY ci.market_cap DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;


-- 3. SEARCH COMPANIES BY NAME OR SYMBOL - WITH SELECTIVE PRICE DATA

CREATE OR REPLACE FUNCTION search_companies(
    p_search_term VARCHAR(255),
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    name VARCHAR(255),
    company_name VARCHAR(255),
    exchange VARCHAR(50),
    sector VARCHAR(100),
    industry VARCHAR(100),
    market_cap BIGINT,
    high DECIMAL(15,4),
    low DECIMAL(15,4),
    volume BIGINT,
    pe_ratio DECIMAL(10,2),
    yield DECIMAL(7,4),
    data_provider VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ci.id, ci.symbol, ci.name, ci.company_name, ci.exchange,
        ci.sector, ci.industry, ci.market_cap, ci.high, ci.low, ci.volume,
        ci.pe_ratio, ci.yield, ci.data_provider
    FROM company_info ci
    WHERE
        ci.symbol ILIKE '%' || UPPER(p_search_term) || '%'
        OR ci.name ILIKE '%' || p_search_term || '%'
        OR ci.company_name ILIKE '%' || p_search_term || '%'
    ORDER BY
        CASE
            WHEN ci.symbol = UPPER(p_search_term) THEN 1
            WHEN ci.symbol ILIKE UPPER(p_search_term) || '%' THEN 2
            WHEN ci.name ILIKE p_search_term || '%' THEN 3
            ELSE 4
        END,
        ci.market_cap DESC NULLS LAST
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get company info by multiple symbols (for quotes) - WITH SELECTIVE PRICE DATA
CREATE OR REPLACE FUNCTION get_company_info_by_symbols(
    p_symbols TEXT[] DEFAULT NULL,
    p_data_provider VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    exchange_id INTEGER,
    name VARCHAR(255),
    company_name VARCHAR(255),
    exchange VARCHAR(50),
    sector VARCHAR(100),
    industry VARCHAR(100),
    about TEXT,
    employees INTEGER,
    logo VARCHAR(500),

    -- Daily price data (kept for trading analysis)
    open DECIMAL(15,4),
    high DECIMAL(15,4),
    low DECIMAL(15,4),
    year_high DECIMAL(15,4),
    year_low DECIMAL(15,4),

    -- Volume and trading metrics
    volume BIGINT,
    avg_volume BIGINT,

    -- Financial ratios and metrics
    market_cap BIGINT,
    beta DECIMAL(8,4),
    pe_ratio DECIMAL(10,2),
    eps DECIMAL(10,4),

    -- Dividend information
    dividend DECIMAL(10,4),
    yield DECIMAL(7,4),
    ex_dividend DATE,
    last_dividend DECIMAL(10,4),

    -- Fund-specific metrics
    net_assets BIGINT,
    nav DECIMAL(15,4),
    expense_ratio DECIMAL(7,4),

    -- Corporate events
    earnings_date DATE,

    -- Performance returns
    five_day_return DECIMAL(8,4),
    one_month_return DECIMAL(8,4),
    three_month_return DECIMAL(8,4),
    six_month_return DECIMAL(8,4),
    ytd_return DECIMAL(8,4),
    year_return DECIMAL(8,4),
    five_year_return DECIMAL(8,4),
    ten_year_return DECIMAL(8,4),
    max_return DECIMAL(8,4),

    -- Additional metadata
    ipo_date DATE,
    currency VARCHAR(3),
    fiscal_year_end VARCHAR(10),

    -- Provider and audit info
    data_provider VARCHAR(50),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
) AS $$
DECLARE
    upper_symbols TEXT[];
BEGIN
    -- If p_symbols is NULL or empty, return empty result set
    IF p_symbols IS NULL OR array_length(p_symbols, 1) = 0 THEN
        RETURN;
    END IF;

    -- Convert all symbols to uppercase for case-insensitive comparison
    SELECT array_agg(UPPER(unnest)) INTO upper_symbols
    FROM unnest(p_symbols) AS unnest;

    RETURN QUERY
    SELECT
        ci.id, ci.symbol, ci.exchange_id, ci.name, ci.company_name, ci.exchange,
        ci.sector, ci.industry, ci.about, ci.employees, ci.logo,
        ci.open, ci.high, ci.low, ci.year_high, ci.year_low, ci.volume, ci.avg_volume,
        ci.market_cap, ci.beta, ci.pe_ratio, ci.eps,
        ci.dividend, ci.yield, ci.ex_dividend, ci.last_dividend,
        ci.net_assets, ci.nav, ci.expense_ratio,
        ci.earnings_date,
        ci.five_day_return, ci.one_month_return, ci.three_month_return, ci.six_month_return,
        ci.ytd_return, ci.year_return, ci.five_year_return, ci.ten_year_return, ci.max_return,
        ci.ipo_date, ci.currency, ci.fiscal_year_end,
        ci.data_provider, ci.created_at, ci.updated_at
    FROM company_info ci
    WHERE
        UPPER(ci.symbol) = ANY(upper_symbols)
        AND (p_data_provider IS NULL OR ci.data_provider = p_data_provider)
    ORDER BY
        array_position(upper_symbols, UPPER(ci.symbol));
END;
$$ LANGUAGE plpgsql;


-- USAGE EXAMPLES - SELECTIVE REAL-TIME DATA
/*
-- Get specific company by symbol
SELECT * FROM get_company_info_by_symbol('AAPL');

-- Search for companies
SELECT * FROM search_companies('Apple', 10);

-- Get selective price info for multiple symbols (NO current price, change, percent_change)
SELECT symbol, name, open, high, low, volume, year_high, year_low, avg_volume, market_cap, pe_ratio, logo
FROM get_company_info_by_symbols(ARRAY['AAPL', 'GOOGL', 'MSFT']);
*/
-- Get basic company info
-- SELECT * FROM get_company_basic_info('MSFT');

-- Get all sectors and industries
-- SELECT * FROM get_sectors_and_industries();

-- This function fetches the latest news articles from the news_articles table
-- Prioritizes by updated_at and published_at for the most recent content
-- Returns maximum 7 articles at once for optimal performance

CREATE OR REPLACE FUNCTION get_latest_market_news(
    article_limit INTEGER DEFAULT 7
)
RETURNS TABLE (
    id INTEGER,
    title TEXT,
    summary TEXT,
    content TEXT,
    url TEXT,
    source VARCHAR(100),
    published_at TIMESTAMP,
    updated_at TIMESTAMP,
    author VARCHAR(255),
    category VARCHAR(50),
    sentiment DECIMAL(3,2),
    relevance_score DECIMAL(3,2),
    sentiment_confidence DECIMAL(3,2),
    language VARCHAR(5),
    word_count INTEGER,
    image_url TEXT,
    tags TEXT[],
    data_provider VARCHAR(50),
    created_at TIMESTAMP
) 
LANGUAGE plpgsql 
AS $$
BEGIN
    -- Validate input parameter
    IF article_limit IS NULL OR article_limit <= 0 THEN
        article_limit := 7;
    END IF;
    
    -- Cap maximum articles to prevent performance issues
    IF article_limit > 50 THEN
        article_limit := 50;
    END IF;

    RETURN QUERY
    SELECT 
        na.id,
        na.title,
        na.summary,
        na.content,
        na.url,
        na.source,
        na.published_at,
        na.updated_at,
        na.author,
        na.category,
        na.sentiment,
        na.relevance_score,
        na.sentiment_confidence,
        na.language,
        na.word_count,
        na.image_url,
        na.tags,
        na.data_provider,
        na.created_at
    FROM news_articles na
    ORDER BY 
        -- Prioritize by latest updated_at first (for articles that have been modified)
        na.updated_at DESC,
        -- Then by published_at for original publication order
        na.published_at DESC,
        -- Finally by id for consistent ordering
        na.id DESC
    LIMIT article_limit;
END;
$$;

-- FILTERED MARKET NEWS FUNCTION
-- Enhanced function with filtering options for more targeted news retrieval

CREATE OR REPLACE FUNCTION get_filtered_market_news(
    article_limit INTEGER DEFAULT 7,
    source_filter VARCHAR(100) DEFAULT NULL,
    category_filter VARCHAR(50) DEFAULT NULL,
    min_relevance_score DECIMAL(3,2) DEFAULT NULL,
    days_back INTEGER DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    title TEXT,
    summary TEXT,
    content TEXT,
    url TEXT,
    source VARCHAR(100),
    published_at TIMESTAMP,
    updated_at TIMESTAMP,
    author VARCHAR(255),
    category VARCHAR(50),
    sentiment DECIMAL(3,2),
    relevance_score DECIMAL(3,2),
    sentiment_confidence DECIMAL(3,2),
    language VARCHAR(5),
    word_count INTEGER,
    image_url TEXT,
    tags TEXT[],
    data_provider VARCHAR(50),
    created_at TIMESTAMP,
    news_age_hours INTEGER
) 
LANGUAGE plpgsql 
AS $$
BEGIN
    -- Validate and set defaults
    IF article_limit IS NULL OR article_limit <= 0 THEN
        article_limit := 7;
    END IF;
    
    IF article_limit > 50 THEN
        article_limit := 50;
    END IF;

    RETURN QUERY
    SELECT 
        na.id,
        na.title,
        na.summary,
        na.content,
        na.url,
        na.source,
        na.published_at,
        na.updated_at,
        na.author,
        na.category,
        na.sentiment,
        na.relevance_score,
        na.sentiment_confidence,
        na.language,
        na.word_count,
        na.image_url,
        na.tags,
        na.data_provider,
        na.created_at,
        -- Calculate news age in hours
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - na.published_at)) / 3600 AS news_age_hours
    FROM news_articles na
    WHERE 
        -- Apply source filter if provided
        (source_filter IS NULL OR na.source ILIKE '%' || source_filter || '%')
        -- Apply category filter if provided
        AND (category_filter IS NULL OR na.category = category_filter)
        -- Apply relevance score filter if provided
        AND (min_relevance_score IS NULL OR na.relevance_score >= min_relevance_score)
        -- Apply date range filter if provided
        AND (days_back IS NULL OR na.published_at >= CURRENT_DATE - INTERVAL '1 day' * days_back)
    ORDER BY 
        na.updated_at DESC,
        na.published_at DESC,
        na.id DESC
    LIMIT article_limit;
END;
$$;

-- These indexes support the functions above (if not already created)

-- Index for ordering by updated_at and published_at
CREATE INDEX IF NOT EXISTS idx_news_articles_latest_ordering 
ON news_articles (updated_at DESC, published_at DESC, id DESC);

-- Index for source filtering
CREATE INDEX IF NOT EXISTS idx_news_articles_source_latest 
ON news_articles (source, updated_at DESC);

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_news_articles_category_latest 
ON news_articles (category, updated_at DESC);

-- Index for relevance score filtering
CREATE INDEX IF NOT EXISTS idx_news_articles_relevance_latest 
ON news_articles (relevance_score DESC, updated_at DESC);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_news_articles_published_range 
ON news_articles (published_at DESC, updated_at DESC);

-- Grant permissions for the functions
GRANT EXECUTE ON FUNCTION get_latest_market_news(INTEGER) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_filtered_market_news(INTEGER, VARCHAR(100), VARCHAR(50), DECIMAL(3,2), INTEGER) TO PUBLIC;


-- USAGE EXAMPLES
/*
-- Get the latest 7 news articles (default)
SELECT * FROM get_latest_market_news();

-- Get the latest 10 news articles
SELECT * FROM get_latest_market_news(10);

-- Get latest 5 Bloomberg articles with high relevance from the past 3 days
SELECT * FROM get_filtered_market_news(
    article_limit := 5,
    source_filter := 'Bloomberg',
    min_relevance_score := 0.7,
    days_back := 3
);

-- Get latest earnings-related news
SELECT * FROM get_filtered_market_news(
    article_limit := 10,
    category_filter := 'earnings'
);

-- Get news from the past week only
SELECT * FROM get_filtered_market_news(
    article_limit := 15,
    days_back := 7
);
*/

-- REDESIGNED MARKET MOVERS SELECT FUNCTIONS - NO PRICE DATA
-- Functions return symbols and rankings only - use stock_quotes for real-time prices

-- 1. GET TOP GAINERS (symbols and rankings only)

-- Get top gainers for a specific date
CREATE OR REPLACE FUNCTION get_top_gainers(
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    name VARCHAR(255),
    rank_position INTEGER,
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.symbol,
        m.name,
        m.rank_position,
        m.fetch_timestamp
    FROM market_movers m
    WHERE m.mover_type = 'gainer'
      AND m.data_date = p_data_date
    ORDER BY m.rank_position ASC NULLS LAST
    LIMIT p_limit;
END;
$$;


-- 2. GET TOP LOSERS (symbols and rankings only)

-- Get top losers for a specific date
CREATE OR REPLACE FUNCTION get_top_losers(
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    name VARCHAR(255),
    rank_position INTEGER,
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.symbol,
        m.name,
        m.rank_position,
        m.fetch_timestamp
    FROM market_movers m
    WHERE m.mover_type = 'loser'
      AND m.data_date = p_data_date
    ORDER BY m.rank_position ASC NULLS LAST
    LIMIT p_limit;
END;
$$;

-- 3. GET MOST ACTIVE STOCKS (symbols and rankings only)

-- Get most active stocks for a specific date
CREATE OR REPLACE FUNCTION get_most_active(
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    name VARCHAR(255),
    rank_position INTEGER,
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.symbol,
        m.name,
        m.rank_position,
        m.fetch_timestamp
    FROM market_movers m
    WHERE m.mover_type = 'active'
      AND m.data_date = p_data_date
    ORDER BY m.rank_position ASC NULLS LAST
    LIMIT p_limit;
END;
$$;


-- REDESIGNED USAGE EXAMPLES - SYMBOLS AND RANKINGS ONLY

/*
-- Get top 10 gainers for today (symbols and rankings)
SELECT * FROM get_top_gainers();

-- Get top 15 losers for a specific date (symbols and rankings)
SELECT * FROM get_top_losers('2024-01-15', 15);

-- Get most active stocks (symbols and rankings)
SELECT * FROM get_most_active();

-- To get actual prices, join with stock_quotes table:
SELECT 
    mm.symbol, 
    mm.name, 
    mm.rank_position,
    sq.price, 
    sq.change, 
    sq.percent_change
FROM get_top_gainers() mm
LEFT JOIN stock_quotes sq ON mm.symbol = sq.symbol;

-- Get all movers for a symbol across different categories
SELECT * FROM market_movers WHERE symbol = 'AAPL' AND data_date = CURRENT_DATE;
*/

-- =====================================================
-- REDESIGNED STOCK PEERS SELECT FUNCTIONS - NO PRICE DATA
-- Functions return symbols and metadata only - use stock_quotes for real-time prices
-- =====================================================

-- 1. GET PEERS FOR A SPECIFIC STOCK (symbols and metadata only)
-- Get all peers for a specific stock symbol
CREATE OR REPLACE FUNCTION get_stock_peers(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    peer_symbol VARCHAR(20),
    peer_name VARCHAR(255),
    logo VARCHAR(500),
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.symbol,
        p.name,
        p.logo,
        p.fetch_timestamp
    FROM stock_peers p
    WHERE p.peer_of = UPPER(p_symbol)
      AND p.data_date = p_data_date
    ORDER BY p.symbol ASC
    LIMIT p_limit;
END;
$$;

-- 2. GET PEERS WITH LOGOS (for UI display)

-- Get peers with company logos for UI display
CREATE OR REPLACE FUNCTION get_peers_with_logos(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    peer_symbol VARCHAR(20),
    peer_name VARCHAR(255),
    logo VARCHAR(500),
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.symbol,
        p.name,
        p.logo,
        p.fetch_timestamp
    FROM stock_peers p
    WHERE p.peer_of = UPPER(p_symbol)
      AND p.data_date = p_data_date
      AND p.logo IS NOT NULL
    ORDER BY p.name ASC
    LIMIT p_limit;
END;
$$;

-- 3. GET PEER SYMBOLS ONLY (for batch price lookups)

-- Get just peer symbols for efficient batch price lookups
CREATE OR REPLACE FUNCTION get_peer_symbols(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    peer_symbol VARCHAR(20)
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.symbol
    FROM stock_peers p
    WHERE p.peer_of = UPPER(p_symbol)
      AND p.data_date = p_data_date
    ORDER BY p.symbol ASC;
END;
$$;

-- 4. GET PEER METADATA FOR COMPARISON (no price data)

-- Get peer metadata for comparison - frontend joins with stock_quotes for prices
CREATE OR REPLACE FUNCTION get_peer_comparison_metadata(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    symbol VARCHAR(20),
    name VARCHAR(255),
    logo VARCHAR(500),
    is_main_stock BOOLEAN,
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH peer_data AS (
        -- Get peer metadata only
        SELECT 
            p.symbol,
            p.name,
            p.logo,
            FALSE as is_main_stock,
            p.fetch_timestamp
        FROM stock_peers p
        WHERE p.peer_of = UPPER(p_symbol)
          AND p.data_date = p_data_date
        
        UNION ALL
        
        -- Get main stock metadata from company_info
        SELECT 
            c.symbol,
            c.name,
            c.logo,
            TRUE as is_main_stock,
            c.updated_at as fetch_timestamp
        FROM company_info c
        WHERE c.symbol = UPPER(p_symbol)
        ORDER BY c.updated_at DESC
        LIMIT 1
    )
    SELECT * FROM peer_data
    ORDER BY is_main_stock DESC, symbol ASC;
END;
$$;



-- 5. GET PAGINATED PEERS (redesigned without price data)

-- Get paginated peer results with metadata-based sorting
CREATE OR REPLACE FUNCTION get_peers_paginated(
    p_symbol VARCHAR(20),
    p_data_date DATE DEFAULT CURRENT_DATE,
    p_offset INTEGER DEFAULT 0,
    p_limit INTEGER DEFAULT 20,
    p_sort_column VARCHAR(50) DEFAULT 'symbol',
    p_sort_direction VARCHAR(4) DEFAULT 'ASC'
)
RETURNS TABLE (
    peer_symbol VARCHAR(20),
    peer_name VARCHAR(255),
    logo VARCHAR(500),
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
DECLARE
    query_text TEXT;
BEGIN
    -- Build dynamic query with sorting (metadata fields only)
    query_text := format('
        SELECT 
            p.symbol,
            p.name,
            p.logo,
            p.fetch_timestamp
        FROM stock_peers p
        WHERE p.peer_of = UPPER($1)
          AND p.data_date = $2
        ORDER BY %I %s
        LIMIT $3 OFFSET $4',
        p_sort_column, 
        CASE WHEN UPPER(p_sort_direction) = 'ASC' THEN 'ASC' ELSE 'DESC' END
    );
    
    RETURN QUERY EXECUTE query_text 
    USING p_symbol, p_data_date, p_limit, p_offset;
END;
$$;

-- =====================================================
-- REDESIGNED USAGE EXAMPLES - NO PRICE DATA
-- =====================================================

/*
-- Get all peers for AAPL (symbols and metadata only)
SELECT * FROM get_stock_peers('AAPL');

-- Get peers with logos for UI display
SELECT * FROM get_peers_with_logos('AAPL');

-- Get just peer symbols for batch price lookup
SELECT * FROM get_peer_symbols('AAPL');

-- Get peer comparison metadata (join with stock_quotes for prices)
SELECT * FROM get_peer_comparison_metadata('AAPL');

-- Get paginated results (sorted by symbol name)
SELECT * FROM get_peers_paginated('AAPL', CURRENT_DATE, 0, 20, 'symbol', 'ASC');

-- Example: Frontend joins peers with stock_quotes for real-time prices
WITH peers AS (
    SELECT * FROM get_stock_peers('AAPL')
)
SELECT 
    p.peer_symbol,
    p.peer_name,
    p.logo,
    sq.price,
    sq.change,
    sq.percent_change
FROM peers p
LEFT JOIN stock_quotes sq ON p.peer_symbol = sq.symbol;
*/

-- =====================================================
-- REDESIGNED STOCK QUOTES FUNCTION - NO PRICE DATA
-- Fetches stock symbol metadata and tracking information only
-- Use external APIs for real-time prices
-- =====================================================

CREATE OR REPLACE FUNCTION get_stock_quotes(
    p_symbol VARCHAR(20),
    p_quote_date DATE DEFAULT CURRENT_DATE,
    p_data_provider VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    symbol VARCHAR(20),
    quote_date DATE,
    quote_timestamp TIMESTAMP,
    data_provider VARCHAR(50),
    exchange_id INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        UPPER(p_symbol)::VARCHAR(20) as symbol,
        p_quote_date as quote_date,
        sq.quote_timestamp,
        sq.data_provider,
        sq.exchange_id
    FROM stock_quotes sq
    WHERE sq.symbol = UPPER(p_symbol)
    AND DATE(sq.quote_timestamp) = p_quote_date
    AND (p_data_provider IS NULL OR sq.data_provider = p_data_provider)
    ORDER BY sq.quote_timestamp DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- REDESIGNED USAGE EXAMPLES - NO PRICE DATA
-- =====================================================

/*
-- Get stock symbol metadata for Apple on a specific date (NO PRICE DATA)
SELECT * FROM get_stock_quotes('AAPL', '2024-01-15');

-- Get current day stock tracking info
SELECT * FROM get_stock_quotes('MSFT');

-- Frontend usage pattern: Get symbols → fetch prices from external APIs
-- 1. Get tracked symbols: SELECT * FROM get_tracked_symbols();
-- 2. Frontend calls external API for real-time prices using the symbols
-- 3. Frontend combines symbol metadata with real-time prices from APIs
*/

-- FINANCE NEWS SELECT FUNCTIONS
-- Functions to retrieve news data for specific symbols

-- 1. GET NEWS BY SYMBOL (PRIMARY FUNCTION)

CREATE OR REPLACE FUNCTION get_symbol_news(
    p_symbol VARCHAR(20),
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_days_back INTEGER DEFAULT 7,
    p_min_relevance DECIMAL(4,3) DEFAULT 0.0,
    p_data_provider VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    id BIGINT,
    title TEXT,
    news_url TEXT,
    source_name VARCHAR(100),
    image_url TEXT,
    time_published VARCHAR(50),
    published_at TIMESTAMP,
    sentiment_score DECIMAL(4,3),
    relevance_score DECIMAL(4,3),
    sentiment_confidence DECIMAL(4,3),
    mentioned_symbols TEXT[],
    primary_symbols TEXT[],
    word_count INTEGER,
    category VARCHAR(50),
    data_provider VARCHAR(50),
    mention_type VARCHAR(20),
    sentiment_impact DECIMAL(4,3),
    confidence_score DECIMAL(4,3)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fn.id,
        fn.title,
        fn.news_url,
        fn.source_name,
        fn.image_url,
        fn.time_published,
        fn.published_at,
        fn.sentiment_score,
        fn.relevance_score,
        fn.sentiment_confidence,
        fn.mentioned_symbols,
        fn.primary_symbols,
        fn.word_count,
        fn.category,
        fn.data_provider,
        COALESCE(fns.mention_type, 'mentioned') as mention_type,
        fns.sentiment_impact,
        fns.confidence_score
    FROM finance_news fn
    LEFT JOIN finance_news_stocks fns ON fn.id = fns.finance_news_id 
        AND fns.stock_symbol = UPPER(p_symbol)
    WHERE 
        (
            -- Symbol mentioned in arrays
            UPPER(p_symbol) = ANY(fn.mentioned_symbols) 
            OR UPPER(p_symbol) = ANY(fn.primary_symbols)
            -- Or symbol in relationship table
            OR fns.stock_symbol = UPPER(p_symbol)
        )
        AND fn.published_at >= CURRENT_TIMESTAMP - INTERVAL '%s days' 
        AND (p_min_relevance = 0.0 OR fn.relevance_score >= p_min_relevance)
        AND (p_data_provider IS NULL OR fn.data_provider = p_data_provider)
    ORDER BY 
        CASE WHEN UPPER(p_symbol) = ANY(fn.primary_symbols) THEN 1 ELSE 2 END,
        fn.published_at DESC,
        fn.relevance_score DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 2. GET LATEST NEWS BY SYMBOL (SIMPLIFIED)

CREATE OR REPLACE FUNCTION get_latest_symbol_news(
    p_symbol VARCHAR(20),
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id BIGINT,
    title TEXT,
    news_url TEXT,
    source_name VARCHAR(100),
    published_at TIMESTAMP,
    sentiment_score DECIMAL(4,3),
    relevance_score DECIMAL(4,3),
    image_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fn.id,
        fn.title,
        fn.news_url,
        fn.source_name,
        fn.published_at,
        fn.sentiment_score,
        fn.relevance_score,
        fn.image_url
    FROM finance_news fn
    WHERE 
        UPPER(p_symbol) = ANY(fn.mentioned_symbols) 
        OR UPPER(p_symbol) = ANY(fn.primary_symbols)
        OR EXISTS (
            SELECT 1 FROM finance_news_stocks fns 
            WHERE fns.finance_news_id = fn.id 
            AND fns.stock_symbol = UPPER(p_symbol)
        )
    ORDER BY fn.published_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;



-- 3. GET NEWS SUMMARY STATISTICS BY SYMBOL

CREATE OR REPLACE FUNCTION get_symbol_news_stats(
    p_symbol VARCHAR(20),
    p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    symbol VARCHAR(20),
    total_articles BIGINT,
    positive_articles BIGINT,
    negative_articles BIGINT,
    neutral_articles BIGINT,
    avg_sentiment DECIMAL(4,3),
    avg_relevance DECIMAL(4,3),
    latest_article_date TIMESTAMP,
    top_sources TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    WITH news_stats AS (
        SELECT 
            fn.sentiment_score,
            fn.relevance_score,
            fn.published_at,
            fn.source_name
        FROM finance_news fn
        LEFT JOIN finance_news_stocks fns ON fn.id = fns.finance_news_id 
            AND fns.stock_symbol = UPPER(p_symbol)
        WHERE 
            (
                UPPER(p_symbol) = ANY(fn.mentioned_symbols) 
                OR UPPER(p_symbol) = ANY(fn.primary_symbols)
                OR fns.stock_symbol = UPPER(p_symbol)
            )
            AND fn.published_at >= CURRENT_TIMESTAMP - INTERVAL '%s days'
    ),
    source_counts AS (
        SELECT 
            source_name,
            COUNT(*) as article_count
        FROM news_stats
        GROUP BY source_name
        ORDER BY COUNT(*) DESC
        LIMIT 5
    )
    SELECT 
        UPPER(p_symbol) as symbol,
        COUNT(*) as total_articles,
        COUNT(*) FILTER (WHERE sentiment_score > 0.1) as positive_articles,
        COUNT(*) FILTER (WHERE sentiment_score < -0.1) as negative_articles,
        COUNT(*) FILTER (WHERE sentiment_score BETWEEN -0.1 AND 0.1) as neutral_articles,
        AVG(sentiment_score) as avg_sentiment,
        AVG(relevance_score) as avg_relevance,
        MAX(published_at) as latest_article_date,
        ARRAY_AGG(sc.source_name ORDER BY sc.article_count DESC) as top_sources
    FROM news_stats ns
    CROSS JOIN source_counts sc
    GROUP BY UPPER(p_symbol);
END;
$$ LANGUAGE plpgsql;


-- 4. SEARCH NEWS BY KEYWORD AND SYMBOL

CREATE OR REPLACE FUNCTION search_symbol_news(
    p_symbol VARCHAR(20),
    p_search_term TEXT,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id BIGINT,
    title TEXT,
    news_url TEXT,
    source_name VARCHAR(100),
    published_at TIMESTAMP,
    sentiment_score DECIMAL(4,3),
    relevance_score DECIMAL(4,3),
    match_rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fn.id,
        fn.title,
        fn.news_url,
        fn.source_name,
        fn.published_at,
        fn.sentiment_score,
        fn.relevance_score,
        ts_rank(to_tsvector('english', fn.title), plainto_tsquery('english', p_search_term)) as match_rank
    FROM finance_news fn
    LEFT JOIN finance_news_stocks fns ON fn.id = fns.finance_news_id 
        AND fns.stock_symbol = UPPER(p_symbol)
    WHERE 
        (
            UPPER(p_symbol) = ANY(fn.mentioned_symbols) 
            OR UPPER(p_symbol) = ANY(fn.primary_symbols)
            OR fns.stock_symbol = UPPER(p_symbol)
        )
        AND to_tsvector('english', fn.title) @@ plainto_tsquery('english', p_search_term)
    ORDER BY match_rank DESC, fn.published_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- USAGE EXAMPLES
/*
-- Get comprehensive news for Apple
SELECT * FROM get_symbol_news('AAPL', 10, 0, 7, 0.0);

-- Get latest 5 news articles for Tesla
SELECT * FROM get_latest_symbol_news('TSLA', 5);

-- Get positive sentiment news for Microsoft
SELECT * FROM get_symbol_news_with_sentiment('MSFT', 'positive', 10, 30);

-- Get news statistics for Google
SELECT * FROM get_symbol_news_stats('GOOGL', 30);

-- Search for earnings-related news for Apple
SELECT * FROM search_symbol_news('AAPL', 'earnings revenue profit', 5);

-- Get news for multiple symbols
SELECT * FROM get_multiple_symbols_news(ARRAY['AAPL', 'TSLA', 'MSFT'], 3);

-- Example formatted query
SELECT 
    title,
    source_name,
    published_at::date as news_date,
    CASE 
        WHEN sentiment_score > 0.1 THEN '📈 Positive'
        WHEN sentiment_score < -0.1 THEN '📉 Negative'
        ELSE '➡️ Neutral'
    END as sentiment,
    ROUND(relevance_score * 100, 1) || '%' as relevance,
    news_url
FROM get_latest_symbol_news('AAPL', 10)
ORDER BY published_at DESC;
*/

-- SIGNIFICANT PRICE MOVEMENTS WITH NEWS
-- Functions to detect stock price movements ±3% and retrieve related news

-- 1. GET SIGNIFICANT PRICE MOVEMENTS WITH NEWS

CREATE OR REPLACE FUNCTION get_significant_price_movements_with_news(
    p_symbol VARCHAR(20) DEFAULT NULL,
    p_days_back INTEGER DEFAULT 30,
    p_min_change_percent DECIMAL(7,4) DEFAULT 3.0,
    p_limit INTEGER DEFAULT 50,
    p_data_provider VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    symbol VARCHAR(20),
    movement_date DATE,
    price_change_percent DECIMAL(7,4),
    price_change_amount DECIMAL(15,4),
    open_price DECIMAL(15,4),
    close_price DECIMAL(15,4),
    high_price DECIMAL(15,4),
    low_price DECIMAL(15,4),
    volume BIGINT,
    movement_type VARCHAR(10),
    quote_timestamp TIMESTAMP,
    news_id BIGINT,
    news_title TEXT,
    news_url TEXT,
    news_source VARCHAR(100),
    news_published_at TIMESTAMP,
    news_sentiment DECIMAL(4,3),
    news_relevance DECIMAL(4,3),
    time_diff_hours INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH significant_movements AS (
        SELECT 
            sq.symbol,
            DATE(sq.quote_timestamp) as movement_date,
            sq.change_percent as price_change_percent,
            sq.change_amount as price_change_amount,
            sq.open_price,
            sq.price as close_price,
            sq.high_price,
            sq.low_price,
            sq.volume,
            CASE 
                WHEN sq.change_percent >= p_min_change_percent THEN 'SURGE'::VARCHAR(10)
                WHEN sq.change_percent <= -p_min_change_percent THEN 'DROP'::VARCHAR(10)
            END as movement_type,
            sq.quote_timestamp,
            ROW_NUMBER() OVER (
                PARTITION BY sq.symbol, DATE(sq.quote_timestamp) 
                ORDER BY ABS(sq.change_percent) DESC
            ) as rn
        FROM stock_quotes sq
        WHERE 
            (p_symbol IS NULL OR sq.symbol = UPPER(p_symbol))
            AND sq.quote_timestamp >= CURRENT_TIMESTAMP - (p_days_back || ' days')::INTERVAL
            AND (
                sq.change_percent >= p_min_change_percent 
                OR sq.change_percent <= -p_min_change_percent
            )
            AND (p_data_provider IS NULL OR sq.data_provider = p_data_provider)
    ),
    movement_news AS (
        SELECT 
            sm.*,
            fn.id as news_id,
            fn.title as news_title,
            fn.news_url,
            fn.source_name as news_source,
            fn.published_at as news_published_at,
            fn.sentiment_score as news_sentiment,
            fn.relevance_score as news_relevance,
            EXTRACT(EPOCH FROM (sm.quote_timestamp - fn.published_at))/3600 as time_diff_hours,
            ROW_NUMBER() OVER (
                PARTITION BY sm.symbol, sm.movement_date 
                ORDER BY 
                    ABS(EXTRACT(EPOCH FROM (sm.quote_timestamp - fn.published_at))/3600),
                    fn.relevance_score DESC NULLS LAST,
                    fn.published_at DESC
            ) as news_rn
        FROM significant_movements sm
        LEFT JOIN finance_news fn ON (
            (UPPER(sm.symbol) = ANY(fn.mentioned_symbols) OR UPPER(sm.symbol) = ANY(fn.primary_symbols))
            AND fn.published_at BETWEEN sm.quote_timestamp - INTERVAL '24 hours' 
                                   AND sm.quote_timestamp + INTERVAL '6 hours'
        )
        WHERE sm.rn = 1
    )
    SELECT 
        mn.symbol,
        mn.movement_date,
        mn.price_change_percent,
        mn.price_change_amount,
        mn.open_price,
        mn.close_price,
        mn.high_price,
        mn.low_price,
        mn.volume,
        mn.movement_type,
        mn.quote_timestamp,
        mn.news_id,
        mn.news_title,
        mn.news_url,
        mn.news_source,
        mn.news_published_at,
        mn.news_sentiment,
        mn.news_relevance,
        mn.time_diff_hours::INTEGER
    FROM movement_news mn
    WHERE mn.news_rn <= 3 OR mn.news_id IS NULL
    ORDER BY 
        ABS(mn.price_change_percent) DESC,
        mn.quote_timestamp DESC,
        mn.news_rn
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- 2. GET TOP MOVERS WITH NEWS TODAY

CREATE OR REPLACE FUNCTION get_top_movers_with_news_today(
    p_limit INTEGER DEFAULT 20,
    p_min_change_percent DECIMAL(7,4) DEFAULT 3.0
)
RETURNS TABLE (
    symbol VARCHAR(20),
    price_change_percent DECIMAL(7,4),
    price_change_amount DECIMAL(15,4),
    current_price DECIMAL(15,4),
    volume BIGINT,
    movement_type VARCHAR(10),
    news_count INTEGER,
    latest_news_title TEXT,
    latest_news_sentiment DECIMAL(4,3),
    latest_news_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH todays_movers AS (
        SELECT 
            sq.symbol,
            sq.change_percent as price_change_percent,
            sq.change_amount as price_change_amount,
            sq.price as current_price,
            sq.volume,
            CASE 
                WHEN sq.change_percent >= p_min_change_percent THEN 'SURGE'::VARCHAR(10)
                WHEN sq.change_percent <= -p_min_change_percent THEN 'DROP'::VARCHAR(10)
            END as movement_type,
            sq.quote_timestamp,
            ROW_NUMBER() OVER (
                PARTITION BY sq.symbol 
                ORDER BY sq.quote_timestamp DESC
            ) as rn
        FROM stock_quotes sq
        WHERE 
            DATE(sq.quote_timestamp) = CURRENT_DATE
            AND (
                sq.change_percent >= p_min_change_percent 
                OR sq.change_percent <= -p_min_change_percent
            )
    ),
    latest_movers AS (
        SELECT 
            tm.symbol,
            tm.price_change_percent,
            tm.price_change_amount,
            tm.current_price,
            tm.volume,
            tm.movement_type,
            tm.quote_timestamp
        FROM todays_movers tm
        WHERE tm.rn = 1
    ),
    movers_with_news AS (
        SELECT 
            lm.*,
            COUNT(fn.id) as news_count,
            (
                SELECT fn2.title 
                FROM finance_news fn2 
                WHERE (UPPER(lm.symbol) = ANY(fn2.mentioned_symbols) OR UPPER(lm.symbol) = ANY(fn2.primary_symbols))
                AND DATE(fn2.published_at) = CURRENT_DATE
                ORDER BY fn2.published_at DESC
                LIMIT 1
            ) as latest_news_title,
            (
                SELECT fn2.sentiment_score 
                FROM finance_news fn2 
                WHERE (UPPER(lm.symbol) = ANY(fn2.mentioned_symbols) OR UPPER(lm.symbol) = ANY(fn2.primary_symbols))
                AND DATE(fn2.published_at) = CURRENT_DATE
                ORDER BY fn2.published_at DESC
                LIMIT 1
            ) as latest_news_sentiment,
            (
                SELECT fn2.news_url 
                FROM finance_news fn2 
                WHERE (UPPER(lm.symbol) = ANY(fn2.mentioned_symbols) OR UPPER(lm.symbol) = ANY(fn2.primary_symbols))
                AND DATE(fn2.published_at) = CURRENT_DATE
                ORDER BY fn2.published_at DESC
                LIMIT 1
            ) as latest_news_url
        FROM latest_movers lm
        LEFT JOIN finance_news fn ON (
            (UPPER(lm.symbol) = ANY(fn.mentioned_symbols) OR UPPER(lm.symbol) = ANY(fn.primary_symbols))
            AND DATE(fn.published_at) = CURRENT_DATE
        )
        GROUP BY lm.symbol, lm.price_change_percent, lm.price_change_amount, 
                 lm.current_price, lm.volume, lm.movement_type, lm.quote_timestamp
    )
    SELECT 
        mwn.symbol,
        mwn.price_change_percent,
        mwn.price_change_amount,
        mwn.current_price,
        mwn.volume,
        mwn.movement_type,
        mwn.news_count::INTEGER,
        mwn.latest_news_title,
        mwn.latest_news_sentiment,
        mwn.latest_news_url
    FROM movers_with_news mwn
    ORDER BY ABS(mwn.price_change_percent) DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- USAGE EXAMPLES
/*
-- Get significant movements with related news for Apple
SELECT * FROM get_significant_price_movements_with_news('AAPL', 30, 3.0, 20);

-- Get all significant movements across all stocks
SELECT * FROM get_significant_price_movements_with_news(NULL, 7, 3.0, 50);

-- Get daily summary for today
SELECT * FROM get_daily_significant_movements_summary(CURRENT_DATE, 3.0);

-- Get Tesla's movement history with news correlation
SELECT * FROM get_symbol_movement_history_with_news('TSLA', 90, 3.0);

-- Get today's top movers with news
SELECT * FROM get_top_movers_with_news_today(15, 3.0);

-- Example formatted query for significant movements
SELECT 
    symbol,
    movement_date,
    CONCAT(
        CASE WHEN movement_type = 'SURGE' THEN '📈 +' ELSE '📉 ' END,
        ROUND(price_change_percent, 2), '%'
    ) as movement,
    CONCAT('$', ROUND(close_price, 2)) as price,
    CASE 
        WHEN news_title IS NOT NULL THEN LEFT(news_title, 80) || '...'
        ELSE 'No related news found'
    END as related_news
FROM get_significant_price_movements_with_news('AAPL', 14, 3.0, 10)
ORDER BY movement_date DESC;
*/

-- ----------------------------------------------------------------------------
-- Function: get_historical_prices
-- NEW DESIGN: Query historical price data with RANGE-TO-INTERVAL mapping
-- Ranges are calculated dynamically based on timestamps - no duplicate storage
-- Eliminates massive data duplication by storing intervals only
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_historical_prices(
    p_symbol TEXT,
    p_time_range TEXT,
    p_time_interval TEXT,
    p_data_provider TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 1000
) RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    exchange_id INTEGER,
    timestamp_utc TIMESTAMP,
    date_only DATE,
    time_interval VARCHAR(10),
    open DECIMAL(15,4),
    high DECIMAL(15,4),
    low DECIMAL(15,4),
    close DECIMAL(15,4),
    volume BIGINT,
    adjusted_close DECIMAL(15,4),
    dividend DECIMAL(10,4),
    split_ratio DECIMAL(10,4),
    data_provider VARCHAR(50),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
) AS $$
DECLARE
    v_start_time TIMESTAMP;
    v_optimal_interval VARCHAR(10);
BEGIN
    -- Validate time_range parameter
    IF p_time_range NOT IN ('1d', '5d', '1mo', '3mo', '6mo', 'ytd', '1y', '2y', '5y', '10y', 'max') THEN
        RAISE EXCEPTION 'Invalid time_range: %. Must be one of: 1d, 5d, 1mo, 3mo, 6mo, ytd, 1y, 2y, 5y, 10y, max', p_time_range;
    END IF;

    -- Validate time_interval parameter
    IF p_time_interval NOT IN ('5m', '15m', '30m', '1h', '1d', '1wk', '1mo') THEN
        RAISE EXCEPTION 'Invalid time_interval: %. Must be one of: 5m, 15m, 30m, 1h, 1d, 1wk, 1mo', p_time_interval;
    END IF;

    -- Calculate time range start based on range parameter
    CASE p_time_range
        WHEN '1d' THEN v_start_time := CURRENT_TIMESTAMP - INTERVAL '1 day';
        WHEN '5d' THEN v_start_time := CURRENT_TIMESTAMP - INTERVAL '5 days';
        WHEN '1mo' THEN v_start_time := CURRENT_TIMESTAMP - INTERVAL '1 month';
        WHEN '3mo' THEN v_start_time := CURRENT_TIMESTAMP - INTERVAL '3 months';
        WHEN '6mo' THEN v_start_time := CURRENT_TIMESTAMP - INTERVAL '6 months';
        WHEN 'ytd' THEN v_start_time := DATE_TRUNC('year', CURRENT_DATE)::TIMESTAMP;
        WHEN '1y' THEN v_start_time := CURRENT_TIMESTAMP - INTERVAL '1 year';
        WHEN '2y' THEN v_start_time := CURRENT_TIMESTAMP - INTERVAL '2 years';
        WHEN '5y' THEN v_start_time := CURRENT_TIMESTAMP - INTERVAL '5 years';
        WHEN '10y' THEN v_start_time := CURRENT_TIMESTAMP - INTERVAL '10 years';
        WHEN 'max' THEN v_start_time := '1900-01-01'::TIMESTAMP;
    END CASE;

    -- Smart interval optimization: use best available interval for requested range
    -- For performance, automatically select optimal interval if requested interval unavailable
    CASE p_time_range
        WHEN '1d' THEN 
            v_optimal_interval := CASE 
                WHEN p_time_interval IN ('5m', '15m', '30m') THEN p_time_interval
                ELSE '5m' -- Default to 5m for intraday
            END;
        WHEN '5d' THEN 
            v_optimal_interval := CASE 
                WHEN p_time_interval IN ('15m', '30m', '1h') THEN p_time_interval
                ELSE '15m' -- Default to 15m for 5 days
            END;
        WHEN '1mo' THEN 
            v_optimal_interval := CASE 
                WHEN p_time_interval IN ('1h', '1d') THEN p_time_interval
                ELSE '1h' -- Default to 1h for 1 month
            END;
        WHEN '3mo', '6mo', 'ytd', '1y' THEN 
            v_optimal_interval := CASE 
                WHEN p_time_interval IN ('1d', '1wk') THEN p_time_interval
                ELSE '1d' -- Default to daily for longer ranges
            END;
        WHEN '2y', '5y', '10y', 'max' THEN 
            v_optimal_interval := CASE 
                WHEN p_time_interval IN ('1d', '1wk', '1mo') THEN p_time_interval
                ELSE '1wk' -- Default to weekly for very long ranges
            END;
    END CASE;

    -- Return the query results with time-based filtering
    RETURN QUERY
    SELECT 
        hp.id,
        hp.symbol,
        hp.exchange_id,
        hp.timestamp_utc,
        hp.date_only,
        hp.time_interval,
        hp.open,
        hp.high,
        hp.low,
        hp.close,
        hp.volume,
        hp.adjusted_close,
        hp.dividend,
        hp.split_ratio,
        hp.data_provider,
        hp.created_at,
        hp.updated_at
    FROM historical_prices hp
    WHERE hp.symbol = p_symbol
      AND hp.time_interval = v_optimal_interval
      AND hp.timestamp_utc >= v_start_time
      AND (p_data_provider IS NULL OR hp.data_provider = p_data_provider)
    ORDER BY hp.timestamp_utc DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function: get_historical_prices_by_symbol
-- Get all available intervals for a specific symbol (no ranges stored)
-- Shows interval coverage and data availability
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_historical_prices_by_symbol(
    p_symbol TEXT
) RETURNS TABLE (
    time_interval VARCHAR(10),
    data_count BIGINT,
    earliest_date TIMESTAMP,
    latest_date TIMESTAMP,
    data_providers TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        hp.time_interval,
        COUNT(*) as data_count,
        MIN(hp.timestamp_utc) as earliest_date,
        MAX(hp.timestamp_utc) as latest_date,
        ARRAY_AGG(DISTINCT hp.data_provider) as data_providers
    FROM historical_prices hp
    WHERE hp.symbol = p_symbol
    GROUP BY hp.time_interval
    ORDER BY 
        CASE hp.time_interval
            WHEN '5m' THEN 1
            WHEN '15m' THEN 2
            WHEN '30m' THEN 3
            WHEN '1h' THEN 4
            WHEN '1d' THEN 5
            WHEN '1wk' THEN 6
            WHEN '1mo' THEN 7
            ELSE 99
        END;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function: get_latest_historical_prices
-- Get the most recent historical price data for a symbol across all intervals
-- Useful for getting current price snapshots
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_latest_historical_prices(
    p_symbol TEXT,
    p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
    timestamp_utc TIMESTAMP,
    time_interval VARCHAR(10),
    open DECIMAL(15,4),
    high DECIMAL(15,4),
    low DECIMAL(15,4),
    close DECIMAL(15,4),
    volume BIGINT,
    adjusted_close DECIMAL(15,4),
    data_provider VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        hp.timestamp_utc,
        hp.time_interval,
        hp.open,
        hp.high,
        hp.low,
        hp.close,
        hp.volume,
        hp.adjusted_close,
        hp.data_provider
    FROM historical_prices hp
    WHERE hp.symbol = p_symbol
    ORDER BY hp.timestamp_utc DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function: get_historical_price_range
-- Get historical prices within a specific date range for analysis
-- NEW: No range parameter needed - query by interval and time directly
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_historical_price_range(
    p_symbol TEXT,
    p_time_interval TEXT,
    p_start_date TIMESTAMP,
    p_end_date TIMESTAMP,
    p_data_provider TEXT DEFAULT NULL
) RETURNS TABLE (
    timestamp_utc TIMESTAMP,
    open DECIMAL(15,4),
    high DECIMAL(15,4),
    low DECIMAL(15,4),
    close DECIMAL(15,4),
    volume BIGINT,
    adjusted_close DECIMAL(15,4)
) AS $$
BEGIN
    -- Validate parameters
    IF p_time_interval NOT IN ('5m', '15m', '30m', '1h', '1d', '1wk', '1mo') THEN
        RAISE EXCEPTION 'Invalid time_interval: %', p_time_interval;
    END IF;

    RETURN QUERY
    SELECT 
        hp.timestamp_utc,
        hp.open,
        hp.high,
        hp.low,
        hp.close,
        hp.volume,
        hp.adjusted_close
    FROM historical_prices hp
    WHERE hp.symbol = p_symbol
      AND hp.time_interval = p_time_interval
      AND hp.timestamp_utc >= p_start_date
      AND hp.timestamp_utc <= p_end_date
      AND (p_data_provider IS NULL OR hp.data_provider = p_data_provider)
    ORDER BY hp.timestamp_utc ASC;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Example Usage: NEW APPROACH - Range calculated dynamically
-- ----------------------------------------------------------------------------

/*
-- Get 5-minute interval data for AAPL from the 1-day range (auto-optimized)
SELECT * FROM get_historical_prices('AAPL', '1d', '5m') LIMIT 100;

-- Get 1-hour interval data for TSLA from the 5-day range (auto-optimized)
SELECT * FROM get_historical_prices('TSLA', '5d', '1h') LIMIT 100;

-- Get daily data for GOOGL from the 1-year range (auto-optimized)
SELECT * FROM get_historical_prices('GOOGL', '1y', '1d') LIMIT 365;

-- Get weekly data for SPY from the max range (auto-optimized)
SELECT * FROM get_historical_prices('SPY', 'max', '1wk');

-- Check what intervals are available for a specific symbol
SELECT * FROM get_historical_prices_by_symbol('AAPL');

-- Get the latest prices for a symbol across all intervals
SELECT * FROM get_latest_historical_prices('AAPL', 5);

-- Get data within a specific date range (no time_range parameter needed)
SELECT * FROM get_historical_price_range(
    'AAPL', 
    '1d',  -- interval only
    '2025-08-01 00:00:00'::TIMESTAMP, 
    '2025-09-01 00:00:00'::TIMESTAMP
);

-- BENEFITS OF NEW APPROACH:
-- ✅ 80-90% reduction in storage space (no duplicate data)
-- ✅ Faster queries (no range filtering needed)
-- ✅ Auto-optimization of intervals based on requested ranges
-- ✅ Simplified edge function - only fetches intervals
-- ✅ Better performance and cost efficiency
*/

-- =================================================================
-- GET KEY STATS FUNCTION
--
-- This function retrieves a comprehensive set of key financial
-- statistics for a given stock symbol. It combines data from
-- company_info, balance_sheet, income_statement, and cash_flow
-- tables to provide a snapshot of a company's financial health.
--
-- The function allows specifying the frequency of financial data
-- (annual or quarterly) and returns the most recent data available
-- for that period.
-- =================================================================

CREATE OR REPLACE FUNCTION get_key_stats(
    p_symbol VARCHAR(20),
    p_frequency VARCHAR(10) DEFAULT 'annual'
)
RETURNS TABLE (
    market_cap BIGINT,
    cash_and_cash_equivalents NUMERIC(25, 2),
    total_debt NUMERIC(25, 2),
    enterprise_value NUMERIC(30, 2),
    revenue NUMERIC(25, 2),
    gross_profit NUMERIC(25, 2),
    ebitda NUMERIC(25, 2),
    net_income_common_stockholders NUMERIC(25, 2),
    diluted_eps NUMERIC(10, 4),
    operating_cash_flow NUMERIC(25, 2),
    capital_expenditure NUMERIC(25, 2),
    free_cash_flow NUMERIC(25, 2)
) AS $$
BEGIN
    RETURN QUERY
    WITH latest_company_info AS (
        SELECT
            ci.symbol,
            ci.market_cap
        FROM company_info ci
        WHERE ci.symbol = UPPER(p_symbol)
        ORDER BY ci.updated_at DESC
        LIMIT 1
    ),
    latest_balance_sheet AS (
        SELECT
            bs.symbol,
            bs.cash_and_cash_equivalents,
            bs.total_debt
        FROM balance_sheet bs
        WHERE bs.symbol = UPPER(p_symbol) AND bs.frequency = p_frequency
        ORDER BY bs.fiscal_date DESC
        LIMIT 1
    ),
    latest_income_statement AS (
        SELECT
            ist.symbol,
            ist.total_revenue,
            ist.gross_profit,
            ist.ebitda,
            ist.net_income_common_stockholders,
            ist.diluted_eps
        FROM income_statement ist
        WHERE ist.symbol = UPPER(p_symbol) AND ist.frequency = p_frequency
        ORDER BY ist.fiscal_date DESC
        LIMIT 1
    ),
    latest_cash_flow AS (
        SELECT
            cf.symbol,
            cf.operating_cash_flow,
            cf.capital_expenditure,
            cf.free_cash_flow
        FROM cash_flow cf
        WHERE cf.symbol = UPPER(p_symbol) AND cf.frequency = p_frequency
        ORDER BY cf.fiscal_date DESC
        LIMIT 1
    )
    SELECT
        lci.market_cap,
        lbs.cash_and_cash_equivalents,
        lbs.total_debt,
        (lci.market_cap + lbs.total_debt - lbs.cash_and_cash_equivalents)::NUMERIC(30, 2) AS enterprise_value,
        lis.total_revenue AS revenue,
        lis.gross_profit,
        lis.ebitda,
        lis.net_income_common_stockholders,
        lis.diluted_eps,
        lcf.operating_cash_flow,
        lcf.capital_expenditure,
        lcf.free_cash_flow
    FROM
        latest_company_info lci
    LEFT JOIN
        latest_balance_sheet lbs ON lci.symbol = lbs.symbol
    LEFT JOIN
        latest_income_statement lis ON lci.symbol = lis.symbol
    LEFT JOIN
        latest_cash_flow lcf ON lci.symbol = lcf.symbol;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Get annual key stats for Apple
SELECT * FROM get_key_stats('AAPL');

-- Get quarterly key stats for Microsoft
SELECT * FROM get_key_stats('MSFT', 'quarterly');

-- Get annual key stats for Google
SELECT * FROM get_key_stats('GOOGL', 'annual');
*/

-- =================================================================
-- GET INCOME STATEMENT FUNCTION
--
-- This function retrieves historical income statement data for a
-- given stock symbol. It allows specifying the frequency (annual or
-- quarterly) and the number of periods to return.
--
-- The data is returned in descending order by fiscal date, providing
-- the most recent data first.
-- =================================================================

CREATE OR REPLACE FUNCTION get_income_statement(
    p_symbol VARCHAR,
    p_frequency VARCHAR,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    frequency VARCHAR(10),
    fiscal_date DATE,
    total_revenue NUMERIC(25, 2),
    operating_revenue NUMERIC(25, 2),
    cost_of_revenue NUMERIC(25, 2),
    gross_profit NUMERIC(25, 2),
    reconciled_cost_of_revenue NUMERIC(25, 2),
    operating_expense NUMERIC(25, 2),
    selling_general_and_administrative NUMERIC(25, 2),
    research_and_development NUMERIC(25, 2),
    total_expenses NUMERIC(25, 2),
    reconciled_depreciation NUMERIC(25, 2),
    operating_income NUMERIC(25, 2),
    total_operating_income_as_reported NUMERIC(25, 2),
    net_non_operating_interest_income_expense NUMERIC(25, 2),
    non_operating_interest_income NUMERIC(25, 2),
    non_operating_interest_expense NUMERIC(25, 2),
    other_income_expense NUMERIC(25, 2),
    other_non_operating_income_expenses NUMERIC(25, 2),
    pretax_income NUMERIC(25, 2),
    net_income_common_stockholders NUMERIC(25, 2),
    net_income_attributable_to_parent_shareholders NUMERIC(25, 2),
    net_income_including_non_controlling_interests NUMERIC(25, 2),
    net_income_continuous_operations NUMERIC(25, 2),
    diluted_ni_available_to_common_stockholders NUMERIC(25, 2),
    net_income_from_continuing_discontinued_operation NUMERIC(25, 2),
    net_income_from_continuing_operation_net_minority_interest NUMERIC(25, 2),
    normalized_income NUMERIC(25, 2),
    interest_income NUMERIC(25, 2),
    interest_expense NUMERIC(25, 2),
    net_interest_income NUMERIC(25, 2),
    basic_eps NUMERIC(10, 4),
    diluted_eps NUMERIC(10, 4),
    basic_average_shares BIGINT,
    diluted_average_shares BIGINT,
    ebit NUMERIC(25, 2),
    ebitda NUMERIC(25, 2),
    normalized_ebitda NUMERIC(25, 2),
    tax_provision NUMERIC(25, 2),
    tax_rate_for_calcs NUMERIC(10, 4),
    tax_effect_of_unusual_items NUMERIC(25, 2),
    data_provider VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ist.symbol,
        ist.frequency,
        ist.fiscal_date,
        ist.total_revenue,
        ist.operating_revenue,
        ist.cost_of_revenue,
        ist.gross_profit,
        ist.reconciled_cost_of_revenue,
        ist.operating_expense,
        ist.selling_general_and_administrative,
        ist.research_and_development,
        ist.total_expenses,
        ist.reconciled_depreciation,
        ist.operating_income,
        ist.total_operating_income_as_reported,
        ist.net_non_operating_interest_income_expense,
        ist.non_operating_interest_income,
        ist.non_operating_interest_expense,
        ist.other_income_expense,
        ist.other_non_operating_income_expenses,
        ist.pretax_income,
        ist.net_income_common_stockholders,
        ist.net_income_attributable_to_parent_shareholders,
        ist.net_income_including_non_controlling_interests,
        ist.net_income_continuous_operations,
        ist.diluted_ni_available_to_common_stockholders,
        ist.net_income_from_continuing_discontinued_operation,
        ist.net_income_from_continuing_operation_net_minority_interest,
        ist.normalized_income,
        ist.interest_income,
        ist.interest_expense,
        ist.net_interest_income,
        ist.basic_eps,
        ist.diluted_eps,
        ist.basic_average_shares,
        ist.diluted_average_shares,
        ist.ebit,
        ist.ebitda,
        ist.normalized_ebitda,
        ist.tax_provision,
        ist.tax_rate_for_calcs,
        ist.tax_effect_of_unusual_items,
        ist.data_provider,
        ist.created_at,
        ist.updated_at
    FROM
        income_statement ist
    WHERE
        ist.symbol = UPPER(p_symbol) AND ist.frequency = p_frequency
    ORDER BY
        ist.fiscal_date DESC
    LIMIT
        p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Get the last 10 quarters of income statement data for Apple
SELECT * FROM get_income_statement('AAPL', 'quarterly', 10);

-- Get the last 5 years of annual income statement data for Microsoft
SELECT * FROM get_income_statement('MSFT', 'annual', 5);

-- Get the last 20 quarters of income statement data for Google
SELECT * FROM get_income_statement('GOOGL', 'quarterly', 20);
*/


-- =================================================================
-- GET BALANCE SHEET FUNCTION
--
-- This function retrieves historical balance sheet data for a
-- given stock symbol. It allows specifying the frequency (annual or
-- quarterly) and the number of periods to return.
--
-- The data is returned in descending order by fiscal date, providing
-- the most recent data first.
-- =================================================================

CREATE OR REPLACE FUNCTION get_balance_sheet(
    p_symbol VARCHAR,
    p_frequency VARCHAR,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    frequency VARCHAR(10),
    fiscal_date DATE,
    total_assets NUMERIC(25, 2),
    total_current_assets NUMERIC(25, 2),
    cash_cash_equivalents_and_short_term_investments NUMERIC(25, 2),
    cash_and_cash_equivalents NUMERIC(25, 2),
    cash NUMERIC(25, 2),
    cash_equivalents NUMERIC(25, 2),
    other_short_term_investments NUMERIC(25, 2),
    receivables NUMERIC(25, 2),
    accounts_receivable NUMERIC(25, 2),
    other_receivables NUMERIC(25, 2),
    inventory NUMERIC(25, 2),
    other_current_assets NUMERIC(25, 2),
    total_non_current_assets NUMERIC(25, 2),
    net_ppe NUMERIC(25, 2),
    gross_ppe NUMERIC(25, 2),
    properties NUMERIC(25, 2),
    land_and_improvements NUMERIC(25, 2),
    machinery_furniture_equipment NUMERIC(25, 2),
    other_properties NUMERIC(25, 2),
    leases NUMERIC(25, 2),
    accumulated_depreciation NUMERIC(25, 2),
    investments_and_advances NUMERIC(25, 2),
    investment_in_financial_assets NUMERIC(25, 2),
    available_for_sale_securities NUMERIC(25, 2),
    other_investments NUMERIC(25, 2),
    non_current_deferred_assets NUMERIC(25, 2),
    non_current_deferred_taxes_assets NUMERIC(25, 2),
    other_non_current_assets NUMERIC(25, 2),
    net_tangible_assets NUMERIC(25, 2),
    tangible_book_value NUMERIC(25, 2),
    total_liabilities NUMERIC(25, 2),
    total_current_liabilities NUMERIC(25, 2),
    payables_and_accrued_expenses NUMERIC(25, 2),
    payables NUMERIC(25, 2),
    accounts_payable NUMERIC(25, 2),
    total_tax_payable NUMERIC(25, 2),
    income_tax_payable NUMERIC(25, 2),
    current_debt_and_capital_lease_obligation NUMERIC(25, 2),
    current_debt NUMERIC(25, 2),
    commercial_paper NUMERIC(25, 2),
    other_current_borrowings NUMERIC(25, 2),
    current_capital_lease_obligation NUMERIC(25, 2),
    current_deferred_liabilities NUMERIC(25, 2),
    current_deferred_revenue NUMERIC(25, 2),
    other_current_liabilities NUMERIC(25, 2),
    total_non_current_liabilities NUMERIC(25, 2),
    long_term_debt_and_capital_lease_obligation NUMERIC(25, 2),
    long_term_debt NUMERIC(25, 2),
    long_term_capital_lease_obligation NUMERIC(25, 2),
    trade_and_other_payables_non_current NUMERIC(25, 2),
    other_non_current_liabilities NUMERIC(25, 2),
    capital_lease_obligations NUMERIC(25, 2),
    total_debt NUMERIC(25, 2),
    net_debt NUMERIC(25, 2),
    total_equity NUMERIC(25, 2),
    stockholders_equity NUMERIC(25, 2),
    capital_stock NUMERIC(25, 2),
    common_stock NUMERIC(25, 2),
    retained_earnings NUMERIC(25, 2),
    gains_losses_not_affecting_retained_earnings NUMERIC(25, 2),
    other_equity_adjustments NUMERIC(25, 2),
    common_stock_equity NUMERIC(25, 2),
    shares_issued BIGINT,
    ordinary_shares_number BIGINT,
    treasury_shares_number BIGINT,
    working_capital NUMERIC(25, 2),
    invested_capital NUMERIC(25, 2),
    total_capitalization NUMERIC(25, 2),
    data_provider VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        bs.symbol,
        bs.frequency,
        bs.fiscal_date,
        bs.total_assets,
        bs.total_current_assets,
        bs.cash_cash_equivalents_and_short_term_investments,
        bs.cash_and_cash_equivalents,
        bs.cash,
        bs.cash_equivalents,
        bs.other_short_term_investments,
        bs.receivables,
        bs.accounts_receivable,
        bs.other_receivables,
        bs.inventory,
        bs.other_current_assets,
        bs.total_non_current_assets,
        bs.net_ppe,
        bs.gross_ppe,
        bs.properties,
        bs.land_and_improvements,
        bs.machinery_furniture_equipment,
        bs.other_properties,
        bs.leases,
        bs.accumulated_depreciation,
        bs.investments_and_advances,
        bs.investment_in_financial_assets,
        bs.available_for_sale_securities,
        bs.other_investments,
        bs.non_current_deferred_assets,
        bs.non_current_deferred_taxes_assets,
        bs.other_non_current_assets,
        bs.net_tangible_assets,
        bs.tangible_book_value,
        bs.total_liabilities,
        bs.total_current_liabilities,
        bs.payables_and_accrued_expenses,
        bs.payables,
        bs.accounts_payable,
        bs.total_tax_payable,
        bs.income_tax_payable,
        bs.current_debt_and_capital_lease_obligation,
        bs.current_debt,
        bs.commercial_paper,
        bs.other_current_borrowings,
        bs.current_capital_lease_obligation,
        bs.current_deferred_liabilities,
        bs.current_deferred_revenue,
        bs.other_current_liabilities,
        bs.total_non_current_liabilities,
        bs.long_term_debt_and_capital_lease_obligation,
        bs.long_term_debt,
        bs.long_term_capital_lease_obligation,
        bs.trade_and_other_payables_non_current,
        bs.other_non_current_liabilities,
        bs.capital_lease_obligations,
        bs.total_debt,
        bs.net_debt,
        bs.total_equity,
        bs.stockholders_equity,
        bs.capital_stock,
        bs.common_stock,
        bs.retained_earnings,
        bs.gains_losses_not_affecting_retained_earnings,
        bs.other_equity_adjustments,
        bs.common_stock_equity,
        bs.shares_issued,
        bs.ordinary_shares_number,
        bs.treasury_shares_number,
        bs.working_capital,
        bs.invested_capital,
        bs.total_capitalization,
        bs.data_provider,
        bs.created_at,
        bs.updated_at
    FROM
        balance_sheet bs
    WHERE
        bs.symbol = UPPER(p_symbol) AND bs.frequency = p_frequency
    ORDER BY
        bs.fiscal_date DESC
    LIMIT
        p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Get the last 10 quarters of balance sheet data for Apple
SELECT * FROM get_balance_sheet('AAPL', 'quarterly', 10);

-- Get the last 5 years of annual balance sheet data for Microsoft
SELECT * FROM get_balance_sheet('MSFT', 'annual', 5);

-- Get the last 20 quarters of balance sheet data for Google
SELECT * FROM get_balance_sheet('GOOGL', 'quarterly', 20);
*/

-- =================================================================
-- GET CASH FLOW FUNCTION
--
-- This function retrieves historical cash flow statement data for a
-- given stock symbol. It allows specifying the frequency (annual or
-- quarterly) and the number of periods to return.
--
-- The data is returned in descending order by fiscal date, providing
-- the most recent data first.
-- =================================================================

CREATE OR REPLACE FUNCTION get_cash_flow(
    p_symbol VARCHAR,
    p_frequency VARCHAR,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    frequency VARCHAR(10),
    fiscal_date DATE,
    operating_cash_flow NUMERIC(25, 2),
    net_income_from_continuing_operations NUMERIC(25, 2),
    depreciation_and_amortization NUMERIC(25, 2),
    deferred_income_tax NUMERIC(25, 2),
    stock_based_compensation NUMERIC(25, 2),
    other_non_cash_items NUMERIC(25, 2),
    change_in_working_capital NUMERIC(25, 2),
    change_in_receivables NUMERIC(25, 2),
    change_in_inventory NUMERIC(25, 2),
    change_in_payables_and_accrued_expense NUMERIC(25, 2),
    change_in_other_current_assets NUMERIC(25, 2),
    change_in_other_current_liabilities NUMERIC(25, 2),
    change_in_other_working_capital NUMERIC(25, 2),
    investing_cash_flow NUMERIC(25, 2),
    net_investment_purchase_and_sale NUMERIC(25, 2),
    purchase_of_investment NUMERIC(25, 2),
    sale_of_investment NUMERIC(25, 2),
    net_ppe_purchase_and_sale NUMERIC(25, 2),
    purchase_of_ppe NUMERIC(25, 2),
    net_business_purchase_and_sale NUMERIC(25, 2),
    purchase_of_business NUMERIC(25, 2),
    net_other_investing_changes NUMERIC(25, 2),
    capital_expenditure NUMERIC(25, 2),
    financing_cash_flow NUMERIC(25, 2),
    net_issuance_payments_of_debt NUMERIC(25, 2),
    net_long_term_debt_issuance NUMERIC(25, 2),
    long_term_debt_issuance NUMERIC(25, 2),
    long_term_debt_payments NUMERIC(25, 2),
    net_short_term_debt_issuance NUMERIC(25, 2),
    short_term_debt_issuance NUMERIC(25, 2),
    short_term_debt_payments NUMERIC(25, 2),
    net_common_stock_issuance NUMERIC(25, 2),
    common_stock_issuance NUMERIC(25, 2),
    common_stock_payments NUMERIC(25, 2),
    cash_dividends_paid NUMERIC(25, 2),
    net_other_financing_charges NUMERIC(25, 2),
    issuance_of_capital_stock NUMERIC(25, 2),
    issuance_of_debt NUMERIC(25, 2),
    repayment_of_debt NUMERIC(25, 2),
    repurchase_of_capital_stock NUMERIC(25, 2),
    end_cash_position NUMERIC(25, 2),
    changes_in_cash NUMERIC(25, 2),
    beginning_cash_position NUMERIC(25, 2),
    free_cash_flow NUMERIC(25, 2),
    income_tax_paid_supplemental_data NUMERIC(25, 2),
    interest_paid_supplemental_data NUMERIC(25, 2),
    data_provider VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cf.symbol,
        cf.frequency,
        cf.fiscal_date,
        cf.operating_cash_flow,
        cf.net_income_from_continuing_operations,
        cf.depreciation_and_amortization,
        cf.deferred_income_tax,
        cf.stock_based_compensation,
        cf.other_non_cash_items,
        cf.change_in_working_capital,
        cf.change_in_receivables,
        cf.change_in_inventory,
        cf.change_in_payables_and_accrued_expense,
        cf.change_in_other_current_assets,
        cf.change_in_other_current_liabilities,
        cf.change_in_other_working_capital,
        cf.investing_cash_flow,
        cf.net_investment_purchase_and_sale,
        cf.purchase_of_investment,
        cf.sale_of_investment,
        cf.net_ppe_purchase_and_sale,
        cf.purchase_of_ppe,
        cf.net_business_purchase_and_sale,
        cf.purchase_of_business,
        cf.net_other_investing_changes,
        cf.capital_expenditure,
        cf.financing_cash_flow,
        cf.net_issuance_payments_of_debt,
        cf.net_long_term_debt_issuance,
        cf.long_term_debt_issuance,
        cf.long_term_debt_payments,
        cf.net_short_term_debt_issuance,
        cf.short_term_debt_issuance,
        cf.short_term_debt_payments,
        cf.net_common_stock_issuance,
        cf.common_stock_issuance,
        cf.common_stock_payments,
        cf.cash_dividends_paid,
        cf.net_other_financing_charges,
        cf.issuance_of_capital_stock,
        cf.issuance_of_debt,
        cf.repayment_of_debt,
        cf.repurchase_of_capital_stock,
        cf.end_cash_position,
        cf.changes_in_cash,
        cf.beginning_cash_position,
        cf.free_cash_flow,
        cf.income_tax_paid_supplemental_data,
        cf.interest_paid_supplemental_data,
        cf.data_provider,
        cf.created_at,
        cf.updated_at
    FROM
        cash_flow cf
    WHERE
        cf.symbol = UPPER(p_symbol) AND cf.frequency = p_frequency
    ORDER BY
        cf.fiscal_date DESC
    LIMIT
        p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Get the last 10 quarters of cash flow data for Apple
SELECT * FROM get_cash_flow('AAPL', 'quarterly', 10);

-- Get the last 5 years of annual cash flow data for Microsoft
SELECT * FROM get_cash_flow('MSFT', 'annual', 5);

-- Get the last 20 quarters of cash flow data for Google
SELECT * FROM get_cash_flow('GOOGL', 'quarterly', 20);
*/

-- BATCH LOGO RETRIEVAL FUNCTION

-- Function to retrieve logos for multiple symbols at once
-- Returns: table with symbol and logo columns

CREATE OR REPLACE FUNCTION get_company_logos_batch(
    p_symbols VARCHAR(20)[]
)
RETURNS TABLE(
    symbol VARCHAR(20),
    logo VARCHAR(500)
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    -- Validate input parameter
    IF p_symbols IS NULL OR array_length(p_symbols, 1) IS NULL THEN
        RETURN;
    END IF;

    -- Return logos for all requested symbols
    RETURN QUERY
    SELECT 
        ci.symbol,
        ci.logo
    FROM company_info ci
    WHERE UPPER(ci.symbol) = ANY(
        SELECT UPPER(TRIM(unnest(p_symbols)))
    )
    ORDER BY ci.symbol;

EXCEPTION
    WHEN OTHERS THEN
        -- Log error and return empty result on any exception
        RAISE WARNING 'Error retrieving logos for symbols: %', SQLERRM;
        RETURN;
END;
$$;


-- BATCH USAGE EXAMPLES
-- SELECT * FROM get_company_logos_batch(ARRAY['AAPL', 'MSFT', 'TSLA']);
-- SELECT * FROM get_company_logos_batch(ARRAY['SPY', 'QQQ', 'DIA']);

-- EARNINGS CALENDAR LOGO RETRIEVAL FUNCTION

-- Function to retrieve logos for multiple symbols from earnings_calendar table only
-- Returns: table with symbol and logo columns
-- Fetches logos exclusively from the earnings_calendar table

CREATE OR REPLACE FUNCTION get_earnings_calendar_logos_batch(
    p_symbols VARCHAR(20)[]
)
RETURNS TABLE(
    symbol VARCHAR(20),
    logo VARCHAR(500)
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Validate input
    IF p_symbols IS NULL OR array_length(p_symbols, 1) IS NULL THEN
        RETURN;
    END IF;

    -- Return logos for all requested symbols from earnings_calendar table only
    RETURN QUERY
    SELECT DISTINCT
        ec.symbol,
        ec.logo
    FROM earnings_calendar ec
    WHERE UPPER(ec.symbol) = ANY(
        SELECT UPPER(TRIM(unnest(p_symbols)))
    )
    AND ec.logo IS NOT NULL
    ORDER BY ec.symbol;

EXCEPTION
    WHEN OTHERS THEN
        -- Log error and return empty result
        RAISE WARNING 'Error in get_earnings_calendar_logos_batch: %', SQLERRM;
        RETURN;
END;
$$;

-- Grant execute permission to public
GRANT EXECUTE ON FUNCTION get_earnings_calendar_logos_batch(VARCHAR(20)[]) TO PUBLIC;

-- Add function comment
COMMENT ON FUNCTION get_earnings_calendar_logos_batch(VARCHAR(20)[]) IS 
'Batch retrieval of company logos from earnings_calendar table only. Returns symbol and logo URL for requested symbols.';

-- =====================================================
-- REDESIGNED WATCHLIST SELECT FUNCTIONS - NO PRICE DATA
-- Functions return symbols and metadata only - use stock_quotes for real-time prices
-- =====================================================

-- Get all watchlists for the authenticated user
CREATE OR REPLACE FUNCTION get_user_watchlists()
RETURNS TABLE (id INTEGER, name VARCHAR(255), created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT w.id, w.name, w.created_at, w.updated_at
    FROM watchlist w
    WHERE w.user_id = auth.uid()
    ORDER BY w.name;
$$;

-- Get all items in a specific watchlist - REDESIGNED: NO PRICE DATA
-- (only if user owns the watchlist)
CREATE OR REPLACE FUNCTION get_watchlist_items(p_watchlist_id INTEGER)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    company_name VARCHAR(255),
    added_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT wi.id, wi.symbol, wi.company_name, wi.added_at, wi.updated_at
    FROM watchlist_items wi
    INNER JOIN watchlist w ON wi.watchlist_id = w.id
    WHERE wi.watchlist_id = p_watchlist_id
    AND w.user_id = auth.uid()
    ORDER BY wi.symbol;
$$;

-- Get watchlist item symbols only (for batch price lookups)
CREATE OR REPLACE FUNCTION get_watchlist_symbols(p_watchlist_id INTEGER)
RETURNS TABLE (symbol VARCHAR(20))
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT wi.symbol
    FROM watchlist_items wi
    INNER JOIN watchlist w ON wi.watchlist_id = w.id
    WHERE wi.watchlist_id = p_watchlist_id
    AND w.user_id = auth.uid()
    ORDER BY wi.symbol;
$$;

-- =====================================================
-- WATCHLIST DELETE FUNCTIONS
-- =====================================================

-- Delete a specific watchlist (only if user owns it)
-- This will cascade delete all items in the watchlist
CREATE OR REPLACE FUNCTION delete_watchlist(p_watchlist_id INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete the watchlist only if it belongs to the authenticated user
    DELETE FROM watchlist
    WHERE id = p_watchlist_id
    AND user_id = auth.uid();
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Return true if a row was deleted, false otherwise
    RETURN v_deleted_count > 0;
END;
$$;

-- Delete a specific item from a watchlist (only if user owns the watchlist)
CREATE OR REPLACE FUNCTION delete_watchlist_item(p_item_id INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete the watchlist item only if the user owns the watchlist
    DELETE FROM watchlist_items wi
    USING watchlist w
    WHERE wi.id = p_item_id
    AND wi.watchlist_id = w.id
    AND w.user_id = auth.uid();
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Return true if a row was deleted, false otherwise
    RETURN v_deleted_count > 0;
END;
$$;

-- Delete a specific stock symbol from a watchlist (only if user owns the watchlist)
CREATE OR REPLACE FUNCTION delete_watchlist_item_by_symbol(
    p_watchlist_id INTEGER,
    p_symbol VARCHAR(20)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete the watchlist item only if the user owns the watchlist
    DELETE FROM watchlist_items wi
    USING watchlist w
    WHERE wi.watchlist_id = p_watchlist_id
    AND wi.symbol = p_symbol
    AND wi.watchlist_id = w.id
    AND w.user_id = auth.uid();
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Return true if a row was deleted, false otherwise
    RETURN v_deleted_count > 0;
END;
$$;

-- Delete all items from a specific watchlist (only if user owns it)
CREATE OR REPLACE FUNCTION clear_watchlist(p_watchlist_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete all items from the watchlist only if the user owns it
    DELETE FROM watchlist_items wi
    USING watchlist w
    WHERE wi.watchlist_id = p_watchlist_id
    AND wi.watchlist_id = w.id
    AND w.user_id = auth.uid();
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Return the number of items deleted
    RETURN v_deleted_count;
END;
$$;

