-- Wrapper functions to match backend expectations
-- These functions call the actual database functions with correct names

-- Chat message functions
CREATE OR REPLACE FUNCTION upsert_ai_chat_message(
    p_user_id UUID,
    p_session_id UUID,
    p_message_type VARCHAR(20),
    p_content TEXT,
    p_question_embedding vector(1536) DEFAULT NULL,
    p_answer_embedding vector(1536) DEFAULT NULL,
    p_context_data JSONB DEFAULT NULL,
    p_model_used VARCHAR(100) DEFAULT NULL,
    p_processing_time_ms INTEGER DEFAULT NULL,
    p_confidence_score DECIMAL(3,2) DEFAULT NULL,
    p_similarity_score DECIMAL(3,2) DEFAULT NULL,
    p_source_type VARCHAR(20) DEFAULT 'external_ai',
    p_message_id UUID DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    session_id UUID,
    message_type VARCHAR(20),
    content TEXT,
    question_embedding vector(1536),
    answer_embedding vector(1536),
    context_data JSONB,
    model_used VARCHAR(100),
    processing_time_ms INTEGER,
    confidence_score DECIMAL(3,2),
    similarity_score DECIMAL(3,2),
    source_type VARCHAR(20),
    usage_count INTEGER,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    operation_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM upsert_ai_chat_history(
        p_user_id,
        p_session_id,
        p_message_type,
        p_content,
        p_question_embedding,
        p_answer_embedding,
        p_context_data,
        p_model_used,
        p_processing_time_ms,
        p_confidence_score,
        p_similarity_score,
        p_source_type,
        1, -- usage_count
        p_message_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION get_ai_chat_messages(
    p_user_id UUID,
    p_message_id UUID DEFAULT NULL,
    p_session_id UUID DEFAULT NULL,
    p_message_type VARCHAR(20) DEFAULT NULL,
    p_source_type VARCHAR(20) DEFAULT NULL,
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
    session_id UUID,
    message_type VARCHAR(20),
    content TEXT,
    content_preview TEXT,
    question_embedding vector(1536),
    answer_embedding vector(1536),
    context_data JSONB,
    model_used VARCHAR(100),
    processing_time_ms INTEGER,
    confidence_score DECIMAL(3,2),
    similarity_score DECIMAL(3,2),
    source_type VARCHAR(20),
    usage_count INTEGER,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    search_similarity DECIMAL(3,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM get_ai_chat_history(
        p_user_id,
        p_message_id,
        p_session_id,
        p_message_type,
        p_source_type,
        p_search_query,
        p_similarity_threshold,
        p_limit,
        p_offset,
        p_order_by,
        p_order_direction
    );
END;
$$;

CREATE OR REPLACE FUNCTION get_ai_chat_session_messages(
    p_user_id UUID,
    p_session_id UUID,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    session_id UUID,
    message_type VARCHAR(20),
    content TEXT,
    content_preview TEXT,
    question_embedding vector(1536),
    answer_embedding vector(1536),
    context_data JSONB,
    model_used VARCHAR(100),
    processing_time_ms INTEGER,
    confidence_score DECIMAL(3,2),
    similarity_score DECIMAL(3,2),
    source_type VARCHAR(20),
    usage_count INTEGER,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    search_similarity DECIMAL(3,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM get_ai_chat_history(
        p_user_id,
        NULL, -- message_id
        p_session_id,
        NULL, -- message_type
        NULL, -- source_type
        NULL, -- search_query
        0.8, -- similarity_threshold
        p_limit,
        0, -- offset
        'created_at',
        'ASC' -- order_direction
    );
END;
$$;

CREATE OR REPLACE FUNCTION get_ai_chat_sessions(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
    session_id UUID,
    message_count INTEGER,
    first_message TEXT,
    last_message TEXT,
    first_message_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,
    total_usage_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM get_chat_sessions(
        p_user_id,
        p_limit,
        p_offset
    );
END;
$$;

CREATE OR REPLACE FUNCTION search_ai_chat_messages(
    p_user_id UUID,
    p_query TEXT,
    p_session_id UUID DEFAULT NULL,
    p_similarity_threshold DECIMAL(3,2) DEFAULT 0.8,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    session_id UUID,
    message_type VARCHAR(20),
    content TEXT,
    content_preview TEXT,
    question_embedding vector(1536),
    answer_embedding vector(1536),
    context_data JSONB,
    model_used VARCHAR(100),
    processing_time_ms INTEGER,
    confidence_score DECIMAL(3,2),
    similarity_score DECIMAL(3,2),
    source_type VARCHAR(20),
    usage_count INTEGER,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    search_similarity DECIMAL(3,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    query_embedding vector(1536);
BEGIN
    -- For now, return empty result since we don't have embedding generation in SQL
    -- This should be called from the backend with pre-computed embeddings
    RETURN QUERY
    SELECT
        ch.id,
        ch.user_id,
        ch.session_id,
        ch.message_type,
        ch.content,
        LEFT(ch.content, 200)::TEXT as content_preview,
        ch.question_embedding,
        ch.answer_embedding,
        ch.context_data,
        ch.model_used,
        ch.processing_time_ms,
        ch.confidence_score,
        ch.similarity_score,
        ch.source_type,
        ch.usage_count,
        ch.last_used_at,
        ch.created_at,
        NULL::DECIMAL(3,2) as search_similarity
    FROM ai_chat_history ch
    WHERE ch.user_id = p_user_id
        AND (p_session_id IS NULL OR ch.session_id = p_session_id)
        AND ch.content ILIKE '%' || p_query || '%'
    ORDER BY ch.created_at DESC
    LIMIT p_limit;
END;
$$;

-- Insights functions
CREATE OR REPLACE FUNCTION upsert_ai_insight(
    p_user_id UUID,
    p_insight_type VARCHAR(50),
    p_title VARCHAR(255),
    p_description TEXT,
    p_insight_embedding vector(1536) DEFAULT NULL,
    p_data_source JSONB DEFAULT NULL,
    p_confidence_score DECIMAL(3,2) DEFAULT NULL,
    p_priority VARCHAR(20) DEFAULT 'medium',
    p_actionable BOOLEAN DEFAULT FALSE,
    p_actions JSONB DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_valid_until TIMESTAMPTZ DEFAULT NULL,
    p_model_used VARCHAR(100) DEFAULT NULL,
    p_insight_id UUID DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    insight_type VARCHAR(50),
    title VARCHAR(255),
    description TEXT,
    insight_embedding vector(1536),
    data_source JSONB,
    confidence_score DECIMAL(3,2),
    priority VARCHAR(20),
    actionable BOOLEAN,
    actions JSONB,
    tags TEXT[],
    valid_until TIMESTAMPTZ,
    model_used VARCHAR(100),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    operation_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM upsert_ai_insights(
        p_user_id,
        p_insight_type,
        p_title,
        p_description,
        p_insight_embedding,
        p_data_source,
        p_confidence_score,
        p_priority,
        p_actionable,
        p_actions,
        p_tags,
        p_valid_until,
        p_model_used,
        p_insight_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION get_priority_ai_insights(
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
    RETURN QUERY
    SELECT * FROM get_priority_insights(
        p_user_id,
        p_priority,
        p_limit
    );
END;
$$;

CREATE OR REPLACE FUNCTION get_actionable_ai_insights(
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
    RETURN QUERY
    SELECT * FROM get_actionable_insights(
        p_user_id,
        p_limit
    );
END;
$$;

CREATE OR REPLACE FUNCTION search_ai_insights(
    p_user_id UUID,
    p_query TEXT,
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
DECLARE
    query_embedding vector(1536);
BEGIN
    -- For now, return empty result since we don't have embedding generation in SQL
    -- This should be called from the backend with pre-computed embeddings
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
        AND (
            ai.title ILIKE '%' || p_query || '%' 
            OR ai.description ILIKE '%' || p_query || '%'
            OR EXISTS (
                SELECT 1 FROM unnest(ai.tags) AS tag 
                WHERE tag ILIKE '%' || p_query || '%'
            )
        )
        AND (ai.valid_until IS NULL OR ai.valid_until > NOW())
    ORDER BY ai.created_at DESC
    LIMIT p_limit;
END;
$$;
