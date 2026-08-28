CREATE TABLE snaptrade_oauth_grants (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    oauth_client_id TEXT NOT NULL,
    snaptrade_user_id TEXT,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    access_token_expires_at TIMESTAMPTZ,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    authorized_at TIMESTAMPTZ,
    last_refreshed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT snaptrade_oauth_grants_user_client_unique
        UNIQUE (user_id, oauth_client_id),
    CONSTRAINT snaptrade_oauth_grants_status_check
        CHECK (status IN ('active', 'reauthorization_required', 'revoked')),
    CONSTRAINT snaptrade_oauth_grants_active_credentials_check CHECK (
        status <> 'active'
        OR (
            snaptrade_user_id IS NOT NULL
            AND access_token_encrypted IS NOT NULL
            AND refresh_token_encrypted IS NOT NULL
            AND access_token_expires_at IS NOT NULL
            AND authorized_at IS NOT NULL
        )
    )
);

CREATE INDEX idx_snaptrade_oauth_grants_snaptrade_user
    ON snaptrade_oauth_grants (oauth_client_id, snaptrade_user_id)
    WHERE snaptrade_user_id IS NOT NULL;

CREATE OR REPLACE TRIGGER trg_snaptrade_oauth_grants_updated_at
    BEFORE UPDATE ON snaptrade_oauth_grants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE snaptrade_oauth_attempts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    state_hash TEXT NOT NULL UNIQUE,
    code_verifier_encrypted TEXT NOT NULL,
    requested_scopes TEXT[] NOT NULL,
    platform TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error_code TEXT,
    grant_id TEXT REFERENCES snaptrade_oauth_grants(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT snaptrade_oauth_attempts_platform_check
        CHECK (platform IN ('web', 'desktop')),
    CONSTRAINT snaptrade_oauth_attempts_status_check
        CHECK (status IN ('pending', 'processing', 'authorized', 'denied', 'failed', 'expired')),
    CONSTRAINT snaptrade_oauth_attempts_consumption_check CHECK (
        (status = 'pending' AND consumed_at IS NULL)
        OR (status <> 'pending' AND consumed_at IS NOT NULL)
    )
);

CREATE INDEX idx_snaptrade_oauth_attempts_user_created
    ON snaptrade_oauth_attempts (user_id, created_at DESC);
CREATE INDEX idx_snaptrade_oauth_attempts_expiry
    ON snaptrade_oauth_attempts (expires_at)
    WHERE status = 'pending';

CREATE OR REPLACE TRIGGER trg_snaptrade_oauth_attempts_updated_at
    BEFORE UPDATE ON snaptrade_oauth_attempts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE brokerage_connections
    ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'commercial',
    ADD COLUMN oauth_grant_id TEXT REFERENCES snaptrade_oauth_grants(id) ON DELETE SET NULL;

ALTER TABLE brokerage_connections
    ADD CONSTRAINT brokerage_connections_auth_mode_check
        CHECK (auth_mode IN ('commercial', 'oauth')),
    ADD CONSTRAINT brokerage_connections_auth_source_check CHECK (
        (
            auth_mode = 'commercial'
            AND oauth_grant_id IS NULL
        )
        OR (
            auth_mode = 'oauth'
            AND oauth_grant_id IS NOT NULL
            AND snaptrade_user_secret_encrypted IS NULL
        )
    ),
    ADD CONSTRAINT brokerage_connections_commercial_credentials_check CHECK (
        auth_mode <> 'commercial'
        OR snaptrade_connection_id IS NULL
        OR (
            snaptrade_user_id IS NOT NULL
            AND snaptrade_user_secret_encrypted IS NOT NULL
        )
    ) NOT VALID;

CREATE INDEX idx_brokerage_connections_oauth_grant
    ON brokerage_connections (oauth_grant_id)
    WHERE oauth_grant_id IS NOT NULL;

ALTER TABLE snaptrade_webhook_events
    ADD COLUMN oauth_client_id TEXT;

CREATE INDEX idx_snaptrade_webhook_events_oauth_client
    ON snaptrade_webhook_events (oauth_client_id, snaptrade_user_id)
    WHERE oauth_client_id IS NOT NULL;
