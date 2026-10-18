-- Fills the user confirmed belong to one order, so they read as one action.
CREATE TABLE IF NOT EXISTS journal_action_joins (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    execution_ids text[] NOT NULL,
    created_at timestamptz NOT NULL,
    revoked_at timestamptz
);
ALTER TABLE journal_action_joins ALTER COLUMN created_at SET DEFAULT now();

-- Notes written on an action as a trade happens, and hindsight notes added
-- after one locks. A note points at the execution that starts its action
-- (and its role, because a reversing fill is in two trades), never at a trade
-- row, so regrouping moves it with its executions.
CREATE TABLE IF NOT EXISTS journal_action_notes (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    anchor_execution_id text NOT NULL,
    anchor_role text NOT NULL,
    execution_ids text[] NOT NULL,
    kind text NOT NULL,
    parent_id text,
    reason text NOT NULL,
    stop_price numeric,
    target_price numeric,
    seen_through timestamptz NOT NULL,
    written_late boolean NOT NULL,
    record_version bigint NOT NULL,
    locked_at timestamptz,
    orphaned_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);
ALTER TABLE journal_action_notes ALTER COLUMN reason SET DEFAULT '';
ALTER TABLE journal_action_notes ALTER COLUMN written_late SET DEFAULT false;
ALTER TABLE journal_action_notes ALTER COLUMN record_version SET DEFAULT 1;
ALTER TABLE journal_action_notes ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE journal_action_notes ALTER COLUMN updated_at SET DEFAULT now();

-- A trade the user chose not to review, and why.
CREATE TABLE IF NOT EXISTS journal_review_skips (
    id text PRIMARY KEY,
    entry_id text NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    session_id text REFERENCES journal_review_sessions(id) ON DELETE SET NULL,
    reason text NOT NULL,
    created_at timestamptz NOT NULL,
    revoked_at timestamptz
);
ALTER TABLE journal_review_skips ALTER COLUMN created_at SET DEFAULT now();

DO $trade_actions$ BEGIN
    -- Composite ownership keys and the note parent key depend on indexes that
    -- entity sync doesn't create, so fresh databases get them here too.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_action_joins'::regclass AND contype='f'
                   AND pg_get_constraintdef(oid)='FOREIGN KEY (workspace_id, user_id) REFERENCES workspaces(id, user_id) ON DELETE CASCADE') THEN
        ALTER TABLE journal_action_joins ADD CONSTRAINT journal_action_joins_workspace_owner_fkey
            FOREIGN KEY (workspace_id, user_id) REFERENCES workspaces(id, user_id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_action_joins'::regclass AND conname='journal_action_joins_size_check') THEN
        ALTER TABLE journal_action_joins ADD CONSTRAINT journal_action_joins_size_check CHECK (cardinality(execution_ids) >= 2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_action_notes'::regclass AND contype='f'
                   AND pg_get_constraintdef(oid)='FOREIGN KEY (workspace_id, user_id) REFERENCES workspaces(id, user_id) ON DELETE CASCADE') THEN
        ALTER TABLE journal_action_notes ADD CONSTRAINT journal_action_notes_workspace_owner_fkey
            FOREIGN KEY (workspace_id, user_id) REFERENCES workspaces(id, user_id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_action_notes'::regclass AND conname='journal_action_notes_parent_id_fkey') THEN
        ALTER TABLE journal_action_notes ADD CONSTRAINT journal_action_notes_parent_id_fkey
            FOREIGN KEY (parent_id) REFERENCES journal_action_notes(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_action_notes'::regclass AND conname='journal_action_notes_role_check') THEN
        ALTER TABLE journal_action_notes ADD CONSTRAINT journal_action_notes_role_check CHECK (anchor_role IN ('entry','exit'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_action_notes'::regclass AND conname='journal_action_notes_kind_check') THEN
        ALTER TABLE journal_action_notes ADD CONSTRAINT journal_action_notes_kind_check
            CHECK ((kind = 'plan' AND parent_id IS NULL) OR (kind = 'hindsight' AND parent_id IS NOT NULL));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_action_notes'::regclass AND conname='journal_action_notes_prices_check') THEN
        ALTER TABLE journal_action_notes ADD CONSTRAINT journal_action_notes_prices_check
            CHECK ((stop_price IS NULL OR stop_price > 0) AND (target_price IS NULL OR target_price > 0));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_action_notes'::regclass AND conname='journal_action_notes_executions_check') THEN
        ALTER TABLE journal_action_notes ADD CONSTRAINT journal_action_notes_executions_check CHECK (cardinality(execution_ids) >= 1);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_review_skips'::regclass AND contype='f'
                   AND pg_get_constraintdef(oid)='FOREIGN KEY (workspace_id, user_id) REFERENCES workspaces(id, user_id) ON DELETE CASCADE') THEN
        ALTER TABLE journal_review_skips ADD CONSTRAINT journal_review_skips_workspace_owner_fkey
            FOREIGN KEY (workspace_id, user_id) REFERENCES workspaces(id, user_id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_review_skips'::regclass AND conname='journal_review_skips_reason_check') THEN
        ALTER TABLE journal_review_skips ADD CONSTRAINT journal_review_skips_reason_check
            CHECK (reason IN ('too_small','mistake_fill','review_later'));
    END IF;
END $trade_actions$;

CREATE INDEX IF NOT EXISTS journal_action_joins_active
    ON journal_action_joins (user_id, workspace_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS journal_action_notes_plan
    ON journal_action_notes (user_id, workspace_id, anchor_execution_id, anchor_role) WHERE kind = 'plan';
CREATE INDEX IF NOT EXISTS journal_action_notes_owner
    ON journal_action_notes (user_id, workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS journal_review_skips_active
    ON journal_review_skips (entry_id) WHERE revoked_at IS NULL;
