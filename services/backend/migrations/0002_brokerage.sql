-- Commercial: the SnapTrade user Tradstry registered for a Tradstry user.
CREATE TABLE snaptrade_registrations (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    snaptrade_user_id text NOT NULL UNIQUE,
    user_secret_encrypted text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- OAuth: a Tradstry user's authorization of the SnapTrade Personal OAuth app.
CREATE TABLE snaptrade_oauth_grants (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    oauth_client_id text NOT NULL,
    personal_user_id text NOT NULL,
    access_token_encrypted text,
    refresh_token_encrypted text,
    access_token_expires_at timestamptz,
    scopes text[] NOT NULL DEFAULT '{}',
    status text NOT NULL CHECK (status IN ('active', 'reauthorization_required', 'revoked')),
    authorized_at timestamptz NOT NULL DEFAULT now(),
    refreshed_at timestamptz,
    revoked_at timestamptz,
    UNIQUE (user_id, oauth_client_id),
    -- Only an active grant may hold usable credentials, and it must hold all of them.
    CHECK (
        (status = 'active') = (
            access_token_encrypted IS NOT NULL
            AND refresh_token_encrypted IS NOT NULL
            AND access_token_expires_at IS NOT NULL
        )
    )
);

-- One SnapTrade Personal identity belongs to one Tradstry user at a time, so
-- OAuth webhooks route unambiguously.
CREATE UNIQUE INDEX snaptrade_oauth_grants_identity_idx
    ON snaptrade_oauth_grants (oauth_client_id, personal_user_id)
    WHERE status <> 'revoked';

-- A single-use OAuth authorization attempt. The state is stored only as a hash.
CREATE TABLE snaptrade_oauth_attempts (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    state_hash text NOT NULL UNIQUE,
    code_verifier_encrypted text NOT NULL,
    scopes text[] NOT NULL,
    intent text NOT NULL CHECK (intent IN ('connect', 'reauthorize')),
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'authorized', 'denied', 'failed')),
    error_code text,
    grant_id uuid REFERENCES snaptrade_oauth_grants (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    CHECK (status <> 'authorized' OR grant_id IS NOT NULL)
);

CREATE INDEX snaptrade_oauth_attempts_expiry_idx ON snaptrade_oauth_attempts (expires_at);

-- One SnapTrade connection (a login at one institution) a user linked.
CREATE TABLE brokerage_connections (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    auth_mode text NOT NULL CHECK (auth_mode IN ('commercial', 'oauth')),
    oauth_grant_id uuid REFERENCES snaptrade_oauth_grants (id),
    snaptrade_connection_id text NOT NULL,
    institution_name text NOT NULL,
    institution_slug text,
    disabled boolean NOT NULL DEFAULT false,
    disabled_at timestamptz,
    data_freshness_mode text,
    new_accounts_available boolean NOT NULL DEFAULT false,
    checked_at timestamptz,
    unlinked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, snaptrade_connection_id),
    CHECK ((auth_mode = 'oauth') = (oauth_grant_id IS NOT NULL))
);

CREATE INDEX brokerage_connections_grant_idx ON brokerage_connections (oauth_grant_id);
CREATE INDEX brokerage_connections_snaptrade_idx ON brokerage_connections (snaptrade_connection_id);

-- One SnapTrade account a user chose to import.
CREATE TABLE brokerage_accounts (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    connection_id uuid NOT NULL REFERENCES brokerage_connections (id) ON DELETE CASCADE,
    snaptrade_account_id text NOT NULL,
    name text NOT NULL,
    masked_number text,
    kind text NOT NULL,
    raw_type text,
    is_paper boolean NOT NULL DEFAULT false,
    import_mode text NOT NULL CHECK (import_mode IN ('one_year', 'two_years', 'all', 'custom')),
    -- Null means all available history.
    import_start_date date,
    initial_import_completed_at timestamptz,
    unlinked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, snaptrade_account_id)
);

CREATE INDEX brokerage_accounts_connection_idx ON brokerage_accounts (connection_id);
CREATE INDEX brokerage_accounts_snaptrade_idx ON brokerage_accounts (snaptrade_account_id);

ALTER TABLE workspaces
    ADD COLUMN brokerage_account_id uuid UNIQUE REFERENCES brokerage_accounts (id) ON DELETE SET NULL;

-- Every SnapTrade webhook received, deduplicated by SnapTrade's webhookId.
CREATE TABLE snaptrade_webhook_events (
    webhook_id text PRIMARY KEY,
    event_type text NOT NULL,
    snaptrade_user_id text,
    oauth_client_id text,
    snaptrade_connection_id text,
    snaptrade_account_id text,
    event_timestamp timestamptz NOT NULL,
    payload jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    outcome text,
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    last_error text
);

CREATE INDEX snaptrade_webhook_events_pending_idx
    ON snaptrade_webhook_events (next_attempt_at)
    WHERE processed_at IS NULL;
