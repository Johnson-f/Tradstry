-- Chat Q&A Functions for Vector-Based Learning System
-- Functions for storing and retrieving chat Q&A pairs with semantic search

-- Function to upsert a chat Q&A pair with embeddings
CREATE OR REPLACE FUNCTION upsert_chat_qa(
    p_user_id UUID,
    p_question TEXT,
    p_answer TEXT,
    p_question_embedding vector(1536),
    p_answer_embedding vector(1536),
    p_similarity_score DECIMAL(3,2) DEFAULT NULL,
    p_source_type VARCHAR(20) DEFAULT 'external_ai',
    p_model_used VARCHAR(100) DEFAULT NULL
) RETURNS TABLE(
    qa_id UUID,
    is_new BOOLEAN,
    message TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_existing_id UUID;
    v_existing_usage_count INTEGER;
BEGIN
    -- Check if similar question already exists (within 0.95 similarity)
    SELECT id, usage_count INTO v_existing_id, v_existing_usage_count
    FROM chat_qa
    WHERE user_id = p_user_id
    AND 1 - (question_embedding <=> p_question_embedding) > 0.95
    ORDER BY 1 - (question_embedding <=> p_question_embedding) DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        -- Update existing Q&A pair
        UPDATE chat_qa SET
            answer = p_answer,
            answer_embedding = p_answer_embedding,
            similarity_score = p_similarity_score,
            source_type = p_source_type,
            model_used = COALESCE(p_model_used, model_used),
            usage_count = v_existing_usage_count + 1,
            last_used_at = NOW()
        WHERE id = v_existing_id;

        RETURN QUERY SELECT
            v_existing_id,
            FALSE,
            'Q&A pair updated successfully'::TEXT;
    ELSE
        -- Insert new Q&A pair
        INSERT INTO chat_qa (
            user_id,
            question,
            answer,
            question_embedding,
            answer_embedding,
            similarity_score,
            source_type,
            model_used
        ) VALUES (
            p_user_id,
            p_question,
            p_answer,
            p_question_embedding,
            p_answer_embedding,
            p_similarity_score,
            p_source_type,
            p_model_used
        )
        RETURNING id INTO v_existing_id;

        RETURN QUERY SELECT
            v_existing_id,
            TRUE,
            'Q&A pair created successfully'::TEXT;
    END IF;
END;
$$;

-- Function to search for similar questions using vector similarity
CREATE OR REPLACE FUNCTION search_similar_chat_qa(
    p_user_id UUID,
    p_question_embedding vector(1536),
    p_similarity_threshold DECIMAL(3,2) DEFAULT 0.8,
    p_limit INTEGER DEFAULT 5
) RETURNS TABLE(
    id UUID,
    question TEXT,
    answer TEXT,
    similarity_score DECIMAL(5,4),
    source_type VARCHAR(20),
    model_used VARCHAR(100),
    usage_count INTEGER,
    created_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        cq.id,
        cq.question,
        cq.answer,
        (1 - (cq.question_embedding <=> p_question_embedding))::DECIMAL(5,4) as similarity_score,
        cq.source_type,
        cq.model_used,
        cq.usage_count,
        cq.created_at
    FROM chat_qa cq
    WHERE cq.user_id = p_user_id
    AND 1 - (cq.question_embedding <=> p_question_embedding) > p_similarity_threshold
    ORDER BY cq.question_embedding <=> p_question_embedding
    LIMIT p_limit;
END;
$$;

-- Function to get chat Q&A statistics for a user
CREATE OR REPLACE FUNCTION get_chat_qa_stats(
    p_user_id UUID,
    p_days_back INTEGER DEFAULT 30
) RETURNS TABLE(
    total_qa_pairs BIGINT,
    qa_pairs_this_period BIGINT,
    avg_similarity_score DECIMAL(3,2),
    most_used_model VARCHAR(100),
    total_usage_count BIGINT,
    source_distribution JSONB
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_qa_pairs,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '1 day' * p_days_back THEN 1 END) as qa_pairs_this_period,
        ROUND(AVG(similarity_score), 2) as avg_similarity_score,
        (SELECT model_used FROM chat_qa WHERE user_id = p_user_id GROUP BY model_used ORDER BY COUNT(*) DESC LIMIT 1) as most_used_model,
        SUM(usage_count) as total_usage_count,
        jsonb_object_agg(source_type, cnt) as source_distribution
    FROM (
        SELECT source_type, COUNT(*) as cnt
        FROM chat_qa
        WHERE user_id = p_user_id
        GROUP BY source_type
    ) source_counts
    CROSS JOIN chat_qa cq
    WHERE cq.user_id = p_user_id;
END;
$$;

-- Function to clean up old/low-usage Q&A pairs (optional maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_chat_qa(
    p_user_id UUID,
    p_days_old INTEGER DEFAULT 90,
    p_min_usage_count INTEGER DEFAULT 1
) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM chat_qa
    WHERE user_id = p_user_id
    AND created_at < NOW() - INTERVAL '1 day' * p_days_old
    AND usage_count <= p_min_usage_count;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

-- Comments for documentation
COMMENT ON FUNCTION upsert_chat_qa(UUID, TEXT, TEXT, vector, vector, DECIMAL, VARCHAR, VARCHAR) IS 'Upserts a chat Q&A pair with vector embeddings for the learning system';
COMMENT ON FUNCTION search_similar_chat_qa(UUID, vector, DECIMAL, INTEGER) IS 'Searches for similar questions using vector similarity for AI learning';
COMMENT ON FUNCTION get_chat_qa_stats(UUID, INTEGER) IS 'Returns statistics about user chat Q&A pairs and learning patterns';
COMMENT ON FUNCTION cleanup_old_chat_qa(UUID, INTEGER, INTEGER) IS 'Removes old or unused Q&A pairs to maintain database performance';

-- Example usage:
/*
-- Insert a new Q&A pair
SELECT * FROM upsert_chat_qa(
    'user-uuid-here'::uuid,
    'What is my win rate?',
    'Your win rate is 65% based on your last 30 trades.',
    '[0.1, 0.2, ...]'::vector,  -- question embedding
    '[0.3, 0.4, ...]'::vector,  -- answer embedding
    NULL,  -- similarity_score
    'external_ai',  -- source_type
    'meta-llama/Llama-3.1-8B-Instruct'  -- model_used
);

-- Search for similar questions
SELECT * FROM search_similar_chat_qa(
    'user-uuid-here'::uuid,
    '[0.1, 0.2, ...]'::vector,  -- question embedding to search with
    0.8,  -- similarity threshold
    3     -- limit results
);

-- Get user statistics
SELECT * FROM get_chat_qa_stats('user-uuid-here'::uuid, 30);
*/
