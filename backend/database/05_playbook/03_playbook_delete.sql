-- 05_playbook/03_playbook_delete.sql

CREATE OR REPLACE FUNCTION delete_playbook(
    p_id UUID
)
RETURNS void
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    DELETE FROM playbook
    WHERE id = p_id AND user_id = v_user_id;
END;
$$ LANGUAGE plpgsql;
