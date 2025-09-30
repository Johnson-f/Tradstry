-- Updated Earnings Transcripts Upsert Function to match new API-based schema
-- Upserts earnings transcripts data with conflict resolution on symbol, year, quarter, and source
-- Redesigned to match finance-query.onrender.com API response structure

CREATE OR REPLACE FUNCTION upsert_earnings_transcripts(
    -- Required parameters matching API structure (no defaults)
    p_symbol VARCHAR(20),
    p_quarter VARCHAR(10),              -- Q1, Q2, Q3, Q4 (matches API)
    p_year INTEGER,                     -- Fiscal year (matches API)
    p_date TIMESTAMP,                   -- Earnings call date (matches API)
    p_transcript TEXT,                  -- Complete transcript text (matches API)
    p_participants JSONB,               -- Array of participant names (matches API)
    
    -- API metadata parameters
    p_source VARCHAR(50) DEFAULT 'finance-query-api',
    p_transcripts_id INTEGER DEFAULT NULL,
    p_retrieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Exchange parameters (for automatic exchange handling)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Optional parameters (with defaults matching table schema)
    p_exchange_id INTEGER DEFAULT NULL,
    p_transcript_length INTEGER DEFAULT NULL,
    p_transcript_language VARCHAR(5) DEFAULT 'en',
    p_reported_eps DECIMAL(10,4) DEFAULT NULL,
    p_reported_revenue BIGINT DEFAULT NULL,
    p_guidance_eps DECIMAL(10,4) DEFAULT NULL,
    p_guidance_revenue BIGINT DEFAULT NULL,
    p_overall_sentiment DECIMAL(3,2) DEFAULT NULL,
    p_confidence_score DECIMAL(3,2) DEFAULT NULL,
    p_key_themes TEXT[] DEFAULT NULL,
    p_risk_factors TEXT[] DEFAULT NULL
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

    -- Step 2: Insert/update earnings transcript data (updated for new schema)
    INSERT INTO earnings_transcripts (
        symbol, 
        exchange_id, 
        quarter, 
        year, 
        date,
        transcript, 
        participants, 
        source,
        transcripts_id,
        retrieved_at,
        transcript_length, 
        transcript_language,
        reported_eps, 
        reported_revenue, 
        guidance_eps,
        guidance_revenue, 
        overall_sentiment, 
        confidence_score, 
        key_themes,
        risk_factors, 
        created_at, 
        updated_at
    ) VALUES (
        p_symbol, 
        v_exchange_id, 
        p_quarter, 
        p_year, 
        p_date,
        p_transcript, 
        p_participants, 
        p_source,
        p_transcripts_id,
        p_retrieved_at,
        p_transcript_length, 
        p_transcript_language,
        p_reported_eps, 
        p_reported_revenue, 
        p_guidance_eps,
        p_guidance_revenue, 
        p_overall_sentiment, 
        p_confidence_score, 
        p_key_themes,
        p_risk_factors, 
        CURRENT_TIMESTAMP, 
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, year, quarter, source) 
    DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, earnings_transcripts.exchange_id),
        date = EXCLUDED.date,  -- Always update (required field)
        transcript = EXCLUDED.transcript,  -- Always update (required field)
        participants = EXCLUDED.participants,  -- Always update (required field)
        transcripts_id = COALESCE(EXCLUDED.transcripts_id, earnings_transcripts.transcripts_id),
        retrieved_at = EXCLUDED.retrieved_at,  -- Always update to track latest retrieval
        transcript_length = COALESCE(EXCLUDED.transcript_length, earnings_transcripts.transcript_length),
        transcript_language = COALESCE(EXCLUDED.transcript_language, earnings_transcripts.transcript_language),
        reported_eps = COALESCE(EXCLUDED.reported_eps, earnings_transcripts.reported_eps),
        reported_revenue = COALESCE(EXCLUDED.reported_revenue, earnings_transcripts.reported_revenue),
        guidance_eps = COALESCE(EXCLUDED.guidance_eps, earnings_transcripts.guidance_eps),
        guidance_revenue = COALESCE(EXCLUDED.guidance_revenue, earnings_transcripts.guidance_revenue),
        overall_sentiment = COALESCE(EXCLUDED.overall_sentiment, earnings_transcripts.overall_sentiment),
        confidence_score = COALESCE(EXCLUDED.confidence_score, earnings_transcripts.confidence_score),
        key_themes = COALESCE(EXCLUDED.key_themes, earnings_transcripts.key_themes),
        risk_factors = COALESCE(EXCLUDED.risk_factors, earnings_transcripts.risk_factors),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_transcript_id;

    RETURN v_transcript_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comments
COMMENT ON FUNCTION upsert_earnings_transcripts IS 'Upserts earnings transcripts data from finance-query API with conflict resolution on symbol, year, quarter, and source. Participants stored as JSONB array. Handles exchange upsert automatically.';


-- =====================================================
-- TEST SCRIPT FOR SUPABASE SQL EDITOR
-- =====================================================

/*
-- Test 1: Insert new earnings transcript matching API structure
SELECT upsert_earnings_transcripts(
    p_symbol => 'TSLA',
    p_quarter => 'Q3',
    p_year => 2024,
    p_date => '2024-09-15T00:00:00'::timestamp,
    p_transcript => 'Travis Axelrod: Good afternoon, everyone, and welcome to Tesla''s Third Quarter 2024 Q&A webcast...',
    p_participants => '["Travis Axelrod", "Elon Musk", "Ashok Elluswamy", "Vaibhav Taneja", "Lars Moravy", "Ferragu Pierre", "Adam Jonas"]'::jsonb,
    
    -- API metadata
    p_source => 'finance-query-api',
    p_transcripts_id => 303380,
    p_retrieved_at => '2025-09-23T14:41:46.502327'::timestamp,
    
    -- Exchange information
    p_exchange_code => 'NASDAQ',
    p_exchange_name => 'NASDAQ Stock Market',
    p_exchange_country => 'USA',
    p_exchange_timezone => 'America/New_York',
    
    -- Optional analysis data
    p_transcript_length => 50000,
    p_reported_eps => 0.72,
    p_reported_revenue => 25182000000,
    p_overall_sentiment => 0.85,
    p_confidence_score => 0.92,
    p_key_themes => ARRAY['Cybercab', 'FSD improvements', 'Energy storage growth', 'Optimus development'],
    p_risk_factors => ARRAY['Regulatory approval delays', 'Competition in EV market']
) AS transcript_id;

-- Test 2: Update existing transcript (same symbol, year, quarter, source)
SELECT upsert_earnings_transcripts(
    p_symbol => 'TSLA',
    p_quarter => 'Q3',
    p_year => 2024,
    p_date => '2024-09-15T00:00:00'::timestamp,
    p_transcript => 'Updated transcript with additional Q&A section...',
    p_participants => '["Travis Axelrod", "Elon Musk", "Ashok Elluswamy", "Vaibhav Taneja"]'::jsonb,
    p_overall_sentiment => 0.90,  -- Updated sentiment
    p_confidence_score => 0.95    -- Updated confidence
) AS updated_transcript_id;

-- Test 3: Minimal required parameters only
SELECT upsert_earnings_transcripts(
    p_symbol => 'AAPL',
    p_quarter => 'Q1',
    p_year => 2025,
    p_date => '2025-01-30T17:00:00'::timestamp,
    p_transcript => 'Apple Q1 2025 earnings transcript...',
    p_participants => '["Tim Cook", "Luca Maestri"]'::jsonb
) AS minimal_transcript_id;

-- Test 4: Query participants using JSONB operators
-- Find transcripts where Elon Musk participated
SELECT id, symbol, quarter, year, participants 
FROM earnings_transcripts 
WHERE participants ? 'Elon Musk';

-- Find all participants for a specific transcript
SELECT 
    symbol,
    quarter, 
    year,
    jsonb_array_elements_text(participants) AS participant_name
FROM earnings_transcripts 
WHERE symbol = 'TSLA' AND year = 2024 AND quarter = 'Q3';

-- Verify the insertions (updated for new schema)
SELECT 
    et.id,
    et.symbol,
    et.quarter,
    et.year,
    et.date,
    et.source,
    et.transcripts_id,
    et.overall_sentiment,
    et.participants,
    et.created_at
FROM earnings_transcripts et
ORDER BY et.created_at DESC 
LIMIT 5;

-- Example: RAG integration - Index transcript for AI context retrieval
-- This would be called by your backend service to enable AI chat context
SELECT upsert_rag_market_document(
    p_user_id => 'system',  -- System-generated content
    p_document_type => 'earnings_transcript',
    p_title => 'TSLA Q3 2024 Earnings Call',
    p_content => 'Travis Axelrod: Good afternoon, everyone, and welcome to Tesla''s Third Quarter 2024 Q&A webcast...',
    p_symbol => 'TSLA',
    p_metadata => jsonb_build_object(
        'quarter', 'Q3',
        'year', 2024,
        'participants', '["Travis Axelrod", "Elon Musk", "Ashok Elluswamy"]'::jsonb,
        'sentiment', 0.85,
        'source', 'finance-query-api'
    ),
    p_expires_at => (CURRENT_DATE + INTERVAL '2 years')::timestamp  -- Keep for 2 years
) AS rag_document_id;
*/