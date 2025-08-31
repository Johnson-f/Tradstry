-- Earnings Call Transcript Data Table - GLOBAL SHARED DATA
-- This table stores earnings call transcripts accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores earnings call transcripts and participant information from providers

CREATE TABLE IF NOT EXISTS earnings_transcripts (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Earnings period information
    earnings_date DATE NOT NULL,
    fiscal_quarter VARCHAR(10) NOT NULL,  -- 'Q1', 'Q2', 'Q3', 'Q4'
    fiscal_year INTEGER NOT NULL,

    -- Transcript content
    transcript_title VARCHAR(500),
    full_transcript TEXT NOT NULL,  -- Complete transcript text
    transcript_length INTEGER,      -- Word count or character count
    transcript_language VARCHAR(5) DEFAULT 'en',

    -- Conference call details
    conference_call_date TIMESTAMP,
    conference_call_duration INTERVAL,  -- Duration of the call
    audio_recording_url TEXT,
    presentation_url TEXT,          -- Link to earnings presentation/slides

    -- Financial results summary (extracted from transcript)
    reported_eps DECIMAL(10,4),
    reported_revenue BIGINT,
    guidance_eps DECIMAL(10,4),     -- Next year EPS guidance
    guidance_revenue BIGINT,        -- Next year revenue guidance

    -- Sentiment and analysis
    overall_sentiment DECIMAL(3,2), -- -1.0 to 1.0 sentiment score
    confidence_score DECIMAL(3,2),  -- Confidence in sentiment analysis
    key_themes TEXT[],              -- Array of key themes discussed
    risk_factors TEXT[],            -- Array of risk factors mentioned

    -- Provider and audit info
    data_provider VARCHAR(50) NOT NULL,
    transcript_quality VARCHAR(20) DEFAULT 'complete',  -- 'complete', 'partial', 'summary'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one transcript per symbol per quarter per year per provider
    UNIQUE(symbol, fiscal_year, fiscal_quarter, data_provider),

    -- Indexes for transcript analysis queries
    INDEX idx_earnings_transcripts_symbol (symbol),
    INDEX idx_earnings_transcripts_earnings_date (earnings_date DESC),
    INDEX idx_earnings_transcripts_fiscal_period (fiscal_year, fiscal_quarter),
    INDEX idx_earnings_transcripts_provider (data_provider),
    INDEX idx_earnings_transcripts_sentiment (overall_sentiment),
    INDEX idx_earnings_transcripts_symbol_date (symbol, earnings_date DESC),
    INDEX idx_earnings_transcripts_quality (transcript_quality)
);

-- Participants table for earnings calls
CREATE TABLE IF NOT EXISTS transcript_participants (
    id SERIAL PRIMARY KEY,
    transcript_id INTEGER REFERENCES earnings_transcripts(id) ON DELETE CASCADE,
    participant_name VARCHAR(255) NOT NULL,
    participant_title VARCHAR(255),    -- CEO, CFO, Analyst, etc.
    participant_company VARCHAR(255),  -- Company they represent
    participant_type VARCHAR(20),      -- 'executive', 'analyst', 'other'
    speaking_time INTERVAL,            -- Total time this participant spoke
    question_count INTEGER DEFAULT 0, -- Number of questions asked (for analysts)

    -- Indexes for participant queries
    INDEX idx_transcript_participants_transcript_id (transcript_id),
    INDEX idx_transcript_participants_participant_type (participant_type),
    INDEX idx_transcript_participants_name (participant_name)
);

-- Add table comments
COMMENT ON TABLE earnings_transcripts IS 'Earnings call transcripts and analysis from multiple market data providers';
COMMENT ON TABLE transcript_participants IS 'Participants in earnings calls with their roles and speaking time';

-- Add column comments for earnings_transcripts
COMMENT ON COLUMN earnings_transcripts.symbol IS 'Stock ticker symbol';
COMMENT ON COLUMN earnings_transcripts.exchange_id IS 'Foreign key to exchanges table';
COMMENT ON COLUMN earnings_transcripts.earnings_date IS 'Date when earnings were reported';
COMMENT ON COLUMN earnings_transcripts.fiscal_quarter IS 'Fiscal quarter being reported (Q1, Q2, Q3, Q4)';
COMMENT ON COLUMN earnings_transcripts.fiscal_year IS 'Fiscal year being reported';
COMMENT ON COLUMN earnings_transcripts.transcript_title IS 'Title of the earnings call transcript';
COMMENT ON COLUMN earnings_transcripts.full_transcript IS 'Complete text of the earnings call transcript';
COMMENT ON COLUMN earnings_transcripts.transcript_length IS 'Length of transcript (word or character count)';
COMMENT ON COLUMN earnings_transcripts.transcript_language IS 'Language of the transcript';
COMMENT ON COLUMN earnings_transcripts.conference_call_date IS 'Date and time of the conference call';
COMMENT ON COLUMN earnings_transcripts.conference_call_duration IS 'Total duration of the conference call';
COMMENT ON COLUMN earnings_transcripts.audio_recording_url IS 'URL to audio recording of the call';
COMMENT ON COLUMN earnings_transcripts.presentation_url IS 'URL to earnings presentation or slides';
COMMENT ON COLUMN earnings_transcripts.reported_eps IS 'EPS reported during the call';
COMMENT ON COLUMN earnings_transcripts.reported_revenue IS 'Revenue reported during the call';
COMMENT ON COLUMN earnings_transcripts.guidance_eps IS 'EPS guidance provided for next year';
COMMENT ON COLUMN earnings_transcripts.guidance_revenue IS 'Revenue guidance provided for next year';
COMMENT ON COLUMN earnings_transcripts.overall_sentiment IS 'Overall sentiment of the call (-1.0 to 1.0)';
COMMENT ON COLUMN earnings_transcripts.confidence_score IS 'Confidence in sentiment analysis';
COMMENT ON COLUMN earnings_transcripts.key_themes IS 'Array of key themes discussed in the call';
COMMENT ON COLUMN earnings_transcripts.risk_factors IS 'Array of risk factors mentioned in the call';
COMMENT ON COLUMN earnings_transcripts.data_provider IS 'Market data provider (finnhub, alpha_vantage, etc.)';
COMMENT ON COLUMN earnings_transcripts.transcript_quality IS 'Quality/completeness of the transcript';

-- Add column comments for transcript_participants
COMMENT ON COLUMN transcript_participants.transcript_id IS 'Foreign key to earnings_transcripts table';
COMMENT ON COLUMN transcript_participants.participant_name IS 'Name of the participant';
COMMENT ON COLUMN transcript_participants.participant_title IS 'Title/role of the participant';
COMMENT ON COLUMN transcript_participants.participant_company IS 'Company the participant represents';
COMMENT ON COLUMN transcript_participants.participant_type IS 'Type of participant (executive, analyst, other)';
COMMENT ON COLUMN transcript_participants.speaking_time IS 'Total time this participant spoke';
COMMENT ON COLUMN transcript_participants.question_count IS 'Number of questions asked by this participant';

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
GRANT SELECT ON transcript_participants TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON earnings_transcripts FROM PUBLIC;
REVOKE UPDATE ON earnings_transcripts FROM PUBLIC;
REVOKE DELETE ON earnings_transcripts FROM PUBLIC;

REVOKE INSERT ON transcript_participants FROM PUBLIC;
REVOKE UPDATE ON transcript_participants FROM PUBLIC;
REVOKE DELETE ON transcript_participants FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the tables
ALTER TABLE earnings_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_participants ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "earnings_transcripts_select_policy" ON earnings_transcripts
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

CREATE POLICY "transcript_participants_select_policy" ON transcript_participants
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "earnings_transcripts_insert_policy" ON earnings_transcripts
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

CREATE POLICY "transcript_participants_insert_policy" ON transcript_participants
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "earnings_transcripts_update_policy" ON earnings_transcripts
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

CREATE POLICY "transcript_participants_update_policy" ON transcript_participants
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "earnings_transcripts_delete_policy" ON earnings_transcripts
    FOR DELETE
    USING (false);  -- Deny all delete operations

CREATE POLICY "transcript_participants_delete_policy" ON transcript_participants
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR EARNINGS TRANSCRIPTS TABLES
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for transcript analysis and display
   - Users cannot modify transcript data integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic transcript data updates

3. DATA INTEGRITY:
   - Transcript data should be treated as immutable by users
   - Only trusted sources can update transcript information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/
