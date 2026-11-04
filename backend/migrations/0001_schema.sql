CREATE TABLE users (
    id uuid PRIMARY KEY,
    stytch_user_id text NOT NULL UNIQUE,
    email text NOT NULL DEFAULT '',
    full_name text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Preferences that change how a user's results are measured and shown.
CREATE TABLE user_settings (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    -- Dollars at risk assumed for a trade with no stop or planned risk.
    default_risk numeric CHECK (default_risk > 0),
    -- Trades whose net is within this many dollars of zero count as breakeven.
    breakeven_band numeric NOT NULL DEFAULT 0 CHECK (breakeven_band >= 0),
    time_zone text NOT NULL DEFAULT 'local' CHECK (time_zone IN ('market', 'local')),
    week_start text NOT NULL DEFAULT 'sunday' CHECK (week_start IN ('sunday', 'monday')),
    default_period text NOT NULL DEFAULT '1m'
        CHECK (default_period IN ('today', '1w', '1m', '3m', '6m', 'ytd', '1y', 'all')),
    updated_at timestamptz NOT NULL DEFAULT now()
);

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
    -- The last day whose transactions are fully imported. SnapTrade reports
    -- transactions a day late, so this trails today.
    transactions_synced_through date,
    holdings_synced_at timestamptz,
    -- SnapTrade's standardised cash/margin flag. The account type itself is
    -- derived from raw_type in code, so it has no column.
    cash_or_margin text NOT NULL DEFAULT 'unknown'
        CHECK (cash_or_margin IN ('cash', 'margin', 'unknown')),
    UNIQUE (user_id, snaptrade_account_id)
);

CREATE INDEX brokerage_accounts_connection_idx ON brokerage_accounts (connection_id);
CREATE INDEX brokerage_accounts_snaptrade_idx ON brokerage_accounts (snaptrade_account_id);

CREATE TABLE workspaces (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    brokerage_account_id uuid UNIQUE REFERENCES brokerage_accounts (id) ON DELETE SET NULL,
    -- The balance a manual workspace sizes percent risk from. Workspaces linked
    -- to a brokerage use the latest holdings snapshot instead.
    planning_balance numeric CHECK (planning_balance > 0),
    -- The position calculator's rule: the percent of the balance risked per
    -- trade, and the widest stop, as a percent of the entry, before it warns.
    planning_risk_percent numeric CHECK (planning_risk_percent > 0 AND planning_risk_percent <= 100),
    max_stop_percent numeric CHECK (max_stop_percent > 0 AND max_stop_percent <= 100)
);

CREATE INDEX workspaces_user_id_idx ON workspaces (user_id, created_at);

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

-- Transactions, kept raw with the fields Tradstry indexes. `type` is stored as
-- SnapTrade sent it; unknown types are kept, never rejected.
CREATE TABLE brokerage_activities (
    account_id uuid NOT NULL REFERENCES brokerage_accounts (id) ON DELETE CASCADE,
    snaptrade_activity_id text NOT NULL,
    type text NOT NULL,
    trade_date timestamptz,
    settlement_date timestamptz,
    units double precision,
    price double precision,
    amount double precision,
    currency text,
    fee double precision,
    instrument_id text,
    symbol text,
    figi_code text,
    option_symbol text,
    description text,
    raw jsonb NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, snaptrade_activity_id)
);

CREATE INDEX brokerage_activities_trade_date_idx ON brokerage_activities (account_id, trade_date DESC);

CREATE TABLE brokerage_orders (
    account_id uuid NOT NULL REFERENCES brokerage_accounts (id) ON DELETE CASCADE,
    brokerage_order_id text NOT NULL,
    status text,
    action text,
    symbol text,
    total_units double precision,
    filled_units double precision,
    execution_price double precision,
    time_placed timestamptz,
    time_executed timestamptz,
    raw jsonb NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, brokerage_order_id)
);

CREATE INDEX brokerage_orders_placed_idx ON brokerage_orders (account_id, time_placed DESC);

-- Positions and balances as SnapTrade returned them at a point in time.
CREATE TABLE brokerage_snapshots (
    account_id uuid NOT NULL REFERENCES brokerage_accounts (id) ON DELETE CASCADE,
    captured_at timestamptz NOT NULL,
    positions jsonb NOT NULL,
    balances jsonb NOT NULL,
    PRIMARY KEY (account_id, captured_at)
);

-- One pending job per account and kind; enqueueing again moves it earlier.
CREATE TABLE sync_jobs (
    id uuid PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES brokerage_accounts (id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('initial', 'transactions', 'holdings')),
    due_at timestamptz NOT NULL,
    leased_until timestamptz,
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_id, kind)
);

CREATE INDEX sync_jobs_due_idx ON sync_jobs (due_at);

-- Inputs the user owns: fills typed by hand, starting positions, ticker
-- changes, and regrouping decisions. Broker fills stay in
-- brokerage_activities and are never edited.

CREATE TABLE manual_fills (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    instrument jsonb NOT NULL,
    instrument_key text NOT NULL,
    side text NOT NULL CHECK (side IN ('buy', 'sell')),
    quantity numeric NOT NULL CHECK (quantity > 0),
    price numeric NOT NULL CHECK (price >= 0),
    fee numeric NOT NULL DEFAULT 0 CHECK (fee >= 0),
    intent text CHECK (intent IN ('open', 'close')),
    executed_at timestamptz NOT NULL,
    note text NOT NULL DEFAULT '',
    record_version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX manual_fills_user_idx ON manual_fills (user_id) WHERE deleted_at IS NULL;

CREATE TABLE opening_positions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    instrument jsonb NOT NULL,
    instrument_key text NOT NULL,
    -- Negative for a short.
    quantity numeric NOT NULL CHECK (quantity <> 0),
    cost_per_unit numeric NOT NULL CHECK (cost_per_unit >= 0),
    acquired_at timestamptz NOT NULL,
    as_of timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, instrument_key)
);

-- Suggestions are computed on every rebuild; only the user's answers are kept.
CREATE TABLE instrument_aliases (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    from_key text NOT NULL,
    to_key text NOT NULL,
    effective_at timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('confirmed', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, from_key, to_key),
    CHECK (from_key <> to_key)
);

CREATE TABLE trade_decisions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    undone_at timestamptz
);

CREATE INDEX trade_decisions_user_idx ON trade_decisions (user_id) WHERE undone_at IS NULL;

-- Engine output. Replaced wholesale on every rebuild, so nothing the user
-- owns references these rows by foreign key.

CREATE TABLE trades (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id text NOT NULL,
    workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    kind text NOT NULL,
    parent_id text,
    children text[] NOT NULL DEFAULT '{}',
    instrument_key text NOT NULL,
    instrument jsonb NOT NULL,
    asset_class text NOT NULL,
    symbol text NOT NULL,
    underlying text NOT NULL,
    direction text,
    status text NOT NULL,
    opened_at timestamptz NOT NULL,
    closed_at timestamptz,
    max_quantity numeric NOT NULL,
    open_quantity numeric NOT NULL,
    avg_entry numeric,
    avg_exit numeric,
    gross numeric NOT NULL,
    fees numeric NOT NULL,
    net numeric,
    income numeric NOT NULL,
    entry_cost numeric NOT NULL,
    return_pct numeric,
    holding_seconds bigint,
    fill_count integer NOT NULL,
    non_economic boolean NOT NULL,
    related text[] NOT NULL DEFAULT '{}',
    decision_id uuid,
    strategy_label text,
    issues jsonb NOT NULL DEFAULT '[]',
    PRIMARY KEY (user_id, id)
);

CREATE INDEX trades_workspace_idx ON trades (workspace_id, opened_at DESC);

CREATE TABLE trade_fills (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    trade_id text NOT NULL,
    seq integer NOT NULL,
    fill_key text NOT NULL,
    role text NOT NULL,
    executed_at timestamptz NOT NULL,
    quantity numeric NOT NULL,
    price numeric NOT NULL,
    fee numeric NOT NULL,
    derived boolean NOT NULL,
    PRIMARY KEY (user_id, trade_id, seq)
);

CREATE INDEX trade_fills_key_idx ON trade_fills (user_id, fill_key);

CREATE TABLE trade_lots (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    lot_id text NOT NULL,
    trade_id text NOT NULL,
    workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    instrument_key text NOT NULL,
    direction text NOT NULL,
    opened_by text NOT NULL,
    acquired_at timestamptz NOT NULL,
    holding_from timestamptz NOT NULL,
    original_quantity numeric NOT NULL,
    quantity numeric NOT NULL,
    cost_per_unit numeric NOT NULL,
    fee_per_unit numeric NOT NULL,
    tax_cost_adjustment numeric NOT NULL,
    wash_basis_adjustment numeric NOT NULL,
    cost_known boolean NOT NULL,
    PRIMARY KEY (user_id, lot_id)
);

CREATE INDEX trade_lots_trade_idx ON trade_lots (user_id, trade_id);

CREATE TABLE lot_closures (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    lot_id text NOT NULL,
    seq integer NOT NULL,
    trade_id text NOT NULL,
    workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    instrument_key text NOT NULL,
    symbol text NOT NULL,
    direction text NOT NULL,
    acquired_at timestamptz NOT NULL,
    closed_by text NOT NULL,
    closed_at timestamptz NOT NULL,
    quantity numeric NOT NULL,
    exit_price numeric NOT NULL,
    fee numeric NOT NULL,
    gross numeric NOT NULL,
    kind text NOT NULL,
    non_economic boolean NOT NULL,
    -- Null for sheltered accounts and for premium folded into a stock leg.
    tax_proceeds numeric,
    tax_cost numeric,
    tax_realized numeric,
    wash_disallowed numeric,
    wash_permanent boolean,
    washed_into text[],
    term text,
    PRIMARY KEY (user_id, lot_id, seq)
);

CREATE INDEX lot_closures_tax_idx ON lot_closures (user_id, closed_at) WHERE tax_realized IS NOT NULL;

CREATE TABLE trade_engine_state (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    engine_version integer NOT NULL,
    rebuilt_at timestamptz NOT NULL,
    duration_ms integer NOT NULL,
    issues jsonb NOT NULL,
    decision_outcomes jsonb NOT NULL,
    alias_suggestions jsonb NOT NULL,
    strategy_suggestions jsonb NOT NULL,
    unattributed_income jsonb NOT NULL
);

-- Edges, entry tactics, tags and mistakes: a catalog each user owns, attached
-- to journal entries by ID so a rename or merge reaches every trade.
CREATE TABLE journal_labels (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('edge', 'entry_tactic', 'tag', 'mistake')),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
    description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
    color text CHECK (color ~ '^#[0-9a-f]{6}$'),
    position integer NOT NULL DEFAULT 0,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, kind)
);

-- Active names are unique per kind, ignoring case and surrounding spaces.
CREATE UNIQUE INDEX journal_labels_name_idx
    ON journal_labels (user_id, kind, lower(btrim(name))) WHERE archived_at IS NULL;

-- The journal: the user's context on a trade, keyed by trade ID. The anchor
-- fill finds the trade again when a decision changes its ID.
CREATE TABLE trade_annotations (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    trade_id text NOT NULL,
    anchor_fill_key text NOT NULL,
    -- A serialized Lexical document.
    notes jsonb NOT NULL DEFAULT
        '{"root":{"type":"root","version":1,"direction":null,"format":"","indent":0,"children":[{"type":"paragraph","version":1,"direction":null,"format":"","indent":0,"textFormat":0,"textStyle":"","children":[]}]}}',
    initial_stop numeric CHECK (initial_stop > 0),
    record_version integer NOT NULL DEFAULT 1,
    orphaned_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    planned_risk numeric CHECK (planned_risk > 0),
    -- How the trader felt and behaved. Null means not recorded, which
    -- analytics keeps apart from "no".
    conviction smallint CHECK (conviction BETWEEN 1 AND 5),
    market_regime text CHECK (market_regime IN ('trending', 'choppy', 'ranging', 'volatile')),
    planned_pre_market boolean,
    revenge_trade boolean,
    broke_thirty_minute_rule boolean,
    rule_adherence smallint CHECK (rule_adherence BETWEEN 1 AND 5),
    CONSTRAINT trade_annotations_note_document CHECK ((
        jsonb_typeof(notes) = 'object' AND jsonb_typeof(notes->'root') = 'object'
        AND notes->'root'->>'type' = 'root'
    ) IS TRUE)
);

CREATE UNIQUE INDEX trade_annotations_trade_idx ON trade_annotations (user_id, trade_id) WHERE orphaned_at IS NULL;

-- The kind is part of the key, so a label can only sit in a slot of its own
-- kind. It doesn't cascade: a label in use can only be archived or merged.
CREATE TABLE trade_annotation_labels (
    annotation_id uuid NOT NULL REFERENCES trade_annotations (id) ON DELETE CASCADE,
    label_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('edge', 'entry_tactic', 'tag', 'mistake')),
    PRIMARY KEY (annotation_id, label_id),
    FOREIGN KEY (label_id, kind) REFERENCES journal_labels (id, kind)
);

CREATE INDEX trade_annotation_labels_label_idx ON trade_annotation_labels (label_id);

-- What a trader means to do before a trade, sized from the risk they chose.
-- A plan stays open until it is linked to the trade that carried it out or
-- skipped. A linked plan follows its anchor fill through rebuilds, like a
-- journal entry. `entry` is the size-weighted average of the tranches.
CREATE TABLE trade_plans (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    asset_class text NOT NULL CHECK (asset_class IN ('stock', 'option')),
    symbol text NOT NULL CHECK (char_length(symbol) BETWEEN 1 AND 32),
    direction text NOT NULL CHECK (direction IN ('long', 'short')),
    entry numeric NOT NULL CHECK (entry > 0),
    stop numeric NOT NULL CHECK (stop >= 0),
    target numeric CHECK (target > 0),
    risk numeric NOT NULL CHECK (risk > 0),
    quantity numeric NOT NULL CHECK (quantity > 0),
    note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'linked', 'skipped')),
    trade_id text,
    anchor_fill_key text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    tranches jsonb NOT NULL
        CHECK (jsonb_typeof(tranches) = 'array' AND jsonb_array_length(tranches) BETWEEN 1 AND 10),
    round_up boolean NOT NULL DEFAULT false,
    CHECK ((status = 'linked') = (trade_id IS NOT NULL AND anchor_fill_key IS NOT NULL))
);

CREATE INDEX trade_plans_workspace_idx ON trade_plans (workspace_id, created_at DESC);
CREATE UNIQUE INDEX trade_plans_trade_idx ON trade_plans (user_id, trade_id) WHERE trade_id IS NOT NULL;

-- Every write a user could see announces itself on its schema's channel
-- (`tradstry_changes_dev`, `tradstry_changes_prod`) as {"u": user, "w":
-- workspace or null, "t": topic}, so open apps refresh whichever code path
-- made the change. Triggers run once per statement over its transition table,
-- and Postgres delivers identical notifications from one transaction once, on
-- commit, so a rebuild that rewrites thousands of rows sends one message per
-- workspace.

CREATE FUNCTION notify_user_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('tradstry_changes_' || TG_TABLE_SCHEMA, json_build_object('u', user_id, 'w', NULL, 't', TG_ARGV[0])::text)
    FROM (SELECT DISTINCT user_id FROM changed) AS users;
    RETURN NULL;
END
$$;

CREATE FUNCTION notify_workspace_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('tradstry_changes_' || TG_TABLE_SCHEMA, json_build_object('u', user_id, 'w', workspace_id, 't', TG_ARGV[0])::text)
    FROM (SELECT DISTINCT user_id, workspace_id FROM changed) AS workspaces;
    RETURN NULL;
END
$$;

-- For brokerage rows that only know their account.
CREATE FUNCTION notify_account_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('tradstry_changes_' || TG_TABLE_SCHEMA, json_build_object('u', user_id, 'w', workspace_id, 't', TG_ARGV[0])::text)
    FROM (
        SELECT DISTINCT a.user_id, w.id AS workspace_id
        FROM (SELECT DISTINCT account_id FROM changed) AS c
        JOIN brokerage_accounts a ON a.id = c.account_id
        LEFT JOIN workspaces w ON w.brokerage_account_id = a.id
    ) AS owners;
    RETURN NULL;
END
$$;

DO $$
DECLARE
    watched record;
    event text;
BEGIN
    FOR watched IN
        SELECT * FROM (VALUES
            ('trades', 'notify_workspace_change', 'trades'),
            ('trade_engine_state', 'notify_user_change', 'trades'),
            ('trade_decisions', 'notify_workspace_change', 'trades'),
            ('manual_fills', 'notify_workspace_change', 'trades'),
            ('opening_positions', 'notify_workspace_change', 'trades'),
            ('instrument_aliases', 'notify_user_change', 'trades'),
            ('trade_annotations', 'notify_workspace_change', 'journal'),
            ('journal_labels', 'notify_user_change', 'labels'),
            ('trade_plans', 'notify_workspace_change', 'plans'),
            ('user_settings', 'notify_user_change', 'settings'),
            ('workspaces', 'notify_user_change', 'workspaces'),
            ('brokerage_connections', 'notify_user_change', 'brokerage'),
            ('brokerage_accounts', 'notify_user_change', 'brokerage'),
            ('sync_jobs', 'notify_account_change', 'brokerage'),
            ('brokerage_activities', 'notify_account_change', 'brokerage'),
            ('brokerage_orders', 'notify_account_change', 'brokerage'),
            ('brokerage_snapshots', 'notify_account_change', 'brokerage')
        ) AS t (relation, function_name, topic)
    LOOP
        -- A trigger with a transition table can only fire on one kind of event.
        FOREACH event IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
            EXECUTE format(
                'CREATE TRIGGER %I AFTER %s ON %I REFERENCING %s TABLE AS changed
                 FOR EACH STATEMENT EXECUTE FUNCTION %I(%L)',
                watched.relation || '_notify_' || lower(event),
                event,
                watched.relation,
                CASE event WHEN 'DELETE' THEN 'OLD' ELSE 'NEW' END,
                watched.function_name,
                watched.topic
            );
        END LOOP;
    END LOOP;
END
$$;
