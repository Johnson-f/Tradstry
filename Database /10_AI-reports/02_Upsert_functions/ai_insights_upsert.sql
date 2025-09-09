-- AI Insights Upsert Function
-- Creates a new AI insight or updates an existing one
CREATE OR REPLACE FUNCTION upsert_ai_insight(
    p_user_id UUID,
    p_insight_type VARCHAR(50),
    p_title VARCHAR(255),
    p_description TEXT,
    p_insight_embedding vector(1536) DEFAULT NULL,
    p_data_source JSONB DEFAULT NULL,
    p_confidence_score DECIMAL(3,2) DEFAULT NULL,
    p_priority VARCHAR(20) DEFAULT 'medium',
    p_actionable BOOLEAN DEFAULT TRUE,
    p_actions JSONB DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_valid_until TIMESTAMPTZ DEFAULT NULL,
    p_model_used VARCHAR(100) DEFAULT NULL,
    p_insight_id UUID DEFAULT NULL -- If provided, updates existing insight
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
    operation_type TEXT -- 'created' or 'updated'
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_insight_id UUID;
    v_operation_type TEXT;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only upsert their own insights.';
    END IF;

    -- Validate required fields
    IF p_insight_type IS NULL OR p_title IS NULL OR p_description IS NULL THEN
        RAISE EXCEPTION 'insight_type, title, and description are required fields.';
    END IF;

    -- Validate insight_type
    IF p_insight_type NOT IN ('pattern', 'risk', 'opportunity', 'performance', 'recommendation', 'alert') THEN
        RAISE EXCEPTION 'Invalid insight_type. Must be one of: pattern, risk, opportunity, performance, recommendation, alert.';
    END IF;

    -- Validate priority
    IF p_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
        RAISE EXCEPTION 'Invalid priority. Must be one of: low, medium, high, critical.';
    END IF;

    -- Validate confidence_score range
    IF p_confidence_score IS NOT NULL AND (p_confidence_score < 0 OR p_confidence_score > 1) THEN
        RAISE EXCEPTION 'confidence_score must be between 0 and 1.';
    END IF;

    -- Validate valid_until is in the future
    IF p_valid_until IS NOT NULL AND p_valid_until <= NOW() THEN
        RAISE EXCEPTION 'valid_until must be a future timestamp.';
    END IF;

    -- Check if this is an update operation
    IF p_insight_id IS NOT NULL THEN
        -- Verify the insight exists and belongs to the user
        SELECT ai_insights.id INTO v_insight_id
        FROM ai_insights
        WHERE ai_insights.id = p_insight_id AND ai_insights.user_id = p_user_id;

        IF v_insight_id IS NULL THEN
            RAISE EXCEPTION 'Insight not found or access denied.';
        END IF;

        -- Update existing insight
        UPDATE ai_insights SET
            insight_type = p_insight_type,
            title = p_title,
            description = p_description,
            insight_embedding = COALESCE(p_insight_embedding, insight_embedding),
            data_source = COALESCE(p_data_source, data_source),
            confidence_score = COALESCE(p_confidence_score, confidence_score),
            priority = p_priority,
            actionable = p_actionable,
            actions = COALESCE(p_actions, actions),
            tags = COALESCE(p_tags, tags),
            valid_until = COALESCE(p_valid_until, valid_until),
            model_used = COALESCE(p_model_used, model_used),
            updated_at = NOW()
        WHERE ai_insights.id = p_insight_id;

        v_operation_type := 'updated';
    ELSE
        -- Insert new insight
        INSERT INTO ai_insights (
            user_id,
            insight_type,
            title,
            description,
            insight_embedding,
            data_source,
            confidence_score,
            priority,
            actionable,
            actions,
            tags,
            valid_until,
            model_used
        ) VALUES (
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
            p_model_used
        ) RETURNING ai_insights.id INTO v_insight_id;

        v_operation_type := 'created';
    END IF;

    -- Return the upserted insight
    RETURN QUERY
    SELECT 
        ai.id,
        ai.user_id,
        ai.insight_type,
        ai.title,
        ai.description,
        ai.insight_embedding,
        ai.data_source,
        ai.confidence_score,
        ai.priority,
        ai.actionable,
        ai.actions,
        ai.tags,
        ai.valid_until,
        ai.model_used,
        ai.created_at,
        ai.updated_at,
        v_operation_type::TEXT as operation_type
    FROM ai_insights ai
    WHERE ai.id = v_insight_id;

END;
$$;

-- Function to mark insight as expired/invalid
CREATE OR REPLACE FUNCTION expire_ai_insight(
    p_user_id UUID,
    p_insight_id UUID,
    p_expire_immediately BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
    id UUID,
    title VARCHAR(255),
    valid_until TIMESTAMPTZ,
    expired_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_insight_record RECORD;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only expire their own insights.';
    END IF;

    -- Check if insight exists and belongs to user
    SELECT ai.id, ai.title, ai.valid_until
    INTO v_insight_record
    FROM ai_insights ai
    WHERE ai.id = p_insight_id AND ai.user_id = p_user_id;

    IF v_insight_record.id IS NULL THEN
        RAISE EXCEPTION 'Insight not found or access denied.';
    END IF;

    -- Update valid_until to expire the insight
    IF p_expire_immediately THEN
        UPDATE ai_insights 
        SET 
            valid_until = NOW(),
            updated_at = NOW()
        WHERE id = p_insight_id;
    ELSE
        -- Set to expire in 1 hour
        UPDATE ai_insights 
        SET 
            valid_until = NOW() + INTERVAL '1 hour',
            updated_at = NOW()
        WHERE id = p_insight_id;
    END IF;

    RETURN QUERY
    SELECT 
        v_insight_record.id,
        v_insight_record.title,
        v_insight_record.valid_until,
        NOW() as expired_at;

END;
$$;
