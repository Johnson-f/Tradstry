-- AI Insights Delete Function
-- Deletes AI insights with validation and expiration handling
CREATE OR REPLACE FUNCTION delete_ai_insight(
    p_user_id UUID,
    p_insight_id UUID,
    p_soft_delete BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
    id UUID,
    title VARCHAR(255),
    insight_type VARCHAR(50),
    priority VARCHAR(20),
    deleted_at TIMESTAMPTZ,
    operation_type TEXT -- 'soft_deleted' or 'permanently_deleted'
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_insight_record RECORD;
    v_operation_type TEXT;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only delete their own insights.';
    END IF;

    -- Check if insight exists and belongs to user
    SELECT ai.id, ai.title, ai.insight_type, ai.priority, ai.valid_until
    INTO v_insight_record
    FROM ai_insights ai
    WHERE ai.id = p_insight_id AND ai.user_id = p_user_id;

    IF v_insight_record.id IS NULL THEN
        RAISE EXCEPTION 'Insight not found or access denied.';
    END IF;

    IF p_soft_delete THEN
        -- Soft delete: Set valid_until to NOW to mark as expired
        UPDATE ai_insights 
        SET 
            valid_until = NOW(),
            updated_at = NOW()
        WHERE id = p_insight_id;
        
        v_operation_type := 'soft_deleted';
    ELSE
        -- Hard delete: Permanently remove the record
        DELETE FROM ai_insights 
        WHERE id = p_insight_id;
        
        v_operation_type := 'permanently_deleted';
    END IF;

    RETURN QUERY
    SELECT 
        v_insight_record.id,
        v_insight_record.title,
        v_insight_record.insight_type,
        v_insight_record.priority,
        NOW() as deleted_at,
        v_operation_type::TEXT as operation_type;

END;
$$;

-- Bulk delete function for multiple insights
CREATE OR REPLACE FUNCTION delete_ai_insights_bulk(
    p_user_id UUID,
    p_insight_ids UUID[],
    p_soft_delete BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
    id UUID,
    title VARCHAR(255),
    insight_type VARCHAR(50),
    priority VARCHAR(20),
    deleted_at TIMESTAMPTZ,
    operation_type TEXT,
    success BOOLEAN,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_insight_id UUID;
    v_insight_record RECORD;
    v_operation_type TEXT;
    v_deleted_count INTEGER := 0;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only delete their own insights.';
    END IF;

    -- Validate input
    IF p_insight_ids IS NULL OR array_length(p_insight_ids, 1) = 0 THEN
        RAISE EXCEPTION 'No insight IDs provided for deletion.';
    END IF;

    -- Limit bulk operations to prevent abuse
    IF array_length(p_insight_ids, 1) > 50 THEN
        RAISE EXCEPTION 'Cannot delete more than 50 insights at once.';
    END IF;

    -- Set operation type
    v_operation_type := CASE WHEN p_soft_delete THEN 'soft_deleted' ELSE 'permanently_deleted' END;

    -- Process each insight ID
    FOREACH v_insight_id IN ARRAY p_insight_ids
    LOOP
        BEGIN
            -- Check if insight exists and belongs to user
            SELECT ai.id, ai.title, ai.insight_type, ai.priority
            INTO v_insight_record
            FROM ai_insights ai
            WHERE ai.id = v_insight_id AND ai.user_id = p_user_id;

            IF v_insight_record.id IS NULL THEN
                -- Insight not found or access denied
                RETURN QUERY
                SELECT 
                    v_insight_id,
                    NULL::VARCHAR(255) as title,
                    NULL::VARCHAR(50) as insight_type,
                    NULL::VARCHAR(20) as priority,
                    NOW() as deleted_at,
                    v_operation_type::TEXT as operation_type,
                    FALSE as success,
                    'Insight not found or access denied'::TEXT as error_message;
                CONTINUE;
            END IF;

            IF p_soft_delete THEN
                -- Soft delete
                UPDATE ai_insights 
                SET 
                    valid_until = NOW(),
                    updated_at = NOW()
                WHERE id = v_insight_id;
            ELSE
                -- Hard delete
                DELETE FROM ai_insights 
                WHERE id = v_insight_id;
            END IF;

            v_deleted_count := v_deleted_count + 1;

            -- Return success record
            RETURN QUERY
            SELECT 
                v_insight_record.id,
                v_insight_record.title,
                v_insight_record.insight_type,
                v_insight_record.priority,
                NOW() as deleted_at,
                v_operation_type::TEXT as operation_type,
                TRUE as success,
                NULL::TEXT as error_message;

        EXCEPTION WHEN OTHERS THEN
            -- Handle individual record errors
            RETURN QUERY
            SELECT 
                v_insight_id,
                NULL::VARCHAR(255) as title,
                NULL::VARCHAR(50) as insight_type,
                NULL::VARCHAR(20) as priority,
                NOW() as deleted_at,
                v_operation_type::TEXT as operation_type,
                FALSE as success,
                SQLERRM::TEXT as error_message;
        END;
    END LOOP;

    -- Log the bulk operation
    RAISE NOTICE 'Bulk delete completed. % insights processed, % successfully deleted.', 
        array_length(p_insight_ids, 1), v_deleted_count;

END;
$$;

-- Delete insights by type
CREATE OR REPLACE FUNCTION delete_insights_by_type(
    p_user_id UUID,
    p_insight_type VARCHAR(50),
    p_soft_delete BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
    deleted_count INTEGER,
    insight_type VARCHAR(50),
    operation_type TEXT,
    deleted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
    v_operation_type TEXT;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only delete their own insights.';
    END IF;

    -- Validate insight_type
    IF p_insight_type NOT IN ('pattern', 'risk', 'opportunity', 'performance', 'recommendation', 'alert') THEN
        RAISE EXCEPTION 'Invalid insight_type. Must be one of: pattern, risk, opportunity, performance, recommendation, alert.';
    END IF;

    -- Set operation type
    v_operation_type := CASE WHEN p_soft_delete THEN 'soft_deleted' ELSE 'permanently_deleted' END;

    IF p_soft_delete THEN
        -- Soft delete by setting valid_until to NOW
        UPDATE ai_insights 
        SET 
            valid_until = NOW(),
            updated_at = NOW()
        WHERE user_id = p_user_id 
            AND insight_type = p_insight_type
            AND (valid_until IS NULL OR valid_until > NOW()); -- Only active insights
    ELSE
        -- Hard delete
        DELETE FROM ai_insights 
        WHERE user_id = p_user_id 
            AND insight_type = p_insight_type;
    END IF;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN QUERY
    SELECT 
        v_deleted_count as deleted_count,
        p_insight_type as insight_type,
        v_operation_type::TEXT as operation_type,
        NOW() as deleted_at;

END;
$$;

-- Cleanup expired insights
CREATE OR REPLACE FUNCTION cleanup_expired_insights(
    p_user_id UUID,
    p_grace_period_days INTEGER DEFAULT 7
)
RETURNS TABLE(
    deleted_count INTEGER,
    cleanup_date TIMESTAMPTZ,
    grace_period_days INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
    v_cutoff_date TIMESTAMPTZ;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only cleanup their own insights.';
    END IF;

    -- Calculate cutoff date (expired + grace period)
    v_cutoff_date := NOW() - (p_grace_period_days || ' days')::INTERVAL;

    -- Delete insights that have been expired for longer than grace period
    DELETE FROM ai_insights 
    WHERE user_id = p_user_id 
        AND valid_until IS NOT NULL 
        AND valid_until < v_cutoff_date;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN QUERY
    SELECT 
        v_deleted_count as deleted_count,
        NOW() as cleanup_date,
        p_grace_period_days as grace_period_days;

END;
$$;

-- Delete low-confidence insights
CREATE OR REPLACE FUNCTION delete_low_confidence_insights(
    p_user_id UUID,
    p_confidence_threshold DECIMAL(3,2) DEFAULT 0.3,
    p_older_than_days INTEGER DEFAULT 30,
    p_soft_delete BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
    deleted_count INTEGER,
    confidence_threshold DECIMAL(3,2),
    operation_type TEXT,
    deleted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
    v_cutoff_date TIMESTAMPTZ;
    v_operation_type TEXT;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only delete their own insights.';
    END IF;

    -- Validate confidence threshold
    IF p_confidence_threshold < 0 OR p_confidence_threshold > 1 THEN
        RAISE EXCEPTION 'confidence_threshold must be between 0 and 1.';
    END IF;

    -- Calculate cutoff date
    v_cutoff_date := NOW() - (p_older_than_days || ' days')::INTERVAL;
    v_operation_type := CASE WHEN p_soft_delete THEN 'soft_deleted' ELSE 'permanently_deleted' END;

    IF p_soft_delete THEN
        -- Soft delete low-confidence insights
        UPDATE ai_insights 
        SET 
            valid_until = NOW(),
            updated_at = NOW()
        WHERE user_id = p_user_id 
            AND confidence_score IS NOT NULL
            AND confidence_score < p_confidence_threshold
            AND created_at < v_cutoff_date
            AND (valid_until IS NULL OR valid_until > NOW()); -- Only active insights
    ELSE
        -- Hard delete low-confidence insights
        DELETE FROM ai_insights 
        WHERE user_id = p_user_id 
            AND confidence_score IS NOT NULL
            AND confidence_score < p_confidence_threshold
            AND created_at < v_cutoff_date;
    END IF;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN QUERY
    SELECT 
        v_deleted_count as deleted_count,
        p_confidence_threshold as confidence_threshold,
        v_operation_type::TEXT as operation_type,
        NOW() as deleted_at;

END;
$$;
