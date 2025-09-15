-- =====================================================
-- WATCHLIST UPSERT FUNCTIONS
-- =====================================================

-- Upsert a watchlist for the authenticated user
CREATE OR REPLACE FUNCTION upsert_watchlist(
    p_name VARCHAR(255)
)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO watchlist (user_id, name)
    VALUES (auth.uid(), p_name)
    ON CONFLICT (user_id, name) DO UPDATE
    SET updated_at = CURRENT_TIMESTAMP
    RETURNING id;
$$;

-- Upsert a watchlist item (only if user owns the watchlist)
CREATE OR REPLACE FUNCTION upsert_watchlist_item(
    p_watchlist_id INTEGER,
    p_symbol VARCHAR(20),
    p_company_name VARCHAR(255),
    p_price DECIMAL(15, 4),
    p_percent_change DECIMAL(8, 4)
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
    
    INSERT INTO watchlist_items (watchlist_id, user_id, symbol, company_name, price, percent_change)
    VALUES (p_watchlist_id, auth.uid(), p_symbol, p_company_name, p_price, p_percent_change)
    ON CONFLICT (watchlist_id, symbol) DO UPDATE
    SET company_name = p_company_name,
        price = p_price,
        percent_change = p_percent_change,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_item_id;

    RETURN v_item_id;
END;
$$;
