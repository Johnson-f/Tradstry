-- WATCHLIST SYSTEM REDESIGN - REMOVE PRICE DATA
-- Update watchlist_items table structure and functions

-- =====================================================
-- UPDATE WATCHLIST_ITEMS TABLE - REMOVE PRICE COLUMNS
-- =====================================================

-- Remove price and percent_change columns from watchlist_items table
ALTER TABLE watchlist_items DROP COLUMN IF EXISTS price;
ALTER TABLE watchlist_items DROP COLUMN IF EXISTS percent_change;

-- Add comments to clarify the redesigned structure
COMMENT ON TABLE watchlist_items IS 'Stores the individual stocks that belong to each watchlist - REDESIGNED: no price data, ticker symbols as text.';
COMMENT ON COLUMN watchlist_items.symbol IS 'Stock ticker symbol (stored as TEXT, not number)';
COMMENT ON COLUMN watchlist_items.company_name IS 'Company name for display purposes';

-- =====================================================
-- REDESIGNED WATCHLIST SELECT FUNCTIONS - NO PRICE DATA
-- Functions return symbols and metadata only - use stock_quotes for real-time prices
-- =====================================================

-- Drop existing functions to recreate with new signatures
DROP FUNCTION IF EXISTS get_watchlist_items(INTEGER);

-- 1. Get all items in a specific watchlist - REDESIGNED: NO PRICE DATA
-- (only if user owns the watchlist)
CREATE OR REPLACE FUNCTION get_watchlist_items(p_watchlist_id INTEGER)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    company_name VARCHAR(255),
    added_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT wi.id, wi.symbol, wi.company_name, wi.added_at, wi.updated_at
    FROM watchlist_items wi
    INNER JOIN watchlist w ON wi.watchlist_id = w.id
    WHERE wi.watchlist_id = p_watchlist_id
    AND w.user_id = auth.uid()
    ORDER BY wi.symbol;
$$;

-- 2. Get watchlist item symbols only (for batch price lookups)
CREATE OR REPLACE FUNCTION get_watchlist_symbols(p_watchlist_id INTEGER)
RETURNS TABLE (symbol VARCHAR(20))
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT wi.symbol
    FROM watchlist_items wi
    INNER JOIN watchlist w ON wi.watchlist_id = w.id
    WHERE wi.watchlist_id = p_watchlist_id
    AND w.user_id = auth.uid()
    ORDER BY wi.symbol;
$$;

-- 3. Get all user watchlists with item counts
CREATE OR REPLACE FUNCTION get_user_watchlists_with_counts()
RETURNS TABLE (
    id INTEGER, 
    name VARCHAR(255), 
    created_at TIMESTAMPTZ, 
    updated_at TIMESTAMPTZ,
    item_count BIGINT
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        w.id, 
        w.name, 
        w.created_at, 
        w.updated_at,
        COUNT(wi.id) as item_count
    FROM watchlist w
    LEFT JOIN watchlist_items wi ON w.id = wi.watchlist_id
    WHERE w.user_id = auth.uid()
    GROUP BY w.id, w.name, w.created_at, w.updated_at
    ORDER BY w.name;
$$;

-- 4. Check if symbol exists in user's watchlists
CREATE OR REPLACE FUNCTION check_symbol_in_watchlists(p_symbol VARCHAR(20))
RETURNS TABLE (
    watchlist_id INTEGER,
    watchlist_name VARCHAR(255),
    item_id INTEGER
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT wi.watchlist_id, w.name, wi.id
    FROM watchlist_items wi
    INNER JOIN watchlist w ON wi.watchlist_id = w.id
    WHERE wi.symbol = UPPER(p_symbol)
    AND w.user_id = auth.uid()
    ORDER BY w.name;
$$;

-- =====================================================
-- WATCHLIST MANAGEMENT FUNCTIONS (UPDATED)
-- =====================================================

-- Create a new watchlist
CREATE OR REPLACE FUNCTION create_watchlist(p_name VARCHAR(255))
RETURNS TABLE (
    id INTEGER,
    name VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_watchlist_id INTEGER;
BEGIN
    -- Insert new watchlist
    INSERT INTO watchlist (user_id, name)
    VALUES (auth.uid(), p_name)
    RETURNING watchlist.id INTO v_watchlist_id;
    
    -- Return the created watchlist
    RETURN QUERY
    SELECT w.id, w.name, w.created_at, w.updated_at
    FROM watchlist w
    WHERE w.id = v_watchlist_id;
END;
$$;

-- Add item to watchlist (with ticker symbol validation)
CREATE OR REPLACE FUNCTION add_watchlist_item(
    p_watchlist_id INTEGER,
    p_symbol VARCHAR(20),
    p_company_name VARCHAR(255) DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    company_name VARCHAR(255),
    added_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item_id INTEGER;
    v_formatted_symbol VARCHAR(20);
BEGIN
    -- Validate and format symbol (store as TEXT, uppercase)
    v_formatted_symbol := UPPER(TRIM(p_symbol));
    
    -- Validate symbol format (basic ticker validation)
    IF NOT (v_formatted_symbol ~ '^[A-Z0-9._-]{1,20}$') THEN
        RAISE EXCEPTION 'Invalid ticker symbol format: %', p_symbol;
    END IF;
    
    -- Check if user owns the watchlist
    IF NOT EXISTS (
        SELECT 1 FROM watchlist 
        WHERE id = p_watchlist_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Watchlist not found or access denied';
    END IF;
    
    -- Check if symbol already exists in this watchlist
    IF EXISTS (
        SELECT 1 FROM watchlist_items 
        WHERE watchlist_id = p_watchlist_id AND symbol = v_formatted_symbol
    ) THEN
        RAISE EXCEPTION 'Symbol % already exists in this watchlist', v_formatted_symbol;
    END IF;
    
    -- Insert new item
    INSERT INTO watchlist_items (watchlist_id, user_id, symbol, company_name)
    VALUES (p_watchlist_id, auth.uid(), v_formatted_symbol, p_company_name)
    RETURNING watchlist_items.id INTO v_item_id;
    
    -- Return the created item
    RETURN QUERY
    SELECT wi.id, wi.symbol, wi.company_name, wi.added_at, wi.updated_at
    FROM watchlist_items wi
    WHERE wi.id = v_item_id;
END;
$$;

-- Update watchlist item company name
CREATE OR REPLACE FUNCTION update_watchlist_item_name(
    p_item_id INTEGER,
    p_company_name VARCHAR(255)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    -- Update the item only if the user owns the watchlist
    UPDATE watchlist_items wi
    SET company_name = p_company_name,
        updated_at = CURRENT_TIMESTAMP
    FROM watchlist w
    WHERE wi.id = p_item_id
    AND wi.watchlist_id = w.id
    AND w.user_id = auth.uid();
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    -- Return true if a row was updated, false otherwise
    RETURN v_updated_count > 0;
END;
$$;

-- =====================================================
-- USAGE EXAMPLES - REDESIGNED WITHOUT PRICE DATA
-- =====================================================

/*
-- Get all watchlists for current user
SELECT * FROM get_user_watchlists();

-- Get watchlists with item counts
SELECT * FROM get_user_watchlists_with_counts();

-- Get items in a watchlist (no price data)
SELECT * FROM get_watchlist_items(1);

-- Get symbols only for price lookup
SELECT * FROM get_watchlist_symbols(1);

-- Check if symbol exists in user's watchlists
SELECT * FROM check_symbol_in_watchlists('AAPL');

-- Create new watchlist
SELECT * FROM create_watchlist('Tech Stocks');

-- Add item to watchlist (ticker symbol validation included)
SELECT * FROM add_watchlist_item(1, 'AAPL', 'Apple Inc.');

-- Update company name
SELECT update_watchlist_item_name(1, 'Apple Inc. (Updated)');

-- Example: Frontend joins watchlist items with stock_quotes for real-time prices
SELECT 
    wi.id,
    wi.symbol,
    wi.company_name,
    wi.added_at,
    sq.price,
    sq.change,
    sq.percent_change
FROM get_watchlist_items(1) wi
LEFT JOIN stock_quotes sq ON wi.symbol = sq.symbol;
*/
