-- Install Setup Functions for Trade Associations
-- Run this script in your Supabase SQL editor or database

-- Function to add a setup to an existing stock trade
CREATE OR REPLACE FUNCTION public.add_setup_to_stock(
    p_user_id UUID,
    p_stock_id INTEGER,
    p_setup_id INTEGER,
    p_confidence_rating INTEGER DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_owns_stock BOOLEAN;
    v_user_owns_setup BOOLEAN;
    v_result INTEGER;
BEGIN
    -- Check if stock exists and user owns it
    SELECT EXISTS(
        SELECT 1 
        FROM public.stocks 
        WHERE id = p_stock_id AND user_id = p_user_id
    ) INTO v_user_owns_stock;
    
    IF NOT v_user_owns_stock THEN
        RAISE EXCEPTION 'Stock not found or access denied.';
    END IF;
    
    -- Check if setup exists and user owns it
    SELECT EXISTS(
        SELECT 1 
        FROM public.setups 
        WHERE id = p_setup_id AND user_id = p_user_id
    ) INTO v_user_owns_setup;
    
    IF NOT v_user_owns_setup THEN
        RAISE EXCEPTION 'Setup not found or access denied.';
    END IF;
    
    -- Insert the new association
    INSERT INTO public.trade_setups (
        stock_id,
        setup_id,
        user_id,
        confidence_rating,
        notes
    ) VALUES (
        p_stock_id,
        p_setup_id,
        p_user_id,
        p_confidence_rating,
        p_notes
    )
    ON CONFLICT (stock_id, setup_id) 
    WHERE stock_id IS NOT NULL
    DO UPDATE SET 
        confidence_rating = EXCLUDED.confidence_rating,
        notes = EXCLUDED.notes
    RETURNING id INTO v_result;
    
    -- Update the setup's updated_at timestamp
    UPDATE public.setups 
    SET updated_at = NOW()
    WHERE id = p_setup_id;
    
    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error adding setup to stock: %', SQLERRM;
END;
$$;

-- Function to add a setup to an existing option trade
CREATE OR REPLACE FUNCTION public.add_setup_to_option(
    p_user_id UUID,
    p_option_id INTEGER,
    p_setup_id INTEGER,
    p_confidence_rating INTEGER DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_owns_option BOOLEAN;
    v_user_owns_setup BOOLEAN;
    v_result INTEGER;
BEGIN
    -- Check if option exists and user owns it
    SELECT EXISTS(
        SELECT 1 
        FROM public.options 
        WHERE id = p_option_id AND user_id = p_user_id
    ) INTO v_user_owns_option;
    
    IF NOT v_user_owns_option THEN
        RAISE EXCEPTION 'Option not found or access denied.';
    END IF;
    
    -- Check if setup exists and user owns it
    SELECT EXISTS(
        SELECT 1 
        FROM public.setups 
        WHERE id = p_setup_id AND user_id = p_user_id
    ) INTO v_user_owns_setup;
    
    IF NOT v_user_owns_setup THEN
        RAISE EXCEPTION 'Setup not found or access denied.';
    END IF;
    
    -- Insert the new association
    INSERT INTO public.trade_setups (
        option_id,
        setup_id,
        user_id,
        confidence_rating,
        notes
    ) VALUES (
        p_option_id,
        p_setup_id,
        p_user_id,
        p_confidence_rating,
        p_notes
    )
    ON CONFLICT (option_id, setup_id) 
    WHERE option_id IS NOT NULL
    DO UPDATE SET 
        confidence_rating = EXCLUDED.confidence_rating,
        notes = EXCLUDED.notes
    RETURNING id INTO v_result;
    
    -- Update the setup's updated_at timestamp
    UPDATE public.setups 
    SET updated_at = NOW()
    WHERE id = p_setup_id;
    
    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error adding setup to option: %', SQLERRM;
END;
$$;

-- Function to get all setups for a specific stock trade
CREATE OR REPLACE FUNCTION public.get_setups_for_stock(
    p_user_id UUID,
    p_stock_id INTEGER
)
RETURNS TABLE(
    setup_id INTEGER,
    setup_name TEXT,
    setup_category TEXT,
    confidence_rating INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as setup_id,
        s.name as setup_name,
        s.category::TEXT as setup_category,
        ts.confidence_rating,
        ts.notes,
        ts.created_at
    FROM public.trade_setups ts
    JOIN public.setups s ON ts.setup_id = s.id
    WHERE ts.stock_id = p_stock_id 
    AND ts.user_id = p_user_id
    ORDER BY ts.created_at DESC;
END;
$$;

-- Function to get all setups for a specific option trade
CREATE OR REPLACE FUNCTION public.get_setups_for_option(
    p_user_id UUID,
    p_option_id INTEGER
)
RETURNS TABLE(
    setup_id INTEGER,
    setup_name TEXT,
    setup_category TEXT,
    confidence_rating INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as setup_id,
        s.name as setup_name,
        s.category::TEXT as setup_category,
        ts.confidence_rating,
        ts.notes,
        ts.created_at
    FROM public.trade_setups ts
    JOIN public.setups s ON ts.setup_id = s.id
    WHERE ts.option_id = p_option_id 
    AND ts.user_id = p_user_id
    ORDER BY ts.created_at DESC;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.add_setup_to_stock(UUID, INTEGER, INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_setup_to_option(UUID, INTEGER, INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_setups_for_stock(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_setups_for_option(UUID, INTEGER) TO authenticated; 

-- Ensure ON CONFLICT clauses work by creating supporting unique partial indexes
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trade_setups_stock_setup 
  ON public.trade_setups(stock_id, setup_id) 
  WHERE stock_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trade_setups_option_setup 
  ON public.trade_setups(option_id, setup_id) 
  WHERE option_id IS NOT NULL;