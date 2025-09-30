-- =====================================================
-- EARNINGS TRANSCRIPTS SELECT FUNCTIONS
-- Comprehensive query functions for earnings call transcripts
-- Supports full-text search, participant filtering, and period-based queries
-- =====================================================

-- 1. GET TRANSCRIPTS FOR A SYMBOL
-- Get all earnings transcripts for a specific stock symbol
CREATE OR REPLACE FUNCTION get_earnings_transcripts(
    p_symbol VARCHAR(20),
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    exchange_id INTEGER,
    quarter VARCHAR(10),
    year INTEGER,
    date TIMESTAMP,
    transcript TEXT,
    participants JSONB,
    transcript_length INTEGER,
    transcript_language VARCHAR(5),
    source VARCHAR(50),
    transcripts_id INTEGER,
    retrieved_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        et.id,
        et.symbol,
        et.exchange_id,
        et.quarter,
        et.year,
        et.date,
        et.transcript,
        et.participants,
        et.transcript_length,
        et.transcript_language,
        et.source,
        et.transcripts_id,
        et.retrieved_at,
        et.created_at,
        et.updated_at
    FROM earnings_transcripts et
    WHERE et.symbol = UPPER(p_symbol)
    ORDER BY et.date DESC, et.year DESC, et.quarter DESC
    LIMIT p_limit;
END;
$$;

-- 2. GET TRANSCRIPT BY SYMBOL, QUARTER, AND YEAR
-- Get a specific earnings transcript by period
CREATE OR REPLACE FUNCTION get_earnings_transcript_by_period(
    p_symbol VARCHAR(20),
    p_year INTEGER,
    p_quarter VARCHAR(10)
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    exchange_id INTEGER,
    quarter VARCHAR(10),
    year INTEGER,
    date TIMESTAMP,
    transcript TEXT,
    participants JSONB,
    transcript_length INTEGER,
    transcript_language VARCHAR(5),
    source VARCHAR(50),
    transcripts_id INTEGER,
    retrieved_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        et.id,
        et.symbol,
        et.exchange_id,
        et.quarter,
        et.year,
        et.date,
        et.transcript,
        et.participants,
        et.transcript_length,
        et.transcript_language,
        et.source,
        et.transcripts_id,
        et.retrieved_at,
        et.created_at,
        et.updated_at
    FROM earnings_transcripts et
    WHERE et.symbol = UPPER(p_symbol)
      AND et.year = p_year
      AND et.quarter = UPPER(p_quarter)
    ORDER BY et.retrieved_at DESC
    LIMIT 1;
END;
$$;

-- 3. GET LATEST TRANSCRIPT FOR A SYMBOL
-- Get the most recent earnings transcript for a symbol
CREATE OR REPLACE FUNCTION get_latest_earnings_transcript(
    p_symbol VARCHAR(20)
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    exchange_id INTEGER,
    quarter VARCHAR(10),
    year INTEGER,
    date TIMESTAMP,
    transcript TEXT,
    participants JSONB,
    transcript_length INTEGER,
    transcript_language VARCHAR(5),
    source VARCHAR(50),
    transcripts_id INTEGER,
    retrieved_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        et.id,
        et.symbol,
        et.exchange_id,
        et.quarter,
        et.year,
        et.date,
        et.transcript,
        et.participants,
        et.transcript_length,
        et.transcript_language,
        et.source,
        et.transcripts_id,
        et.retrieved_at,
        et.created_at,
        et.updated_at
    FROM earnings_transcripts et
    WHERE et.symbol = UPPER(p_symbol)
    ORDER BY et.date DESC, et.year DESC, et.quarter DESC
    LIMIT 1;
END;
$$;

-- 4. GET RECENT TRANSCRIPTS (ACROSS ALL SYMBOLS)
-- Get most recent earnings transcripts across all symbols
CREATE OR REPLACE FUNCTION get_recent_earnings_transcripts(
    p_days_back INTEGER DEFAULT 90,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    quarter VARCHAR(10),
    year INTEGER,
    date TIMESTAMP,
    transcript_length INTEGER,
    participants_count INTEGER,
    source VARCHAR(50),
    retrieved_at TIMESTAMP
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        et.id,
        et.symbol,
        et.quarter,
        et.year,
        et.date,
        et.transcript_length,
        jsonb_array_length(et.participants) as participants_count,
        et.source,
        et.retrieved_at
    FROM earnings_transcripts et
    WHERE et.date >= (CURRENT_TIMESTAMP - INTERVAL '1 day' * p_days_back)
    ORDER BY et.date DESC, et.retrieved_at DESC
    LIMIT p_limit;
END;
$$;

-- 5. SEARCH TRANSCRIPTS BY TEXT
-- Full-text search within transcript content
CREATE OR REPLACE FUNCTION search_earnings_transcripts(
    p_search_text TEXT,
    p_symbol VARCHAR(20) DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    quarter VARCHAR(10),
    year INTEGER,
    date TIMESTAMP,
    transcript_snippet TEXT,
    transcript_length INTEGER,
    participants JSONB,
    source VARCHAR(50)
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        et.id,
        et.symbol,
        et.quarter,
        et.year,
        et.date,
        LEFT(et.transcript, 500) as transcript_snippet,
        et.transcript_length,
        et.participants,
        et.source
    FROM earnings_transcripts et
    WHERE (p_symbol IS NULL OR et.symbol = UPPER(p_symbol))
      AND et.transcript ILIKE '%' || p_search_text || '%'
    ORDER BY et.date DESC
    LIMIT p_limit;
END;
$$;

-- 6. GET TRANSCRIPTS BY PARTICIPANT
-- Find transcripts where a specific participant spoke
CREATE OR REPLACE FUNCTION get_transcripts_by_participant(
    p_participant_name TEXT,
    p_symbol VARCHAR(20) DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    quarter VARCHAR(10),
    year INTEGER,
    date TIMESTAMP,
    participants JSONB,
    transcript_length INTEGER,
    source VARCHAR(50)
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        et.id,
        et.symbol,
        et.quarter,
        et.year,
        et.date,
        et.participants,
        et.transcript_length,
        et.source
    FROM earnings_transcripts et
    WHERE (p_symbol IS NULL OR et.symbol = UPPER(p_symbol))
      AND et.participants::text ILIKE '%' || p_participant_name || '%'
    ORDER BY et.date DESC
    LIMIT p_limit;
END;
$$;

-- 7. GET TRANSCRIPTS BY DATE RANGE
-- Get transcripts within a specific date range
CREATE OR REPLACE FUNCTION get_transcripts_by_date_range(
    p_start_date TIMESTAMP,
    p_end_date TIMESTAMP,
    p_symbol VARCHAR(20) DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    quarter VARCHAR(10),
    year INTEGER,
    date TIMESTAMP,
    transcript_length INTEGER,
    participants_count INTEGER,
    source VARCHAR(50),
    retrieved_at TIMESTAMP
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        et.id,
        et.symbol,
        et.quarter,
        et.year,
        et.date,
        et.transcript_length,
        jsonb_array_length(et.participants) as participants_count,
        et.source,
        et.retrieved_at
    FROM earnings_transcripts et
    WHERE et.date >= p_start_date
      AND et.date <= p_end_date
      AND (p_symbol IS NULL OR et.symbol = UPPER(p_symbol))
    ORDER BY et.date DESC
    LIMIT p_limit;
END;
$$;

-- 8. GET TRANSCRIPTS BY YEAR
-- Get all transcripts for a specific fiscal year
CREATE OR REPLACE FUNCTION get_transcripts_by_year(
    p_year INTEGER,
    p_symbol VARCHAR(20) DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    quarter VARCHAR(10),
    year INTEGER,
    date TIMESTAMP,
    transcript_length INTEGER,
    participants_count INTEGER,
    source VARCHAR(50)
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        et.id,
        et.symbol,
        et.quarter,
        et.year,
        et.date,
        et.transcript_length,
        jsonb_array_length(et.participants) as participants_count,
        et.source
    FROM earnings_transcripts et
    WHERE et.year = p_year
      AND (p_symbol IS NULL OR et.symbol = UPPER(p_symbol))
    ORDER BY et.date DESC, et.quarter DESC
    LIMIT p_limit;
END;
$$;

-- 9. GET TRANSCRIPT STATISTICS
-- Get aggregated statistics about transcripts for a symbol
CREATE OR REPLACE FUNCTION get_transcript_statistics(
    p_symbol VARCHAR(20)
)
RETURNS TABLE (
    symbol VARCHAR(20),
    total_transcripts BIGINT,
    avg_transcript_length NUMERIC,
    min_date TIMESTAMP,
    max_date TIMESTAMP,
    years_covered INTEGER[],
    quarters_available TEXT[]
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p_symbol::VARCHAR(20),
        COUNT(*)::BIGINT as total_transcripts,
        AVG(et.transcript_length) as avg_transcript_length,
        MIN(et.date) as min_date,
        MAX(et.date) as max_date,
        ARRAY_AGG(DISTINCT et.year ORDER BY et.year DESC) as years_covered,
        ARRAY_AGG(DISTINCT et.quarter || ' ' || et.year ORDER BY et.quarter || ' ' || et.year DESC) as quarters_available
    FROM earnings_transcripts et
    WHERE et.symbol = UPPER(p_symbol);
END;
$$;

-- 10. GET TRANSCRIPT METADATA (WITHOUT FULL TEXT)
-- Get transcript metadata without the full transcript text for efficient listing
CREATE OR REPLACE FUNCTION get_transcript_metadata(
    p_symbol VARCHAR(20) DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    quarter VARCHAR(10),
    year INTEGER,
    date TIMESTAMP,
    transcript_length INTEGER,
    participants_count INTEGER,
    transcript_language VARCHAR(5),
    source VARCHAR(50),
    retrieved_at TIMESTAMP
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        et.id,
        et.symbol,
        et.quarter,
        et.year,
        et.date,
        et.transcript_length,
        jsonb_array_length(et.participants) as participants_count,
        et.transcript_language,
        et.source,
        et.retrieved_at
    FROM earnings_transcripts et
    WHERE (p_symbol IS NULL OR et.symbol = UPPER(p_symbol))
    ORDER BY et.date DESC
    LIMIT p_limit;
END;
$$;

-- 11. GET PAGINATED TRANSCRIPTS
-- Get paginated transcript results with flexible sorting
CREATE OR REPLACE FUNCTION get_transcripts_paginated(
    p_symbol VARCHAR(20) DEFAULT NULL,
    p_year INTEGER DEFAULT NULL,
    p_quarter VARCHAR(10) DEFAULT NULL,
    p_offset INTEGER DEFAULT 0,
    p_limit INTEGER DEFAULT 20,
    p_sort_column VARCHAR(50) DEFAULT 'date',
    p_sort_direction VARCHAR(4) DEFAULT 'DESC'
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    quarter VARCHAR(10),
    year INTEGER,
    date TIMESTAMP,
    transcript_length INTEGER,
    participants_count INTEGER,
    source VARCHAR(50),
    retrieved_at TIMESTAMP
) 
LANGUAGE plpgsql
AS $$
DECLARE
    query_text TEXT;
    where_clause TEXT := 'TRUE';
BEGIN
    -- Build WHERE clause
    IF p_symbol IS NOT NULL THEN
        where_clause := where_clause || ' AND et.symbol = UPPER($1)';
    END IF;
    
    IF p_year IS NOT NULL THEN
        where_clause := where_clause || ' AND et.year = $2';
    END IF;
    
    IF p_quarter IS NOT NULL THEN
        where_clause := where_clause || ' AND et.quarter = UPPER($3)';
    END IF;
    
    -- Build dynamic query with sorting
    query_text := format('
        SELECT 
            et.id,
            et.symbol,
            et.quarter,
            et.year,
            et.date,
            et.transcript_length,
            jsonb_array_length(et.participants) as participants_count,
            et.source,
            et.retrieved_at
        FROM earnings_transcripts et
        WHERE %s
        ORDER BY %I %s NULLS LAST
        LIMIT $4 OFFSET $5',
        where_clause,
        p_sort_column, 
        CASE WHEN UPPER(p_sort_direction) = 'ASC' THEN 'ASC' ELSE 'DESC' END
    );
    
    -- Execute with appropriate parameters
    IF p_symbol IS NOT NULL AND p_year IS NOT NULL AND p_quarter IS NOT NULL THEN
        RETURN QUERY EXECUTE query_text 
        USING p_symbol, p_year, p_quarter, p_limit, p_offset;
    ELSIF p_symbol IS NOT NULL AND p_year IS NOT NULL THEN
        RETURN QUERY EXECUTE query_text 
        USING p_symbol, p_year, p_limit, p_offset;
    ELSIF p_symbol IS NOT NULL AND p_quarter IS NOT NULL THEN
        RETURN QUERY EXECUTE query_text 
        USING p_symbol, p_quarter, p_limit, p_offset;
    ELSIF p_symbol IS NOT NULL THEN
        RETURN QUERY EXECUTE query_text 
        USING p_symbol, p_limit, p_offset;
    ELSIF p_year IS NOT NULL THEN
        RETURN QUERY EXECUTE query_text 
        USING p_year, p_limit, p_offset;
    ELSIF p_quarter IS NOT NULL THEN
        RETURN QUERY EXECUTE query_text 
        USING p_quarter, p_limit, p_offset;
    ELSE
        RETURN QUERY EXECUTE query_text 
        USING p_limit, p_offset;
    END IF;
END;
$$;

-- 12. GET UNIQUE PARTICIPANTS
-- Get list of unique participants across transcripts
CREATE OR REPLACE FUNCTION get_unique_participants(
    p_symbol VARCHAR(20) DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    participant_name TEXT,
    appearance_count BIGINT,
    symbols TEXT[],
    latest_appearance TIMESTAMP
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH participant_data AS (
        SELECT 
            jsonb_array_elements_text(et.participants) as participant,
            et.symbol,
            et.date
        FROM earnings_transcripts et
        WHERE (p_symbol IS NULL OR et.symbol = UPPER(p_symbol))
    )
    SELECT 
        pd.participant as participant_name,
        COUNT(*)::BIGINT as appearance_count,
        ARRAY_AGG(DISTINCT pd.symbol ORDER BY pd.symbol) as symbols,
        MAX(pd.date) as latest_appearance
    FROM participant_data pd
    GROUP BY pd.participant
    ORDER BY appearance_count DESC, latest_appearance DESC
    LIMIT p_limit;
END;
$$;

-- 13. GET TRANSCRIPT COUNT BY QUARTER
-- Get count of transcripts grouped by quarter and year
CREATE OR REPLACE FUNCTION get_transcript_count_by_quarter(
    p_symbol VARCHAR(20) DEFAULT NULL
)
RETURNS TABLE (
    year INTEGER,
    quarter VARCHAR(10),
    transcript_count BIGINT,
    avg_length NUMERIC,
    symbols_count BIGINT
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        et.year,
        et.quarter,
        COUNT(*)::BIGINT as transcript_count,
        AVG(et.transcript_length) as avg_length,
        COUNT(DISTINCT et.symbol)::BIGINT as symbols_count
    FROM earnings_transcripts et
    WHERE (p_symbol IS NULL OR et.symbol = UPPER(p_symbol))
    GROUP BY et.year, et.quarter
    ORDER BY et.year DESC, et.quarter DESC;
END;
$$;

-- =====================================================
-- GRANT EXECUTE PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION get_earnings_transcripts TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_earnings_transcript_by_period TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_latest_earnings_transcript TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_recent_earnings_transcripts TO PUBLIC;
GRANT EXECUTE ON FUNCTION search_earnings_transcripts TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_transcripts_by_participant TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_transcripts_by_date_range TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_transcripts_by_year TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_transcript_statistics TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_transcript_metadata TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_transcripts_paginated TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_unique_participants TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_transcript_count_by_quarter TO PUBLIC;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Get all earnings transcripts for AAPL
SELECT * FROM get_earnings_transcripts('AAPL');

-- Get AAPL's Q4 2024 transcript
SELECT * FROM get_earnings_transcript_by_period('AAPL', 2024, 'Q4');

-- Get latest transcript for AAPL
SELECT * FROM get_latest_earnings_transcript('AAPL');

-- Get recent transcripts from last 30 days
SELECT * FROM get_recent_earnings_transcripts(30, 25);

-- Search transcripts containing "guidance" for AAPL
SELECT * FROM search_earnings_transcripts('guidance', 'AAPL', 10);

-- Search all transcripts mentioning "AI" or "artificial intelligence"
SELECT * FROM search_earnings_transcripts('artificial intelligence', NULL, 20);

-- Find transcripts where Tim Cook participated
SELECT * FROM get_transcripts_by_participant('Tim Cook', NULL, 10);

-- Find AAPL transcripts where CFO participated
SELECT * FROM get_transcripts_by_participant('CFO', 'AAPL', 5);

-- Get transcripts from Q1 2024 to Q3 2024
SELECT * FROM get_transcripts_by_date_range(
    '2024-01-01'::timestamp, 
    '2024-09-30'::timestamp, 
    NULL, 
    50
);

-- Get all 2024 transcripts for AAPL
SELECT * FROM get_transcripts_by_year(2024, 'AAPL', 10);

-- Get all 2024 transcripts across all symbols
SELECT * FROM get_transcripts_by_year(2024, NULL, 100);

-- Get transcript statistics for AAPL
SELECT * FROM get_transcript_statistics('AAPL');

-- Get transcript metadata (without full text) for efficient listing
SELECT * FROM get_transcript_metadata('AAPL', 20);

-- Get all transcript metadata across all symbols
SELECT * FROM get_transcript_metadata(NULL, 100);

-- Get paginated transcripts for AAPL sorted by date
SELECT * FROM get_transcripts_paginated('AAPL', NULL, NULL, 0, 20, 'date', 'DESC');

-- Get 2024 transcripts with pagination
SELECT * FROM get_transcripts_paginated(NULL, 2024, NULL, 0, 50, 'date', 'DESC');

-- Get Q4 transcripts across all years and symbols
SELECT * FROM get_transcripts_paginated(NULL, NULL, 'Q4', 0, 50, 'year', 'DESC');

-- Get unique participants for AAPL
SELECT * FROM get_unique_participants('AAPL', 50);

-- Get all unique participants across all symbols
SELECT * FROM get_unique_participants(NULL, 200);

-- Get transcript count by quarter for AAPL
SELECT * FROM get_transcript_count_by_quarter('AAPL');

-- Get overall transcript count by quarter across all symbols
SELECT * FROM get_transcript_count_by_quarter(NULL);

-- Complex query: Find transcripts mentioning "revenue growth" with CEO participation
WITH ceo_transcripts AS (
    SELECT * FROM get_transcripts_by_participant('CEO', NULL, 100)
)
SELECT 
    ct.symbol,
    ct.quarter,
    ct.year,
    ct.date
FROM ceo_transcripts ct
JOIN earnings_transcripts et ON ct.id = et.id
WHERE et.transcript ILIKE '%revenue growth%'
ORDER BY ct.date DESC;
*/
