-- WATCHLIST TABLE

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

-- WATCHLIST ITEMS TABLE - REDESIGNED: NO PRICE DATA

-- This table stores the individual stocks within each watchlist.
-- REMOVED: price, percent_change (use stock_quotes for real-time prices)

CREATE TABLE IF NOT EXISTS watchlist_items (
    id SERIAL PRIMARY KEY,
    watchlist_id INTEGER NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,  -- Ticker symbol stored as TEXT (not number)
    company_name VARCHAR(255),
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
COMMENT ON TABLE watchlist_items IS 'Stores the individual stocks that belong to each watchlist - REDESIGNED: no price data, ticker symbols as text.';
COMMENT ON COLUMN watchlist_items.symbol IS 'Stock ticker symbol (stored as TEXT, not number)';
COMMENT ON COLUMN watchlist_items.company_name IS 'Company name for display purposes';



-- RLS (ROW LEVEL SECURITY) POLICIES

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



-- WATCHLIST ITEMS TABLE MIGRATION

-- Add missing updated_at column to existing watchlist_items table
-- Add the updated_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'watchlist_items' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE watchlist_items 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        
        -- Update existing records to have the current timestamp
        UPDATE watchlist_items 
        SET updated_at = COALESCE(added_at, CURRENT_TIMESTAMP) 
        WHERE updated_at IS NULL;
        
        RAISE NOTICE 'Added updated_at column to watchlist_items table';
    ELSE
        RAISE NOTICE 'updated_at column already exists in watchlist_items table';
    END IF;
END $$;

-- Create a trigger to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_watchlist_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists and create it
DROP TRIGGER IF EXISTS trigger_update_watchlist_items_updated_at ON watchlist_items;
CREATE TRIGGER trigger_update_watchlist_items_updated_at
    BEFORE UPDATE ON watchlist_items
    FOR EACH ROW
    EXECUTE FUNCTION update_watchlist_items_updated_at();
