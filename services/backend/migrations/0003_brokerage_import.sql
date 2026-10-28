ALTER TABLE brokerage_accounts
    -- The last day whose transactions are fully imported. SnapTrade reports
    -- transactions a day late, so this trails today.
    ADD COLUMN transactions_synced_through date,
    ADD COLUMN holdings_synced_at timestamptz;

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
