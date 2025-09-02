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

    -- Financial metrics
    market_cap BIGINT,
    employees INTEGER,
    revenue BIGINT,
    net_income BIGINT,
    pe_ratio DECIMAL(10,2),
    pb_ratio DECIMAL(10,2),
    dividend_yield DECIMAL(7,4),

    -- Company details
    description TEXT,
    website VARCHAR(500),
    ceo VARCHAR(255),
    headquarters VARCHAR(255),
    founded VARCHAR(50),  -- Year or date string
    phone VARCHAR(50),
    email VARCHAR(255),

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

-- Add table comment
COMMENT ON TABLE company_info IS 'Fundamental company information and metrics from multiple market data providers';

-- Add column comments
COMMENT ON COLUMN company_info.symbol IS 'Stock ticker symbol';
COMMENT ON COLUMN company_info.exchange_id IS 'Foreign key to exchanges table';
COMMENT ON COLUMN company_info.name IS 'Short company name for display';
COMMENT ON COLUMN company_info.company_name IS 'Full legal company name';
COMMENT ON COLUMN company_info.exchange IS 'Stock exchange where listed';
COMMENT ON COLUMN company_info.sector IS 'Business sector classification';
COMMENT ON COLUMN company_info.industry IS 'Industry classification within sector';
COMMENT ON COLUMN company_info.market_cap IS 'Market capitalization in company currency';
COMMENT ON COLUMN company_info.employees IS 'Number of employees';
COMMENT ON COLUMN company_info.revenue IS 'Annual revenue in company currency';
COMMENT ON COLUMN company_info.net_income IS 'Annual net income in company currency';
COMMENT ON COLUMN company_info.pe_ratio IS 'Price-to-earnings ratio';
COMMENT ON COLUMN company_info.pb_ratio IS 'Price-to-book ratio';
COMMENT ON COLUMN company_info.dividend_yield IS 'Annual dividend yield as decimal (0.025 = 2.5%)';
COMMENT ON COLUMN company_info.description IS 'Company business description';
COMMENT ON COLUMN company_info.website IS 'Company website URL';
COMMENT ON COLUMN company_info.ceo IS 'Chief Executive Officer name';
COMMENT ON COLUMN company_info.headquarters IS 'Company headquarters location';
COMMENT ON COLUMN company_info.founded IS 'Year company was founded';
COMMENT ON COLUMN company_info.phone IS 'Company phone number';
COMMENT ON COLUMN company_info.email IS 'Company email address';
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