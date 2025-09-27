DROP TABLE company_info CASCADE;



-- Company Information Table - REDESIGNED: SELECTIVE REAL-TIME DATA
-- This table stores company information accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores selective price data: REMOVED price, pre_market_price, after_hours_price, change, percent_change
-- KEPT: open, high, low, volume, avg_volume, year_high, year_low

CREATE TABLE IF NOT EXISTS company_info (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Basic company information (shared globally)
    name VARCHAR(255),
    company_name VARCHAR(255),  -- Sometimes different from name
    exchange VARCHAR(50),
    sector VARCHAR(100),
    industry VARCHAR(100),
    about TEXT,  -- Company description/business overview
    employees INTEGER,
    logo VARCHAR(500),  -- URL to company logo

    -- Daily price data (kept for trading analysis)
    open DECIMAL(15,4),  -- Opening price
    high DECIMAL(15,4),  -- Day's high price
    low DECIMAL(15,4),  -- Day's low price
    year_high DECIMAL(15,4),  -- 52-week high
    year_low DECIMAL(15,4),  -- 52-week low

    -- Volume and trading metrics
    volume BIGINT,  -- Current day's volume
    avg_volume BIGINT,  -- Average daily volume

    -- Financial ratios and metrics
    market_cap BIGINT,  -- Market capitalization
    beta DECIMAL(8,4),  -- Beta coefficient (volatility measure)
    pe_ratio DECIMAL(10,2),  -- Price-to-earnings ratio
    eps DECIMAL(10,4),  -- Earnings per share

    -- Dividend information
    dividend DECIMAL(10,4),  -- Annual dividend per share
    yield DECIMAL(7,4),  -- Dividend yield percentage
    ex_dividend DATE,  -- Ex-dividend date
    last_dividend DECIMAL(10,4),  -- Last dividend payment

    -- Fund-specific metrics (for ETFs/Mutual Funds)
    net_assets BIGINT,  -- Total net assets
    nav DECIMAL(15,4),  -- Net Asset Value
    expense_ratio DECIMAL(7,4),  -- Annual expense ratio

    -- Corporate events
    earnings_date DATE,  -- Next earnings announcement date

    -- Performance returns
    five_day_return DECIMAL(8,4),  -- 5-day return percentage
    one_month_return DECIMAL(8,4),  -- 1-month return percentage
    three_month_return DECIMAL(8,4),  -- 3-month return percentage
    six_month_return DECIMAL(8,4),  -- 6-month return percentage
    ytd_return DECIMAL(8,4),  -- Year-to-date return percentage
    year_return DECIMAL(8,4),  -- 1-year return percentage
    five_year_return DECIMAL(8,4),  -- 5-year return percentage
    ten_year_return DECIMAL(8,4),  -- 10-year return percentage
    max_return DECIMAL(8,4),  -- Maximum return percentage

    -- Additional metadata
    ipo_date DATE,
    currency VARCHAR(3) DEFAULT 'USD',
    fiscal_year_end VARCHAR(10),  -- e.g., '12-31'

    -- Provider and audit info
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per symbol per provider (most current data)
    UNIQUE(symbol, data_provider)
);

-- Create indexes separately (PostgreSQL style) - Updated for selective real-time data
CREATE INDEX IF NOT EXISTS idx_company_info_symbol ON company_info (symbol);
CREATE INDEX IF NOT EXISTS idx_company_info_sector ON company_info (sector);
CREATE INDEX IF NOT EXISTS idx_company_info_industry ON company_info (industry);
CREATE INDEX IF NOT EXISTS idx_company_info_market_cap ON company_info (market_cap DESC);
CREATE INDEX IF NOT EXISTS idx_company_info_provider ON company_info (data_provider);
CREATE INDEX IF NOT EXISTS idx_company_info_sector_industry ON company_info (sector, industry);
-- Removed: idx_company_info_price (no longer exists)
CREATE INDEX IF NOT EXISTS idx_company_info_volume ON company_info (volume DESC);  -- RESTORED
CREATE INDEX IF NOT EXISTS idx_company_info_pe_ratio ON company_info (pe_ratio);
CREATE INDEX IF NOT EXISTS idx_company_info_yield ON company_info (yield DESC);
CREATE INDEX IF NOT EXISTS idx_company_info_ytd_return ON company_info (ytd_return DESC);
CREATE INDEX IF NOT EXISTS idx_company_info_year_return ON company_info (year_return DESC);
CREATE INDEX IF NOT EXISTS idx_company_info_earnings_date ON company_info (earnings_date);
CREATE INDEX IF NOT EXISTS idx_company_info_ex_dividend ON company_info (ex_dividend);

-- Add table comment
COMMENT ON TABLE company_info IS 'Company information with selective price data - REMOVED: price, pre_market_price, after_hours_price, change, percent_change - KEPT: open, high, low, volume, avg_volume';

-- Add column comments
COMMENT ON COLUMN company_info.symbol IS 'Stock ticker symbol';
COMMENT ON COLUMN company_info.exchange_id IS 'Foreign key to exchanges table';
COMMENT ON COLUMN company_info.name IS 'Short company name for display';
COMMENT ON COLUMN company_info.company_name IS 'Full legal company name';
COMMENT ON COLUMN company_info.exchange IS 'Stock exchange where listed';
COMMENT ON COLUMN company_info.sector IS 'Business sector classification';
COMMENT ON COLUMN company_info.industry IS 'Industry classification within sector';
COMMENT ON COLUMN company_info.about IS 'Company business description and overview';
COMMENT ON COLUMN company_info.employees IS 'Number of employees';
COMMENT ON COLUMN company_info.logo IS 'URL to company logo image';

-- Daily price data comments (kept for trading analysis)
COMMENT ON COLUMN company_info.open IS 'Opening price for current/last trading day';
COMMENT ON COLUMN company_info.high IS 'Highest price for current/last trading day';
COMMENT ON COLUMN company_info.low IS 'Lowest price for current/last trading day';
COMMENT ON COLUMN company_info.year_high IS '52-week high price';
COMMENT ON COLUMN company_info.year_low IS '52-week low price';

-- Volume and trading metrics comments
COMMENT ON COLUMN company_info.volume IS 'Current day trading volume';
COMMENT ON COLUMN company_info.avg_volume IS 'Average daily trading volume';

-- Financial metrics comments
COMMENT ON COLUMN company_info.market_cap IS 'Market capitalization in company currency';
COMMENT ON COLUMN company_info.beta IS 'Beta coefficient (volatility measure vs market)';
COMMENT ON COLUMN company_info.pe_ratio IS 'Price-to-earnings ratio';
COMMENT ON COLUMN company_info.eps IS 'Earnings per share';

-- Dividend information comments
COMMENT ON COLUMN company_info.dividend IS 'Annual dividend per share';
COMMENT ON COLUMN company_info.yield IS 'Current dividend yield as decimal (0.025 = 2.5%)';
COMMENT ON COLUMN company_info.ex_dividend IS 'Ex-dividend date';
COMMENT ON COLUMN company_info.last_dividend IS 'Last dividend payment amount';

-- Fund-specific metrics comments
COMMENT ON COLUMN company_info.net_assets IS 'Total net assets (for ETFs/Mutual Funds)';
COMMENT ON COLUMN company_info.nav IS 'Net Asset Value (for ETFs/Mutual Funds)';
COMMENT ON COLUMN company_info.expense_ratio IS 'Annual expense ratio as decimal';

-- Corporate events comments
COMMENT ON COLUMN company_info.earnings_date IS 'Next earnings announcement date';

-- Performance returns comments
COMMENT ON COLUMN company_info.five_day_return IS '5-day return percentage as decimal';
COMMENT ON COLUMN company_info.one_month_return IS '1-month return percentage as decimal';
COMMENT ON COLUMN company_info.three_month_return IS '3-month return percentage as decimal';
COMMENT ON COLUMN company_info.six_month_return IS '6-month return percentage as decimal';
COMMENT ON COLUMN company_info.ytd_return IS 'Year-to-date return percentage as decimal';
COMMENT ON COLUMN company_info.year_return IS '1-year return percentage as decimal';
COMMENT ON COLUMN company_info.five_year_return IS '5-year return percentage as decimal';
COMMENT ON COLUMN company_info.ten_year_return IS '10-year return percentage as decimal';
COMMENT ON COLUMN company_info.max_return IS 'Maximum return percentage as decimal';

-- Metadata fields comments
COMMENT ON COLUMN company_info.ipo_date IS 'Initial public offering date';
COMMENT ON COLUMN company_info.currency IS 'Company reporting currency (ISO 4217)';
COMMENT ON COLUMN company_info.fiscal_year_end IS 'Fiscal year end date (MM-DD format)';
COMMENT ON COLUMN company_info.data_provider IS 'Market data provider (fmp, alpha_vantage, finnhub, etc.)';

-- =====================================================
-- COMPANY INFO TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from company_info table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from company_info table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON company_info TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON company_info FROM PUBLIC;
REVOKE UPDATE ON company_info FROM PUBLIC;
REVOKE DELETE ON company_info FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE company_info ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "company_info_select_policy" ON company_info
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "company_info_insert_policy" ON company_info
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "company_info_update_policy" ON company_info
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "company_info_delete_policy" ON company_info
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR COMPANY_INFO TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for company analysis and display
   - Users cannot modify company information integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic company data updates

3. DATA INTEGRITY:
   - Company data should be treated as immutable by users
   - Only trusted sources can update company information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/

DROP FUNCTION IF EXISTS get_company_info_by_symbol;
DROP FUNCTION IF EXISTS get_companies_by_sector_industry;
DROP FUNCTION IF EXISTS search_companies;
DROP FUNCTION IF EXISTS get_company_info_by_symbols;

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
/*
-- Get basic company info
SELECT * FROM get_company_basic_info('MSFT');

-- Get all sectors and industries
SELECT * FROM get_sectors_and_industries();
*/


DROP FUNCTION IF EXISTS upsert_company_info;

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
