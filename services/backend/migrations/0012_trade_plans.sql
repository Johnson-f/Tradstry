-- What a trader means to do before a trade, sized from the risk they chose.
-- A plan stays open until it is linked to the trade that carried it out or
-- skipped. A linked plan follows its anchor fill through rebuilds, like a
-- journal entry.
CREATE TABLE trade_plans (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    asset_class text NOT NULL CHECK (asset_class IN ('stock', 'option', 'crypto')),
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
    CHECK ((status = 'linked') = (trade_id IS NOT NULL AND anchor_fill_key IS NOT NULL))
);

CREATE INDEX trade_plans_workspace_idx ON trade_plans (workspace_id, created_at DESC);
CREATE UNIQUE INDEX trade_plans_trade_idx ON trade_plans (user_id, trade_id) WHERE trade_id IS NOT NULL;

-- The balance a manual workspace sizes percent risk from. Workspaces linked
-- to a brokerage use the latest holdings snapshot instead.
ALTER TABLE workspaces ADD COLUMN planning_balance numeric CHECK (planning_balance > 0);
