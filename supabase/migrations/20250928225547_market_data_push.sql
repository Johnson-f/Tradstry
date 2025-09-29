-- =====================================================
-- EXCHANGES TABLE - REFERENCE DATA (MUST BE FIRST)
-- =====================================================
-- This table must be created before any other tables that reference it

CREATE TABLE IF NOT EXISTS exchanges (
    id SERIAL PRIMARY KEY,
    exchange_code VARCHAR(10) NOT NULL UNIQUE,
    exchange_name VARCHAR(100) NOT NULL,
    country VARCHAR(50),
    timezone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- EXCHANGES TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from exchanges table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from exchanges table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON exchanges TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON exchanges FROM PUBLIC;
REVOKE UPDATE ON exchanges FROM PUBLIC;
REVOKE DELETE ON exchanges FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE exchanges ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "exchanges_select_policy" ON exchanges
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "exchanges_insert_policy" ON exchanges
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "exchanges_update_policy" ON exchanges
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "exchanges_delete_policy" ON exchanges
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- ADDITIONAL INDEXES FOR EXCHANGES TABLE (RECOMMENDED)
-- =====================================================

-- These indexes are recommended for better query performance
-- since exchanges table is frequently used for lookups

-- Index on exchange_code (already unique, but explicit index helps)
CREATE INDEX IF NOT EXISTS idx_exchanges_exchange_code ON exchanges (exchange_code);

-- Index on country for filtering by country
CREATE INDEX IF NOT EXISTS idx_exchanges_country ON exchanges (country);

-- Index on timezone for timezone-based queries
CREATE INDEX IF NOT EXISTS idx_exchanges_timezone ON exchanges (timezone);

-- Composite index for country and timezone lookups
CREATE INDEX IF NOT EXISTS idx_exchanges_country_timezone ON exchanges (country, timezone);

-- Add table and column comments for documentation
COMMENT ON TABLE exchanges IS 'Stock exchange reference data - read-only for users, system-managed';
COMMENT ON COLUMN exchanges.id IS 'Primary key for exchange records';
COMMENT ON COLUMN exchanges.exchange_code IS 'Unique exchange identifier (NYSE, NASDAQ, LSE, etc.)';
COMMENT ON COLUMN exchanges.exchange_name IS 'Full name of the exchange';
COMMENT ON COLUMN exchanges.country IS 'Country where the exchange is located';
COMMENT ON COLUMN exchanges.timezone IS 'Timezone of the exchange (for trading hours)';
COMMENT ON COLUMN exchanges.created_at IS 'Timestamp when exchange record was created';

-- =====================================================
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

-- Dividend Data Table - GLOBAL SHARED DATA
-- This table stores dividend data accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores dividend payments, schedules, and history from market data providers

CREATE TABLE IF NOT EXISTS dividend_data (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Dividend schedule dates (shared globally)
    declaration_date DATE,
    ex_dividend_date DATE NOT NULL,
    record_date DATE,
    payment_date DATE,

    -- Dividend amount and type
    dividend_amount DECIMAL(10,4) NOT NULL,
    dividend_type VARCHAR(20) DEFAULT 'regular',  -- 'regular', 'special', 'stock', etc.
    currency VARCHAR(3) DEFAULT 'USD',

    -- Dividend frequency and status
    frequency VARCHAR(20),  -- 'annual', 'semi-annual', 'quarterly', 'monthly'
    dividend_status VARCHAR(20) DEFAULT 'active',  -- 'active', 'suspended', 'terminated'

    -- Additional dividend metrics
    dividend_yield DECIMAL(7,4),  -- Current dividend yield
    payout_ratio DECIMAL(7,4),    -- Dividend payout ratio
    consecutive_years INTEGER,     -- Years of consecutive dividend payments

    -- Tax information
    qualified_dividend BOOLEAN DEFAULT TRUE,
    tax_rate DECIMAL(7,4),

    -- Period information
    fiscal_year INTEGER,
    fiscal_quarter INTEGER CHECK (fiscal_quarter BETWEEN 1 AND 4),

    -- Provider and audit info
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per symbol per ex-dividend date per provider
    UNIQUE(symbol, ex_dividend_date, data_provider)
);

-- Create indexes for dividend analysis queries (after table creation)
CREATE INDEX IF NOT EXISTS idx_dividend_data_symbol ON dividend_data (symbol);
CREATE INDEX IF NOT EXISTS idx_dividend_data_ex_dividend_date ON dividend_data (ex_dividend_date DESC);
CREATE INDEX IF NOT EXISTS idx_dividend_data_payment_date ON dividend_data (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_dividend_data_amount ON dividend_data (dividend_amount DESC);
CREATE INDEX IF NOT EXISTS idx_dividend_data_yield ON dividend_data (dividend_yield DESC);
CREATE INDEX IF NOT EXISTS idx_dividend_data_provider ON dividend_data (data_provider);
CREATE INDEX IF NOT EXISTS idx_dividend_data_symbol_date ON dividend_data (symbol, ex_dividend_date DESC);
CREATE INDEX IF NOT EXISTS idx_dividend_data_frequency ON dividend_data (frequency);

-- Add table comment
COMMENT ON TABLE dividend_data IS 'Dividend payments, schedules, and history from multiple market data providers';

-- Add column comments
COMMENT ON COLUMN dividend_data.symbol IS 'Stock ticker symbol';
COMMENT ON COLUMN dividend_data.exchange_id IS 'Foreign key to exchanges table';
COMMENT ON COLUMN dividend_data.declaration_date IS 'Date when dividend was declared by company';
COMMENT ON COLUMN dividend_data.ex_dividend_date IS 'Date when stock trades without dividend (must own before this date)';
COMMENT ON COLUMN dividend_data.record_date IS 'Date when shareholders of record are determined';
COMMENT ON COLUMN dividend_data.payment_date IS 'Date when dividend will be paid to shareholders';
COMMENT ON COLUMN dividend_data.dividend_amount IS 'Dividend amount per share';
COMMENT ON COLUMN dividend_data.dividend_type IS 'Type of dividend (regular, special, stock, etc.)';
COMMENT ON COLUMN dividend_data.currency IS 'Currency of the dividend payment';
COMMENT ON COLUMN dividend_data.frequency IS 'Dividend payment frequency';
COMMENT ON COLUMN dividend_data.dividend_status IS 'Current status of the dividend program';
COMMENT ON COLUMN dividend_data.dividend_yield IS 'Current dividend yield as decimal (0.025 = 2.5%)';
COMMENT ON COLUMN dividend_data.payout_ratio IS 'Dividend payout ratio as decimal (0.35 = 35%)';
COMMENT ON COLUMN dividend_data.consecutive_years IS 'Number of consecutive years dividend has been paid';
COMMENT ON COLUMN dividend_data.qualified_dividend IS 'Whether dividend qualifies for lower tax rate';
COMMENT ON COLUMN dividend_data.tax_rate IS 'Applicable tax rate for the dividend';
COMMENT ON COLUMN dividend_data.fiscal_year IS 'Fiscal year associated with the dividend';
COMMENT ON COLUMN dividend_data.fiscal_quarter IS 'Fiscal quarter associated with the dividend';
COMMENT ON COLUMN dividend_data.data_provider IS 'Market data provider (alpha_vantage, finnhub, fmp, etc.)';

-- =====================================================
-- DIVIDEND DATA TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from dividend_data table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from dividend_data table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON dividend_data TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON dividend_data FROM PUBLIC;
REVOKE UPDATE ON dividend_data FROM PUBLIC;
REVOKE DELETE ON dividend_data FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE dividend_data ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "dividend_data_select_policy" ON dividend_data
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "dividend_data_insert_policy" ON dividend_data
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "dividend_data_update_policy" ON dividend_data
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "dividend_data_delete_policy" ON dividend_data
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR DIVIDEND_DATA TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for dividend analysis and display
   - Users cannot modify dividend data integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic dividend data updates

3. DATA INTEGRITY:
   - Dividend data should be treated as immutable by users
   - Only trusted sources can update dividend information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/

-- Earnings Calendar Data Table - GLOBAL SHARED DATA
-- This table stores earnings calendar accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores upcoming and historical earnings dates from market data providers

CREATE TABLE IF NOT EXISTS earnings_calendar (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Earnings date and time information
    earnings_date DATE NOT NULL,
    time_of_day VARCHAR(10),  -- 'amc' (after market close), 'bmo' (before market open), 'dmh' (during market hours)

    -- EPS estimates and actuals
    eps DECIMAL(10,4),  -- Actual EPS if reported
    eps_estimated DECIMAL(10,4),  -- Estimated EPS
    eps_surprise DECIMAL(10,4),  -- EPS surprise (calculated field)
    eps_surprise_percent DECIMAL(7,4),  -- Surprise percentage

    -- Revenue estimates and actuals
    revenue BIGINT,  -- Actual revenue if reported
    revenue_estimated BIGINT,  -- Estimated revenue
    revenue_surprise BIGINT,  -- Revenue surprise
    revenue_surprise_percent DECIMAL(7,4),  -- Revenue surprise percentage

    -- Fiscal period information
    fiscal_date_ending DATE,  -- End of fiscal period
    fiscal_year INTEGER NOT NULL,
    fiscal_quarter INTEGER CHECK (fiscal_quarter BETWEEN 1 AND 4),

    -- Company and market context
    market_cap_at_time BIGINT,  -- Market cap at time of earnings
    sector VARCHAR(100),        -- Company sector
    industry VARCHAR(100),      -- Company industry

    -- Earnings call details
    conference_call_date TIMESTAMP,
    conference_call_time TIME,
    webcast_url TEXT,
    transcript_available BOOLEAN DEFAULT FALSE,

    -- Status and tracking
    status VARCHAR(20) DEFAULT 'scheduled',  -- 'scheduled', 'confirmed', 'reported', 'postponed'
    last_updated TIMESTAMP,
    update_source VARCHAR(100),  -- What caused the last update

    -- Provider and audit info
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per symbol per fiscal period per provider
    UNIQUE(symbol, fiscal_year, fiscal_quarter, data_provider)
);

-- Indexes for earnings calendar queries
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_symbol ON earnings_calendar (symbol);
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_earnings_date ON earnings_calendar (earnings_date);
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_fiscal_period ON earnings_calendar (fiscal_year, fiscal_quarter);
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_status ON earnings_calendar (status);
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_provider ON earnings_calendar (data_provider);
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_symbol_date ON earnings_calendar (symbol, earnings_date);
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_date_status ON earnings_calendar (earnings_date, status);
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_sector_date ON earnings_calendar (sector, earnings_date);

-- Add table comment
COMMENT ON TABLE earnings_calendar IS 'Earnings calendar with dates, estimates, and reporting schedule from multiple market data providers';

-- Add column comments
COMMENT ON COLUMN earnings_calendar.symbol IS 'Stock ticker symbol';
COMMENT ON COLUMN earnings_calendar.exchange_id IS 'Foreign key to exchanges table';
COMMENT ON COLUMN earnings_calendar.earnings_date IS 'Date when earnings will be/were reported';
COMMENT ON COLUMN earnings_calendar.time_of_day IS 'Time of earnings release (amc, bmo, dmh)';
COMMENT ON COLUMN earnings_calendar.eps IS 'Actual earnings per share if reported';
COMMENT ON COLUMN earnings_calendar.eps_estimated IS 'Estimated earnings per share';
COMMENT ON COLUMN earnings_calendar.eps_surprise IS 'EPS surprise amount (actual - estimated)';
COMMENT ON COLUMN earnings_calendar.eps_surprise_percent IS 'EPS surprise as percentage';
COMMENT ON COLUMN earnings_calendar.revenue IS 'Actual revenue if reported';
COMMENT ON COLUMN earnings_calendar.revenue_estimated IS 'Estimated revenue';
COMMENT ON COLUMN earnings_calendar.revenue_surprise IS 'Revenue surprise amount';
COMMENT ON COLUMN earnings_calendar.revenue_surprise_percent IS 'Revenue surprise as percentage';
COMMENT ON COLUMN earnings_calendar.fiscal_date_ending IS 'End date of the fiscal period being reported';
COMMENT ON COLUMN earnings_calendar.fiscal_year IS 'Fiscal year being reported';
COMMENT ON COLUMN earnings_calendar.fiscal_quarter IS 'Fiscal quarter being reported (1-4)';
COMMENT ON COLUMN earnings_calendar.market_cap_at_time IS 'Company market cap at time of earnings';
COMMENT ON COLUMN earnings_calendar.sector IS 'Company sector classification';
COMMENT ON COLUMN earnings_calendar.industry IS 'Company industry classification';
COMMENT ON COLUMN earnings_calendar.conference_call_date IS 'Date and time of earnings conference call';
COMMENT ON COLUMN earnings_calendar.conference_call_time IS 'Time of earnings conference call';
COMMENT ON COLUMN earnings_calendar.webcast_url IS 'URL for earnings webcast';
COMMENT ON COLUMN earnings_calendar.transcript_available IS 'Whether earnings transcript is available';
COMMENT ON COLUMN earnings_calendar.status IS 'Status of earnings event (scheduled, confirmed, reported, postponed)';
COMMENT ON COLUMN earnings_calendar.last_updated IS 'Last time this calendar entry was updated';
COMMENT ON COLUMN earnings_calendar.update_source IS 'Source of the last update';
COMMENT ON COLUMN earnings_calendar.data_provider IS 'Market data provider (alpha_vantage, finnhub, fmp, etc.)';

-- =====================================================
-- EARNINGS CALENDAR TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from earnings_calendar table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from earnings_calendar table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON earnings_calendar TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON earnings_calendar FROM PUBLIC;
REVOKE UPDATE ON earnings_calendar FROM PUBLIC;
REVOKE DELETE ON earnings_calendar FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE earnings_calendar ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "earnings_calendar_select_policy" ON earnings_calendar
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "earnings_calendar_insert_policy" ON earnings_calendar
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "earnings_calendar_update_policy" ON earnings_calendar
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "earnings_calendar_delete_policy" ON earnings_calendar
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR EARNINGS_CALENDAR TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for earnings calendar analysis and display
   - Users cannot modify earnings calendar integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic earnings calendar updates

3. DATA INTEGRITY:
   - Earnings calendar should be treated as immutable by users
   - Only trusted sources can update earnings information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/

-- Earnings Call Transcript Data Table - GLOBAL SHARED DATA
-- This table stores earnings call transcripts accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores earnings call transcripts and participant information from providers
-- Redesigned to match finance-query.onrender.com API response structure

CREATE TABLE IF NOT EXISTS earnings_transcripts (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Earnings period information (matches API structure)
    quarter VARCHAR(10) NOT NULL,       -- 'Q1', 'Q2', 'Q3', 'Q4' (matches API field name)
    year INTEGER NOT NULL,              -- Fiscal year (matches API field name)
    date TIMESTAMP NOT NULL,            -- Earnings call date (matches API field name)

    -- Transcript content (matches API structure)
    transcript TEXT NOT NULL,           -- Complete transcript text (matches API field name)
    participants JSONB NOT NULL,        -- Array of participant names (matches API structure)
    
    -- Additional metadata
    transcript_length INTEGER,          -- Character count of transcript
    transcript_language VARCHAR(5) DEFAULT 'en',

    -- API response metadata
    source VARCHAR(50) DEFAULT 'finance-query-api',  -- Data source identifier
    transcripts_id INTEGER,             -- Original API transcript ID
    retrieved_at TIMESTAMP,             -- When data was retrieved from API

    -- Audit info
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one transcript per symbol per quarter per year
    UNIQUE(symbol, year, quarter, source)
);

 -- Indexes for transcript analysis queries (updated for new schema)
CREATE INDEX IF NOT EXISTS idx_earnings_transcripts_symbol ON earnings_transcripts (symbol);
CREATE INDEX IF NOT EXISTS idx_earnings_transcripts_date ON earnings_transcripts (date DESC);
CREATE INDEX IF NOT EXISTS idx_earnings_transcripts_period ON earnings_transcripts (year, quarter);
CREATE INDEX IF NOT EXISTS idx_earnings_transcripts_symbol_date ON earnings_transcripts (symbol, date DESC);
CREATE INDEX IF NOT EXISTS idx_earnings_transcripts_retrieved_at ON earnings_transcripts (retrieved_at DESC);

-- Note: Participants are now stored as JSONB array in the main table
-- This eliminates the need for a separate participants table
-- Participants can be queried using JSONB operators and functions

-- Add table comments
COMMENT ON TABLE earnings_transcripts IS 'Earnings call transcripts from finance-query API with JSONB participants';

-- Add column comments for earnings_transcripts (updated schema)
COMMENT ON COLUMN earnings_transcripts.symbol IS 'Stock ticker symbol';
COMMENT ON COLUMN earnings_transcripts.quarter IS 'Fiscal quarter (Q1, Q2, Q3, Q4) - matches API';
COMMENT ON COLUMN earnings_transcripts.year IS 'Fiscal year - matches API';
COMMENT ON COLUMN earnings_transcripts.date IS 'Earnings call date - matches API';
COMMENT ON COLUMN earnings_transcripts.transcript IS 'Complete transcript text - matches API';
COMMENT ON COLUMN earnings_transcripts.participants IS 'JSONB array of participant names - matches API';
COMMENT ON COLUMN earnings_transcripts.source IS 'Data source identifier';
COMMENT ON COLUMN earnings_transcripts.transcripts_id IS 'Original API transcript ID';
COMMENT ON COLUMN earnings_transcripts.retrieved_at IS 'When data was retrieved from API';


-- JSONB Indexes for participant queries
CREATE INDEX IF NOT EXISTS idx_earnings_transcripts_participants_gin ON earnings_transcripts USING GIN (participants);

-- =====================================================
-- EARNINGS TRANSCRIPTS TABLES SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from earnings transcript tables
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from earnings transcript tables
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON earnings_transcripts TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON earnings_transcripts FROM PUBLIC;
REVOKE UPDATE ON earnings_transcripts FROM PUBLIC;
REVOKE DELETE ON earnings_transcripts FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE earnings_transcripts ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "earnings_transcripts_select_policy" ON earnings_transcripts
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "earnings_transcripts_insert_policy" ON earnings_transcripts
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "earnings_transcripts_update_policy" ON earnings_transcripts
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "earnings_transcripts_delete_policy" ON earnings_transcripts
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR EARNINGS TRANSCRIPTS TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for transcript analysis and display
   - Users cannot modify transcript data integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and API ingestion processes can INSERT/UPDATE
   - Maintains data accuracy and consistency from finance-query API
   - Supports automatic transcript data updates from external sources

3. DATA INTEGRITY:
   - Transcript data should be treated as immutable by users
   - Only trusted API sources can update transcript information
   - Supports regulatory compliance requirements for financial data

SCHEMA DESIGN NOTES:

- Redesigned to match finance-query.onrender.com API response structure
- Participants stored as JSONB array for flexible querying
- Direct field mapping: symbol, quarter, year, date, transcript, participants
- Additional metadata fields for API tracking and analysis
- JSONB indexes for efficient participant searches

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for API data ingestion processes
- Use JSONB operators for participant queries: participants ? 'participant_name'
*/

-- Economic Events Data Table - GLOBAL SHARED DATA
-- This table stores economic events accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores economic calendar events, forecasts, and actuals from providers

CREATE TABLE IF NOT EXISTS economic_events (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(100) NOT NULL,  -- Unique identifier for the event
    country VARCHAR(5) NOT NULL,     -- Country code (US, EU, GB, etc.)
    event_name VARCHAR(255) NOT NULL,
    event_period VARCHAR(100),       -- Time period (January 2024, Q1 2024, etc.)

    -- Economic data points
    actual DECIMAL(15,4),           -- Actual reported value
    previous DECIMAL(15,4),         -- Previous period value
    forecast DECIMAL(15,4),         -- Forecast/consensus value
    unit VARCHAR(50),               -- Unit of measurement (% , K, M, etc.)

    -- Event metadata
    importance INTEGER CHECK (importance BETWEEN 1 AND 3),  -- 1=Low, 2=Medium, 3=High
    event_timestamp TIMESTAMP NOT NULL,  -- When the event occurred/was scheduled
    last_update TIMESTAMP,          -- Last time this data was updated
    description TEXT,               -- Detailed description of the event
    url TEXT,                       -- URL to more information

    -- Additional categorization
    category VARCHAR(50),           -- 'employment', 'inflation', 'GDP', etc.
    frequency VARCHAR(20),          -- 'monthly', 'quarterly', 'annual', 'one-time'
    source VARCHAR(100),            -- Primary data source
    currency VARCHAR(3) DEFAULT 'USD',

    -- Impact and status
    market_impact VARCHAR(20),      -- 'high', 'medium', 'low'
    status VARCHAR(20) DEFAULT 'scheduled',  -- 'scheduled', 'released', 'revised'
    revised BOOLEAN DEFAULT FALSE,  -- Whether this is a revision

    -- Provider and audit info
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per event per provider (most current data)
    UNIQUE(event_id, data_provider)
);

 -- Indexes for economic analysis queries
CREATE INDEX IF NOT EXISTS idx_economic_events_event_timestamp ON economic_events (event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_economic_events_country ON economic_events (country);
CREATE INDEX IF NOT EXISTS idx_economic_events_importance ON economic_events (importance DESC);
CREATE INDEX IF NOT EXISTS idx_economic_events_category ON economic_events (category);
CREATE INDEX IF NOT EXISTS idx_economic_events_status ON economic_events (status);
CREATE INDEX IF NOT EXISTS idx_economic_events_provider ON economic_events (data_provider);
CREATE INDEX IF NOT EXISTS idx_economic_events_country_timestamp ON economic_events (country, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_economic_events_importance_timestamp ON economic_events (importance DESC, event_timestamp DESC);

-- Add table comment
COMMENT ON TABLE economic_events IS 'Economic calendar events, forecasts, and actuals from multiple market data providers';

-- Add column comments
COMMENT ON COLUMN economic_events.event_id IS 'Unique identifier for the economic event';
COMMENT ON COLUMN economic_events.country IS 'Country code where the event occurs (US, EU, GB, etc.)';
COMMENT ON COLUMN economic_events.event_name IS 'Name of the economic event (Non-Farm Payrolls, GDP, CPI, etc.)';
COMMENT ON COLUMN economic_events.event_period IS 'Time period for the event (January 2024, Q1 2024, etc.)';
COMMENT ON COLUMN economic_events.actual IS 'Actual reported value for the economic indicator';
COMMENT ON COLUMN economic_events.previous IS 'Previous period value for comparison';
COMMENT ON COLUMN economic_events.forecast IS 'Forecast/consensus estimate before the event';
COMMENT ON COLUMN economic_events.unit IS 'Unit of measurement (%, K, M, B, etc.)';
COMMENT ON COLUMN economic_events.importance IS 'Importance level (1=Low, 2=Medium, 3=High)';
COMMENT ON COLUMN economic_events.event_timestamp IS 'Date and time when the event occurred or is scheduled';
COMMENT ON COLUMN economic_events.last_update IS 'Last time this economic data was updated';
COMMENT ON COLUMN economic_events.description IS 'Detailed description of the economic event';
COMMENT ON COLUMN economic_events.url IS 'URL for more information about the event';
COMMENT ON COLUMN economic_events.category IS 'Economic category (employment, inflation, GDP, etc.)';
COMMENT ON COLUMN economic_events.frequency IS 'How often this event occurs';
COMMENT ON COLUMN economic_events.source IS 'Primary data source or government agency';
COMMENT ON COLUMN economic_events.currency IS 'Currency relevant to the economic data';
COMMENT ON COLUMN economic_events.market_impact IS 'Expected market impact level';
COMMENT ON COLUMN economic_events.status IS 'Current status of the event data';
COMMENT ON COLUMN economic_events.revised IS 'Whether this represents a data revision';
COMMENT ON COLUMN economic_events.data_provider IS 'Market data provider (finnhub, alpha_vantage, etc.)';

-- =====================================================
-- ECONOMIC EVENTS TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from economic_events table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from economic_events table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON economic_events TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON economic_events FROM PUBLIC;
REVOKE UPDATE ON economic_events FROM PUBLIC;
REVOKE DELETE ON economic_events FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE economic_events ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "economic_events_select_policy" ON economic_events
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "economic_events_insert_policy" ON economic_events
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "economic_events_update_policy" ON economic_events
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "economic_events_delete_policy" ON economic_events
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR ECONOMIC_EVENTS TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for economic analysis and display
   - Users cannot modify economic data integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic economic data updates

3. DATA INTEGRITY:
   - Economic data should be treated as immutable by users
   - Only trusted sources can update economic information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/

-- Economic Indicators Data Table - GLOBAL SHARED DATA
-- This table stores economic indicators accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores economic metrics and indicators from market data providers

CREATE TABLE IF NOT EXISTS economic_indicators (
    id SERIAL PRIMARY KEY,
    indicator_code VARCHAR(50) NOT NULL,  -- 'GDP', 'CPI', 'UNEMPLOYMENT', etc.
    indicator_name VARCHAR(255) NOT NULL,
    country VARCHAR(5) NOT NULL,          -- Country code (US, EU, GB, etc.)

    -- Data values
    value DECIMAL(15,4),                  -- The actual indicator value
    previous_value DECIMAL(15,4),         -- Previous period value
    change_value DECIMAL(15,4),           -- Change from previous period
    change_percent DECIMAL(7,4),          -- Percentage change
    year_over_year_change DECIMAL(7,4),   -- Year-over-year change

    -- Period information
    period_date DATE NOT NULL,            -- Date this indicator applies to
    period_type VARCHAR(20),              -- 'monthly', 'quarterly', 'annual', 'weekly'
    frequency VARCHAR(20),                -- How often it's released

    -- Units and metadata
    unit VARCHAR(50),                     -- Unit of measurement ('%', '$', 'Index', etc.)
    currency VARCHAR(3) DEFAULT 'USD',    -- Currency if applicable
    seasonal_adjustment BOOLEAN DEFAULT TRUE,  -- Whether seasonally adjusted
    preliminary BOOLEAN DEFAULT FALSE,    -- Whether this is preliminary data

    -- Importance and impact
    importance_level INTEGER CHECK (importance_level BETWEEN 1 AND 3),  -- 1=Low, 2=Medium, 3=High
    market_impact VARCHAR(20),            -- Expected market impact
    consensus_estimate DECIMAL(15,4),     -- Market consensus estimate
    surprise DECIMAL(15,4),               -- Surprise vs consensus

    -- Release information
    release_date TIMESTAMP,               -- When this data was officially released
    next_release_date TIMESTAMP,          -- When next data will be released
    source_agency VARCHAR(100),           -- Government agency or organization

    -- Status and updates
    status VARCHAR(20) DEFAULT 'final',   -- 'preliminary', 'revised', 'final'
    last_revised TIMESTAMP,               -- Last time this data was revised
    revision_count INTEGER DEFAULT 0,     -- Number of times revised

    -- Provider and audit info
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per indicator per period per provider
    UNIQUE(indicator_code, country, period_date, data_provider)
);

-- Indexes for economic analysis queries
CREATE INDEX IF NOT EXISTS idx_economic_indicators_indicator_code ON economic_indicators (indicator_code);
CREATE INDEX IF NOT EXISTS idx_economic_indicators_country ON economic_indicators (country);
CREATE INDEX IF NOT EXISTS idx_economic_indicators_period_date ON economic_indicators (period_date DESC);
CREATE INDEX IF NOT EXISTS idx_economic_indicators_importance ON economic_indicators (importance_level DESC);
CREATE INDEX IF NOT EXISTS idx_economic_indicators_provider ON economic_indicators (data_provider);
CREATE INDEX IF NOT EXISTS idx_economic_indicators_release_date ON economic_indicators (release_date DESC);
CREATE INDEX IF NOT EXISTS idx_economic_indicators_country_date ON economic_indicators (country, period_date DESC);
CREATE INDEX IF NOT EXISTS idx_economic_indicators_code_date ON economic_indicators (indicator_code, period_date DESC);

-- Add table comment
COMMENT ON TABLE economic_indicators IS 'Economic indicators and metrics from multiple market data providers';

-- Add column comments
COMMENT ON COLUMN economic_indicators.indicator_code IS 'Standard code for the economic indicator (GDP, CPI, UNEMPLOYMENT, etc.)';
COMMENT ON COLUMN economic_indicators.indicator_name IS 'Full name of the economic indicator';
COMMENT ON COLUMN economic_indicators.country IS 'Country code where this indicator applies (US, EU, GB, etc.)';
COMMENT ON COLUMN economic_indicators.value IS 'The actual value of the economic indicator';
COMMENT ON COLUMN economic_indicators.previous_value IS 'Value from the previous period';
COMMENT ON COLUMN economic_indicators.change_value IS 'Absolute change from previous period';
COMMENT ON COLUMN economic_indicators.change_percent IS 'Percentage change from previous period';
COMMENT ON COLUMN economic_indicators.year_over_year_change IS 'Year-over-year percentage change';
COMMENT ON COLUMN economic_indicators.period_date IS 'Date this indicator value applies to';
COMMENT ON COLUMN economic_indicators.period_type IS 'Type of period (monthly, quarterly, annual, weekly)';
COMMENT ON COLUMN economic_indicators.frequency IS 'How often this indicator is released';
COMMENT ON COLUMN economic_indicators.unit IS 'Unit of measurement for the indicator';
COMMENT ON COLUMN economic_indicators.currency IS 'Currency if the indicator is currency-denominated';
COMMENT ON COLUMN economic_indicators.seasonal_adjustment IS 'Whether the data is seasonally adjusted';
COMMENT ON COLUMN economic_indicators.preliminary IS 'Whether this is preliminary data';
COMMENT ON COLUMN economic_indicators.importance_level IS 'Importance level (1=Low, 2=Medium, 3=High)';
COMMENT ON COLUMN economic_indicators.market_impact IS 'Expected market impact level';
COMMENT ON COLUMN economic_indicators.consensus_estimate IS 'Market consensus estimate before release';
COMMENT ON COLUMN economic_indicators.surprise IS 'Surprise amount vs consensus estimate';
COMMENT ON COLUMN economic_indicators.release_date IS 'Official release date and time';
COMMENT ON COLUMN economic_indicators.next_release_date IS 'Expected date of next release';
COMMENT ON COLUMN economic_indicators.source_agency IS 'Government agency or organization that releases this data';
COMMENT ON COLUMN economic_indicators.status IS 'Status of the data (preliminary, revised, final)';
COMMENT ON COLUMN economic_indicators.last_revised IS 'Last time this data was revised';
COMMENT ON COLUMN economic_indicators.revision_count IS 'Number of times this data has been revised';
COMMENT ON COLUMN economic_indicators.data_provider IS 'Market data provider (alpha_vantage, finnhub, fmp, etc.)';

-- =====================================================
-- ECONOMIC INDICATORS TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from economic_indicators table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from economic_indicators table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON economic_indicators TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON economic_indicators FROM PUBLIC;
REVOKE UPDATE ON economic_indicators FROM PUBLIC;
REVOKE DELETE ON economic_indicators FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE economic_indicators ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "economic_indicators_select_policy" ON economic_indicators
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "economic_indicators_insert_policy" ON economic_indicators
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "economic_indicators_update_policy" ON economic_indicators
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "economic_indicators_delete_policy" ON economic_indicators
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR ECONOMIC_INDICATORS TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for economic analysis and display
   - Users cannot modify economic indicator integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic economic indicator updates

3. DATA INTEGRITY:
   - Economic indicator data should be treated as immutable by users
   - Only trusted sources can update economic information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/


-- Historical Prices Table - GLOBAL SHARED DATA
-- This table stores historical price data accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores OHLCV data by INTERVAL ONLY - ranges are calculated dynamically
-- Eliminates duplicate data by storing each interval once and querying by time ranges

CREATE TABLE IF NOT EXISTS historical_prices (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Time dimension - timestamp and interval only
    timestamp_utc TIMESTAMP NOT NULL,
    date_only DATE GENERATED ALWAYS AS (timestamp_utc::DATE) STORED,
    
    -- Interval specification only - ranges handled by query logic
    time_interval VARCHAR(10) NOT NULL CHECK (time_interval IN ('5m', '15m', '30m', '1h', '1d', '1wk', '1mo')),

    -- Core OHLCV data (shared globally)
    open DECIMAL(15,4),
    high DECIMAL(15,4),
    low DECIMAL(15,4),
    close DECIMAL(15,4),
    volume BIGINT,
    adjusted_close DECIMAL(15,4),

    -- Corporate actions and adjustments
    dividend DECIMAL(10,4) DEFAULT 0,
    split_ratio DECIMAL(10,4) DEFAULT 1.0,

    -- Metadata
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per symbol per timestamp per interval per provider
    UNIQUE(symbol, timestamp_utc, time_interval, data_provider)
);

-- Time series indexes for fast historical queries
CREATE INDEX IF NOT EXISTS idx_historical_prices_symbol_timestamp ON historical_prices (symbol, timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_historical_prices_symbol_date ON historical_prices (symbol, date_only DESC);
CREATE INDEX IF NOT EXISTS idx_historical_prices_timestamp ON historical_prices (timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_historical_prices_date ON historical_prices (date_only DESC);
CREATE INDEX IF NOT EXISTS idx_historical_prices_provider ON historical_prices (data_provider);
CREATE INDEX IF NOT EXISTS idx_historical_prices_symbol_provider ON historical_prices (symbol, data_provider);
CREATE INDEX IF NOT EXISTS idx_historical_prices_interval ON historical_prices (time_interval);
CREATE INDEX IF NOT EXISTS idx_historical_prices_symbol_interval ON historical_prices (symbol, time_interval, timestamp_utc DESC);

-- Add table comment
COMMENT ON TABLE historical_prices IS 'Historical OHLCV price data from multiple market data providers';

-- Add column comments
COMMENT ON COLUMN historical_prices.symbol IS 'Stock ticker symbol (e.g., AAPL, GOOGL)';
COMMENT ON COLUMN historical_prices.exchange_id IS 'Foreign key to exchanges table';
COMMENT ON COLUMN historical_prices.timestamp_utc IS 'UTC timestamp for this price data point (supports intraday and daily data)';
COMMENT ON COLUMN historical_prices.date_only IS 'Generated column: date portion of timestamp_utc for efficient date-based queries';
COMMENT ON COLUMN historical_prices.time_interval IS 'Time interval granularity (5m, 15m, 30m, 1h, 1d, 1wk, 1mo) - ranges calculated by query logic';
COMMENT ON COLUMN historical_prices.open IS 'Opening price for the time period';
COMMENT ON COLUMN historical_prices.high IS 'Highest price during the time period';
COMMENT ON COLUMN historical_prices.low IS 'Lowest price during the time period';
COMMENT ON COLUMN historical_prices.close IS 'Closing price for the time period';
COMMENT ON COLUMN historical_prices.volume IS 'Trading volume for the time period';
COMMENT ON COLUMN historical_prices.adjusted_close IS 'Split and dividend adjusted closing price (null for intraday data)';
COMMENT ON COLUMN historical_prices.dividend IS 'Dividend amount paid on this date (typically for daily data only)';
COMMENT ON COLUMN historical_prices.split_ratio IS 'Stock split ratio (e.g., 2.0 for 2:1 split)';
COMMENT ON COLUMN historical_prices.data_provider IS 'Market data provider (alpha_vantage, finnhub, polygon, etc.)';

-- =====================================================
-- HISTORICAL PRICES TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from historical_prices table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from historical_prices table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON historical_prices TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON historical_prices FROM PUBLIC;
REVOKE UPDATE ON historical_prices FROM PUBLIC;
REVOKE DELETE ON historical_prices FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE historical_prices ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "historical_prices_select_policy" ON historical_prices
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "historical_prices_insert_policy" ON historical_prices
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "historical_prices_update_policy" ON historical_prices
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "historical_prices_delete_policy" ON historical_prices
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR HISTORICAL_PRICES TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for analysis and display
   - Users cannot modify historical price integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic market data updates

3. DATA INTEGRITY:
   - Historical data should be treated as immutable by users
   - Only trusted sources can update price information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/

-- News Data Table - GLOBAL SHARED DATA
-- This table stores news articles accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores news articles, sentiment analysis, and symbol mentions from providers

CREATE TABLE IF NOT EXISTS news_articles (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    url TEXT UNIQUE,
    source VARCHAR(100),

    -- Publication information
    published_at TIMESTAMP NOT NULL,
    author VARCHAR(255),
    category VARCHAR(50),  -- 'earnings', 'general', 'analysis', etc.

    -- Sentiment and relevance analysis
    sentiment DECIMAL(3,2),  -- -1.0 to 1.0 sentiment score
    relevance_score DECIMAL(3,2),  -- 0.0 to 1.0 relevance score
    sentiment_confidence DECIMAL(3,2),  -- Confidence in sentiment analysis

    -- Content metadata
    language VARCHAR(5) DEFAULT 'en',
    word_count INTEGER,
    image_url TEXT,
    tags TEXT[],  -- Array of tags/keywords

    -- Provider and audit info
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- NEW TABLE: Finance Query News Data
-- =====================================================
-- This table stores news specifically from finance-query.onrender.com API
-- Optimized for finance-specific news with stock symbol tracking

CREATE TABLE IF NOT EXISTS finance_news (
    id BIGSERIAL PRIMARY KEY,
    
    -- Core news data from finance-query API
    title TEXT NOT NULL,
    news_url TEXT UNIQUE NOT NULL,  -- The 'link' field from API
    source_name VARCHAR(100) NOT NULL,  -- The 'source' field from API
    image_url TEXT,  -- The 'img' field from API
    time_published VARCHAR(50),  -- Original time string from API ("5 hours ago")
    
    -- Processed timestamps
    published_at TIMESTAMP NOT NULL,  -- Converted to proper timestamp
    
    -- Calculated fields (from Edge Function processing)
    sentiment_score DECIMAL(4,3),  -- -1.000 to 1.000
    relevance_score DECIMAL(4,3),  -- 0.000 to 1.000 
    sentiment_confidence DECIMAL(4,3),  -- 0.000 to 1.000
    
    -- Stock symbol mentions
    mentioned_symbols TEXT[],  -- Array of stock symbols found in title
    primary_symbols TEXT[],  -- Most relevant symbols (if any)
    
    -- Metadata
    word_count INTEGER DEFAULT 0,
    language VARCHAR(5) DEFAULT 'en',
    category VARCHAR(50) DEFAULT 'financial',
    
    -- Provider tracking
    data_provider VARCHAR(50) DEFAULT 'finance_query',
    api_fetch_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
    CONSTRAINT valid_sentiment_score CHECK (sentiment_score IS NULL OR (sentiment_score >= -1 AND sentiment_score <= 1)),
    CONSTRAINT valid_relevance_score CHECK (relevance_score IS NULL OR (relevance_score >= 0 AND relevance_score <= 1)),
    CONSTRAINT valid_confidence_score CHECK (sentiment_confidence IS NULL OR (sentiment_confidence >= 0 AND sentiment_confidence <= 1))
);
-- Indexes for news analysis queries
CREATE INDEX IF NOT EXISTS idx_news_articles_published_at ON news_articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_source ON news_articles (source);
CREATE INDEX IF NOT EXISTS idx_news_articles_sentiment ON news_articles (sentiment);
CREATE INDEX IF NOT EXISTS idx_news_articles_relevance ON news_articles (relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_category ON news_articles (category);
CREATE INDEX IF NOT EXISTS idx_news_articles_provider ON news_articles (data_provider);
CREATE INDEX IF NOT EXISTS idx_news_articles_published_at_source ON news_articles (published_at DESC, source);

-- Indexes for finance_news table (optimized for finance-query API)
CREATE INDEX IF NOT EXISTS idx_finance_news_published_at ON finance_news (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_news_source ON finance_news (source_name);
CREATE INDEX IF NOT EXISTS idx_finance_news_sentiment ON finance_news (sentiment_score DESC);
CREATE INDEX IF NOT EXISTS idx_finance_news_relevance ON finance_news (relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_finance_news_symbols ON finance_news USING GIN (mentioned_symbols);
CREATE INDEX IF NOT EXISTS idx_finance_news_primary_symbols ON finance_news USING GIN (primary_symbols);
CREATE INDEX IF NOT EXISTS idx_finance_news_api_fetch ON finance_news (api_fetch_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_finance_news_url ON finance_news (news_url);
CREATE INDEX IF NOT EXISTS idx_finance_news_title_search ON finance_news USING GIN (to_tsvector('english', title));

-- Many-to-many relationship table for news mentioning multiple stocks
CREATE TABLE IF NOT EXISTS news_stocks (
    news_id INTEGER REFERENCES news_articles(id) ON DELETE CASCADE,
    stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
    mention_type VARCHAR(20) DEFAULT 'mentioned',  -- 'primary', 'mentioned', 'sector'
    sentiment_impact DECIMAL(3,2),  -- -1.0 to 1.0 impact on stock
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (news_id, stock_id)
);

-- New relationship table for finance_news to stocks
CREATE TABLE IF NOT EXISTS finance_news_stocks (
    finance_news_id BIGINT REFERENCES finance_news(id) ON DELETE CASCADE,
    stock_symbol VARCHAR(10) NOT NULL,  -- Direct symbol reference (no foreign key to allow flexibility)
    mention_type VARCHAR(20) DEFAULT 'mentioned',  -- 'primary', 'mentioned', 'sector'
    sentiment_impact DECIMAL(4,3),  -- -1.000 to 1.000 impact on stock
    confidence_score DECIMAL(4,3),  -- 0.000 to 1.000 confidence in symbol detection
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (finance_news_id, stock_symbol)
);

-- Index for finance_news_stocks relationship
CREATE INDEX IF NOT EXISTS idx_finance_news_stocks_symbol ON finance_news_stocks (stock_symbol);
CREATE INDEX IF NOT EXISTS idx_finance_news_stocks_news_id ON finance_news_stocks (finance_news_id);
CREATE INDEX IF NOT EXISTS idx_finance_news_stocks_sentiment ON finance_news_stocks (sentiment_impact DESC);

-- Indexes for news-stock relationship queries
CREATE INDEX IF NOT EXISTS idx_news_stocks_stock_id ON news_stocks (stock_id);
CREATE INDEX IF NOT EXISTS idx_news_stocks_news_id ON news_stocks (news_id);
CREATE INDEX IF NOT EXISTS idx_news_stocks_mention_type ON news_stocks (mention_type);
CREATE INDEX IF NOT EXISTS idx_news_stocks_sentiment_impact ON news_stocks (sentiment_impact DESC);

-- Add table comments
COMMENT ON TABLE news_articles IS 'News articles and content from multiple market data providers';
COMMENT ON TABLE news_stocks IS 'Many-to-many relationship between news articles and mentioned stocks';
COMMENT ON TABLE finance_news IS 'Finance-specific news from finance-query.onrender.com API with enhanced stock tracking';
COMMENT ON TABLE finance_news_stocks IS 'Relationship between finance news articles and mentioned stock symbols';

-- Add column comments for news_articles
COMMENT ON COLUMN news_articles.title IS 'News article title';
COMMENT ON COLUMN news_articles.summary IS 'Brief summary of the article';
COMMENT ON COLUMN news_articles.content IS 'Full article content (if available)';
COMMENT ON COLUMN news_articles.url IS 'URL to the full article';
COMMENT ON COLUMN news_articles.source IS 'News source (Bloomberg, Reuters, CNBC, etc.)';
COMMENT ON COLUMN news_articles.published_at IS 'Date and time when article was published';
COMMENT ON COLUMN news_articles.author IS 'Article author or journalist name';
COMMENT ON COLUMN news_articles.category IS 'Article category (earnings, general, analysis, etc.)';
COMMENT ON COLUMN news_articles.sentiment IS 'Sentiment score (-1.0 negative to 1.0 positive)';
COMMENT ON COLUMN news_articles.relevance_score IS 'Relevance score (0.0 to 1.0) for financial markets';
COMMENT ON COLUMN news_articles.sentiment_confidence IS 'Confidence level in sentiment analysis';
COMMENT ON COLUMN news_articles.language IS 'Article language code (en, es, fr, etc.)';
COMMENT ON COLUMN news_articles.word_count IS 'Approximate word count of the article';
COMMENT ON COLUMN news_articles.image_url IS 'URL to article featured image';
COMMENT ON COLUMN news_articles.tags IS 'Array of tags and keywords for the article';
COMMENT ON COLUMN news_articles.data_provider IS 'Market data provider (finnhub, alpha_vantage, etc.)';

-- Add column comments for news_stocks
COMMENT ON COLUMN news_stocks.news_id IS 'Foreign key to news_articles table';
COMMENT ON COLUMN news_stocks.stock_id IS 'Foreign key to stocks table';
COMMENT ON COLUMN news_stocks.mention_type IS 'Type of mention (primary, mentioned, sector)';
COMMENT ON COLUMN news_stocks.sentiment_impact IS 'Sentiment impact on the stock (-1.0 to 1.0)';

-- =====================================================
-- NEWS TABLES SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from news tables
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from news tables
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON news_articles TO PUBLIC;
GRANT SELECT ON news_stocks TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON news_articles FROM PUBLIC;
REVOKE UPDATE ON news_articles FROM PUBLIC;
REVOKE DELETE ON news_articles FROM PUBLIC;

REVOKE INSERT ON news_stocks FROM PUBLIC;
REVOKE UPDATE ON news_stocks FROM PUBLIC;
REVOKE DELETE ON news_stocks FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the tables
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_stocks ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "news_articles_select_policy" ON news_articles
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

CREATE POLICY "news_stocks_select_policy" ON news_stocks
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "news_articles_insert_policy" ON news_articles
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

CREATE POLICY "news_stocks_insert_policy" ON news_stocks
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "news_articles_update_policy" ON news_articles
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

CREATE POLICY "news_stocks_update_policy" ON news_stocks
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "news_articles_delete_policy" ON news_articles
    FOR DELETE
    USING (false);  -- Deny all delete operations

CREATE POLICY "news_stocks_delete_policy" ON news_stocks
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- FINANCE NEWS TABLE SECURITY POLICIES
-- =====================================================

-- Enable Row Level Security on finance_news tables
ALTER TABLE finance_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_news_stocks ENABLE ROW LEVEL SECURITY;

-- Grant SELECT permission to public for finance_news tables
GRANT SELECT ON finance_news TO PUBLIC;
GRANT SELECT ON finance_news_stocks TO PUBLIC;

-- Revoke modification permissions from public
REVOKE INSERT, UPDATE, DELETE ON finance_news FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON finance_news_stocks FROM PUBLIC;

-- Create policies for finance_news table
CREATE POLICY "finance_news_select_policy" ON finance_news
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

CREATE POLICY "finance_news_insert_policy" ON finance_news
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

CREATE POLICY "finance_news_update_policy" ON finance_news
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

CREATE POLICY "finance_news_delete_policy" ON finance_news
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- Create policies for finance_news_stocks table
CREATE POLICY "finance_news_stocks_select_policy" ON finance_news_stocks
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

CREATE POLICY "finance_news_stocks_insert_policy" ON finance_news_stocks
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

CREATE POLICY "finance_news_stocks_update_policy" ON finance_news_stocks
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

CREATE POLICY "finance_news_stocks_delete_policy" ON finance_news_stocks
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR NEWS TABLES
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for news analysis and display
   - Users cannot modify news data integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic news data updates

3. DATA INTEGRITY:
   - News data should be treated as immutable by users
   - Only trusted sources can update news information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/

-- Options Chain Table - GLOBAL SHARED DATA
-- This table stores options chain data accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores options quotes with Greeks and market data from providers

CREATE TABLE IF NOT EXISTS options_chain (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL,  -- Full option symbol (e.g., AAPL240315C00150000)
    underlying_symbol VARCHAR(20) NOT NULL,  -- Underlying stock symbol
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Option specifics
    strike DECIMAL(15,4) NOT NULL,
    expiration DATE NOT NULL,
    option_type VARCHAR(10) NOT NULL CHECK (option_type IN ('call', 'put')),

    -- Market data (shared globally)
    bid DECIMAL(15,4),
    ask DECIMAL(15,4),
    last_price DECIMAL(15,4),
    volume INTEGER,
    open_interest INTEGER,
    implied_volatility DECIMAL(7,4),  -- As decimal (0.234 = 23.4%)

    -- Options Greeks
    delta DECIMAL(7,4),
    gamma DECIMAL(7,4),
    theta DECIMAL(7,4),
    vega DECIMAL(7,4),
    rho DECIMAL(7,4),

    -- Market data
    intrinsic_value DECIMAL(15,4),
    extrinsic_value DECIMAL(15,4),
    time_value DECIMAL(15,4),

    -- Metadata
    quote_timestamp TIMESTAMP NOT NULL,
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per option symbol per timestamp per provider
    UNIQUE(symbol, quote_timestamp, data_provider)
);

 -- Indexes for options analysis queries
CREATE INDEX IF NOT EXISTS idx_options_chain_underlying_strike ON options_chain (underlying_symbol, strike);
CREATE INDEX IF NOT EXISTS idx_options_chain_expiration ON options_chain (expiration);
CREATE INDEX IF NOT EXISTS idx_options_chain_type_expiration ON options_chain (option_type, expiration);
CREATE INDEX IF NOT EXISTS idx_options_chain_timestamp ON options_chain (quote_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_options_chain_provider ON options_chain (data_provider);
CREATE INDEX IF NOT EXISTS idx_options_chain_underlying_expiration ON options_chain (underlying_symbol, expiration);

-- Add table comment
COMMENT ON TABLE options_chain IS 'Options chain data with Greeks and market data from multiple providers';

-- Add column comments
COMMENT ON COLUMN options_chain.symbol IS 'Full option symbol (e.g., AAPL240315C00150000)';
COMMENT ON COLUMN options_chain.underlying_symbol IS 'Underlying stock ticker symbol';
COMMENT ON COLUMN options_chain.exchange_id IS 'Foreign key to exchanges table';
COMMENT ON COLUMN options_chain.strike IS 'Strike price of the option';
COMMENT ON COLUMN options_chain.expiration IS 'Expiration date of the option';
COMMENT ON COLUMN options_chain.option_type IS 'Type of option (call or put)';
COMMENT ON COLUMN options_chain.bid IS 'Current bid price';
COMMENT ON COLUMN options_chain.ask IS 'Current ask price';
COMMENT ON COLUMN options_chain.last_price IS 'Last traded price';
COMMENT ON COLUMN options_chain.volume IS 'Trading volume for the option';
COMMENT ON COLUMN options_chain.open_interest IS 'Number of outstanding contracts';
COMMENT ON COLUMN options_chain.implied_volatility IS 'Implied volatility as decimal (0.234 = 23.4%)';
COMMENT ON COLUMN options_chain.delta IS 'Delta Greek (sensitivity to underlying price)';
COMMENT ON COLUMN options_chain.gamma IS 'Gamma Greek (delta sensitivity)';
COMMENT ON COLUMN options_chain.theta IS 'Theta Greek (time decay)';
COMMENT ON COLUMN options_chain.vega IS 'Vega Greek (volatility sensitivity)';
COMMENT ON COLUMN options_chain.rho IS 'Rho Greek (interest rate sensitivity)';
COMMENT ON COLUMN options_chain.intrinsic_value IS 'Intrinsic value of the option';
COMMENT ON COLUMN options_chain.extrinsic_value IS 'Extrinsic/time value of the option';
COMMENT ON COLUMN options_chain.time_value IS 'Time value remaining in the option';
COMMENT ON COLUMN options_chain.quote_timestamp IS 'Timestamp when this option data was captured';
COMMENT ON COLUMN options_chain.data_provider IS 'Market data provider (polygon, finnhub, etc.)';

-- =====================================================
-- OPTIONS CHAIN TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from options_chain table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from options_chain table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON options_chain TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON options_chain FROM PUBLIC;
REVOKE UPDATE ON options_chain FROM PUBLIC;
REVOKE DELETE ON options_chain FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE options_chain ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "options_chain_select_policy" ON options_chain
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "options_chain_insert_policy" ON options_chain
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "options_chain_update_policy" ON options_chain
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "options_chain_delete_policy" ON options_chain
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR OPTIONS_CHAIN TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for options analysis and display
   - Users cannot modify options data integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic options data updates

3. DATA INTEGRITY:
   - Options data should be treated as immutable by users
   - Only trusted sources can update options information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/

-- STOCK QUOTES TABLE - REDESIGNED: NO PRICE DATA
-- This table stores stock symbol metadata and tracking information
-- NO user ownership - data is shared across the entire platform
-- REMOVED: All price-related fields (use external APIs for real-time prices)

CREATE TABLE IF NOT EXISTS stock_quotes (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,  -- Ticker symbol stored as TEXT (not number)
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Metadata only (no price data)
    quote_timestamp TIMESTAMP NOT NULL,
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one tracking record per symbol per timestamp per provider
    UNIQUE(symbol, quote_timestamp, data_provider)
);

 -- Global indexes for cross-user queries
CREATE INDEX IF NOT EXISTS idx_stock_quotes_symbol_timestamp ON stock_quotes (symbol, quote_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_stock_quotes_provider ON stock_quotes (data_provider);
CREATE INDEX IF NOT EXISTS idx_stock_quotes_timestamp ON stock_quotes (quote_timestamp DESC);

-- Add table comment
COMMENT ON TABLE stock_quotes IS 'Stock symbol metadata and tracking information - REDESIGNED: no price data, ticker symbols as text';

-- Add column comments
COMMENT ON COLUMN stock_quotes.symbol IS 'Stock ticker symbol stored as TEXT (not number) - e.g., AAPL, GOOGL';
COMMENT ON COLUMN stock_quotes.quote_timestamp IS 'Timestamp when this symbol was tracked/updated';
COMMENT ON COLUMN stock_quotes.data_provider IS 'Data provider source for symbol validation';
COMMENT ON COLUMN stock_quotes.exchange_id IS 'Reference to exchange where symbol is traded';
COMMENT ON COLUMN stock_quotes.data_provider IS 'Market data provider (alpha_vantage, finnhub, polygon, etc.)';

-- =====================================================
-- STOCK QUOTES TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from stock_quotes table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from stock_quotes table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON stock_quotes TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON stock_quotes FROM PUBLIC;
REVOKE UPDATE ON stock_quotes FROM PUBLIC;
REVOKE DELETE ON stock_quotes FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE stock_quotes ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "stock_quotes_select_policy" ON stock_quotes
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "stock_quotes_insert_policy" ON stock_quotes
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "stock_quotes_update_policy" ON stock_quotes
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "stock_quotes_delete_policy" ON stock_quotes
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR STOCK_QUOTES TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for analysis and display
   - Users cannot modify the integrity of market data
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic market data updates

3. DATA INTEGRITY:
   - Market data should be treated as immutable by users
   - Only trusted sources can update pricing information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/


-- =====================================================
-- MARKET MOVERS TABLE - REDESIGNED: NO PRICE DATA
-- =====================================================
-- Table to store market movers data (actives, gainers, losers)
-- REMOVED: price, change, percent_change (use stock_quotes for real-time prices)
-- Data source: finance-query.onrender.com API endpoints

CREATE TABLE IF NOT EXISTS market_movers (
    id SERIAL PRIMARY KEY,
    
    -- Stock identification (ticker symbols stored as text, not numbers)
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    
    -- Mover classification (ranking and position tracking)
    mover_type VARCHAR(20) NOT NULL CHECK (mover_type IN ('active', 'gainer', 'loser')),
    rank_position INTEGER, -- Position in the leaderboard (1st, 2nd, etc.)
    
    -- Data tracking and metadata
    data_provider VARCHAR(50) DEFAULT 'finance_query',
    fetch_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_date DATE DEFAULT CURRENT_DATE,
    
    -- Audit timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one record per symbol per mover type per date
    UNIQUE(symbol, mover_type, data_date)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_market_movers_symbol ON market_movers(symbol);
CREATE INDEX IF NOT EXISTS idx_market_movers_type ON market_movers(mover_type);
CREATE INDEX IF NOT EXISTS idx_market_movers_date ON market_movers(data_date);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_market_movers_type_date ON market_movers(mover_type, data_date);
CREATE INDEX IF NOT EXISTS idx_market_movers_symbol_type ON market_movers(symbol, mover_type);
CREATE INDEX IF NOT EXISTS idx_market_movers_fetch_timestamp ON market_movers(fetch_timestamp);

-- Performance index for ranking
CREATE INDEX IF NOT EXISTS idx_market_movers_rank ON market_movers(mover_type, data_date, rank_position);
CREATE INDEX IF NOT EXISTS idx_market_movers_type_rank ON market_movers(mover_type, rank_position);

-- =====================================================
-- CONSTRAINTS AND TRIGGERS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_market_movers_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_market_movers_timestamp
    BEFORE UPDATE ON market_movers
    FOR EACH ROW
    EXECUTE FUNCTION update_market_movers_timestamp();

-- =====================================================
-- MARKET MOVERS TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from market_movers table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from market_movers table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON market_movers TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON market_movers FROM PUBLIC;
REVOKE UPDATE ON market_movers FROM PUBLIC;
REVOKE DELETE ON market_movers FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE market_movers ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "market_movers_select_policy" ON market_movers
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "market_movers_insert_policy" ON market_movers
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "market_movers_update_policy" ON market_movers
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "market_movers_delete_policy" ON market_movers
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR MARKET MOVERS TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT market movers data for analysis and display
   - Users cannot modify the integrity of market movers data
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data fetching processes can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic data refresh from finance-query API

3. DATA INTEGRITY:
   - Market movers data should be treated as immutable by users
   - Only trusted data management systems can update data
   - Supports performance optimization without security compromise

4. PERFORMANCE OPTIMIZATION:
   - Cached market movers data reduces load on external APIs
   - Supports real-time market analysis without rate limiting
   - Efficient indexing for fast retrieval by mover type and date

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure data fetching processes can still write data
- Consider implementing data expiration and cleanup policies
- Monitor API usage and cache hit rates for performance improvements
*/

-- =====================================================
-- SAMPLE USAGE QUERIES
-- =====================================================

-- Get today's top 10 gainers (by rank position)
-- SELECT * FROM market_movers WHERE mover_type = 'gainer' AND data_date = CURRENT_DATE ORDER BY rank_position ASC LIMIT 10;

-- Get today's top 10 losers (by rank position) 
-- SELECT * FROM market_movers WHERE mover_type = 'loser' AND data_date = CURRENT_DATE ORDER BY rank_position ASC LIMIT 10;

-- Get today's most active stocks (by rank position)
-- SELECT * FROM market_movers WHERE mover_type = 'active' AND data_date = CURRENT_DATE ORDER BY rank_position ASC LIMIT 10;

-- Get all mover entries for a specific symbol
-- SELECT * FROM market_movers WHERE symbol = 'AAPL' AND data_date = CURRENT_DATE;

-- Get symbols by mover type for joining with stock_quotes for real-time prices
-- SELECT symbol, rank_position FROM market_movers WHERE mover_type = 'gainer' AND data_date = CURRENT_DATE ORDER BY rank_position;

-- =====================================================
-- STOCK PEERS TABLE - REDESIGNED: NO PRICE DATA
-- =====================================================
-- Table to store stock peers data (companies in similar sectors/industries)
-- REMOVED: price, change, percent_change (use stock_quotes for real-time prices)
-- Data source: finance-query.onrender.com API endpoints

CREATE TABLE IF NOT EXISTS stock_peers (
    id SERIAL PRIMARY KEY,
    
    -- Stock identification (ticker symbols stored as text, not numbers)
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    
    -- Logo/branding (kept for UI display)
    logo VARCHAR(500), -- URL to company logo
    
    -- Peer relationship tracking
    peer_of VARCHAR(20) NOT NULL, -- The symbol this is a peer of
    
    -- Data tracking and metadata
    data_provider VARCHAR(50) DEFAULT 'finance_query',
    fetch_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_date DATE DEFAULT CURRENT_DATE,
    
    -- Audit timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per symbol per peer relationship per provider
    UNIQUE(symbol, peer_of, data_provider)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_stock_peers_symbol ON stock_peers(symbol);
CREATE INDEX IF NOT EXISTS idx_stock_peers_peer_of ON stock_peers(peer_of);
CREATE INDEX IF NOT EXISTS idx_stock_peers_date ON stock_peers(data_date);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_stock_peers_peer_of_date ON stock_peers(peer_of, data_date);
CREATE INDEX IF NOT EXISTS idx_stock_peers_symbol_peer ON stock_peers(symbol, peer_of);
CREATE INDEX IF NOT EXISTS idx_stock_peers_fetch_timestamp ON stock_peers(fetch_timestamp);

-- Performance index for peer lookups (no price sorting needed)
CREATE INDEX IF NOT EXISTS idx_stock_peers_logo ON stock_peers(logo) WHERE logo IS NOT NULL;

-- =====================================================
-- CONSTRAINTS AND TRIGGERS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_stock_peers_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stock_peers_timestamp
    BEFORE UPDATE ON stock_peers
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_peers_timestamp();

-- =====================================================
-- STOCK PEERS TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from stock_peers table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from stock_peers table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON stock_peers TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON stock_peers FROM PUBLIC;
REVOKE UPDATE ON stock_peers FROM PUBLIC;
REVOKE DELETE ON stock_peers FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE stock_peers ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "stock_peers_select_policy" ON stock_peers
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "stock_peers_insert_policy" ON stock_peers
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "stock_peers_update_policy" ON stock_peers
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "stock_peers_delete_policy" ON stock_peers
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR STOCK PEERS TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT stock peers data for analysis and comparison
   - Users cannot modify the integrity of peers data
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data fetching processes can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic data refresh from finance-query API

3. DATA INTEGRITY:
   - Stock peers data should be treated as immutable by users
   - Only trusted data management systems can update data
   - Supports performance optimization without security compromise

4. PERFORMANCE OPTIMIZATION:
   - Cached peers data reduces load on external APIs
   - Supports real-time peer comparison without rate limiting
   - Efficient indexing for fast retrieval by peer relationships

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure data fetching processes can still write data
- Consider implementing data expiration and cleanup policies
- Monitor API usage and cache hit rates for performance improvements
*/

-- =====================================================
-- SAMPLE USAGE QUERIES
-- =====================================================

-- Get all peers for a specific stock (e.g., AAPL) - symbols and names only
-- SELECT symbol, name, logo FROM stock_peers WHERE peer_of = 'AAPL' AND data_date = CURRENT_DATE ORDER BY symbol;

-- Get peers with logos for UI display
-- SELECT symbol, name, logo FROM stock_peers WHERE peer_of = 'AAPL' AND data_date = CURRENT_DATE AND logo IS NOT NULL ORDER BY name;

-- Get all peer symbols for price lookup in stock_quotes
-- SELECT symbol FROM stock_peers WHERE peer_of = 'AAPL' AND data_date = CURRENT_DATE;

-- Get all peer relationships for multiple stocks
-- SELECT peer_of, symbol, name, logo FROM stock_peers WHERE peer_of IN ('AAPL', 'MSFT', 'GOOGL') AND data_date = CURRENT_DATE ORDER BY peer_of, symbol;

-- Join with stock_quotes for real-time prices
-- SELECT sp.symbol, sp.name, sp.logo, sq.price, sq.change, sq.percent_change 
-- FROM stock_peers sp 
-- LEFT JOIN stock_quotes sq ON sp.symbol = sq.symbol 
-- WHERE sp.peer_of = 'AAPL' AND sp.data_date = CURRENT_DATE;

-- WATCHLIST TABLE

-- This table stores user-created watchlists.
-- Each user can have multiple watchlists to organize stocks.

CREATE TABLE IF NOT EXISTS watchlist (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure a user cannot have two watchlists with the same name
    UNIQUE(user_id, name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id_name ON watchlist(user_id, name);

-- Add table comment
COMMENT ON TABLE watchlist IS 'Stores user-created watchlists for organizing stocks.';

-- WATCHLIST ITEMS TABLE - REDESIGNED: NO PRICE DATA

-- This table stores the individual stocks within each watchlist.
-- REMOVED: price, percent_change (use stock_quotes for real-time prices)

CREATE TABLE IF NOT EXISTS watchlist_items (
    id SERIAL PRIMARY KEY,
    watchlist_id INTEGER NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,  -- Ticker symbol stored as TEXT (not number)
    company_name VARCHAR(255),
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure a stock symbol can only appear once per watchlist
    UNIQUE(watchlist_id, symbol)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist_id ON watchlist_items(watchlist_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_user_id ON watchlist_items(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_symbol ON watchlist_items(symbol);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist_id_symbol ON watchlist_items(watchlist_id, symbol);


-- Add table comment
COMMENT ON TABLE watchlist_items IS 'Stores the individual stocks that belong to each watchlist - REDESIGNED: no price data, ticker symbols as text.';
COMMENT ON COLUMN watchlist_items.symbol IS 'Stock ticker symbol (stored as TEXT, not number)';
COMMENT ON COLUMN watchlist_items.company_name IS 'Company name for display purposes';



-- RLS (ROW LEVEL SECURITY) POLICIES

-- Enable RLS for both tables
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;

-- Policies for `watchlist` table
CREATE POLICY "Allow full access to own watchlists"
ON watchlist
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policies for `watchlist_items` table
CREATE POLICY "Allow full access to own watchlist items"
ON watchlist_items
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Grant permissions to the authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON watchlist TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON watchlist_items TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE watchlist_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE watchlist_items_id_seq TO authenticated;



-- WATCHLIST ITEMS TABLE MIGRATION

-- Add missing updated_at column to existing watchlist_items table
-- Add the updated_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'watchlist_items' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE watchlist_items 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        
        -- Update existing records to have the current timestamp
        UPDATE watchlist_items 
        SET updated_at = COALESCE(added_at, CURRENT_TIMESTAMP) 
        WHERE updated_at IS NULL;
        
        RAISE NOTICE 'Added updated_at column to watchlist_items table';
    ELSE
        RAISE NOTICE 'updated_at column already exists in watchlist_items table';
    END IF;
END $$;

-- Create a trigger to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_watchlist_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists and create it
DROP TRIGGER IF EXISTS trigger_update_watchlist_items_updated_at ON watchlist_items;
CREATE TRIGGER trigger_update_watchlist_items_updated_at
    BEFORE UPDATE ON watchlist_items
    FOR EACH ROW
    EXECUTE FUNCTION update_watchlist_items_updated_at();

-- =============================================
-- Table: holders
-- Description: Stores comprehensive holder information for stocks including institutional, mutual fund, and insider data
-- =============================================

CREATE TABLE IF NOT EXISTS public.holders (
    -- Primary identification
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    holder_type VARCHAR(20) NOT NULL CHECK (holder_type IN ('institutional', 'mutualfund', 'insider_transactions', 'insider_purchases', 'insider_roster')),
    
    -- Common holder information (used by institutional, mutualfund, insider_transactions, insider_roster)
    holder_name VARCHAR(500),
    shares BIGINT,
    value BIGINT, -- Value in cents to avoid floating point precision issues
    date_reported TIMESTAMPTZ,
    
    -- Insider-specific fields (insider_transactions, insider_roster)
    insider_position VARCHAR(100),
    transaction_type VARCHAR(50),
    ownership_type VARCHAR(10), -- 'D' for Direct, 'I' for Indirect
    
    -- Insider roster specific fields
    most_recent_transaction VARCHAR(100),
    latest_transaction_date TIMESTAMPTZ,
    shares_owned_directly BIGINT,
    shares_owned_indirectly BIGINT,
    position_direct_date TIMESTAMPTZ,
    
    -- Insider purchases summary fields (for insider_purchases type)
    summary_period VARCHAR(10), -- e.g., '6m'
    purchases_shares BIGINT,
    purchases_transactions INTEGER,
    sales_shares BIGINT,
    sales_transactions INTEGER,
    net_shares BIGINT,
    net_transactions INTEGER,
    total_insider_shares BIGINT,
    net_percent_insider_shares DECIMAL(10,6),
    buy_percent_insider_shares DECIMAL(10,6),
    sell_percent_insider_shares DECIMAL(10,6),
    
    -- Metadata
    data_source VARCHAR(50) DEFAULT 'finance_api',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Basic constraints (partial unique indexes created separately below)
    CONSTRAINT chk_holder_type CHECK (holder_type IN ('institutional', 'mutualfund', 'insider_transactions', 'insider_purchases', 'insider_roster'))
);

-- =============================================
-- Partial Unique Indexes (replaces invalid WHERE constraints in table definition)
-- =============================================

-- Unique constraint for institutional and mutual fund holders
CREATE UNIQUE INDEX IF NOT EXISTS uniq_institutional_holder 
    ON public.holders(symbol, holder_type, holder_name, date_reported) 
    WHERE holder_type IN ('institutional', 'mutualfund');

-- Unique constraint for insider transactions
CREATE UNIQUE INDEX IF NOT EXISTS uniq_insider_transaction 
    ON public.holders(symbol, holder_type, holder_name, date_reported, transaction_type, shares, value)
    WHERE holder_type = 'insider_transactions';

-- Unique constraint for insider roster
CREATE UNIQUE INDEX IF NOT EXISTS uniq_insider_roster 
    ON public.holders(symbol, holder_type, holder_name)
    WHERE holder_type = 'insider_roster';

-- Unique constraint for insider purchases summary
CREATE UNIQUE INDEX IF NOT EXISTS uniq_insider_purchases 
    ON public.holders(symbol, holder_type, summary_period)
    WHERE holder_type = 'insider_purchases';

-- =============================================
-- Indexes for performance optimization
-- =============================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_holders_symbol_type ON public.holders(symbol, holder_type);
CREATE INDEX IF NOT EXISTS idx_holders_symbol_date ON public.holders(symbol, date_reported DESC) WHERE date_reported IS NOT NULL;

-- Holder-specific indexes
CREATE INDEX IF NOT EXISTS idx_holders_institutional ON public.holders(symbol, holder_name, date_reported) 
    WHERE holder_type IN ('institutional', 'mutualfund');

CREATE INDEX IF NOT EXISTS idx_holders_insider_name ON public.holders(symbol, holder_name, insider_position) 
    WHERE holder_type IN ('insider_transactions', 'insider_roster');

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_holders_shares ON public.holders(symbol, shares DESC) WHERE shares IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_holders_value ON public.holders(symbol, value DESC) WHERE value IS NOT NULL;

-- Time-based indexes
CREATE INDEX IF NOT EXISTS idx_holders_created_at ON public.holders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_holders_updated_at ON public.holders(updated_at DESC);

-- =============================================
-- SECURITY POLICY - GLOBAL SHARED DATA (READ-ONLY FOR USERS)
-- =============================================

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON public.holders TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON public.holders FROM PUBLIC;
REVOKE UPDATE ON public.holders FROM PUBLIC;
REVOKE DELETE ON public.holders FROM PUBLIC;

-- 3. ENABLE ROW LEVEL SECURITY WITH READ-ONLY POLICIES
ALTER TABLE public.holders ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "holders_select_policy" ON public.holders
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "holders_insert_policy" ON public.holders
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "holders_update_policy" ON public.holders
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "holders_delete_policy" ON public.holders
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =============================================
-- Comments for documentation
-- =============================================

COMMENT ON TABLE public.holders IS 'Comprehensive holder information for stocks including institutional investors, mutual funds, and insider data';

COMMENT ON COLUMN public.holders.symbol IS 'Stock symbol (e.g., AAPL, TSLA)';
COMMENT ON COLUMN public.holders.holder_type IS 'Type of holder: institutional, mutualfund, insider_transactions, insider_purchases, insider_roster';
COMMENT ON COLUMN public.holders.holder_name IS 'Name of the holder/institution/insider';
COMMENT ON COLUMN public.holders.shares IS 'Number of shares held';
COMMENT ON COLUMN public.holders.value IS 'Value of holdings in cents';
COMMENT ON COLUMN public.holders.date_reported IS 'Date when the holding was reported';
COMMENT ON COLUMN public.holders.insider_position IS 'Position of insider (CEO, CFO, Director, etc.)';
COMMENT ON COLUMN public.holders.transaction_type IS 'Type of insider transaction';
COMMENT ON COLUMN public.holders.ownership_type IS 'D for Direct ownership, I for Indirect ownership';
COMMENT ON COLUMN public.holders.summary_period IS 'Time period for insider purchase summaries (e.g., 6m)';
COMMENT ON COLUMN public.holders.net_percent_insider_shares IS 'Net percentage of insider shares as decimal (0.001 = 0.1%)';

-- =============================================
-- Trigger for updated_at timestamp
-- =============================================

CREATE OR REPLACE FUNCTION update_holders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_holders_updated_at
    BEFORE UPDATE ON public.holders
    FOR EACH ROW
    EXECUTE FUNCTION update_holders_updated_at();

-- =============================================
-- SECURITY PRINCIPLES FOR HOLDERS DATA
-- =============================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for holder analysis and display
   - Users cannot modify holders data integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and API ingestion processes can INSERT/UPDATE
   - Maintains data accuracy and consistency from finance-query API
   - Supports automatic holder data updates from external sources

3. DATA INTEGRITY:
   - Holders data should be treated as immutable by users
   - Only trusted API sources can update holder information
   - Supports regulatory compliance requirements for financial data

SCHEMA DESIGN NOTES:

- Designed to match finance-query.onrender.com API response structure
- Single table handles all holder types: institutional, mutualfund, insider_transactions, insider_purchases, insider_roster
- Flexible schema accommodates different data structures per holder type
- Unique constraints prevent duplicate data per holder type
- Values stored in cents to avoid floating-point precision issues

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system  
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for API data ingestion processes

QUERY EXAMPLES:

-- Get top institutional holders for AAPL
SELECT holder_name, shares, value/100 as value_dollars 
FROM public.holders 
WHERE symbol = 'AAPL' AND holder_type = 'institutional' 
ORDER BY shares DESC LIMIT 10;

-- Get recent insider transactions
SELECT holder_name, insider_position, shares, transaction_type, date_reported
FROM public.holders 
WHERE symbol = 'AAPL' AND holder_type = 'insider_transactions'
ORDER BY date_reported DESC;

-- Get insider purchase summary
SELECT * FROM public.holders 
WHERE symbol = 'AAPL' AND holder_type = 'insider_purchases';

-- Get current insider roster
SELECT holder_name, insider_position, shares_owned_directly, 
       most_recent_transaction, latest_transaction_date
FROM public.holders 
WHERE symbol = 'AAPL' AND holder_type = 'insider_roster'
ORDER BY shares_owned_directly DESC;

-- Get mutual fund holders
SELECT holder_name, shares, value/100 as value_dollars, date_reported
FROM public.holders 
WHERE symbol = 'AAPL' AND holder_type = 'mutualfund'
ORDER BY shares DESC;
*/

-- Balance Sheet Table - GLOBAL SHARED DATA
-- This table stores balance sheet data for companies, accessible to ALL users.
-- Data is sourced from market data providers and is shared across the platform.
-- This table uses a "wide" format, where each financial metric is a separate column.

CREATE TABLE IF NOT EXISTS balance_sheet (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    frequency VARCHAR(10) NOT NULL, -- 'annual' or 'quarterly'
    fiscal_date DATE NOT NULL,

    -- Assets
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

    -- Liabilities
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

    -- Equity
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

    -- Other
    working_capital NUMERIC(25, 2),
    invested_capital NUMERIC(25, 2),
    total_capitalization NUMERIC(25, 2),

    -- Metadata
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per period per provider
    UNIQUE(symbol, frequency, fiscal_date, data_provider)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_balance_sheet_symbol_freq_date ON balance_sheet (symbol, frequency, fiscal_date);
CREATE INDEX IF NOT EXISTS idx_balance_sheet_provider ON balance_sheet (data_provider);

-- Add table and column comments
COMMENT ON TABLE balance_sheet IS 'Stores detailed balance sheet financial data (both annual and quarterly) for companies from various data providers. This table uses a "wide" format where each financial metric is a separate column.';

COMMENT ON COLUMN balance_sheet.id IS 'Unique identifier for each record.';
COMMENT ON COLUMN balance_sheet.symbol IS 'Stock ticker symbol, references company_info(symbol).';
COMMENT ON COLUMN balance_sheet.frequency IS 'Frequency of the report: ''annual'' or ''quarterly''.';
COMMENT ON COLUMN balance_sheet.fiscal_date IS 'The end date of the fiscal period for the report.';

-- Assets Comments
COMMENT ON COLUMN balance_sheet.total_assets IS 'Total value of all assets.';
COMMENT ON COLUMN balance_sheet.total_current_assets IS 'Total of all current assets.';
COMMENT ON COLUMN balance_sheet.cash_cash_equivalents_and_short_term_investments IS 'Sum of cash, cash equivalents, and short-term investments.';
COMMENT ON COLUMN balance_sheet.cash_and_cash_equivalents IS 'Sum of cash and cash equivalents.';
COMMENT ON COLUMN balance_sheet.cash IS 'Cash on hand.';
COMMENT ON COLUMN balance_sheet.cash_equivalents IS 'Highly liquid investments with short maturities.';
COMMENT ON COLUMN balance_sheet.other_short_term_investments IS 'Other investments with a maturity of less than one year.';
COMMENT ON COLUMN balance_sheet.receivables IS 'Total amount owed to the company.';
COMMENT ON COLUMN balance_sheet.accounts_receivable IS 'Money owed by customers for goods or services delivered.';
COMMENT ON COLUMN balance_sheet.other_receivables IS 'Other amounts owed to the company.';
COMMENT ON COLUMN balance_sheet.inventory IS 'Value of goods available for sale.';
COMMENT ON COLUMN balance_sheet.other_current_assets IS 'Other assets expected to be converted to cash within a year.';
COMMENT ON COLUMN balance_sheet.total_non_current_assets IS 'Total of all long-term assets.';
COMMENT ON COLUMN balance_sheet.net_ppe IS 'Net value of property, plant, and equipment.';
COMMENT ON COLUMN balance_sheet.gross_ppe IS 'Gross value of property, plant, and equipment before depreciation.';
COMMENT ON COLUMN balance_sheet.properties IS 'Value of properties held.';
COMMENT ON COLUMN balance_sheet.land_and_improvements IS 'Value of land and improvements.';
COMMENT ON COLUMN balance_sheet.machinery_furniture_equipment IS 'Value of machinery, furniture, and equipment.';
COMMENT ON COLUMN balance_sheet.other_properties IS 'Value of other properties.';
COMMENT ON COLUMN balance_sheet.leases IS 'Value of assets held under lease.';
COMMENT ON COLUMN balance_sheet.accumulated_depreciation IS 'Total depreciation expense recorded for assets.';
COMMENT ON COLUMN balance_sheet.investments_and_advances IS 'Total value of investments and advances made.';
COMMENT ON COLUMN balance_sheet.investment_in_financial_assets IS 'Investments in financial assets.';
COMMENT ON COLUMN balance_sheet.available_for_sale_securities IS 'Securities that are not classified as held-to-maturity or trading.';
COMMENT ON COLUMN balance_sheet.other_investments IS 'Other long-term investments.';
COMMENT ON COLUMN balance_sheet.non_current_deferred_assets IS 'Long-term deferred assets.';
COMMENT ON COLUMN balance_sheet.non_current_deferred_taxes_assets IS 'Long-term deferred tax assets.';
COMMENT ON COLUMN balance_sheet.other_non_current_assets IS 'Other long-term assets.';
COMMENT ON COLUMN balance_sheet.net_tangible_assets IS 'Total assets minus intangible assets and liabilities.';
COMMENT ON COLUMN balance_sheet.tangible_book_value IS 'Book value of the company excluding intangible assets.';

-- Liabilities Comments
COMMENT ON COLUMN balance_sheet.total_liabilities IS 'Total amount of all liabilities.';
COMMENT ON COLUMN balance_sheet.total_current_liabilities IS 'Total of all current liabilities.';
COMMENT ON COLUMN balance_sheet.payables_and_accrued_expenses IS 'Money owed to suppliers and other accrued expenses.';
COMMENT ON COLUMN balance_sheet.payables IS 'Total amount owed to suppliers.';
COMMENT ON COLUMN balance_sheet.accounts_payable IS 'Money owed to suppliers for goods or services.';
COMMENT ON COLUMN balance_sheet.total_tax_payable IS 'Total amount of taxes owed.';
COMMENT ON COLUMN balance_sheet.income_tax_payable IS 'Amount of income tax owed.';
COMMENT ON COLUMN balance_sheet.current_debt_and_capital_lease_obligation IS 'Short-term debt and capital lease obligations due within a year.';
COMMENT ON COLUMN balance_sheet.current_debt IS 'Short-term debt due within a year.';
COMMENT ON COLUMN balance_sheet.commercial_paper IS 'Short-term unsecured promissory notes issued by companies.';
COMMENT ON COLUMN balance_sheet.other_current_borrowings IS 'Other short-term borrowings.';
COMMENT ON COLUMN balance_sheet.current_capital_lease_obligation IS 'Portion of capital lease obligations due within a year.';
COMMENT ON COLUMN balance_sheet.current_deferred_liabilities IS 'Deferred liabilities due within a year.';
COMMENT ON COLUMN balance_sheet.current_deferred_revenue IS 'Revenue received but not yet earned, to be recognized within a year.';
COMMENT ON COLUMN balance_sheet.other_current_liabilities IS 'Other liabilities due within a year.';
COMMENT ON COLUMN balance_sheet.total_non_current_liabilities IS 'Total of all long-term liabilities.';
COMMENT ON COLUMN balance_sheet.long_term_debt_and_capital_lease_obligation IS 'Long-term debt and capital lease obligations.';
COMMENT ON COLUMN balance_sheet.long_term_debt IS 'Debt with a maturity of more than one year.';
COMMENT ON COLUMN balance_sheet.long_term_capital_lease_obligation IS 'Long-term portion of capital lease obligations.';
COMMENT ON COLUMN balance_sheet.trade_and_other_payables_non_current IS 'Non-current trade and other payables.';
COMMENT ON COLUMN balance_sheet.other_non_current_liabilities IS 'Other long-term liabilities.';
COMMENT ON COLUMN balance_sheet.capital_lease_obligations IS 'Total obligation under capital leases.';
COMMENT ON COLUMN balance_sheet.total_debt IS 'Sum of all short-term and long-term debt.';
COMMENT ON COLUMN balance_sheet.net_debt IS 'Total debt minus cash and cash equivalents.';

-- Equity Comments
COMMENT ON COLUMN balance_sheet.total_equity IS 'Total shareholders'' equity.';
COMMENT ON COLUMN balance_sheet.stockholders_equity IS 'Total equity belonging to stockholders.';
COMMENT ON COLUMN balance_sheet.capital_stock IS 'Value of common and preferred stock.';
COMMENT ON COLUMN balance_sheet.common_stock IS 'Value of common stock.';
COMMENT ON COLUMN balance_sheet.retained_earnings IS 'Cumulative net earnings retained by the company.';
COMMENT ON COLUMN balance_sheet.gains_losses_not_affecting_retained_earnings IS 'Gains and losses not affecting retained earnings (e.g., other comprehensive income).';
COMMENT ON COLUMN balance_sheet.other_equity_adjustments IS 'Other adjustments to equity.';
COMMENT ON COLUMN balance_sheet.common_stock_equity IS 'Equity attributable to common shareholders.';
COMMENT ON COLUMN balance_sheet.shares_issued IS 'Total number of shares issued.';
COMMENT ON COLUMN balance_sheet.ordinary_shares_number IS 'Number of ordinary shares.';
COMMENT ON COLUMN balance_sheet.treasury_shares_number IS 'Number of shares held in treasury.';

-- Other Comments
COMMENT ON COLUMN balance_sheet.working_capital IS 'Current Assets - Current Liabilities.';
COMMENT ON COLUMN balance_sheet.invested_capital IS 'Total capital invested in the company.';
COMMENT ON COLUMN balance_sheet.total_capitalization IS 'Total long-term debt, and equity.';

-- =====================================================
-- BALANCE SHEET TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed.
-- =====================================================

-- Enable Row Level Security on the table
ALTER TABLE balance_sheet ENABLE ROW LEVEL SECURITY;

-- Grant SELECT permission to all authenticated users
GRANT SELECT ON balance_sheet TO PUBLIC;

-- Revoke modification permissions
REVOKE INSERT, UPDATE, DELETE ON balance_sheet FROM PUBLIC;

-- Create policies to enforce read-only access for users
CREATE POLICY "balance_sheet_select_policy" ON balance_sheet
    FOR SELECT
    USING (true); -- Allow all users to read all rows

CREATE POLICY "balance_sheet_insert_policy" ON balance_sheet
    FOR INSERT
    WITH CHECK (false); -- Deny all insert operations

CREATE POLICY "balance_sheet_update_policy" ON balance_sheet
    FOR UPDATE
    USING (false)
    WITH CHECK (false); -- Deny all update operations

CREATE POLICY "balance_sheet_delete_policy" ON balance_sheet
    FOR DELETE
    USING (false); -- Deny all delete operations

-- Cash Flow Statement Table - GLOBAL SHARED DATA
-- This table stores cash flow statement data for companies, accessible to ALL users.
-- Data is sourced from market data providers and is shared across the platform.
-- This table uses a "wide" format, where each financial metric is a separate column.

CREATE TABLE IF NOT EXISTS cash_flow (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    frequency VARCHAR(10) NOT NULL, -- 'annual' or 'quarterly'
    fiscal_date DATE NOT NULL,

    -- Operating Cash Flow
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

    -- Investing Cash Flow
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

    -- Financing Cash Flow
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

    -- Summary
    end_cash_position NUMERIC(25, 2),
    changes_in_cash NUMERIC(25, 2),
    beginning_cash_position NUMERIC(25, 2),
    free_cash_flow NUMERIC(25, 2),

    -- Supplemental Data
    income_tax_paid_supplemental_data NUMERIC(25, 2),
    interest_paid_supplemental_data NUMERIC(25, 2),

    -- Metadata
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per period per provider
    UNIQUE(symbol, frequency, fiscal_date, data_provider)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cash_flow_symbol_freq_date ON cash_flow (symbol, frequency, fiscal_date);
CREATE INDEX IF NOT EXISTS idx_cash_flow_provider ON cash_flow (data_provider);

-- Add table and column comments
COMMENT ON TABLE cash_flow IS '''Stores detailed cash flow statement financial data (both annual and quarterly) for companies from various data providers. This table uses a "wide" format where each financial metric is a separate column.''';

COMMENT ON COLUMN cash_flow.id IS '''Unique identifier for each record.''';
COMMENT ON COLUMN cash_flow.symbol IS '''Stock ticker symbol, references company_info(symbol).''';
COMMENT ON COLUMN cash_flow.frequency IS '''Frequency of the report: ''annual'' or ''quarterly''.''';
COMMENT ON COLUMN cash_flow.fiscal_date IS '''The end date of the fiscal period for the report.''';

-- Operating Cash Flow Comments
COMMENT ON COLUMN cash_flow.operating_cash_flow IS '''Cash flow from operating activities.''';
COMMENT ON COLUMN cash_flow.net_income_from_continuing_operations IS '''Net income from continuing operations.''';
COMMENT ON COLUMN cash_flow.depreciation_and_amortization IS '''Depreciation and amortization expense.''';
COMMENT ON COLUMN cash_flow.deferred_income_tax IS '''Deferred income tax expense or benefit.''';
COMMENT ON COLUMN cash_flow.stock_based_compensation IS '''Non-cash expense for stock-based compensation.''';
COMMENT ON COLUMN cash_flow.other_non_cash_items IS '''Other non-cash items included in net income.''';
COMMENT ON COLUMN cash_flow.change_in_working_capital IS '''Change in working capital.''';
COMMENT ON COLUMN cash_flow.change_in_receivables IS '''Change in accounts receivable.''';
COMMENT ON COLUMN cash_flow.change_in_inventory IS '''Change in inventory.''';
COMMENT ON COLUMN cash_flow.change_in_payables_and_accrued_expense IS '''Change in payables and accrued expenses.''';
COMMENT ON COLUMN cash_flow.change_in_other_current_assets IS '''Change in other current assets.''';
COMMENT ON COLUMN cash_flow.change_in_other_current_liabilities IS '''Change in other current liabilities.''';
COMMENT ON COLUMN cash_flow.change_in_other_working_capital IS '''Change in other working capital components.''';

-- Investing Cash Flow Comments
COMMENT ON COLUMN cash_flow.investing_cash_flow IS '''Cash flow from investing activities.''';
COMMENT ON COLUMN cash_flow.net_investment_purchase_and_sale IS '''Net cash from purchase and sale of investments.''';
COMMENT ON COLUMN cash_flow.purchase_of_investment IS '''Cash used to purchase investments.''';
COMMENT ON COLUMN cash_flow.sale_of_investment IS '''Cash received from sale of investments.''';
COMMENT ON COLUMN cash_flow.net_ppe_purchase_and_sale IS '''Net cash from purchase and sale of property, plant, and equipment.''';
COMMENT ON COLUMN cash_flow.purchase_of_ppe IS '''Cash used to purchase property, plant, and equipment.''';
COMMENT ON COLUMN cash_flow.net_business_purchase_and_sale IS '''Net cash from purchase and sale of businesses.''';
COMMENT ON COLUMN cash_flow.purchase_of_business IS '''Cash used to acquire businesses.''';
COMMENT ON COLUMN cash_flow.net_other_investing_changes IS '''Net cash from other investing activities.''';
COMMENT ON COLUMN cash_flow.capital_expenditure IS '''Expenditure on acquiring or maintaining fixed assets.''';

-- Financing Cash Flow Comments
COMMENT ON COLUMN cash_flow.financing_cash_flow IS '''Cash flow from financing activities.''';
COMMENT ON COLUMN cash_flow.net_issuance_payments_of_debt IS '''Net cash from issuance and payment of debt.''';
COMMENT ON COLUMN cash_flow.net_long_term_debt_issuance IS '''Net cash from issuance of long-term debt.''';
COMMENT ON COLUMN cash_flow.long_term_debt_issuance IS '''Cash received from issuing long-term debt.''';
COMMENT ON COLUMN cash_flow.long_term_debt_payments IS '''Cash paid to repay long-term debt.''';
COMMENT ON COLUMN cash_flow.net_short_term_debt_issuance IS '''Net cash from issuance of short-term debt.''';
COMMENT ON COLUMN cash_flow.short_term_debt_issuance IS '''Cash received from issuing short-term debt.''';
COMMENT ON COLUMN cash_flow.short_term_debt_payments IS '''Cash paid to repay short-term debt.''';
COMMENT ON COLUMN cash_flow.net_common_stock_issuance IS '''Net cash from issuance and repurchase of common stock.''';
COMMENT ON COLUMN cash_flow.common_stock_issuance IS '''Cash received from issuing common stock.''';
COMMENT ON COLUMN cash_flow.common_stock_payments IS '''Cash paid to repurchase common stock.''';
COMMENT ON COLUMN cash_flow.cash_dividends_paid IS '''Cash paid as dividends to shareholders.''';
COMMENT ON COLUMN cash_flow.net_other_financing_charges IS '''Net cash from other financing activities.''';
COMMENT ON COLUMN cash_flow.issuance_of_capital_stock IS '''Cash from issuance of capital stock.''';
COMMENT ON COLUMN cash_flow.issuance_of_debt IS '''Cash from issuance of debt.''';
COMMENT ON COLUMN cash_flow.repayment_of_debt IS '''Cash paid for repayment of debt.''';
COMMENT ON COLUMN cash_flow.repurchase_of_capital_stock IS '''Cash paid for repurchase of capital stock.''';

-- Summary Comments
COMMENT ON COLUMN cash_flow.end_cash_position IS '''Cash position at the end of the period.''';
COMMENT ON COLUMN cash_flow.changes_in_cash IS '''Net change in cash during the period.''';
COMMENT ON COLUMN cash_flow.beginning_cash_position IS '''Cash position at the beginning of the period.''';
COMMENT ON COLUMN cash_flow.free_cash_flow IS '''Operating Cash Flow - Capital Expenditure.''';

-- Supplemental Data Comments
COMMENT ON COLUMN cash_flow.income_tax_paid_supplemental_data IS '''Supplemental data on income tax paid.''';
COMMENT ON COLUMN cash_flow.interest_paid_supplemental_data IS '''Supplemental data on interest paid.''';

-- Metadata Comments
COMMENT ON COLUMN cash_flow.data_provider IS '''The source of the market data (e.g., ''fmp'', ''alpha_vantage'').''';
COMMENT ON COLUMN cash_flow.created_at IS '''Timestamp of when the record was first created.''';
COMMENT ON COLUMN cash_flow.updated_at IS '''Timestamp of when the record was last updated.''';

-- =====================================================
-- CASH FLOW TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed.
-- =====================================================

-- Enable Row Level Security on the table
ALTER TABLE cash_flow ENABLE ROW LEVEL SECURITY;

-- Grant SELECT permission to all authenticated users
GRANT SELECT ON cash_flow TO PUBLIC;

-- Revoke modification permissions
REVOKE INSERT, UPDATE, DELETE ON cash_flow FROM PUBLIC;

-- Create policies to enforce read-only access for users
CREATE POLICY "cash_flow_select_policy" ON cash_flow
    FOR SELECT
    USING (true); -- Allow all users to read all rows

CREATE POLICY "cash_flow_insert_policy" ON cash_flow
    FOR INSERT
    WITH CHECK (false); -- Deny all insert operations

CREATE POLICY "cash_flow_update_policy" ON cash_flow
    FOR UPDATE
    USING (false)
    WITH CHECK (false); -- Deny all update operations

CREATE POLICY "cash_flow_delete_policy" ON cash_flow
    FOR DELETE
    USING (false); -- Deny all delete operations

-- Income Statement Table - GLOBAL SHARED DATA
-- This table stores income statement data for companies, accessible to ALL users.
-- Data is sourced from market data providers and is shared across the platform.
-- This table uses a "wide" format, where each financial metric is a separate column.

CREATE TABLE IF NOT EXISTS income_statement (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    frequency VARCHAR(10) NOT NULL, -- 'annual' or 'quarterly'
    fiscal_date DATE NOT NULL,

    -- Revenue & Profit
    total_revenue NUMERIC(25, 2),
    operating_revenue NUMERIC(25, 2),
    cost_of_revenue NUMERIC(25, 2),
    gross_profit NUMERIC(25, 2),
    reconciled_cost_of_revenue NUMERIC(25, 2),

    -- Expenses
    operating_expense NUMERIC(25, 2),
    selling_general_and_administrative NUMERIC(25, 2),
    research_and_development NUMERIC(25, 2),
    total_expenses NUMERIC(25, 2),
    reconciled_depreciation NUMERIC(25, 2),

    -- Income
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

    -- Interest
    interest_income NUMERIC(25, 2),
    interest_expense NUMERIC(25, 2),
    net_interest_income NUMERIC(25, 2),

    -- EPS & Shares
    basic_eps NUMERIC(10, 4),
    diluted_eps NUMERIC(10, 4),
    basic_average_shares BIGINT,
    diluted_average_shares BIGINT,

    -- Other Metrics
    ebit NUMERIC(25, 2),
    ebitda NUMERIC(25, 2),
    normalized_ebitda NUMERIC(25, 2),
    tax_provision NUMERIC(25, 2),
    tax_rate_for_calcs NUMERIC(10, 4),
    tax_effect_of_unusual_items NUMERIC(25, 2),

    -- Metadata
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per period per provider
    UNIQUE(symbol, frequency, fiscal_date, data_provider)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_income_statement_symbol_freq_date ON income_statement (symbol, frequency, fiscal_date);
CREATE INDEX IF NOT EXISTS idx_income_statement_provider ON income_statement (data_provider);

-- Add table and column comments
COMMENT ON TABLE income_statement IS '''Stores detailed income statement financial data (both annual and quarterly) for companies from various data providers. This table uses a "wide" format where each financial metric is a separate column.''';

COMMENT ON COLUMN income_statement.id IS '''Unique identifier for each record.''';
COMMENT ON COLUMN income_statement.symbol IS '''Stock ticker symbol, references company_info(symbol).''';
COMMENT ON COLUMN income_statement.frequency IS '''Frequency of the report: ''annual'' or ''quarterly''.''';
COMMENT ON COLUMN income_statement.fiscal_date IS '''The end date of the fiscal period for the report.''';

-- Revenue & Profit Comments
COMMENT ON COLUMN income_statement.total_revenue IS '''Total revenue generated by the company.''';
COMMENT ON COLUMN income_statement.operating_revenue IS '''Revenue generated from primary business operations.''';
COMMENT ON COLUMN income_statement.cost_of_revenue IS '''The cost of goods sold and other direct costs associated with revenue generation.''';
COMMENT ON COLUMN income_statement.gross_profit IS '''Total Revenue - Cost of Revenue.''';
COMMENT ON COLUMN income_statement.reconciled_cost_of_revenue IS '''Cost of revenue reconciled with other financial statements.''';

-- Expenses Comments
COMMENT ON COLUMN income_statement.operating_expense IS '''Total expenses incurred through normal business operations.''';
COMMENT ON COLUMN income_statement.selling_general_and_administrative IS '''Selling, general, and administrative expenses (SG&A).''';
COMMENT ON COLUMN income_statement.research_and_development IS '''Research and Development (R&D) expenses.''';
COMMENT ON COLUMN income_statement.total_expenses IS '''Sum of all operating and non-operating expenses.''';
COMMENT ON COLUMN income_statement.reconciled_depreciation IS '''Depreciation expenses reconciled with other financial statements.''';

-- Income Comments
COMMENT ON COLUMN income_statement.operating_income IS '''Gross Profit - Operating Expenses.''';
COMMENT ON COLUMN income_statement.total_operating_income_as_reported IS '''Operating income as reported in financial statements.''';
COMMENT ON COLUMN income_statement.net_non_operating_interest_income_expense IS '''Net income or expense from non-operating interest.''';
COMMENT ON COLUMN income_statement.non_operating_interest_income IS '''Income from investments and other non-primary business activities.''';
COMMENT ON COLUMN income_statement.non_operating_interest_expense IS '''Expenses from non-operating activities, like interest on debt.''';
COMMENT ON COLUMN income_statement.other_income_expense IS '''Other miscellaneous income or expenses.''';
COMMENT ON COLUMN income_statement.other_non_operating_income_expenses IS '''Other non-operating income and expenses.''';
COMMENT ON COLUMN income_statement.pretax_income IS '''Income before taxes.''';
COMMENT ON COLUMN income_statement.net_income_common_stockholders IS '''Net income available to common stockholders.''';
COMMENT ON COLUMN income_statement.net_income_attributable_to_parent_shareholders IS '''Net income attributable to the parent company''s shareholders.''';
COMMENT ON COLUMN income_statement.net_income_including_non_controlling_interests IS '''Net income including the portion attributable to non-controlling interests.''';
COMMENT ON COLUMN income_statement.net_income_continuous_operations IS '''Net income from continuing business operations.''';
COMMENT ON COLUMN income_statement.diluted_ni_available_to_common_stockholders IS '''Diluted net income available to common stockholders.''';
COMMENT ON COLUMN income_statement.net_income_from_continuing_discontinued_operation IS '''Net income from both continuing and discontinued operations.''';
COMMENT ON COLUMN income_statement.net_income_from_continuing_operation_net_minority_interest IS '''Net income from continuing operations net of minority interest.''';
COMMENT ON COLUMN income_statement.normalized_income IS '''Net income adjusted for non-recurring items.''';

-- Interest Comments
COMMENT ON COLUMN income_statement.interest_income IS '''Income earned from interest-bearing assets.''';
COMMENT ON COLUMN income_statement.interest_expense IS '''Cost of borrowed funds.''';
COMMENT ON COLUMN income_statement.net_interest_income IS '''Interest Income - Interest Expense.''';

-- EPS & Shares Comments
COMMENT ON COLUMN income_statement.basic_eps IS '''Basic Earnings Per Share.''';
COMMENT ON COLUMN income_statement.diluted_eps IS '''Diluted Earnings Per Share.''';
COMMENT ON COLUMN income_statement.basic_average_shares IS '''Average number of basic shares outstanding.''';
COMMENT ON COLUMN income_statement.diluted_average_shares IS '''Average number of diluted shares outstanding.''';

-- Other Metrics Comments
COMMENT ON COLUMN income_statement.ebit IS '''Earnings Before Interest and Taxes.''';
COMMENT ON COLUMN income_statement.ebitda IS '''Earnings Before Interest, Taxes, Depreciation, and Amortization.''';
COMMENT ON COLUMN income_statement.normalized_ebitda IS '''EBITDA adjusted for non-recurring items.''';
COMMENT ON COLUMN income_statement.tax_provision IS '''Provision for income taxes.''';
COMMENT ON COLUMN income_statement.tax_rate_for_calcs IS '''Effective tax rate used for calculations.''';
COMMENT ON COLUMN income_statement.tax_effect_of_unusual_items IS '''Tax impact of unusual or non-recurring items.''';

-- Metadata Comments
COMMENT ON COLUMN income_statement.data_provider IS '''The source of the market data (e.g., ''fmp'', ''alpha_vantage'').''';
COMMENT ON COLUMN income_statement.created_at IS '''Timestamp of when the record was first created.''';
COMMENT ON COLUMN income_statement.updated_at IS '''Timestamp of when the record was last updated.''';

-- =====================================================
-- INCOME STATEMENT TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed.
-- =====================================================

-- Enable Row Level Security on the table
ALTER TABLE income_statement ENABLE ROW LEVEL SECURITY;

-- Grant SELECT permission to all authenticated users
GRANT SELECT ON income_statement TO PUBLIC;

-- Revoke modification permissions
REVOKE INSERT, UPDATE, DELETE ON income_statement FROM PUBLIC;

-- Create policies to enforce read-only access for users
CREATE POLICY "income_statement_select_policy" ON income_statement
    FOR SELECT
    USING (true); -- Allow all users to read all rows

CREATE POLICY "income_statement_insert_policy" ON income_statement
    FOR INSERT
    WITH CHECK (false); -- Deny all insert operations

CREATE POLICY "income_statement_update_policy" ON income_statement
    FOR UPDATE
    USING (false)
    WITH CHECK (false); -- Deny all update operations

CREATE POLICY "income_statement_delete_policy" ON income_statement
    FOR DELETE
    USING (false); -- Deny all delete operations