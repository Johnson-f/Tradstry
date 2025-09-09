-- AI Reports Upsert Function
-- Creates a new AI report or updates an existing one
CREATE OR REPLACE FUNCTION upsert_ai_report(
    p_user_id UUID,
    p_report_type VARCHAR(50),
    p_title VARCHAR(255),
    p_content TEXT,
    p_content_embedding vector(1536) DEFAULT NULL,
    p_insights JSONB DEFAULT NULL,
    p_recommendations JSONB DEFAULT NULL,
    p_metrics JSONB DEFAULT NULL,
    p_date_range_start DATE DEFAULT NULL,
    p_date_range_end DATE DEFAULT NULL,
    p_model_used VARCHAR(100) DEFAULT NULL,
    p_processing_time_ms INTEGER DEFAULT NULL,
    p_confidence_score DECIMAL(3,2) DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT 'completed',
    p_report_id UUID DEFAULT NULL -- If provided, updates existing report
)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    report_type VARCHAR(50),
    title VARCHAR(255),
    content TEXT,
    content_embedding vector(1536),
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
    operation_type TEXT -- 'created' or 'updated'
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_report_id UUID;
    v_operation_type TEXT;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only upsert their own reports.';
    END IF;

    -- Validate required fields
    IF p_report_type IS NULL OR p_title IS NULL OR p_content IS NULL THEN
        RAISE EXCEPTION 'report_type, title, and content are required fields.';
    END IF;

    -- Validate report_type
    IF p_report_type NOT IN ('daily', 'weekly', 'monthly', 'custom') THEN
        RAISE EXCEPTION 'Invalid report_type. Must be one of: daily, weekly, monthly, custom.';
    END IF;

    -- Validate status
    IF p_status NOT IN ('processing', 'completed', 'failed') THEN
        RAISE EXCEPTION 'Invalid status. Must be one of: processing, completed, failed.';
    END IF;

    -- Validate confidence_score range
    IF p_confidence_score IS NOT NULL AND (p_confidence_score < 0 OR p_confidence_score > 1) THEN
        RAISE EXCEPTION 'confidence_score must be between 0 and 1.';
    END IF;

    -- Check if this is an update operation
    IF p_report_id IS NOT NULL THEN
        -- Verify the report exists and belongs to the user
        SELECT ai_reports.id INTO v_report_id
        FROM ai_reports
        WHERE ai_reports.id = p_report_id AND ai_reports.user_id = p_user_id;

        IF v_report_id IS NULL THEN
            RAISE EXCEPTION 'Report not found or access denied.';
        END IF;

        -- Update existing report
        UPDATE ai_reports SET
            report_type = p_report_type,
            title = p_title,
            content = p_content,
            content_embedding = COALESCE(p_content_embedding, content_embedding),
            insights = COALESCE(p_insights, insights),
            recommendations = COALESCE(p_recommendations, recommendations),
            metrics = COALESCE(p_metrics, metrics),
            date_range_start = COALESCE(p_date_range_start, date_range_start),
            date_range_end = COALESCE(p_date_range_end, date_range_end),
            model_used = COALESCE(p_model_used, model_used),
            processing_time_ms = COALESCE(p_processing_time_ms, processing_time_ms),
            confidence_score = COALESCE(p_confidence_score, confidence_score),
            status = p_status,
            updated_at = NOW()
        WHERE ai_reports.id = p_report_id;

        v_operation_type := 'updated';
    ELSE
        -- Insert new report
        INSERT INTO ai_reports (
            user_id,
            report_type,
            title,
            content,
            content_embedding,
            insights,
            recommendations,
            metrics,
            date_range_start,
            date_range_end,
            model_used,
            processing_time_ms,
            confidence_score,
            status
        ) VALUES (
            p_user_id,
            p_report_type,
            p_title,
            p_content,
            p_content_embedding,
            p_insights,
            p_recommendations,
            p_metrics,
            p_date_range_start,
            p_date_range_end,
            p_model_used,
            p_processing_time_ms,
            p_confidence_score,
            p_status
        ) RETURNING ai_reports.id INTO v_report_id;

        v_operation_type := 'created';
    END IF;

    -- Return the upserted report
    RETURN QUERY
    SELECT 
        ar.id,
        ar.user_id,
        ar.report_type,
        ar.title,
        ar.content,
        ar.content_embedding,
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
        v_operation_type::TEXT as operation_type
    FROM ai_reports ar
    WHERE ar.id = v_report_id;

END;
$$;
