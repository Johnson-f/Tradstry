-- AI Chat History Select Function
-- Retrieves chat history with flexible filtering, search, and pagination
CREATE OR REPLACE FUNCTION get_ai_chat_history(
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
    content_preview TEXT, -- First 200 characters
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
    search_similarity DECIMAL(3,2) -- Only populated when using vector search
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only access their own chat history.';
    END IF;

    -- Validate limit and offset
    IF p_limit < 1 OR p_limit > 100 THEN
        RAISE EXCEPTION 'Limit must be between 1 and 100.';
    END IF;

    IF p_offset < 0 THEN
        RAISE EXCEPTION 'Offset must be non-negative.';
    END IF;

    -- Validate order_by
    IF p_order_by NOT IN ('created_at', 'last_used_at', 'usage_count', 'confidence_score') THEN
        RAISE EXCEPTION 'Invalid order_by field. Must be one of: created_at, last_used_at, usage_count, confidence_score.';
    END IF;

    -- Validate order_direction
    IF p_order_direction NOT IN ('ASC', 'DESC') THEN
        RAISE EXCEPTION 'Invalid order_direction. Must be ASC or DESC.';
    END IF;

    -- If searching by specific message ID, return that message
    IF p_message_id IS NOT NULL THEN
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
        WHERE ch.id = p_message_id AND ch.user_id = p_user_id;
        RETURN;
    END IF;

    -- If using text search
    IF p_search_query IS NOT NULL AND LENGTH(TRIM(p_search_query)) > 0 THEN
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
            AND ch.content ILIKE '%' || p_search_query || '%'
            AND (p_session_id IS NULL OR ch.session_id = p_session_id)
            AND (p_message_type IS NULL OR ch.message_type = p_message_type)
            AND (p_source_type IS NULL OR ch.source_type = p_source_type)
        ORDER BY 
            CASE WHEN p_order_by = 'created_at' AND p_order_direction = 'DESC' THEN ch.created_at END DESC,
            CASE WHEN p_order_by = 'created_at' AND p_order_direction = 'ASC' THEN ch.created_at END ASC,
            CASE WHEN p_order_by = 'last_used_at' AND p_order_direction = 'DESC' THEN ch.last_used_at END DESC,
            CASE WHEN p_order_by = 'last_used_at' AND p_order_direction = 'ASC' THEN ch.last_used_at END ASC,
            CASE WHEN p_order_by = 'usage_count' AND p_order_direction = 'DESC' THEN ch.usage_count END DESC,
            CASE WHEN p_order_by = 'usage_count' AND p_order_direction = 'ASC' THEN ch.usage_count END ASC,
            CASE WHEN p_order_by = 'confidence_score' AND p_order_direction = 'DESC' THEN ch.confidence_score END DESC,
            CASE WHEN p_order_by = 'confidence_score' AND p_order_direction = 'ASC' THEN ch.confidence_score END ASC
        LIMIT p_limit OFFSET p_offset;
        RETURN;
    END IF;

    -- Standard filtered query without search
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
        AND (p_message_type IS NULL OR ch.message_type = p_message_type)
        AND (p_source_type IS NULL OR ch.source_type = p_source_type)
    ORDER BY 
        CASE WHEN p_order_by = 'created_at' AND p_order_direction = 'DESC' THEN ch.created_at END DESC,
        CASE WHEN p_order_by = 'created_at' AND p_order_direction = 'ASC' THEN ch.created_at END ASC,
        CASE WHEN p_order_by = 'last_used_at' AND p_order_direction = 'DESC' THEN ch.last_used_at END DESC,
        CASE WHEN p_order_by = 'last_used_at' AND p_order_direction = 'ASC' THEN ch.last_used_at END ASC,
        CASE WHEN p_order_by = 'usage_count' AND p_order_direction = 'DESC' THEN ch.usage_count END DESC,
        CASE WHEN p_order_by = 'usage_count' AND p_order_direction = 'ASC' THEN ch.usage_count END ASC,
        CASE WHEN p_order_by = 'confidence_score' AND p_order_direction = 'DESC' THEN ch.confidence_score END DESC,
        CASE WHEN p_order_by = 'confidence_score' AND p_order_direction = 'ASC' THEN ch.confidence_score END ASC
    LIMIT p_limit OFFSET p_offset;

END;
$$;

-- Get chat sessions for a user
CREATE OR REPLACE FUNCTION get_chat_sessions(
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
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only access their own chat sessions.';
    END IF;

    RETURN QUERY
    SELECT 
        ch.session_id,
        COUNT(*)::INTEGER as message_count,
        (SELECT content FROM ai_chat_history WHERE session_id = ch.session_id AND user_id = p_user_id ORDER BY created_at ASC LIMIT 1) as first_message,
        (SELECT content FROM ai_chat_history WHERE session_id = ch.session_id AND user_id = p_user_id ORDER BY created_at DESC LIMIT 1) as last_message,
        MIN(ch.created_at) as first_message_at,
        MAX(ch.created_at) as last_message_at,
        SUM(ch.usage_count)::INTEGER as total_usage_count
    FROM ai_chat_history ch
    WHERE ch.user_id = p_user_id
    GROUP BY ch.session_id
    ORDER BY MAX(ch.created_at) DESC
    LIMIT p_limit OFFSET p_offset;

END;
$$;

-- Vector similarity search for chat history
CREATE OR REPLACE FUNCTION search_chat_history_by_similarity(
    p_user_id UUID,
    p_query_embedding vector(1536),
    p_message_type VARCHAR(20) DEFAULT NULL, -- 'user_question' or 'ai_response'
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
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only access their own chat history.';
    END IF;

    -- Search against question embeddings for user questions
    IF p_message_type = 'user_question' OR p_message_type IS NULL THEN
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
            (1 - (ch.question_embedding <=> p_query_embedding))::DECIMAL(3,2) as search_similarity
        FROM ai_chat_history ch
        WHERE ch.user_id = p_user_id
            AND ch.question_embedding IS NOT NULL
            AND (p_message_type IS NULL OR ch.message_type = p_message_type)
            AND (1 - (ch.question_embedding <=> p_query_embedding)) >= p_similarity_threshold
        ORDER BY ch.question_embedding <=> p_query_embedding
        LIMIT p_limit;
    END IF;

    -- Search against answer embeddings for AI responses
    IF p_message_type = 'ai_response' OR p_message_type IS NULL THEN
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
            (1 - (ch.answer_embedding <=> p_query_embedding))::DECIMAL(3,2) as search_similarity
        FROM ai_chat_history ch
        WHERE ch.user_id = p_user_id
            AND ch.answer_embedding IS NOT NULL
            AND (p_message_type IS NULL OR ch.message_type = p_message_type)
            AND (1 - (ch.answer_embedding <=> p_query_embedding)) >= p_similarity_threshold
        ORDER BY ch.answer_embedding <=> p_query_embedding
        LIMIT p_limit;
    END IF;

END;
$$;
