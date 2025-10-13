-- 05_playbook/02_playbook_upsert.sql

CREATE OR REPLACE FUNCTION upsert_playbook(
    p_id UUID,
    p_name TEXT,
    p_description TEXT
)
RETURNS SETOF playbook
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    RETURN QUERY
    INSERT INTO playbook (id, user_id, name, description)
    VALUES (COALESCE(p_id, gen_random_uuid()), v_user_id, p_name, p_description)
    ON CONFLICT (id) DO UPDATE
    SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        updated_at = now()
    WHERE
        playbook.user_id = v_user_id -- Security check
    RETURNING *;
END;
$$ LANGUAGE plpgsql;
