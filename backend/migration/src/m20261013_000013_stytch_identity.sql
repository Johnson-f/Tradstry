ALTER TABLE users ADD COLUMN IF NOT EXISTS stytch_user_id text;
ALTER TABLE users ALTER COLUMN clerk_uuid DROP NOT NULL;

DO $stytch$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'u' AND pg_get_constraintdef(oid, true) = 'UNIQUE (stytch_user_id)') THEN
        ALTER TABLE users ADD CONSTRAINT users_stytch_user_id_key UNIQUE (stytch_user_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'agent_action_proposals' AND column_name = 'approved_by_clerk_id') THEN
        ALTER TABLE agent_action_proposals RENAME COLUMN approved_by_clerk_id TO approved_by_subject;
    END IF;
END $stytch$;
