-- AI Chat History Delete Function
-- Deletes chat messages with validation and session management
CREATE OR REPLACE FUNCTION delete_ai_chat_message(
    p_user_id UUID,
    p_message_id UUID
)
RETURNS TABLE(
    id UUID,
    session_id UUID,
    message_type VARCHAR(20),
    content_preview TEXT,
    deleted_at TIMESTAMPTZ,
    operation_type TEXT -- 'message_deleted'
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_message_record RECORD;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only delete their own chat messages.';
    END IF;

    -- Check if message exists and belongs to user
    SELECT ch.id, ch.session_id, ch.message_type, ch.content
    INTO v_message_record
    FROM ai_chat_history ch
    WHERE ch.id = p_message_id AND ch.user_id = p_user_id;

    IF v_message_record.id IS NULL THEN
        RAISE EXCEPTION 'Chat message not found or access denied.';
    END IF;

    -- Delete the message
    DELETE FROM ai_chat_history 
    WHERE id = p_message_id;

    RETURN QUERY
    SELECT 
        v_message_record.id,
        v_message_record.session_id,
        v_message_record.message_type,
        LEFT(v_message_record.content, 100)::TEXT as content_preview,
        NOW() as deleted_at,
        'message_deleted'::TEXT as operation_type;

END;
$$;

-- Delete entire chat session
CREATE OR REPLACE FUNCTION delete_chat_session(
    p_user_id UUID,
    p_session_id UUID
)
RETURNS TABLE(
    session_id UUID,
    messages_deleted INTEGER,
    deleted_at TIMESTAMPTZ,
    operation_type TEXT -- 'session_deleted'
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_message_count INTEGER;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only delete their own chat sessions.';
    END IF;

    -- Check if session exists and belongs to user
    SELECT COUNT(*)::INTEGER INTO v_message_count
    FROM ai_chat_history ch
    WHERE ch.session_id = p_session_id AND ch.user_id = p_user_id;

    IF v_message_count = 0 THEN
        RAISE EXCEPTION 'Chat session not found or access denied.';
    END IF;

    -- Delete all messages in the session
    DELETE FROM ai_chat_history 
    WHERE session_id = p_session_id AND user_id = p_user_id;

    RETURN QUERY
    SELECT 
        p_session_id as session_id,
        v_message_count as messages_deleted,
        NOW() as deleted_at,
        'session_deleted'::TEXT as operation_type;

END;
$$;

-- Bulk delete multiple messages
CREATE OR REPLACE FUNCTION delete_chat_messages_bulk(
    p_user_id UUID,
    p_message_ids UUID[]
)
RETURNS TABLE(
    id UUID,
    session_id UUID,
    message_type VARCHAR(20),
    content_preview TEXT,
    deleted_at TIMESTAMPTZ,
    operation_type TEXT,
    success BOOLEAN,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_message_id UUID;
    v_message_record RECORD;
    v_deleted_count INTEGER := 0;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only delete their own chat messages.';
    END IF;

    -- Validate input
    IF p_message_ids IS NULL OR array_length(p_message_ids, 1) = 0 THEN
        RAISE EXCEPTION 'No message IDs provided for deletion.';
    END IF;

    -- Limit bulk operations to prevent abuse
    IF array_length(p_message_ids, 1) > 100 THEN
        RAISE EXCEPTION 'Cannot delete more than 100 messages at once.';
    END IF;

    -- Process each message ID
    FOREACH v_message_id IN ARRAY p_message_ids
    LOOP
        BEGIN
            -- Check if message exists and belongs to user
            SELECT ch.id, ch.session_id, ch.message_type, ch.content
            INTO v_message_record
            FROM ai_chat_history ch
            WHERE ch.id = v_message_id AND ch.user_id = p_user_id;

            IF v_message_record.id IS NULL THEN
                -- Message not found or access denied
                RETURN QUERY
                SELECT 
                    v_message_id,
                    NULL::UUID as session_id,
                    NULL::VARCHAR(20) as message_type,
                    NULL::TEXT as content_preview,
                    NOW() as deleted_at,
                    'message_deleted'::TEXT as operation_type,
                    FALSE as success,
                    'Message not found or access denied'::TEXT as error_message;
                CONTINUE;
            END IF;

            -- Delete the message
            DELETE FROM ai_chat_history 
            WHERE id = v_message_id;

            v_deleted_count := v_deleted_count + 1;

            -- Return success record
            RETURN QUERY
            SELECT 
                v_message_record.id,
                v_message_record.session_id,
                v_message_record.message_type,
                LEFT(v_message_record.content, 100)::TEXT as content_preview,
                NOW() as deleted_at,
                'message_deleted'::TEXT as operation_type,
                TRUE as success,
                NULL::TEXT as error_message;

        EXCEPTION WHEN OTHERS THEN
            -- Handle individual record errors
            RETURN QUERY
            SELECT 
                v_message_id,
                NULL::UUID as session_id,
                NULL::VARCHAR(20) as message_type,
                NULL::TEXT as content_preview,
                NOW() as deleted_at,
                'message_deleted'::TEXT as operation_type,
                FALSE as success,
                SQLERRM::TEXT as error_message;
        END;
    END LOOP;

    -- Log the bulk operation
    RAISE NOTICE 'Bulk delete completed. % messages processed, % successfully deleted.', 
        array_length(p_message_ids, 1), v_deleted_count;

END;
$$;

-- Delete old chat messages (cleanup)
CREATE OR REPLACE FUNCTION cleanup_old_chat_history(
    p_user_id UUID,
    p_older_than_days INTEGER DEFAULT 90,
    p_keep_high_usage BOOLEAN DEFAULT TRUE,
    p_usage_threshold INTEGER DEFAULT 5
)
RETURNS TABLE(
    deleted_count INTEGER,
    cleanup_date TIMESTAMPTZ,
    criteria TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
    v_cutoff_date TIMESTAMPTZ;
    v_criteria TEXT;
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only cleanup their own chat history.';
    END IF;

    -- Calculate cutoff date
    v_cutoff_date := NOW() - (p_older_than_days || ' days')::INTERVAL;

    -- Build criteria description
    v_criteria := 'Messages older than ' || p_older_than_days || ' days';
    
    IF p_keep_high_usage THEN
        v_criteria := v_criteria || ', excluding high-usage messages (usage_count >= ' || p_usage_threshold || ')';
        
        -- Delete old messages but keep frequently used ones
        DELETE FROM ai_chat_history 
        WHERE user_id = p_user_id 
            AND created_at < v_cutoff_date
            AND usage_count < p_usage_threshold;
    ELSE
        v_criteria := v_criteria || ', including all messages regardless of usage';
        
        -- Delete all old messages
        DELETE FROM ai_chat_history 
        WHERE user_id = p_user_id 
            AND created_at < v_cutoff_date;
    END IF;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN QUERY
    SELECT 
        v_deleted_count as deleted_count,
        NOW() as cleanup_date,
        v_criteria as criteria;

END;
$$;

-- Delete messages by session age
CREATE OR REPLACE FUNCTION delete_old_chat_sessions(
    p_user_id UUID,
    p_older_than_days INTEGER DEFAULT 180
)
RETURNS TABLE(
    sessions_deleted INTEGER,
    messages_deleted INTEGER,
    cleanup_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sessions_deleted INTEGER;
    v_messages_deleted INTEGER;
    v_cutoff_date TIMESTAMPTZ;
    v_old_sessions UUID[];
BEGIN
    -- Validate user authentication
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied. User can only cleanup their own chat sessions.';
    END IF;

    -- Calculate cutoff date
    v_cutoff_date := NOW() - (p_older_than_days || ' days')::INTERVAL;

    -- Find old sessions
    SELECT ARRAY_AGG(DISTINCT session_id) INTO v_old_sessions
    FROM ai_chat_history
    WHERE user_id = p_user_id
        AND created_at < v_cutoff_date;

    IF v_old_sessions IS NULL THEN
        v_sessions_deleted := 0;
        v_messages_deleted := 0;
    ELSE
        v_sessions_deleted := array_length(v_old_sessions, 1);
        
        -- Count messages to be deleted
        SELECT COUNT(*)::INTEGER INTO v_messages_deleted
        FROM ai_chat_history
        WHERE user_id = p_user_id
            AND session_id = ANY(v_old_sessions);

        -- Delete messages from old sessions
        DELETE FROM ai_chat_history
        WHERE user_id = p_user_id
            AND session_id = ANY(v_old_sessions);
    END IF;

    RETURN QUERY
    SELECT 
        v_sessions_deleted as sessions_deleted,
        v_messages_deleted as messages_deleted,
        NOW() as cleanup_date;

END;
$$;
