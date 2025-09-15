-- =====================================================
-- WATCHLIST TABLE
-- =====================================================
-- This table stores user-created watchlists.
-- Each user can have multiple watchlists to organize stocks.

CREATE TABLE IF NOT EXISTS watchlist (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure a user cannot have two watchlists with the same name
    UNIQUE(user_id, name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id_name ON watchlist(user_id, name);

-- Add table comment
COMMENT ON TABLE watchlist IS 'Stores user-created watchlists for organizing stocks.';

-- =====================================================
-- WATCHLIST ITEMS TABLE
-- =====================================================
-- This table stores the individual stocks within each watchlist.

CREATE TABLE IF NOT EXISTS watchlist_items (
    id SERIAL PRIMARY KEY,
    watchlist_id INTEGER NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    company_name VARCHAR(255),
    price DECIMAL(15, 4),
    percent_change DECIMAL(8, 4),
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure a stock symbol can only appear once per watchlist
    UNIQUE(watchlist_id, symbol)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist_id ON watchlist_items(watchlist_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_user_id ON watchlist_items(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_symbol ON watchlist_items(symbol);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist_id_symbol ON watchlist_items(watchlist_id, symbol);


-- Add table comment
COMMENT ON TABLE watchlist_items IS 'Stores the individual stocks that belong to each watchlist.';


-- =====================================================
-- RLS (ROW LEVEL SECURITY) POLICIES
-- =====================================================

-- Enable RLS for both tables
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;

-- Policies for `watchlist` table
CREATE POLICY "Allow full access to own watchlists"
ON watchlist
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policies for `watchlist_items` table
CREATE POLICY "Allow full access to own watchlist items"
ON watchlist_items
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Grant permissions to the authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON watchlist TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON watchlist_items TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE watchlist_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE watchlist_items_id_seq TO authenticated;
