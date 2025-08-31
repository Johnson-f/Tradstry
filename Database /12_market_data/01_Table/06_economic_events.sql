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
    UNIQUE(event_id, data_provider),

    -- Indexes for economic analysis queries
    INDEX idx_economic_events_event_timestamp (event_timestamp DESC),
    INDEX idx_economic_events_country (country),
    INDEX idx_economic_events_importance (importance DESC),
    INDEX idx_economic_events_category (category),
    INDEX idx_economic_events_status (status),
    INDEX idx_economic_events_provider (data_provider),
    INDEX idx_economic_events_country_timestamp (country, event_timestamp DESC),
    INDEX idx_economic_events_importance_timestamp (importance DESC, event_timestamp DESC)
);

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
