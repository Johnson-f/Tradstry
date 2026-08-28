-- Cascading user/workspace deletion fires source DELETE triggers after the
-- parent row is no longer referenceable. In that case there is nothing left to
-- index, and attempting to enqueue work would violate the outbox foreign keys.
CREATE OR REPLACE FUNCTION agent_enqueue_index_work(
    p_user_id TEXT,
    p_workspace_id TEXT,
    p_source_type TEXT,
    p_source_id TEXT,
    p_operation TEXT
) RETURNS VOID AS $$
BEGIN
    IF p_user_id IS NULL OR p_workspace_id IS NULL OR p_source_id IS NULL THEN
        RETURN;
    END IF;
    INSERT INTO agent_index_outbox
        (user_id, workspace_id, source_type, source_id, operation)
    SELECT p_user_id, p_workspace_id, p_source_type, p_source_id, p_operation
    WHERE EXISTS (SELECT 1 FROM users WHERE id = p_user_id)
      AND EXISTS (
          SELECT 1 FROM workspaces WHERE id = p_workspace_id AND user_id = p_user_id
      )
    ON CONFLICT (user_id, workspace_id, source_type, source_id)
        WHERE status = 'queued'
    DO UPDATE SET operation = EXCLUDED.operation, available_at = now(),
                  updated_at = now(), error_code = NULL;
END;
$$ LANGUAGE plpgsql;
