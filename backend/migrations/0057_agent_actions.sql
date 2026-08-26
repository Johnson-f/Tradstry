CREATE TABLE IF NOT EXISTS agent_action_proposals (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('create_notebook_note','update_playbook','add_trade_tag','remove_trade_tag')),
    payload_json JSONB NOT NULL,
    preview_json JSONB NOT NULL,
    expected_versions_json JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','executed','failed')),
    expires_at TIMESTAMPTZ NOT NULL,
    approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    approved_by_clerk_id TEXT,
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_action_proposals_conversation
    ON agent_action_proposals (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_action_proposals_pending
    ON agent_action_proposals (status, expires_at) WHERE status IN ('pending','approved');

CREATE TABLE IF NOT EXISTS agent_action_executions (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL UNIQUE REFERENCES agent_action_proposals(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
    lease_owner TEXT,
    leased_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    outcome_json JSONB,
    affected_records_json JSONB NOT NULL DEFAULT '[]',
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_action_executions_claimable
    ON agent_action_executions (status, created_at) WHERE status IN ('queued','running');
