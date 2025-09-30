-- =====================================================
-- MIGRATION: Update watchlist_items to remove price data
-- =====================================================
-- This migration aligns the SQL function with the redesigned table schema
-- that eliminates price storage (prices come from real-time API)

-- Step 1: Update the upsert function to match redesigned schema
CREATE OR REPLACE FUNCTION upsert_watchlist_item(
    p_watchlist_id INTEGER,
    p_symbol VARCHAR(20),
    p_company_name VARCHAR(255),
    p_price DECIMAL(15, 4) DEFAULT NULL,  -- Keep for backward compatibility but ignore
    p_percent_change DECIMAL(8, 4) DEFAULT NULL  -- Keep for backward compatibility but ignore
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item_id INTEGER;
    v_watchlist_owner UUID;
BEGIN
    -- Verify the watchlist belongs to the authenticated user
    SELECT user_id INTO v_watchlist_owner
    FROM watchlist
    WHERE id = p_watchlist_id;
    
    IF v_watchlist_owner IS NULL THEN
        RAISE EXCEPTION 'Watchlist not found';
    END IF;
    
    IF v_watchlist_owner != auth.uid() THEN
        RAISE EXCEPTION 'Access denied: You do not own this watchlist';
    END IF;
    
    -- REDESIGNED: Only store symbol and company_name, no price data
    INSERT INTO watchlist_items (watchlist_id, user_id, symbol, company_name)
    VALUES (p_watchlist_id, auth.uid(), p_symbol, p_company_name)
    ON CONFLICT (watchlist_id, symbol) DO UPDATE
    SET company_name = p_company_name,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_item_id;

    RETURN v_item_id;
END;
$$;

-- Step 2: Drop price columns from watchlist_items if they exist
DO $$ 
BEGIN
    -- Drop price column if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'watchlist_items' 
        AND column_name = 'price'
    ) THEN
        ALTER TABLE watchlist_items DROP COLUMN price;
        RAISE NOTICE 'Dropped price column from watchlist_items table';
    ELSE
        RAISE NOTICE 'price column does not exist in watchlist_items table';
    END IF;
    
    -- Drop percent_change column if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'watchlist_items' 
        AND column_name = 'percent_change'
    ) THEN
        ALTER TABLE watchlist_items DROP COLUMN percent_change;
        RAISE NOTICE 'Dropped percent_change column from watchlist_items table';
    ELSE
        RAISE NOTICE 'percent_change column does not exist in watchlist_items table';
    END IF;
END $$;

-- Step 3: Add comment to document the redesign
COMMENT ON FUNCTION upsert_watchlist_item IS 'REDESIGNED: Add/update watchlist item without price data. Real-time prices come from stock_quotes table and finance-query API.';

-- Migration complete
SELECT 'Watchlist items table successfully migrated to remove price data' AS status;
