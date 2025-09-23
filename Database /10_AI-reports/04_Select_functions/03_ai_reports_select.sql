-- AI Reports Select Function
-- Retrieves AI reports with flexible filtering, search, and pagination
CREATE OR REPLACE FUNCTION get_ai_reports(
    p_user_id UUID,
    p_report_id UUID DEFAULT NULL,
    p_report_type VARCHAR(50) DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT NULL,
    p_date_range_start DATE DEFAULT NULL,
    p_date_range_end DATE DEFAULT NULL,
    p_search_query TEXT DEFAULT NULL,
    p_similarity_threshold DECIMAL(3,2) DEFAULT 0.8,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_order_by VARCHAR(20) DEFAULT 'created_at',
    p_order_direction VARCHAR(4) DEFAULT 'DESC'
)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    report_type VARCHAR(50),
    title VARCHAR(255),
    content TEXT,
    content_preview TEXT, -- First 200 characters
    insights JSONB,
    recommendations JSONB,
    metrics JSONB,
    date_range_start DATE,
    date_range_end DATE,
    model_used VARCHAR(100),
    processing_time_ms INTEGER,
    confidence_score DECIMAL(3,2),
    status VARCHAR(20),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    similarity_score DECIMAL(3,2) -- Only populated when using vector search
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_query_embedding vector(1536);
    v_sql TEXT;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only access their own reports.';
    END IF;

    -- Validate limit and offset
    IF p_limit < 1 OR p_limit > 100 THEN
        RAISE EXCEPTION 'Limit must be between 1 and 100.';
    END IF;

    IF p_offset < 0 THEN
        RAISE EXCEPTION 'Offset must be non-negative.';
    END IF;

    -- Validate order_by
    IF p_order_by NOT IN ('created_at', 'updated_at', 'title', 'report_type', 'confidence_score') THEN
        RAISE EXCEPTION 'Invalid order_by field. Must be one of: created_at, updated_at, title, report_type, confidence_score.';
    END IF;

    -- Validate order_direction
    IF p_order_direction NOT IN ('ASC', 'DESC') THEN
        RAISE EXCEPTION 'Invalid order_direction. Must be ASC or DESC.';
    END IF;

    -- If searching by specific report ID, return that report
    IF p_report_id IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            ar.id,
            ar.user_id,
            ar.report_type,
            ar.title,
            ar.content,
            LEFT(ar.content, 200)::TEXT as content_preview,
            ar.insights,
            ar.recommendations,
            ar.metrics,
            ar.date_range_start,
            ar.date_range_end,
            ar.model_used,
            ar.processing_time_ms,
            ar.confidence_score,
            ar.status,
            ar.created_at,
            ar.updated_at,
            NULL::DECIMAL(3,2) as similarity_score
        FROM ai_reports ar
        WHERE ar.id = p_report_id AND ar.user_id = p_user_id;
        RETURN;
    END IF;

    -- If using vector search with search query
    IF p_search_query IS NOT NULL AND LENGTH(TRIM(p_search_query)) > 0 THEN
        -- Generate embedding for search query (this would be done by your application)
        -- For now, we'll do text-based search and vector search separately
        
        -- Vector similarity search (requires embedding to be provided by application)
        -- This is a placeholder - in practice, you'd get the embedding from your AI service
        RETURN QUERY
        SELECT 
            ar.id,
            ar.user_id,
            ar.report_type,
            ar.title,
            ar.content,
            LEFT(ar.content, 200)::TEXT as content_preview,
            ar.insights,
            ar.recommendations,
            ar.metrics,
            ar.date_range_start,
            ar.date_range_end,
            ar.model_used,
            ar.processing_time_ms,
            ar.confidence_score,
            ar.status,
            ar.created_at,
            ar.updated_at,
            NULL::DECIMAL(3,2) as similarity_score
        FROM ai_reports ar
        WHERE ar.user_id = p_user_id
            AND (
                ar.title ILIKE '%' || p_search_query || '%' 
                OR ar.content ILIKE '%' || p_search_query || '%'
            )
            AND (p_report_type IS NULL OR ar.report_type = p_report_type)
            AND (p_status IS NULL OR ar.status = p_status)
            AND (p_date_range_start IS NULL OR ar.date_range_start >= p_date_range_start)
            AND (p_date_range_end IS NULL OR ar.date_range_end <= p_date_range_end)
        ORDER BY 
            CASE WHEN p_order_by = 'created_at' AND p_order_direction = 'DESC' THEN ar.created_at END DESC,
            CASE WHEN p_order_by = 'created_at' AND p_order_direction = 'ASC' THEN ar.created_at END ASC,
            CASE WHEN p_order_by = 'updated_at' AND p_order_direction = 'DESC' THEN ar.updated_at END DESC,
            CASE WHEN p_order_by = 'updated_at' AND p_order_direction = 'ASC' THEN ar.updated_at END ASC,
            CASE WHEN p_order_by = 'title' AND p_order_direction = 'DESC' THEN ar.title END DESC,
            CASE WHEN p_order_by = 'title' AND p_order_direction = 'ASC' THEN ar.title END ASC,
            CASE WHEN p_order_by = 'report_type' AND p_order_direction = 'DESC' THEN ar.report_type END DESC,
            CASE WHEN p_order_by = 'report_type' AND p_order_direction = 'ASC' THEN ar.report_type END ASC,
            CASE WHEN p_order_by = 'confidence_score' AND p_order_direction = 'DESC' THEN ar.confidence_score END DESC,
            CASE WHEN p_order_by = 'confidence_score' AND p_order_direction = 'ASC' THEN ar.confidence_score END ASC
        LIMIT p_limit OFFSET p_offset;
        RETURN;
    END IF;

    -- Standard filtered query without search
    RETURN QUERY
    SELECT 
        ar.id,
        ar.user_id,
        ar.report_type,
        ar.title,
        ar.content,
        LEFT(ar.content, 200)::TEXT as content_preview,
        ar.insights,
        ar.recommendations,
        ar.metrics,
        ar.date_range_start,
        ar.date_range_end,
        ar.model_used,
        ar.processing_time_ms,
        ar.confidence_score,
        ar.status,
        ar.created_at,
        ar.updated_at,
        NULL::DECIMAL(3,2) as similarity_score
    FROM ai_reports ar
    WHERE ar.user_id = p_user_id
        AND (p_report_type IS NULL OR ar.report_type = p_report_type)
        AND (p_status IS NULL OR ar.status = p_status)
        AND (p_date_range_start IS NULL OR ar.date_range_start >= p_date_range_start)
        AND (p_date_range_end IS NULL OR ar.date_range_end <= p_date_range_end)
    ORDER BY 
        CASE WHEN p_order_by = 'created_at' AND p_order_direction = 'DESC' THEN ar.created_at END DESC,
        CASE WHEN p_order_by = 'created_at' AND p_order_direction = 'ASC' THEN ar.created_at END ASC,
        CASE WHEN p_order_by = 'updated_at' AND p_order_direction = 'DESC' THEN ar.updated_at END DESC,
        CASE WHEN p_order_by = 'updated_at' AND p_order_direction = 'ASC' THEN ar.updated_at END ASC,
        CASE WHEN p_order_by = 'title' AND p_order_direction = 'DESC' THEN ar.title END DESC,
        CASE WHEN p_order_by = 'title' AND p_order_direction = 'ASC' THEN ar.title END ASC,
        CASE WHEN p_order_by = 'report_type' AND p_order_direction = 'DESC' THEN ar.report_type END DESC,
        CASE WHEN p_order_by = 'report_type' AND p_order_direction = 'ASC' THEN ar.report_type END ASC,
        CASE WHEN p_order_by = 'confidence_score' AND p_order_direction = 'DESC' THEN ar.confidence_score END DESC,
        CASE WHEN p_order_by = 'confidence_score' AND p_order_direction = 'ASC' THEN ar.confidence_score END ASC
    LIMIT p_limit OFFSET p_offset;

END;
$$;

-- Vector similarity search function (requires embedding input)
CREATE OR REPLACE FUNCTION search_ai_reports_by_similarity(
    p_user_id UUID,
    p_query_embedding vector(1536),
    p_similarity_threshold DECIMAL(3,2) DEFAULT 0.8,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    report_type VARCHAR(50),
    title VARCHAR(255),
    content TEXT,
    content_preview TEXT,
    insights JSONB,
    recommendations JSONB,
    metrics JSONB,
    date_range_start DATE,
    date_range_end DATE,
    model_used VARCHAR(100),
    processing_time_ms INTEGER,
    confidence_score DECIMAL(3,2),
    status VARCHAR(20),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    similarity_score DECIMAL(3,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only access their own reports.';
    END IF;

    RETURN QUERY
    SELECT 
        ar.id,
        ar.user_id,
        ar.report_type,
        ar.title,
        ar.content,
        LEFT(ar.content, 200)::TEXT as content_preview,
        ar.insights,
        ar.recommendations,
        ar.metrics,
        ar.date_range_start,
        ar.date_range_end,
        ar.model_used,
        ar.processing_time_ms,
        ar.confidence_score,
        ar.status,
        ar.created_at,
        ar.updated_at,
        (1 - (ar.content_embedding <=> p_query_embedding))::DECIMAL(3,2) as similarity_score
    FROM ai_reports ar
    WHERE ar.user_id = p_user_id
        AND ar.content_embedding IS NOT NULL
        AND (1 - (ar.content_embedding <=> p_query_embedding)) >= p_similarity_threshold
    ORDER BY ar.content_embedding <=> p_query_embedding
    LIMIT p_limit;

END;
$$;
