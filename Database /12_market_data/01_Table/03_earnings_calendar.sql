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
    UNIQUE(symbol, fiscal_year, fiscal_quarter, data_provider),

    -- Indexes for earnings calendar queries
    INDEX idx_earnings_calendar_symbol (symbol),
    INDEX idx_earnings_calendar_earnings_date (earnings_date),
    INDEX idx_earnings_calendar_fiscal_period (fiscal_year, fiscal_quarter),
    INDEX idx_earnings_calendar_status (status),
    INDEX idx_earnings_calendar_provider (data_provider),
    INDEX idx_earnings_calendar_symbol_date (symbol, earnings_date),
    INDEX idx_earnings_calendar_date_status (earnings_date, status),
    INDEX idx_earnings_calendar_sector_date (sector, earnings_date)
);

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
