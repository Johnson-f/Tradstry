-- Earnings Transcripts Upsert Function
-- Upserts earnings transcripts data with conflict resolution on symbol, fiscal_year, fiscal_quarter, and data_provider

CREATE OR REPLACE FUNCTION upsert_earnings_transcripts(
    p_symbol VARCHAR(20),
    p_earnings_date DATE,
    p_fiscal_year INTEGER,
    p_full_transcript TEXT,
    p_fiscal_quarter VARCHAR(10),
    p_data_provider VARCHAR(50),
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
BEGIN
    INSERT INTO earnings_transcripts (
        symbol, exchange_id, earnings_date, fiscal_quarter, fiscal_year,
        transcript_title, full_transcript, transcript_length, transcript_language,
        conference_call_date, conference_call_duration, audio_recording_url,
        presentation_url, reported_eps, reported_revenue, guidance_eps,
        guidance_revenue, overall_sentiment, confidence_score, key_themes,
        risk_factors, transcript_quality, data_provider, created_at, updated_at
    ) VALUES (
        p_symbol, p_exchange_id, p_earnings_date, p_fiscal_quarter, p_fiscal_year,
        p_transcript_title, p_full_transcript, p_transcript_length, p_transcript_language,
        p_conference_call_date, p_conference_call_duration, p_audio_recording_url,
        p_presentation_url, p_reported_eps, p_reported_revenue, p_guidance_eps,
        p_guidance_revenue, p_overall_sentiment, p_confidence_score, p_key_themes,
        p_risk_factors, p_transcript_quality, p_data_provider, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, fiscal_year, fiscal_quarter, data_provider) 
    DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, earnings_transcripts.exchange_id),
        earnings_date = COALESCE(EXCLUDED.earnings_date, earnings_transcripts.earnings_date),
        transcript_title = COALESCE(EXCLUDED.transcript_title, earnings_transcripts.transcript_title),
        full_transcript = COALESCE(EXCLUDED.full_transcript, earnings_transcripts.full_transcript),
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

-- Transcript Participants Upsert Function
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
    INSERT INTO transcript_participants (
        transcript_id, participant_name, participant_title, participant_company,
        participant_type, speaking_time, question_count
    ) VALUES (
        p_transcript_id, p_participant_name, p_participant_title, p_participant_company,
        p_participant_type, p_speaking_time, p_question_count
    )
    ON CONFLICT (transcript_id, participant_name) 
    DO UPDATE SET
        participant_title = COALESCE(EXCLUDED.participant_title, transcript_participants.participant_title),
        participant_company = COALESCE(EXCLUDED.participant_company, transcript_participants.participant_company),
        participant_type = COALESCE(EXCLUDED.participant_type, transcript_participants.participant_type),
        speaking_time = COALESCE(EXCLUDED.speaking_time, transcript_participants.speaking_time),
        question_count = COALESCE(EXCLUDED.question_count, transcript_participants.question_count)
    RETURNING id INTO v_participant_id;

    RETURN v_participant_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comments
COMMENT ON FUNCTION upsert_earnings_transcripts IS 'Upserts earnings transcripts data with conflict resolution on symbol, fiscal_year, fiscal_quarter, and data_provider';
COMMENT ON FUNCTION upsert_transcript_participants IS 'Upserts transcript participants data with conflict resolution on transcript_id and participant_name';
