-- Company Information Table - GLOBAL SHARED DATA
-- This table stores company information accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores fundamental company data from market data providers

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

    -- Real-time price data
    price DECIMAL(15,4),  -- Current stock price (remove)
    pre_market_price DECIMAL(15,4),  -- Pre-market trading price (remove)
    after_hours_price DECIMAL(15,4),  -- After-hours trading price (remove)
    change DECIMAL(15,4),  -- Price change from previous close (remove)
    percent_change DECIMAL(8,4),  -- Percentage change from previous close (remove)
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

-- Create indexes separately (PostgreSQL style)
CREATE INDEX IF NOT EXISTS idx_company_info_symbol ON company_info (symbol);
CREATE INDEX IF NOT EXISTS idx_company_info_sector ON company_info (sector);
CREATE INDEX IF NOT EXISTS idx_company_info_industry ON company_info (industry);
CREATE INDEX IF NOT EXISTS idx_company_info_market_cap ON company_info (market_cap DESC);
CREATE INDEX IF NOT EXISTS idx_company_info_provider ON company_info (data_provider);
CREATE INDEX IF NOT EXISTS idx_company_info_sector_industry ON company_info (sector, industry);
CREATE INDEX IF NOT EXISTS idx_company_info_price ON company_info (price DESC);
CREATE INDEX IF NOT EXISTS idx_company_info_volume ON company_info (volume DESC);
CREATE INDEX IF NOT EXISTS idx_company_info_pe_ratio ON company_info (pe_ratio);
CREATE INDEX IF NOT EXISTS idx_company_info_yield ON company_info (yield DESC);
CREATE INDEX IF NOT EXISTS idx_company_info_ytd_return ON company_info (ytd_return DESC);
CREATE INDEX IF NOT EXISTS idx_company_info_year_return ON company_info (year_return DESC);
CREATE INDEX IF NOT EXISTS idx_company_info_earnings_date ON company_info (earnings_date);
CREATE INDEX IF NOT EXISTS idx_company_info_ex_dividend ON company_info (ex_dividend);

-- Add table comment
COMMENT ON TABLE company_info IS 'Comprehensive company information including real-time prices, financial metrics, dividends, and performance returns from multiple market data providers';

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

-- Real-time price data comments
COMMENT ON COLUMN company_info.price IS 'Current stock price';
COMMENT ON COLUMN company_info.pre_market_price IS 'Pre-market trading price';
COMMENT ON COLUMN company_info.after_hours_price IS 'After-hours trading price';
COMMENT ON COLUMN company_info.change IS 'Price change from previous close';
COMMENT ON COLUMN company_info.percent_change IS 'Percentage change from previous close';
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