-- Earnings Data Table - GLOBAL SHARED DATA
-- This table stores earnings data accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores earnings reports, estimates, and guidance from market data providers

CREATE TABLE IF NOT EXISTS earnings_data (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Period information (shared globally)
    fiscal_year INTEGER NOT NULL,
    fiscal_quarter INTEGER CHECK (fiscal_quarter BETWEEN 1 AND 4),
    reported_date DATE NOT NULL,
    report_type VARCHAR(20) DEFAULT 'quarterly',  -- 'annual', 'quarterly'

    -- Earnings per share data
    eps DECIMAL(10,4),  -- Actual EPS
    eps_estimated DECIMAL(10,4),  -- Estimated EPS
    eps_surprise DECIMAL(10,4),  -- EPS surprise (actual - estimated)
    eps_surprise_percent DECIMAL(7,4),  -- Surprise percentage

    -- Revenue data
    revenue BIGINT,  -- Actual revenue
    revenue_estimated BIGINT,  -- Estimated revenue
    revenue_surprise BIGINT,  -- Revenue surprise
    revenue_surprise_percent DECIMAL(7,4),  -- Revenue surprise percentage

    -- Income statement data
    net_income BIGINT,
    gross_profit BIGINT,
    operating_income BIGINT,
    ebitda BIGINT,

    -- Additional metrics
    operating_margin DECIMAL(7,4),
    net_margin DECIMAL(7,4),
    year_over_year_eps_growth DECIMAL(7,4),
    year_over_year_revenue_growth DECIMAL(7,4),

    -- Management guidance
    guidance TEXT,  -- CEO/CFO comments and outlook
    next_year_eps_guidance DECIMAL(10,4),
    next_year_revenue_guidance BIGINT,

    -- Conference call details
    conference_call_date TIMESTAMP,
    transcript_url TEXT,
    audio_url TEXT,

    -- Beat/Miss/Met status
    eps_beat_miss_met VARCHAR(10),  -- 'beat', 'miss', 'met'
    revenue_beat_miss_met VARCHAR(10),  -- 'beat', 'miss', 'met'

    -- Provider and audit info
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per symbol per fiscal period per provider
    UNIQUE(symbol, fiscal_year, fiscal_quarter, data_provider),

    -- Indexes for earnings analysis queries
    INDEX idx_earnings_data_symbol (symbol),
    INDEX idx_earnings_data_reported_date (reported_date DESC),
    INDEX idx_earnings_data_fiscal_period (fiscal_year, fiscal_quarter),
    INDEX idx_earnings_data_eps_surprise (eps_surprise_percent DESC),
    INDEX idx_earnings_data_provider (data_provider),
    INDEX idx_earnings_data_symbol_date (symbol, reported_date DESC),
    INDEX idx_earnings_data_beat_miss (eps_beat_miss_met)
);

-- Add table comment
COMMENT ON TABLE earnings_data IS 'Earnings reports, estimates, and guidance from multiple market data providers';

-- Add column comments
COMMENT ON COLUMN earnings_data.symbol IS 'Stock ticker symbol';
COMMENT ON COLUMN earnings_data.exchange_id IS 'Foreign key to exchanges table';
COMMENT ON COLUMN earnings_data.fiscal_year IS 'Fiscal year for the earnings report';
COMMENT ON COLUMN earnings_data.fiscal_quarter IS 'Fiscal quarter (1-4) for the earnings report';
COMMENT ON COLUMN earnings_data.reported_date IS 'Date when earnings were reported';
COMMENT ON COLUMN earnings_data.report_type IS 'Type of report (annual or quarterly)';
COMMENT ON COLUMN earnings_data.eps IS 'Actual earnings per share';
COMMENT ON COLUMN earnings_data.eps_estimated IS 'Estimated earnings per share before report';
COMMENT ON COLUMN earnings_data.eps_surprise IS 'EPS surprise amount (actual - estimated)';
COMMENT ON COLUMN earnings_data.eps_surprise_percent IS 'EPS surprise percentage';
COMMENT ON COLUMN earnings_data.revenue IS 'Actual revenue reported';
COMMENT ON COLUMN earnings_data.revenue_estimated IS 'Estimated revenue before report';
COMMENT ON COLUMN earnings_data.revenue_surprise IS 'Revenue surprise amount';
COMMENT ON COLUMN earnings_data.revenue_surprise_percent IS 'Revenue surprise percentage';
COMMENT ON COLUMN earnings_data.net_income IS 'Net income for the period';
COMMENT ON COLUMN earnings_data.gross_profit IS 'Gross profit for the period';
COMMENT ON COLUMN earnings_data.operating_income IS 'Operating income for the period';
COMMENT ON COLUMN earnings_data.ebitda IS 'EBITDA for the period';
COMMENT ON COLUMN earnings_data.operating_margin IS 'Operating margin as decimal';
COMMENT ON COLUMN earnings_data.net_margin IS 'Net margin as decimal';
COMMENT ON COLUMN earnings_data.year_over_year_eps_growth IS 'Year-over-year EPS growth rate';
COMMENT ON COLUMN earnings_data.year_over_year_revenue_growth IS 'Year-over-year revenue growth rate';
COMMENT ON COLUMN earnings_data.guidance IS 'Management guidance and comments from earnings call';
COMMENT ON COLUMN earnings_data.next_year_eps_guidance IS 'Management EPS guidance for next year';
COMMENT ON COLUMN earnings_data.next_year_revenue_guidance IS 'Management revenue guidance for next year';
COMMENT ON COLUMN earnings_data.conference_call_date IS 'Date and time of the earnings conference call';
COMMENT ON COLUMN earnings_data.transcript_url IS 'URL to the earnings call transcript';
COMMENT ON COLUMN earnings_data.audio_url IS 'URL to the earnings call audio recording';
COMMENT ON COLUMN earnings_data.eps_beat_miss_met IS 'Whether EPS beat, missed, or met expectations';
COMMENT ON COLUMN earnings_data.revenue_beat_miss_met IS 'Whether revenue beat, missed, or met expectations';
COMMENT ON COLUMN earnings_data.data_provider IS 'Market data provider (alpha_vantage, finnhub, fmp, etc.)';

-- =====================================================
-- EARNINGS DATA TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from earnings_data table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from earnings_data table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON earnings_data TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON earnings_data FROM PUBLIC;
REVOKE UPDATE ON earnings_data FROM PUBLIC;
REVOKE DELETE ON earnings_data FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE earnings_data ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "earnings_data_select_policy" ON earnings_data
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "earnings_data_insert_policy" ON earnings_data
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "earnings_data_update_policy" ON earnings_data
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "earnings_data_delete_policy" ON earnings_data
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR EARNINGS_DATA TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for earnings analysis and display
   - Users cannot modify earnings data integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic earnings data updates

3. DATA INTEGRITY:
   - Earnings data should be treated as immutable by users
   - Only trusted sources can update earnings information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/
