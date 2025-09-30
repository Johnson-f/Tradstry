-- =====================================================
-- REDESIGNED WATCHLIST SELECT FUNCTIONS - NO PRICE DATA
-- Functions return symbols and metadata only - use stock_quotes for real-time prices
-- =====================================================

-- Get all watchlists for the authenticated user
CREATE OR REPLACE FUNCTION get_user_watchlists()
RETURNS TABLE (id INTEGER, name VARCHAR(255), created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT w.id, w.name, w.created_at, w.updated_at
    FROM watchlist w
    WHERE w.user_id = auth.uid()
    ORDER BY w.name;
$$;

-- Get all items in a specific watchlist - REDESIGNED: NO PRICE DATA
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

-- Get watchlist item symbols only (for batch price lookups)
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

-- =====================================================
-- WATCHLIST DELETE FUNCTIONS
-- =====================================================

-- Delete a specific watchlist (only if user owns it)
-- This will cascade delete all items in the watchlist
CREATE OR REPLACE FUNCTION delete_watchlist(p_watchlist_id INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete the watchlist only if it belongs to the authenticated user
    DELETE FROM watchlist
    WHERE id = p_watchlist_id
    AND user_id = auth.uid();
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Return true if a row was deleted, false otherwise
    RETURN v_deleted_count > 0;
END;
$$;

-- Delete a specific item from a watchlist (only if user owns the watchlist)
CREATE OR REPLACE FUNCTION delete_watchlist_item(p_item_id INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete the watchlist item only if the user owns the watchlist
    DELETE FROM watchlist_items wi
    USING watchlist w
    WHERE wi.id = p_item_id
    AND wi.watchlist_id = w.id
    AND w.user_id = auth.uid();
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Return true if a row was deleted, false otherwise
    RETURN v_deleted_count > 0;
END;
$$;

-- Delete a specific stock symbol from a watchlist (only if user owns the watchlist)
CREATE OR REPLACE FUNCTION delete_watchlist_item_by_symbol(
    p_watchlist_id INTEGER,
    p_symbol VARCHAR(20)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete the watchlist item only if the user owns the watchlist
    DELETE FROM watchlist_items wi
    USING watchlist w
    WHERE wi.watchlist_id = p_watchlist_id
    AND wi.symbol = p_symbol
    AND wi.watchlist_id = w.id
    AND w.user_id = auth.uid();
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Return true if a row was deleted, false otherwise
    RETURN v_deleted_count > 0;
END;
$$;

-- Delete all items from a specific watchlist (only if user owns it)
CREATE OR REPLACE FUNCTION clear_watchlist(p_watchlist_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete all items from the watchlist only if the user owns it
    DELETE FROM watchlist_items wi
    USING watchlist w
    WHERE wi.watchlist_id = p_watchlist_id
    AND wi.watchlist_id = w.id
    AND w.user_id = auth.uid();
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Return the number of items deleted
    RETURN v_deleted_count;
END;
$$;
