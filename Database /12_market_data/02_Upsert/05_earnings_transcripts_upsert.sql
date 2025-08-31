-- Earnings Transcripts Upsert Function
-- Handles INSERT or UPDATE operations for earnings_transcripts table
-- Uses PostgreSQL's ON CONFLICT for atomic upsert operations

CREATE OR REPLACE FUNCTION upsert_earnings_transcript(
    p_symbol VARCHAR(20),
    p_exchange_id INTEGER DEFAULT NULL,
    p_earnings_date DATE,
    p_fiscal_quarter VARCHAR(10),
    p_fiscal_year INTEGER,
    p_transcript_title VARCHAR(500) DEFAULT NULL,
    p_full_transcript TEXT,
    p_transcript_length INTEGER DEFAULT NULL,
    p_transcript_language VARCHAR(5) DEFAULT 'en',
    p_conference_call_date TIMESTAMP DEFAULT NULL,
    p_conference_call_duration INTERVAL DEFAULT NULL,
    p_audio_recording_url TEXT DEFAULT NULL,
    p_presentation_url TEXT DEFAULT NULL,
    p_reported_eps DECIMAL(10,4) DEFAULT NULL,
    p_reported_revenue BIGINT DEFAULT NULL,
    p_guidance_eps DECIMAL(10,4) DEFAULT NULL,
    p_guidance_revenue BIGINT DEFAULT NULL,
    p_overall_sentiment DECIMAL(3,2) DEFAULT NULL,
    p_confidence_score DECIMAL(3,2) DEFAULT NULL,
    p_key_themes TEXT[] DEFAULT NULL,
    p_risk_factors TEXT[] DEFAULT NULL,
    p_data_provider VARCHAR(50),
    p_transcript_quality VARCHAR(20) DEFAULT 'complete'
)
RETURNS INTEGER AS $$
DECLARE
    result_id INTEGER;
BEGIN
    -- Attempt to insert or update the earnings transcript record
    INSERT INTO earnings_transcripts (
        symbol,
        exchange_id,
        earnings_date,
        fiscal_quarter,
        fiscal_year,
        transcript_title,
        full_transcript,
        transcript_length,
        transcript_language,
        conference_call_date,
        conference_call_duration,
        audio_recording_url,
        presentation_url,
        reported_eps,
        reported_revenue,
        guidance_eps,
        guidance_revenue,
        overall_sentiment,
        confidence_score,
        key_themes,
        risk_factors,
        data_provider,
        transcript_quality,
        updated_at
    ) VALUES (
        p_symbol,
        p_exchange_id,
        p_earnings_date,
        p_fiscal_quarter,
        p_fiscal_year,
        p_transcript_title,
        p_full_transcript,
        p_transcript_length,
        p_transcript_language,
        p_conference_call_date,
        p_conference_call_duration,
        p_audio_recording_url,
        p_presentation_url,
        p_reported_eps,
        p_reported_revenue,
        p_guidance_eps,
        p_guidance_revenue,
        p_overall_sentiment,
        p_confidence_score,
        p_key_themes,
        p_risk_factors,
        p_data_provider,
        p_transcript_quality,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, fiscal_year, fiscal_quarter, data_provider)
    DO UPDATE SET
        exchange_id = EXCLUDED.exchange_id,
        earnings_date = EXCLUDED.earnings_date,
        transcript_title = EXCLUDED.transcript_title,
        full_transcript = EXCLUDED.full_transcript,
        transcript_length = EXCLUDED.transcript_length,
        transcript_language = EXCLUDED.transcript_language,
        conference_call_date = EXCLUDED.conference_call_date,
        conference_call_duration = EXCLUDED.conference_call_duration,
        audio_recording_url = EXCLUDED.audio_recording_url,
        presentation_url = EXCLUDED.presentation_url,
        reported_eps = EXCLUDED.reported_eps,
        reported_revenue = EXCLUDED.reported_revenue,
        guidance_eps = EXCLUDED.guidance_eps,
        guidance_revenue = EXCLUDED.guidance_revenue,
        overall_sentiment = EXCLUDED.overall_sentiment,
        confidence_score = EXCLUDED.confidence_score,
        key_themes = EXCLUDED.key_themes,
        risk_factors = EXCLUDED.risk_factors,
        transcript_quality = EXCLUDED.transcript_quality,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO result_id;

    -- Log the operation for audit purposes
    RAISE NOTICE 'Earnings transcript upserted for symbol % Q% % from provider %, ID: %',
                 p_symbol, p_fiscal_quarter, p_fiscal_year, p_data_provider, result_id;

    RETURN result_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Error upserting earnings transcript for symbol % Q% %: %',
                       p_symbol, p_fiscal_quarter, p_fiscal_year, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Function to upsert transcript participants
CREATE OR REPLACE FUNCTION upsert_transcript_participant(
    p_transcript_id INTEGER,
    p_participant_name VARCHAR(255),
    p_participant_title VARCHAR(255) DEFAULT NULL,
    p_participant_company VARCHAR(255) DEFAULT NULL,
    p_participant_type VARCHAR(20) DEFAULT 'other',
    p_speaking_time INTERVAL DEFAULT NULL,
    p_question_count INTEGER DEFAULT 0
)
RETURNS INTEGER AS $$
DECLARE
    result_id INTEGER;
BEGIN
    -- Attempt to insert or update the transcript participant record
    INSERT INTO transcript_participants (
        transcript_id,
        participant_name,
        participant_title,
        participant_company,
        participant_type,
        speaking_time,
        question_count
    ) VALUES (
        p_transcript_id,
        p_participant_name,
        p_participant_title,
        p_participant_company,
        p_participant_type,
        p_speaking_time,
        p_question_count
    )
    ON CONFLICT (transcript_id, participant_name)
    DO UPDATE SET
        participant_title = EXCLUDED.participant_title,
        participant_company = EXCLUDED.participant_company,
        participant_type = EXCLUDED.participant_type,
        speaking_time = EXCLUDED.speaking_time,
        question_count = EXCLUDED.question_count
    RETURNING id INTO result_id;

    -- Log the operation for audit purposes
    RAISE NOTICE 'Transcript participant upserted: % for transcript %, ID: %',
                 p_participant_name, p_transcript_id, result_id;

    RETURN result_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Error upserting transcript participant %: %',
                       p_participant_name, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Add function comments
COMMENT ON FUNCTION upsert_earnings_transcript(
    VARCHAR(20), INTEGER, DATE, VARCHAR(10), INTEGER, VARCHAR(500),
    TEXT, INTEGER, VARCHAR(5), TIMESTAMP, INTERVAL, TEXT, TEXT,
    DECIMAL(10,4), BIGINT, DECIMAL(10,4), BIGINT, DECIMAL(3,2),
    DECIMAL(3,2), TEXT[], TEXT[], VARCHAR(50), VARCHAR(20)
) IS 'Upserts earnings transcript data. Inserts new record or updates existing based on symbol + fiscal_year + fiscal_quarter + data_provider.';

COMMENT ON FUNCTION upsert_transcript_participant(
    INTEGER, VARCHAR(255), VARCHAR(255), VARCHAR(255), VARCHAR(20),
    INTERVAL, INTEGER
) IS 'Upserts transcript participant data. Inserts new record or updates existing based on transcript_id + participant_name.';

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Example 1: Insert new earnings transcript
SELECT upsert_earnings_transcript(
    'AAPL',           -- symbol
    1,               -- exchange_id
    '2024-01-25',    -- earnings_date
    'Q1',            -- fiscal_quarter
    2024,            -- fiscal_year
    'Apple Inc. Q1 2024 Earnings Call Transcript', -- transcript_title
    'Operator: Good afternoon and welcome to Apple Inc. Q1 2024 earnings call...', -- full_transcript
    15420,           -- transcript_length (word count)
    'en',            -- transcript_language
    '2024-01-25 16:30:00', -- conference_call_date
    '01:15:00',      -- conference_call_duration
    'https://apple.com/investor/audio', -- audio_recording_url
    'https://apple.com/investor/presentation', -- presentation_url
    2.46,            -- reported_eps
    119400000000,    -- reported_revenue
    6.50,            -- guidance_eps
    360000000000,    -- guidance_revenue
    0.15,            -- overall_sentiment
    0.85,            -- confidence_score
    ARRAY['revenue growth', 'services growth', 'AI investment'], -- key_themes
    ARRAY['supply chain constraints', 'geopolitical risks'], -- risk_factors
    'finnhub',        -- data_provider
    'complete'       -- transcript_quality
);

-- Example 2: Add participants to the transcript
-- First get the transcript ID from the previous insert
SELECT upsert_transcript_participant(
    1,               -- transcript_id (from previous insert)
    'Tim Cook',      -- participant_name
    'CEO',           -- participant_title
    'Apple Inc.',    -- participant_company
    'executive',     -- participant_type
    '00:12:30',      -- speaking_time
    0                -- question_count
);

SELECT upsert_transcript_participant(
    1,               -- transcript_id
    'Luca Maestri',  -- participant_name
    'CFO',           -- participant_title
    'Apple Inc.',    -- participant_company
    'executive',     -- participant_type
    '00:15:45',      -- speaking_time
    0                -- question_count
);

SELECT upsert_transcript_participant(
    1,               -- transcript_id
    'John Doe',      -- participant_name
    'Analyst',       -- participant_title
    'Investment Bank XYZ', -- participant_company
    'analyst',       -- participant_type
    '00:03:20',      -- speaking_time
    3                -- question_count
);

-- Example 3: Update existing transcript with new analysis
SELECT upsert_earnings_transcript(
    'AAPL',
    1,
    '2024-01-25',    -- Same date
    'Q1',            -- Same quarter
    2024,            -- Same year
    'Apple Inc. Q1 2024 Earnings Call Transcript',
    'Operator: Good afternoon...', -- Updated transcript
    15420,
    'en',
    '2024-01-25 16:30:00',
    '01:15:00',
    'https://apple.com/investor/audio',
    'https://apple.com/investor/presentation',
    2.46,
    119400000000,
    6.50,
    360000000000,
    0.25,            -- Updated sentiment analysis
    0.90,            -- Updated confidence
    ARRAY['revenue growth', 'services growth', 'AI investment', 'margin expansion'], -- Updated themes
    ARRAY['supply chain constraints', 'geopolitical risks', 'competition'], -- Updated risks
    'finnhub',        -- Same provider
    'complete'
);

-- Batch processing example
-- Your application can process multiple transcripts and participants
*/

-- =====================================================
-- FUNCTION FEATURES
-- =====================================================

/*
FUNCTION FEATURES:

1. ATOMIC UPSERT:
   - Uses PostgreSQL ON CONFLICT for thread-safe operations
   - Either inserts new record or updates existing
   - Based on unique constraints for both tables
   - No race conditions or duplicate data

2. COMPREHENSIVE PARAMETERS:
   - All earnings_transcripts table columns supported
   - All transcript_participants table columns supported
   - Optional parameters with sensible defaults
   - Type-safe with proper data types for all parameters

3. SENTIMENT ANALYSIS:
   - Supports sentiment scores and confidence levels
   - Array-based key themes and risk factors
   - Enables advanced transcript analysis

4. PARTICIPANT TRACKING:
   - Tracks speaking time and question counts
   - Supports different participant types (executive, analyst, other)
   - Enables analysis of call dynamics

5. AUDIT TRAIL:
   - Automatically updates updated_at timestamp
   - Logs operations for monitoring
   - Returns the record ID for reference

INTEGRATION NOTES:

- Call upsert_earnings_transcript first to create/get transcript ID
- Then call upsert_transcript_participant for each participant
- Use the returned IDs for logging or further processing
- Handle exceptions in your application code
- Consider batch processing for multiple transcripts
- Functions support both new inserts and updates seamlessly
*/
