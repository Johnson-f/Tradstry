-- 05_playbook/04_playbook_select.sql

-- Function to get all playbook setups for the current user
CREATE OR REPLACE FUNCTION get_playbook()
RETURNS SETOF playbook
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM playbook
    WHERE user_id = auth.uid()
    ORDER BY updated_at DESC, name;
END;
$$ LANGUAGE plpgsql;

-- Function to get a single playbook setup by its ID for the current user
CREATE OR REPLACE FUNCTION get_playbook_by_id(
    p_id UUID
)
RETURNS SETOF playbook
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM playbook
    WHERE id = p_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql;
