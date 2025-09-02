-- Updated Earnings Transcripts Upsert Function to match earnings_transcripts table schema
-- Upserts earnings transcripts data with conflict resolution on symbol, fiscal_year, fiscal_quarter, and data_provider

-- Tested 

CREATE OR REPLACE FUNCTION upsert_earnings_transcripts(
    -- Required parameters (no defaults)
    p_symbol VARCHAR(20),
    p_earnings_date DATE,
    p_fiscal_quarter VARCHAR(10),
    p_fiscal_year INTEGER,
    p_full_transcript TEXT,
    p_data_provider VARCHAR(50),
    
    -- Exchange parameters (for automatic exchange handling)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Optional parameters (with defaults matching table schema)
    p_exchange_id INTEGER DEFAULT NULL,
    p_transcript_title VARCHAR(500) DEFAULT NULL,
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
    p_transcript_quality VARCHAR(20) DEFAULT 'complete'
) RETURNS INTEGER AS $$
DECLARE
    v_transcript_id INTEGER;
    v_exchange_id INTEGER;  -- Changed from BIGINT to INTEGER to match table schema
BEGIN
    -- Step 1: Handle exchange upsert if exchange data is provided
    IF p_exchange_code IS NOT NULL THEN
        SELECT upsert_exchange(
            p_exchange_code,
            p_exchange_name,
            p_exchange_country,
            p_exchange_timezone
        ) INTO v_exchange_id;
    ELSE
        v_exchange_id := p_exchange_id;
    END IF;

    -- Step 2: Insert/update earnings transcript data
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
        transcript_quality, 
        data_provider, 
        created_at, 
        updated_at
    ) VALUES (
        p_symbol, 
        v_exchange_id, 
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
        p_transcript_quality, 
        p_data_provider, 
        CURRENT_TIMESTAMP, 
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, fiscal_year, fiscal_quarter, data_provider) 
    DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, earnings_transcripts.exchange_id),
        earnings_date = EXCLUDED.earnings_date,  -- Always update (required field)
        transcript_title = COALESCE(EXCLUDED.transcript_title, earnings_transcripts.transcript_title),
        full_transcript = EXCLUDED.full_transcript,  -- Always update (required field)
        transcript_length = COALESCE(EXCLUDED.transcript_length, earnings_transcripts.transcript_length),
        transcript_language = COALESCE(EXCLUDED.transcript_language, earnings_transcripts.transcript_language),
        conference_call_date = COALESCE(EXCLUDED.conference_call_date, earnings_transcripts.conference_call_date),
        conference_call_duration = COALESCE(EXCLUDED.conference_call_duration, earnings_transcripts.conference_call_duration),
        audio_recording_url = COALESCE(EXCLUDED.audio_recording_url, earnings_transcripts.audio_recording_url),
        presentation_url = COALESCE(EXCLUDED.presentation_url, earnings_transcripts.presentation_url),
        reported_eps = COALESCE(EXCLUDED.reported_eps, earnings_transcripts.reported_eps),
        reported_revenue = COALESCE(EXCLUDED.reported_revenue, earnings_transcripts.reported_revenue),
        guidance_eps = COALESCE(EXCLUDED.guidance_eps, earnings_transcripts.guidance_eps),
        guidance_revenue = COALESCE(EXCLUDED.guidance_revenue, earnings_transcripts.guidance_revenue),
        overall_sentiment = COALESCE(EXCLUDED.overall_sentiment, earnings_transcripts.overall_sentiment),
        confidence_score = COALESCE(EXCLUDED.confidence_score, earnings_transcripts.confidence_score),
        key_themes = COALESCE(EXCLUDED.key_themes, earnings_transcripts.key_themes),
        risk_factors = COALESCE(EXCLUDED.risk_factors, earnings_transcripts.risk_factors),
        transcript_quality = COALESCE(EXCLUDED.transcript_quality, earnings_transcripts.transcript_quality),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_transcript_id;

    RETURN v_transcript_id;
END;
$$ LANGUAGE plpgsql;

-- Updated Transcript Participants Upsert Function
-- Note: The table schema doesn't have a unique constraint on (transcript_id, participant_name)
-- so we'll need to add that constraint or modify the conflict resolution approach

CREATE OR REPLACE FUNCTION upsert_transcript_participants(
    p_transcript_id INTEGER,
    p_participant_name VARCHAR(255),
    p_participant_title VARCHAR(255) DEFAULT NULL,
    p_participant_company VARCHAR(255) DEFAULT NULL,
    p_participant_type VARCHAR(20) DEFAULT NULL,
    p_speaking_time INTERVAL DEFAULT NULL,
    p_question_count INTEGER DEFAULT 0
) RETURNS INTEGER AS $$
DECLARE
    v_participant_id INTEGER;
BEGIN
    -- Since there's no unique constraint defined in the table schema for participants,
    -- we'll first try to find an existing record and update it, otherwise insert
    SELECT id INTO v_participant_id
    FROM transcript_participants
    WHERE transcript_id = p_transcript_id 
      AND participant_name = p_participant_name;

    IF v_participant_id IS NOT NULL THEN
        -- Update existing participant
        UPDATE transcript_participants SET
            participant_title = COALESCE(p_participant_title, participant_title),
            participant_company = COALESCE(p_participant_company, participant_company),
            participant_type = COALESCE(p_participant_type, participant_type),
            speaking_time = COALESCE(p_speaking_time, speaking_time),
            question_count = COALESCE(p_question_count, question_count)
        WHERE id = v_participant_id;
    ELSE
        -- Insert new participant
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
        ) RETURNING id INTO v_participant_id;
    END IF;

    RETURN v_participant_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comments
COMMENT ON FUNCTION upsert_earnings_transcripts IS 'Upserts earnings transcripts data with conflict resolution on symbol, fiscal_year, fiscal_quarter, and data_provider. Handles exchange upsert automatically.';
COMMENT ON FUNCTION upsert_transcript_participants IS 'Upserts transcript participants data with manual conflict resolution on transcript_id and participant_name';


-- =====================================================
-- TEST SCRIPT FOR SUPABASE SQL EDITOR
-- =====================================================

/*
-- Test 1: Insert new earnings transcript with automatic exchange handling
SELECT upsert_earnings_transcripts(
    p_symbol => 'AAPL',
    p_earnings_date => '2025-01-30',
    p_fiscal_quarter => 'Q1',
    p_fiscal_year => 2025,
    p_full_transcript => 'Thank you for joining us today for Apple Q1 2025 earnings call...',
    p_data_provider => 'YahooFinance',
    
    -- Exchange information
    p_exchange_code => 'NASDAQ',
    p_exchange_name => 'NASDAQ Stock Market',
    p_exchange_country => 'USA',
    p_exchange_timezone => 'America/New_York',
    
    -- Transcript details
    p_transcript_title => 'Apple Inc. Q1 2025 Earnings Call',
    p_transcript_length => 15000,
    p_conference_call_date => '2025-01-30 17:00:00'::timestamp,
    p_conference_call_duration => '1 hour 15 minutes'::interval,
    p_reported_eps => 2.18,
    p_reported_revenue => 124500000000,
    p_guidance_eps => 2.25,
    p_guidance_revenue => 128000000000,
    p_overall_sentiment => 0.75,
    p_confidence_score => 0.89,
    p_key_themes => ARRAY['iPhone growth', 'Services revenue', 'AI integration'],
    p_risk_factors => ARRAY['Supply chain challenges', 'Regulatory concerns']
) AS transcript_id;

-- Test 2: Update existing transcript (same symbol, fiscal_year, fiscal_quarter, data_provider)
SELECT upsert_earnings_transcripts(
    p_symbol => 'AAPL',
    p_earnings_date => '2025-01-30',
    p_fiscal_quarter => 'Q1',
    p_fiscal_year => 2025,
    p_full_transcript => 'Updated transcript with additional Q&A section...',
    p_data_provider => 'YahooFinance',
    p_overall_sentiment => 0.80,  -- Updated sentiment
    p_confidence_score => 0.92    -- Updated confidence
) AS updated_transcript_id;

-- Test 3: Minimal required parameters only
SELECT upsert_earnings_transcripts(
    p_symbol => 'MSFT',
    p_earnings_date => '2025-01-25',
    p_fiscal_quarter => 'Q2',
    p_fiscal_year => 2025,
    p_full_transcript => 'Microsoft Q2 2025 earnings transcript...',
    p_data_provider => 'AlphaVantage'
) AS minimal_transcript_id;

-- Test 4: Add participants to the Apple transcript
-- First, get the transcript ID (assuming it's 1 from the first test)
SELECT upsert_transcript_participants(
    p_transcript_id => 1,
    p_participant_name => 'Tim Cook',
    p_participant_title => 'CEO',
    p_participant_company => 'Apple Inc.',
    p_participant_type => 'executive',
    p_speaking_time => '25 minutes'::interval,
    p_question_count => 0
) AS participant_id_1;

SELECT upsert_transcript_participants(
    p_transcript_id => 1,
    p_participant_name => 'Luca Maestri',
    p_participant_title => 'CFO',
    p_participant_company => 'Apple Inc.',
    p_participant_type => 'executive',
    p_speaking_time => '15 minutes'::interval,
    p_question_count => 0
) AS participant_id_2;

SELECT upsert_transcript_participants(
    p_transcript_id => 1,
    p_participant_name => 'John Smith',
    p_participant_title => 'Senior Analyst',
    p_participant_company => 'Goldman Sachs',
    p_participant_type => 'analyst',
    p_speaking_time => '5 minutes'::interval,
    p_question_count => 3
) AS participant_id_3;

-- Verify the insertions
SELECT 
    et.id,
    et.symbol,
    et.earnings_date,
    et.fiscal_quarter,
    et.fiscal_year,
    et.transcript_title,
    et.data_provider,
    et.overall_sentiment,
    et.created_at
FROM earnings_transcripts et
ORDER BY et.created_at DESC 
LIMIT 5;

-- Check participants
SELECT 
    tp.id,
    tp.transcript_id,
    tp.participant_name,
    tp.participant_title,
    tp.participant_type,
    tp.speaking_time,
    tp.question_count
FROM transcript_participants tp
JOIN earnings_transcripts et ON tp.transcript_id = et.id
WHERE et.symbol = 'AAPL'
ORDER BY tp.id;
*/