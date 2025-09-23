-- AI Insights Select Function
-- Retrieves AI insights with flexible filtering, search, and pagination
CREATE OR REPLACE FUNCTION get_ai_insights(
    p_user_id UUID,
    p_insight_id UUID DEFAULT NULL,
    p_insight_type VARCHAR(50) DEFAULT NULL,
    p_priority VARCHAR(20) DEFAULT NULL,
    p_actionable BOOLEAN DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_include_expired BOOLEAN DEFAULT FALSE,
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
    insight_type VARCHAR(50),
    title VARCHAR(255),
    description TEXT,
    description_preview TEXT, -- First 200 characters
    insight_embedding vector(1536),
    data_source JSONB,
    confidence_score DECIMAL(3,2),
    priority VARCHAR(20),
    actionable BOOLEAN,
    actions JSONB,
    tags TEXT[],
    valid_until TIMESTAMPTZ,
    is_expired BOOLEAN,
    model_used VARCHAR(100),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    similarity_score DECIMAL(3,2) -- Only populated when using vector search
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only access their own insights.';
    END IF;

    -- Validate limit and offset
    IF p_limit < 1 OR p_limit > 100 THEN
        RAISE EXCEPTION 'Limit must be between 1 and 100.';
    END IF;

    IF p_offset < 0 THEN
        RAISE EXCEPTION 'Offset must be non-negative.';
    END IF;

    -- Validate order_by
    IF p_order_by NOT IN ('created_at', 'updated_at', 'title', 'priority', 'confidence_score', 'valid_until') THEN
        RAISE EXCEPTION 'Invalid order_by field. Must be one of: created_at, updated_at, title, priority, confidence_score, valid_until.';
    END IF;

    -- Validate order_direction
    IF p_order_direction NOT IN ('ASC', 'DESC') THEN
        RAISE EXCEPTION 'Invalid order_direction. Must be ASC or DESC.';
    END IF;

    -- If searching by specific insight ID, return that insight
    IF p_insight_id IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            ai.id,
            ai.user_id,
            ai.insight_type,
            ai.title,
            ai.description,
            LEFT(ai.description, 200)::TEXT as description_preview,
            ai.insight_embedding,
            ai.data_source,
            ai.confidence_score,
            ai.priority,
            ai.actionable,
            ai.actions,
            ai.tags,
            ai.valid_until,
            (ai.valid_until IS NOT NULL AND ai.valid_until <= NOW())::BOOLEAN as is_expired,
            ai.model_used,
            ai.created_at,
            ai.updated_at,
            NULL::DECIMAL(3,2) as similarity_score
        FROM ai_insights ai
        WHERE ai.id = p_insight_id AND ai.user_id = p_user_id;
        RETURN;
    END IF;

    -- If using text search
    IF p_search_query IS NOT NULL AND LENGTH(TRIM(p_search_query)) > 0 THEN
        RETURN QUERY
        SELECT 
            ai.id,
            ai.user_id,
            ai.insight_type,
            ai.title,
            ai.description,
            LEFT(ai.description, 200)::TEXT as description_preview,
            ai.insight_embedding,
            ai.data_source,
            ai.confidence_score,
            ai.priority,
            ai.actionable,
            ai.actions,
            ai.tags,
            ai.valid_until,
            (ai.valid_until IS NOT NULL AND ai.valid_until <= NOW())::BOOLEAN as is_expired,
            ai.model_used,
            ai.created_at,
            ai.updated_at,
            NULL::DECIMAL(3,2) as similarity_score
        FROM ai_insights ai
        WHERE ai.user_id = p_user_id
            AND (
                ai.title ILIKE '%' || p_search_query || '%' 
                OR ai.description ILIKE '%' || p_search_query || '%'
                OR EXISTS (
                    SELECT 1 FROM unnest(ai.tags) AS tag 
                    WHERE tag ILIKE '%' || p_search_query || '%'
                )
            )
            AND (p_insight_type IS NULL OR ai.insight_type = p_insight_type)
            AND (p_priority IS NULL OR ai.priority = p_priority)
            AND (p_actionable IS NULL OR ai.actionable = p_actionable)
            AND (p_tags IS NULL OR ai.tags && p_tags) -- Array overlap operator
            AND (p_include_expired OR ai.valid_until IS NULL OR ai.valid_until > NOW())
        ORDER BY 
            CASE WHEN p_order_by = 'created_at' AND p_order_direction = 'DESC' THEN ai.created_at END DESC,
            CASE WHEN p_order_by = 'created_at' AND p_order_direction = 'ASC' THEN ai.created_at END ASC,
            CASE WHEN p_order_by = 'updated_at' AND p_order_direction = 'DESC' THEN ai.updated_at END DESC,
            CASE WHEN p_order_by = 'updated_at' AND p_order_direction = 'ASC' THEN ai.updated_at END ASC,
            CASE WHEN p_order_by = 'title' AND p_order_direction = 'DESC' THEN ai.title END DESC,
            CASE WHEN p_order_by = 'title' AND p_order_direction = 'ASC' THEN ai.title END ASC,
            CASE WHEN p_order_by = 'priority' AND p_order_direction = 'DESC' THEN 
                CASE ai.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END END ASC,
            CASE WHEN p_order_by = 'priority' AND p_order_direction = 'ASC' THEN 
                CASE ai.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END END DESC,
            CASE WHEN p_order_by = 'confidence_score' AND p_order_direction = 'DESC' THEN ai.confidence_score END DESC,
            CASE WHEN p_order_by = 'confidence_score' AND p_order_direction = 'ASC' THEN ai.confidence_score END ASC,
            CASE WHEN p_order_by = 'valid_until' AND p_order_direction = 'DESC' THEN ai.valid_until END DESC,
            CASE WHEN p_order_by = 'valid_until' AND p_order_direction = 'ASC' THEN ai.valid_until END ASC
        LIMIT p_limit OFFSET p_offset;
        RETURN;
    END IF;

    -- Standard filtered query without search
    RETURN QUERY
    SELECT 
        ai.id,
        ai.user_id,
        ai.insight_type,
        ai.title,
        ai.description,
        LEFT(ai.description, 200)::TEXT as description_preview,
        ai.insight_embedding,
        ai.data_source,
        ai.confidence_score,
        ai.priority,
        ai.actionable,
        ai.actions,
        ai.tags,
        ai.valid_until,
        (ai.valid_until IS NOT NULL AND ai.valid_until <= NOW())::BOOLEAN as is_expired,
        ai.model_used,
        ai.created_at,
        ai.updated_at,
        NULL::DECIMAL(3,2) as similarity_score
    FROM ai_insights ai
    WHERE ai.user_id = p_user_id
        AND (p_insight_type IS NULL OR ai.insight_type = p_insight_type)
        AND (p_priority IS NULL OR ai.priority = p_priority)
        AND (p_actionable IS NULL OR ai.actionable = p_actionable)
        AND (p_tags IS NULL OR ai.tags && p_tags) -- Array overlap operator
        AND (p_include_expired OR ai.valid_until IS NULL OR ai.valid_until > NOW())
    ORDER BY 
        CASE WHEN p_order_by = 'created_at' AND p_order_direction = 'DESC' THEN ai.created_at END DESC,
        CASE WHEN p_order_by = 'created_at' AND p_order_direction = 'ASC' THEN ai.created_at END ASC,
        CASE WHEN p_order_by = 'updated_at' AND p_order_direction = 'DESC' THEN ai.updated_at END DESC,
        CASE WHEN p_order_by = 'updated_at' AND p_order_direction = 'ASC' THEN ai.updated_at END ASC,
        CASE WHEN p_order_by = 'title' AND p_order_direction = 'DESC' THEN ai.title END DESC,
        CASE WHEN p_order_by = 'title' AND p_order_direction = 'ASC' THEN ai.title END ASC,
        CASE WHEN p_order_by = 'priority' AND p_order_direction = 'DESC' THEN 
            CASE ai.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END END ASC,
        CASE WHEN p_order_by = 'priority' AND p_order_direction = 'ASC' THEN 
            CASE ai.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END END DESC,
        CASE WHEN p_order_by = 'confidence_score' AND p_order_direction = 'DESC' THEN ai.confidence_score END DESC,
        CASE WHEN p_order_by = 'confidence_score' AND p_order_direction = 'ASC' THEN ai.confidence_score END ASC,
        CASE WHEN p_order_by = 'valid_until' AND p_order_direction = 'DESC' THEN ai.valid_until END DESC,
        CASE WHEN p_order_by = 'valid_until' AND p_order_direction = 'ASC' THEN ai.valid_until END ASC
    LIMIT p_limit OFFSET p_offset;

END;
$$;

-- Get insights by priority for dashboard display
CREATE OR REPLACE FUNCTION get_priority_insights(
    p_user_id UUID,
    p_priority VARCHAR(20) DEFAULT 'high',
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    id UUID,
    insight_type VARCHAR(50),
    title VARCHAR(255),
    description_preview TEXT,
    priority VARCHAR(20),
    actionable BOOLEAN,
    actions JSONB,
    valid_until TIMESTAMPTZ,
    is_expired BOOLEAN,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only access their own insights.';
    END IF;

    RETURN QUERY
    SELECT 
        ai.id,
        ai.insight_type,
        ai.title,
        LEFT(ai.description, 150)::TEXT as description_preview,
        ai.priority,
        ai.actionable,
        ai.actions,
        ai.valid_until,
        (ai.valid_until IS NOT NULL AND ai.valid_until <= NOW())::BOOLEAN as is_expired,
        ai.created_at
    FROM ai_insights ai
    WHERE ai.user_id = p_user_id
        AND ai.priority = p_priority
        AND (ai.valid_until IS NULL OR ai.valid_until > NOW()) -- Only active insights
    ORDER BY ai.created_at DESC
    LIMIT p_limit;

END;
$$;

-- Vector similarity search for insights
CREATE OR REPLACE FUNCTION search_insights_by_similarity(
    p_user_id UUID,
    p_query_embedding vector(1536),
    p_insight_type VARCHAR(50) DEFAULT NULL,
    p_similarity_threshold DECIMAL(3,2) DEFAULT 0.8,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    insight_type VARCHAR(50),
    title VARCHAR(255),
    description TEXT,
    description_preview TEXT,
    insight_embedding vector(1536),
    data_source JSONB,
    confidence_score DECIMAL(3,2),
    priority VARCHAR(20),
    actionable BOOLEAN,
    actions JSONB,
    tags TEXT[],
    valid_until TIMESTAMPTZ,
    is_expired BOOLEAN,
    model_used VARCHAR(100),
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
        RAISE EXCEPTION 'Access denied. User can only access their own insights.';
    END IF;

    RETURN QUERY
    SELECT 
        ai.id,
        ai.user_id,
        ai.insight_type,
        ai.title,
        ai.description,
        LEFT(ai.description, 200)::TEXT as description_preview,
        ai.insight_embedding,
        ai.data_source,
        ai.confidence_score,
        ai.priority,
        ai.actionable,
        ai.actions,
        ai.tags,
        ai.valid_until,
        (ai.valid_until IS NOT NULL AND ai.valid_until <= NOW())::BOOLEAN as is_expired,
        ai.model_used,
        ai.created_at,
        ai.updated_at,
        (1 - (ai.insight_embedding <=> p_query_embedding))::DECIMAL(3,2) as similarity_score
    FROM ai_insights ai
    WHERE ai.user_id = p_user_id
        AND ai.insight_embedding IS NOT NULL
        AND (p_insight_type IS NULL OR ai.insight_type = p_insight_type)
        AND (1 - (ai.insight_embedding <=> p_query_embedding)) >= p_similarity_threshold
    ORDER BY ai.insight_embedding <=> p_query_embedding
    LIMIT p_limit;

END;
$$;

-- Get actionable insights with their actions
CREATE OR REPLACE FUNCTION get_actionable_insights(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    id UUID,
    insight_type VARCHAR(50),
    title VARCHAR(255),
    description_preview TEXT,
    priority VARCHAR(20),
    actions JSONB,
    tags TEXT[],
    confidence_score DECIMAL(3,2),
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only access their own insights.';
    END IF;

    RETURN QUERY
    SELECT 
        ai.id,
        ai.insight_type,
        ai.title,
        LEFT(ai.description, 150)::TEXT as description_preview,
        ai.priority,
        ai.actions,
        ai.tags,
        ai.confidence_score,
        ai.valid_until,
        ai.created_at
    FROM ai_insights ai
    WHERE ai.user_id = p_user_id
        AND ai.actionable = TRUE
        AND ai.actions IS NOT NULL
        AND (ai.valid_until IS NULL OR ai.valid_until > NOW()) -- Only active insights
    ORDER BY 
        CASE ai.priority 
            WHEN 'critical' THEN 1 
            WHEN 'high' THEN 2 
            WHEN 'medium' THEN 3 
            WHEN 'low' THEN 4 
        END,
        ai.created_at DESC
    LIMIT p_limit;

END;
$$;
