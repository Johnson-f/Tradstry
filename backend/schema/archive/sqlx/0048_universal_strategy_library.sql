-- User-owned strategy definitions, universal by default, with optional
-- selected-workspace applicability. Workspace trading data remains isolated.

ALTER TABLE playbooks
    ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'all'
    CHECK (availability IN ('all', 'selected'));
ALTER TABLE tag_categories
    ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'all'
    CHECK (availability IN ('all', 'selected'));

CREATE TABLE IF NOT EXISTS playbook_workspace_applicability (
    playbook_id TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    PRIMARY KEY (playbook_id, workspace_id)
);
CREATE TABLE IF NOT EXISTS tag_category_workspace_applicability (
    category_id TEXT NOT NULL REFERENCES tag_categories(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    PRIMARY KEY (category_id, workspace_id)
);

-- Cross-workspace references are valid once definitions are user-owned.
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_playbook_workspace_fk;
ALTER TABLE trading_principles DROP CONSTRAINT IF EXISTS principles_playbook_workspace_fk;
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_category_workspace_fk;
ALTER TABLE journal_entries
    ADD CONSTRAINT journal_playbook_fk FOREIGN KEY (playbook_id) REFERENCES playbooks(id);
ALTER TABLE trading_principles
    ADD CONSTRAINT principles_playbook_fk FOREIGN KEY (playbook_id) REFERENCES playbooks(id);

-- Merge exact playbook clones produced by the workspace migration. Differing
-- definitions remain distinct even when they share a display name.
CREATE TEMP TABLE strategy_playbook_merge ON COMMIT DROP AS
SELECT id AS old_id, canonical_id
FROM (
    SELECT id,
           first_value(id) OVER (
               PARTITION BY user_id, lower(name), lower(edge_name), entry_rules,
                            exit_rules, position_sizing_rules, COALESCE(additional_rules, '')
               ORDER BY created_at, id
           ) AS canonical_id
    FROM playbooks
    WHERE deleted_at IS NULL
) ranked
WHERE id <> canonical_id;

UPDATE journal_entries j SET playbook_id = m.canonical_id
FROM strategy_playbook_merge m WHERE j.playbook_id = m.old_id;
UPDATE trading_principles p SET playbook_id = m.canonical_id
FROM strategy_playbook_merge m WHERE p.playbook_id = m.old_id;
DELETE FROM playbooks p USING strategy_playbook_merge m WHERE p.id = m.old_id;

-- Categories with a built-in role are one canonical category per user. Custom
-- categories merge only when their normalized names match.
DROP INDEX IF EXISTS idx_tagcat_workspace_name;
DROP INDEX IF EXISTS idx_tagcat_workspace_role;
DROP INDEX IF EXISTS idx_tags_workspace_cat_name;

CREATE TEMP TABLE strategy_category_merge ON COMMIT DROP AS
SELECT id AS old_id, canonical_id
FROM (
    SELECT id,
           first_value(id) OVER (
               PARTITION BY user_id, COALESCE('role:' || role, 'name:' || lower(name))
               ORDER BY created_at, id
           ) AS canonical_id
    FROM tag_categories
    WHERE deleted_at IS NULL
) ranked
WHERE id <> canonical_id;

UPDATE tags t SET category_id = m.canonical_id
FROM strategy_category_merge m WHERE t.category_id = m.old_id;
DELETE FROM tag_categories c USING strategy_category_merge m WHERE c.id = m.old_id;

-- Merge duplicate tags after their categories have been canonicalized while
-- preserving every historical trade-tag link.
CREATE TEMP TABLE strategy_tag_merge ON COMMIT DROP AS
SELECT id AS old_id, canonical_id
FROM (
    SELECT id,
           first_value(id) OVER (
               PARTITION BY user_id, category_id, lower(name)
               ORDER BY created_at, id
           ) AS canonical_id
    FROM tags
    WHERE deleted_at IS NULL
) ranked
WHERE id <> canonical_id;

INSERT INTO trade_tags (journal_entry_id, tag_id)
SELECT tt.journal_entry_id, m.canonical_id
FROM trade_tags tt JOIN strategy_tag_merge m ON m.old_id = tt.tag_id
ON CONFLICT DO NOTHING;
DELETE FROM trade_tags tt USING strategy_tag_merge m WHERE tt.tag_id = m.old_id;
DELETE FROM tags t USING strategy_tag_merge m WHERE t.id = m.old_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tagcat_user_name
    ON tag_categories (user_id, lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tagcat_user_role
    ON tag_categories (user_id, role) WHERE role IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_user_cat_name
    ON tags (user_id, category_id, lower(name)) WHERE deleted_at IS NULL;

-- `workspace_id` remains the sync origin for backward-compatible desktop
-- mutation routing. Rehome origins before deleting a non-final workspace so a
-- universal definition never disappears merely because an account was removed.
CREATE OR REPLACE FUNCTION rehome_strategy_library_before_workspace_delete()
RETURNS trigger AS $$
DECLARE replacement TEXT;
BEGIN
    SELECT id INTO replacement FROM workspaces
    WHERE user_id = OLD.user_id AND id <> OLD.id
    ORDER BY created_at, id LIMIT 1;
    IF replacement IS NOT NULL THEN
        UPDATE playbooks SET workspace_id = replacement WHERE workspace_id = OLD.id;
        UPDATE tag_categories SET workspace_id = replacement WHERE workspace_id = OLD.id;
        UPDATE tags SET workspace_id = replacement WHERE workspace_id = OLD.id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rehome_strategy_library ON workspaces;
CREATE TRIGGER trg_rehome_strategy_library
BEFORE DELETE ON workspaces FOR EACH ROW
EXECUTE FUNCTION rehome_strategy_library_before_workspace_delete();
