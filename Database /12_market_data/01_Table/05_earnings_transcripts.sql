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

    -- Analysis fields (computed/enhanced data)
    overall_sentiment DECIMAL(3,2),     -- -1.0 to 1.0 sentiment score
    confidence_score DECIMAL(3,2),      -- Confidence in sentiment analysis
    key_themes TEXT[],                  -- Array of key themes discussed
    risk_factors TEXT[],                -- Array of risk factors mentioned

    -- Financial results summary (extracted from transcript)
    reported_eps DECIMAL(10,4),
    reported_revenue BIGINT,
    guidance_eps DECIMAL(10,4),         -- Next year EPS guidance
    guidance_revenue BIGINT,            -- Next year revenue guidance

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
CREATE INDEX IF NOT EXISTS idx_earnings_transcripts_source ON earnings_transcripts (source);
CREATE INDEX IF NOT EXISTS idx_earnings_transcripts_sentiment ON earnings_transcripts (overall_sentiment);
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
