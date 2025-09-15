-- =====================================================
-- WATCHLIST ITEMS TABLE MIGRATION
-- =====================================================
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
