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
