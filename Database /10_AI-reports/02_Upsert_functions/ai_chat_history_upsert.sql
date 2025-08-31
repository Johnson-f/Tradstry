-- AI Chat History Upsert Function
-- Creates a new chat message or updates an existing one
CREATE OR REPLACE FUNCTION upsert_ai_chat_history(
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
    p_usage_count INTEGER DEFAULT 1,
    p_message_id UUID DEFAULT NULL -- If provided, updates existing message
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
    operation_type TEXT -- 'created' or 'updated'
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_message_id UUID;
    v_operation_type TEXT;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only upsert their own chat history.';
    END IF;

    -- Validate required fields
    IF p_session_id IS NULL OR p_message_type IS NULL OR p_content IS NULL THEN
        RAISE EXCEPTION 'session_id, message_type, and content are required fields.';
    END IF;

    -- Validate message_type
    IF p_message_type NOT IN ('user_question', 'ai_response') THEN
        RAISE EXCEPTION 'Invalid message_type. Must be one of: user_question, ai_response.';
    END IF;

    -- Validate source_type
    IF p_source_type NOT IN ('external_ai', 'vector_match', 'cached') THEN
        RAISE EXCEPTION 'Invalid source_type. Must be one of: external_ai, vector_match, cached.';
    END IF;

    -- Validate confidence_score range
    IF p_confidence_score IS NOT NULL AND (p_confidence_score < 0 OR p_confidence_score > 1) THEN
        RAISE EXCEPTION 'confidence_score must be between 0 and 1.';
    END IF;

    -- Validate similarity_score range
    IF p_similarity_score IS NOT NULL AND (p_similarity_score < 0 OR p_similarity_score > 1) THEN
        RAISE EXCEPTION 'similarity_score must be between 0 and 1.';
    END IF;

    -- Validate embedding consistency with message type
    IF p_message_type = 'user_question' AND p_question_embedding IS NULL THEN
        RAISE NOTICE 'Consider providing question_embedding for user_question message type.';
    END IF;

    IF p_message_type = 'ai_response' AND p_answer_embedding IS NULL THEN
        RAISE NOTICE 'Consider providing answer_embedding for ai_response message type.';
    END IF;

    -- Check if this is an update operation
    IF p_message_id IS NOT NULL THEN
        -- Verify the message exists and belongs to the user
        SELECT ch.id INTO v_message_id
        FROM ai_chat_history ch
        WHERE ch.id = p_message_id AND ch.user_id = p_user_id;

        IF v_message_id IS NULL THEN
            RAISE EXCEPTION 'Chat message not found or access denied.';
        END IF;

        -- Update existing message
        UPDATE ai_chat_history AS ach SET
            session_id = p_session_id,
            message_type = p_message_type,
            content = p_content,
            question_embedding = COALESCE(p_question_embedding, question_embedding),
            answer_embedding = COALESCE(p_answer_embedding, answer_embedding),
            context_data = COALESCE(p_context_data, context_data),
            model_used = COALESCE(p_model_used, model_used),
            processing_time_ms = COALESCE(p_processing_time_ms, processing_time_ms),
            confidence_score = COALESCE(p_confidence_score, confidence_score),
            similarity_score = COALESCE(p_similarity_score, similarity_score),
            source_type = p_source_type,
            usage_count = COALESCE(p_usage_count, usage_count),
            last_used_at = NOW()
        WHERE ach.id = p_message_id AND ach.user_id = p_user_id;

        v_operation_type := 'updated';
    ELSE
        -- Insert new message
        INSERT INTO ai_chat_history (
            user_id,
            session_id,
            message_type,
            content,
            question_embedding,
            answer_embedding,
            context_data,
            model_used,
            processing_time_ms,
            confidence_score,
            similarity_score,
            source_type,
            usage_count,
            last_used_at
        ) VALUES (
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
            p_usage_count,
            NOW()
        ) RETURNING ai_chat_history.id INTO v_message_id;

        v_operation_type := 'created';
    END IF;

    -- Return the upserted message
    RETURN QUERY
    SELECT 
        ch.id,
        ch.user_id,
        ch.session_id,
        ch.message_type,
        ch.content,
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
        v_operation_type::TEXT as operation_type
    FROM ai_chat_history ch
    WHERE ch.id = v_message_id;

END;
$$;

-- Function to increment usage count for reused Q&A pairs
CREATE OR REPLACE FUNCTION increment_chat_usage(
    p_user_id UUID,
    p_message_id UUID
)
RETURNS TABLE(
    id UUID,
    usage_count INTEGER,
    last_used_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only update their own chat history.';
    END IF;

    -- Update usage count and last_used_at
    UPDATE ai_chat_history 
    SET 
        usage_count = usage_count + 1,
        last_used_at = NOW()
    WHERE ai_chat_history.id = p_message_id 
        AND ai_chat_history.user_id = p_user_id;

    -- Return updated record
    RETURN QUERY
    SELECT 
        ch.id,
        ch.usage_count,
        ch.last_used_at
    FROM ai_chat_history ch
    WHERE ch.id = p_message_id AND ch.user_id = p_user_id;

END;
$$;
