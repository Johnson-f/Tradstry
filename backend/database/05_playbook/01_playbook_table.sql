-- 05_playbook/01_table.sql
-- Ignore the user_id, it is not needed

-- Create the table for playbook setups
CREATE TABLE IF NOT EXISTS playbook (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (user_id, name)
);

-- Create a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_playbook_setups_updated_at
BEFORE UPDATE ON playbook_setups
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create the many-to-many join table for stock trades and playbook setups
CREATE TABLE IF NOT EXISTS stock_trade_setups (
    stock_trade_id UUID NOT NULL REFERENCES stock_trades(id) ON DELETE CASCADE,
    setup_id UUID NOT NULL REFERENCES playbook_setups(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (stock_trade_id, setup_id)
);

-- Create the many-to-many join table for option trades and playbook setups
CREATE TABLE IF NOT EXISTS option_trade_setups (
    option_trade_id UUID NOT NULL REFERENCES option_trades(id) ON DELETE CASCADE,
    setup_id UUID NOT NULL REFERENCES playbook_setups(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (option_trade_id, setup_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_stock_trade_setups_stock_trade_id ON stock_trade_setups(stock_trade_id);
CREATE INDEX IF NOT EXISTS idx_stock_trade_setups_setup_id ON stock_trade_setups(setup_id);

CREATE INDEX IF NOT EXISTS idx_option_trade_setups_option_trade_id ON option_trade_setups(option_trade_id);
CREATE INDEX IF NOT EXISTS idx_option_trade_setups_setup_id ON option_trade_setups(setup_id);

CREATE INDEX IF NOT EXISTS idx_playbook_setups_user_id ON playbook_setups(user_id);

COMMENT ON TABLE playbook IS 'Stores user-defined trading setups or playbooks.';
COMMENT ON TABLE stock_trade_playbook IS 'Associates stock trades with playbook setups in a many-to-many relationship.';
COMMENT ON TABLE option_trade_playbook IS 'Associates option trades with playbook setups in a many-to-many relationship.';
