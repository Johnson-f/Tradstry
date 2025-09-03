-- Updated company function to match the corrected exchange function

-- Tested 

CREATE OR REPLACE FUNCTION upsert_company_info(
    p_symbol VARCHAR(20),
    p_data_provider VARCHAR(50),
    
    -- Exchange parameters (simplified)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Company parameters
    p_name VARCHAR(255) DEFAULT NULL,
    p_company_name VARCHAR(255) DEFAULT NULL,
    p_exchange VARCHAR(50) DEFAULT NULL,
    p_sector VARCHAR(100) DEFAULT NULL,
    p_industry VARCHAR(100) DEFAULT NULL,
    p_market_cap BIGINT DEFAULT NULL,
    p_employees INTEGER DEFAULT NULL,
    p_revenue BIGINT DEFAULT NULL,
    p_net_income BIGINT DEFAULT NULL,
    p_pe_ratio DECIMAL(10,2) DEFAULT NULL,
    p_pb_ratio DECIMAL(10,2) DEFAULT NULL,
    p_dividend_yield DECIMAL(7,4) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_website VARCHAR(500) DEFAULT NULL,
    p_ceo VARCHAR(255) DEFAULT NULL,
    p_headquarters VARCHAR(255) DEFAULT NULL,
    p_founded VARCHAR(50) DEFAULT NULL,
    p_phone VARCHAR(50) DEFAULT NULL,
    p_email VARCHAR(255) DEFAULT NULL,
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

    -- Step 2: Insert/update company info
    INSERT INTO company_info (
        symbol, exchange_id, name, company_name, exchange, sector, industry,
        market_cap, employees, revenue, net_income, pe_ratio, pb_ratio,
        dividend_yield, description, website, ceo, headquarters, founded,
        phone, email, ipo_date, currency, fiscal_year_end, data_provider,
        created_at, updated_at
    ) VALUES (
        p_symbol, v_exchange_id, p_name, p_company_name, p_exchange, p_sector, p_industry,
        p_market_cap, p_employees, p_revenue, p_net_income, p_pe_ratio, p_pb_ratio,
        p_dividend_yield, p_description, p_website, p_ceo, p_headquarters, p_founded,
        p_phone, p_email, p_ipo_date, p_currency, p_fiscal_year_end, p_data_provider,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, data_provider) 
    DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, company_info.exchange_id),
        name = COALESCE(EXCLUDED.name, company_info.name),
        company_name = COALESCE(EXCLUDED.company_name, company_info.company_name),
        exchange = COALESCE(EXCLUDED.exchange, company_info.exchange),
        sector = COALESCE(EXCLUDED.sector, company_info.sector),
        industry = COALESCE(EXCLUDED.industry, company_info.industry),
        market_cap = COALESCE(EXCLUDED.market_cap, company_info.market_cap),
        employees = COALESCE(EXCLUDED.employees, company_info.employees),
        revenue = COALESCE(EXCLUDED.revenue, company_info.revenue),
        net_income = COALESCE(EXCLUDED.net_income, company_info.net_income),
        pe_ratio = COALESCE(EXCLUDED.pe_ratio, company_info.pe_ratio),
        pb_ratio = COALESCE(EXCLUDED.pb_ratio, company_info.pb_ratio),
        dividend_yield = COALESCE(EXCLUDED.dividend_yield, company_info.dividend_yield),
        description = COALESCE(EXCLUDED.description, company_info.description),
        website = COALESCE(EXCLUDED.website, company_info.website),
        ceo = COALESCE(EXCLUDED.ceo, company_info.ceo),
        headquarters = COALESCE(EXCLUDED.headquarters, company_info.headquarters),
        founded = COALESCE(EXCLUDED.founded, company_info.founded),
        phone = COALESCE(EXCLUDED.phone, company_info.phone),
        email = COALESCE(EXCLUDED.email, company_info.email),
        ipo_date = COALESCE(EXCLUDED.ipo_date, company_info.ipo_date),
        currency = COALESCE(EXCLUDED.currency, company_info.currency),
        fiscal_year_end = COALESCE(EXCLUDED.fiscal_year_end, company_info.fiscal_year_end),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_company_id;

    RETURN v_company_id;
END;
$$ LANGUAGE plpgsql;


-- Test script for Supabase SQL Editor 
/*
-- Test insert: new company with automatic exchange handling
SELECT upsert_company_info(
    p_symbol => 'AAPL',
    p_data_provider => 'YahooFinance',
    
    -- Exchange information (replaces p_exchange_id)
    p_exchange_code => 'NASDAQ',
    p_exchange_name => 'NASDAQ Stock Market',
    p_exchange_country => 'USA',
    p_exchange_timezone => 'America/New_York',
    
    -- Company information
    p_name => 'Apple',
    p_company_name => 'Apple Inc.',
    p_exchange => 'NASDAQ',
    p_sector => 'Technology',
    p_industry => 'Consumer Electronics',
    p_market_cap => 2500000000000,
    p_employees => 164000,
    p_revenue => 400000000000,
    p_net_income => 100000000000,
    p_pe_ratio => 28.5,
    p_pb_ratio => 35.2,
    p_dividend_yield => 0.0065,
    p_description => 'Apple designs, manufactures and markets consumer electronics and software.',
    p_website => 'https://www.apple.com',
    p_ceo => 'Tim Cook',
    p_headquarters => 'Cupertino, California',
    p_founded => '1976',
    p_phone => '+1-408-996-1010',
    p_email => 'contact@apple.com',
    p_ipo_date => '1980-12-12',
    p_currency => 'USD',
    p_fiscal_year_end => '09-30'
);
*/