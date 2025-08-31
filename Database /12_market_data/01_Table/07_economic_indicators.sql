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
    UNIQUE(indicator_code, country, period_date, data_provider),

    -- Indexes for economic analysis queries
    INDEX idx_economic_indicators_indicator_code (indicator_code),
    INDEX idx_economic_indicators_country (country),
    INDEX idx_economic_indicators_period_date (period_date DESC),
    INDEX idx_economic_indicators_importance (importance_level DESC),
    INDEX idx_economic_indicators_provider (data_provider),
    INDEX idx_economic_indicators_release_date (release_date DESC),
    INDEX idx_economic_indicators_country_date (country, period_date DESC),
    INDEX idx_economic_indicators_code_date (indicator_code, period_date DESC)
);

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
