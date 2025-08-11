-- Function to add a stock to a setup
CREATE OR REPLACE FUNCTION public.add_stock_to_setup(
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
        RAISE EXCEPTION 'Error adding stock to setup: %', SQLERRM;
END;
$$;

-- Function to add an option to a setup
CREATE OR REPLACE FUNCTION public.add_option_to_setup(
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
        RAISE EXCEPTION 'Error adding option to setup: %', SQLERRM;
END;
$$;
