-- Function to remove a stock from a setup
CREATE OR REPLACE FUNCTION public.remove_stock_from_setup(
    p_user_id UUID,
    p_stock_id INTEGER,
    p_setup_id INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete the association
    DELETE FROM public.trade_setups
    WHERE stock_id = p_stock_id
    AND setup_id = p_setup_id
    AND user_id = p_user_id
    AND stock_id IS NOT NULL
    AND EXISTS (
        SELECT 1 
        FROM public.setups s 
        WHERE s.id = p_setup_id 
        AND s.user_id = p_user_id
    )
    RETURNING 1 INTO v_deleted_count;
    
    -- Update the setup's updated_at timestamp if a row was deleted
    IF v_deleted_count > 0 THEN
        UPDATE public.setups 
        SET updated_at = NOW()
        WHERE id = p_setup_id;
        
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error removing stock from setup: %', SQLERRM;
END;
$$;

-- Function to remove an option from a setup
CREATE OR REPLACE FUNCTION public.remove_option_from_setup(
    p_user_id UUID,
    p_option_id INTEGER,
    p_setup_id INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete the association
    DELETE FROM public.trade_setups
    WHERE option_id = p_option_id
    AND setup_id = p_setup_id
    AND user_id = p_user_id
    AND option_id IS NOT NULL
    AND EXISTS (
        SELECT 1 
        FROM public.setups s 
        WHERE s.id = p_setup_id 
        AND s.user_id = p_user_id
    )
    RETURNING 1 INTO v_deleted_count;
    
    -- Update the setup's updated_at timestamp if a row was deleted
    IF v_deleted_count > 0 THEN
        UPDATE public.setups 
        SET updated_at = NOW()
        WHERE id = p_setup_id;
        
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error removing option from setup: %', SQLERRM;
END;
$$;
