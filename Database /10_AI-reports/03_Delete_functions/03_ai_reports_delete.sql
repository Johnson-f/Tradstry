-- AI Reports Delete Function
-- Deletes AI reports with validation and optional soft delete
CREATE OR REPLACE FUNCTION delete_ai_report(
    p_user_id UUID,
    p_report_id UUID,
    p_soft_delete BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
    id UUID,
    title VARCHAR(255),
    report_type VARCHAR(50),
    deleted_at TIMESTAMPTZ,
    operation_type TEXT -- 'soft_deleted' or 'permanently_deleted'
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_report_record RECORD;
    v_operation_type TEXT;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only delete their own reports.';
    END IF;

    -- Check if report exists and belongs to user
    SELECT ar.id, ar.title, ar.report_type, ar.created_at
    INTO v_report_record
    FROM ai_reports ar
    WHERE ar.id = p_report_id AND ar.user_id = p_user_id;

    IF v_report_record.id IS NULL THEN
        RAISE EXCEPTION 'Report not found or access denied.';
    END IF;

    IF p_soft_delete THEN
        -- Soft delete: Add deleted_at timestamp (requires adding this column to table)
        -- For now, we'll update status to 'deleted' as a soft delete mechanism
        UPDATE ai_reports 
        SET 
            status = 'deleted',
            updated_at = NOW()
        WHERE id = p_report_id;
        
        v_operation_type := 'soft_deleted';
        
        RETURN QUERY
        SELECT 
            v_report_record.id,
            v_report_record.title,
            v_report_record.report_type,
            NOW() as deleted_at,
            v_operation_type::TEXT as operation_type;
    ELSE
        -- Hard delete: Permanently remove the record
        DELETE FROM ai_reports 
        WHERE id = p_report_id;
        
        v_operation_type := 'permanently_deleted';
        
        RETURN QUERY
        SELECT 
            v_report_record.id,
            v_report_record.title,
            v_report_record.report_type,
            NOW() as deleted_at,
            v_operation_type::TEXT as operation_type;
    END IF;

END;
$$;

-- Bulk delete function for multiple reports
CREATE OR REPLACE FUNCTION delete_ai_reports_bulk(
    p_user_id UUID,
    p_report_ids UUID[],
    p_soft_delete BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
    id UUID,
    title VARCHAR(255),
    report_type VARCHAR(50),
    deleted_at TIMESTAMPTZ,
    operation_type TEXT,
    success BOOLEAN,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_report_id UUID;
    v_report_record RECORD;
    v_operation_type TEXT;
    v_deleted_count INTEGER := 0;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only delete their own reports.';
    END IF;

    -- Validate input
    IF p_report_ids IS NULL OR array_length(p_report_ids, 1) = 0 THEN
        RAISE EXCEPTION 'No report IDs provided for deletion.';
    END IF;

    -- Limit bulk operations to prevent abuse
    IF array_length(p_report_ids, 1) > 50 THEN
        RAISE EXCEPTION 'Cannot delete more than 50 reports at once.';
    END IF;

    -- Set operation type
    v_operation_type := CASE WHEN p_soft_delete THEN 'soft_deleted' ELSE 'permanently_deleted' END;

    -- Process each report ID
    FOREACH v_report_id IN ARRAY p_report_ids
    LOOP
        BEGIN
            -- Check if report exists and belongs to user
            SELECT ar.id, ar.title, ar.report_type
            INTO v_report_record
            FROM ai_reports ar
            WHERE ar.id = v_report_id AND ar.user_id = p_user_id;

            IF v_report_record.id IS NULL THEN
                -- Report not found or access denied
                RETURN QUERY
                SELECT 
                    v_report_id,
                    NULL::VARCHAR(255) as title,
                    NULL::VARCHAR(50) as report_type,
                    NOW() as deleted_at,
                    v_operation_type::TEXT as operation_type,
                    FALSE as success,
                    'Report not found or access denied'::TEXT as error_message;
                CONTINUE;
            END IF;

            IF p_soft_delete THEN
                -- Soft delete
                UPDATE ai_reports 
                SET 
                    status = 'deleted',
                    updated_at = NOW()
                WHERE id = v_report_id;
            ELSE
                -- Hard delete
                DELETE FROM ai_reports 
                WHERE id = v_report_id;
            END IF;

            v_deleted_count := v_deleted_count + 1;

            -- Return success record
            RETURN QUERY
            SELECT 
                v_report_record.id,
                v_report_record.title,
                v_report_record.report_type,
                NOW() as deleted_at,
                v_operation_type::TEXT as operation_type,
                TRUE as success,
                NULL::TEXT as error_message;

        EXCEPTION WHEN OTHERS THEN
            -- Handle individual record errors
            RETURN QUERY
            SELECT 
                v_report_id,
                NULL::VARCHAR(255) as title,
                NULL::VARCHAR(50) as report_type,
                NOW() as deleted_at,
                v_operation_type::TEXT as operation_type,
                FALSE as success,
                SQLERRM::TEXT as error_message;
        END;
    END LOOP;

    -- Log the bulk operation (optional)
    RAISE NOTICE 'Bulk delete completed. % reports processed, % successfully deleted.', 
        array_length(p_report_ids, 1), v_deleted_count;

END;
$$;

-- Function to permanently delete soft-deleted reports (cleanup)
CREATE OR REPLACE FUNCTION cleanup_deleted_ai_reports(
    p_user_id UUID,
    p_older_than_days INTEGER DEFAULT 30
)
RETURNS TABLE(
    deleted_count INTEGER,
    cleanup_date TIMESTAMPTZ
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
        RAISE EXCEPTION 'Access denied. User can only cleanup their own reports.';
    END IF;

    -- Calculate cutoff date
    v_cutoff_date := NOW() - (p_older_than_days || ' days')::INTERVAL;

    -- Delete reports that have been soft-deleted and are older than cutoff
    DELETE FROM ai_reports 
    WHERE user_id = p_user_id 
        AND status = 'deleted' 
        AND updated_at < v_cutoff_date;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN QUERY
    SELECT 
        v_deleted_count as deleted_count,
        NOW() as cleanup_date;

END;
$$;
