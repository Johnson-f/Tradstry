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

-- The journal: the user's context on a trade, keyed by trade ID. The anchor
-- fill finds the trade again when a decision changes its ID.
CREATE TABLE trade_annotations (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    trade_id text NOT NULL,
    anchor_fill_key text NOT NULL,
    notes text NOT NULL DEFAULT '',
    setup text NOT NULL DEFAULT '',
    stop_price numeric CHECK (stop_price > 0),
    target_price numeric CHECK (target_price > 0),
    rating smallint CHECK (rating BETWEEN 1 AND 5),
    mistakes text[] NOT NULL DEFAULT '{}',
    tags text[] NOT NULL DEFAULT '{}',
    record_version integer NOT NULL DEFAULT 1,
    orphaned_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX trade_annotations_trade_idx ON trade_annotations (user_id, trade_id) WHERE orphaned_at IS NULL;
CREATE INDEX trade_annotations_tags_idx ON trade_annotations USING gin (tags);
