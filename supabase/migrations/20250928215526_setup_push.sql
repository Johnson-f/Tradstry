-- Function to get analytics for a specific setup
CREATE OR REPLACE FUNCTION public.get_setup_analytics(
    p_user_id UUID,
    p_setup_id INTEGER,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    total_trades BIGINT,
    winning_trades BIGINT,
    losing_trades BIGINT,
    win_rate NUMERIC,
    total_profit_loss NUMERIC,
    avg_profit NUMERIC,
    avg_loss NUMERIC,
    profit_factor NUMERIC,
    max_drawdown NUMERIC,
    avg_holding_period INTERVAL,
    avg_confidence_rating NUMERIC,
    trade_type_distribution JSONB,
    symbol_distribution JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_setup_name TEXT;
    v_setup_category TEXT;
    v_setup_conditions TEXT;
    v_has_access BOOLEAN;
BEGIN
    -- Check if user has access to the setup and get setup details
    SELECT
        s.name,
        s.category,
        s.setup_conditions,
        TRUE
    INTO
        v_setup_name,
        v_setup_category,
        v_setup_conditions,
        v_has_access
        
    FROM
        public.setups s
    WHERE
        s.id = p_setup_id
        AND s.user_id = p_user_id;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Setup not found or access denied.';
    END IF;

    -- Return analytics for the setup
    RETURN QUERY
    WITH trade_data AS (
        -- Stock trades
        SELECT
            'stock' AS trade_type,
            s.symbol,
            s.entry_date,
            s.exit_date,
            (s.exit_price - s.entry_price) * s.number_shares *
                CASE WHEN s.trade_type = 'BUY' THEN 1 ELSE -1 END AS profit_loss,
            CASE
                WHEN s.exit_price IS NOT NULL THEN
                    ((s.exit_price - s.entry_price) / s.entry_price) *
                    CASE WHEN s.trade_type = 'BUY' THEN 1 ELSE -1 END * 100
                ELSE NULL
            END AS return_pct,
            ts.confidence_rating,
            s.exit_date - s.entry_date AS holding_period
        FROM
            public.trade_setups ts
            JOIN public.stocks s ON ts.stock_id = s.id
        WHERE
            ts.setup_id = p_setup_id
            AND ts.user_id = p_user_id
            AND ts.stock_id IS NOT NULL
            AND (p_start_date IS NULL OR s.entry_date >= p_start_date)
            AND (p_end_date IS NULL OR s.entry_date <= p_end_date)
            AND s.exit_price IS NOT NULL  -- Only count closed trades for analytics

        UNION ALL

        -- Option trades
        SELECT
            'option' AS trade_type,
            o.symbol,
            o.entry_date,
            o.exit_date,
            (o.exit_price - o.entry_price) * o.number_of_contracts * 100 AS profit_loss,
            CASE
                WHEN o.exit_price IS NOT NULL AND o.entry_price > 0 THEN
                    ((o.exit_price - o.entry_price) / o.entry_price) * 100
                ELSE NULL
            END AS return_pct,
            ts.confidence_rating,
            o.exit_date - o.entry_date AS holding_period
        FROM
            public.trade_setups ts
            JOIN public.options o ON ts.option_id = o.id
        WHERE
            ts.setup_id = p_setup_id
            AND ts.user_id = p_user_id
            AND ts.option_id IS NOT NULL
            AND (p_start_date IS NULL OR o.entry_date >= p_start_date)
            AND (p_end_date IS NULL OR o.entry_date <= p_end_date)
            AND o.exit_price IS NOT NULL  -- Only count closed trades for analytics
    ),
    analytics AS (
        SELECT
            COUNT(*) AS total_trades,
            COUNT(*) FILTER (WHERE profit_loss > 0) AS winning_trades,
            COUNT(*) FILTER (WHERE profit_loss < 0) AS losing_trades,
            ROUND(COUNT(*) FILTER (WHERE profit_loss > 0) * 100.0 /
                  NULLIF(COUNT(*) FILTER (WHERE profit_loss IS NOT NULL), 0), 2) AS win_rate,
            COALESCE(SUM(profit_loss), 0) AS total_profit_loss,
            ROUND(AVG(profit_loss) FILTER (WHERE profit_loss > 0), 2) AS avg_profit,
            ROUND(AVG(profit_loss) FILTER (WHERE profit_loss < 0), 2) AS avg_loss,
            ROUND(COALESCE(
                SUM(profit_loss) FILTER (WHERE profit_loss > 0) /
                NULLIF(ABS(SUM(profit_loss) FILTER (WHERE profit_loss < 0)), 0),
                0
            ), 2) AS profit_factor,
            (
                SELECT MIN(equity_curve.drawdown)
                FROM (
                    SELECT
                        entry_date,
                        SUM(profit_loss) OVER (ORDER BY entry_date) AS running_total,
                        SUM(profit_loss) OVER (ORDER BY entry_date) -
                        MAX(SUM(profit_loss) OVER (ORDER BY entry_date)) OVER (ORDER BY entry_date) AS drawdown
                    FROM trade_data
                ) AS equity_curve
            ) AS max_drawdown,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY holding_period) AS median_holding_period,
            ROUND(AVG(confidence_rating) FILTER (WHERE confidence_rating IS NOT NULL), 2) AS avg_confidence_rating,
            (
                SELECT jsonb_object_agg(trade_type, count)
                FROM (
                    SELECT trade_type, COUNT(*) as count
                    FROM trade_data
                    GROUP BY trade_type
                ) AS type_counts
            ) AS trade_type_distribution,
            (
                SELECT jsonb_object_agg(symbol, count)
                FROM (
                    SELECT symbol, COUNT(*) as count
                    FROM trade_data
                    GROUP BY symbol
                    ORDER BY count DESC
                    LIMIT 10  -- Limit to top 10 symbols
                ) AS symbol_counts
            ) AS symbol_distribution
        FROM
            trade_data
    )
    SELECT
        a.total_trades::BIGINT,
        a.winning_trades::BIGINT,
        a.losing_trades::BIGINT,
        a.win_rate,
        a.total_profit_loss,
        a.avg_profit,
        a.avg_loss,
        a.profit_factor,
        COALESCE(a.max_drawdown, 0) AS max_drawdown,
        a.median_holding_period AS avg_holding_period,
        a.avg_confidence_rating,
        COALESCE(a.trade_type_distribution, '{}'::jsonb) AS trade_type_distribution,
        COALESCE(a.symbol_distribution, '{}'::jsonb) AS symbol_distribution
    FROM
        analytics a;
END;
$$;


-- Testing
-- SELECT get_setup_analytics();


-- Function to get all trades associated with a specific setup
CREATE OR REPLACE FUNCTION public.get_trades_by_setup(
    p_user_id UUID,
    p_setup_id INTEGER,
    p_status VARCHAR(10) DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    trade_id INTEGER,
    trade_type VARCHAR(10),
    symbol VARCHAR(20),
    entry_date TIMESTAMPTZ,
    exit_date TIMESTAMPTZ,
    entry_price NUMERIC,
    exit_price NUMERIC,
    profit_loss NUMERIC,
    return_pct NUMERIC,
    status VARCHAR(10),
    confidence_rating SMALLINT,
    notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if user has access to the setup
    IF NOT EXISTS (
        SELECT 1 
        FROM public.setups 
        WHERE id = p_setup_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Setup not found or access denied.';
    END IF;
    
    RETURN QUERY
    WITH setup_trades AS (
        -- Stock trades
        SELECT 
            s.id AS trade_id,
            'stock'::VARCHAR(10) AS trade_type,
            s.symbol,
            s.entry_date,
            s.exit_date,
            s.entry_price,
            s.exit_price,
            (s.exit_price - s.entry_price) * s.number_shares * 
                CASE WHEN s.trade_type = 'BUY' THEN 1 ELSE -1 END AS profit_loss,
            CASE 
                WHEN s.exit_price IS NOT NULL THEN 
                    ((s.exit_price - s.entry_price) / s.entry_price) * 
                    CASE WHEN s.trade_type = 'BUY' THEN 1 ELSE -1 END * 100
                ELSE NULL 
            END AS return_pct,
            CASE 
                WHEN s.exit_price IS NULL THEN 'open' 
                ELSE 'closed' 
            END AS status,
            ts.confidence_rating,
            ts.notes
        FROM 
            public.trade_setups ts
            JOIN public.stocks s ON ts.stock_id = s.id
        WHERE 
            ts.setup_id = p_setup_id 
            AND ts.user_id = p_user_id
            AND ts.stock_id IS NOT NULL
            AND (p_status IS NULL OR 
                (p_status = 'open' AND s.exit_price IS NULL) OR
                (p_status = 'closed' AND s.exit_price IS NOT NULL)
            )
        
        UNION ALL
        
        -- Option trades
        SELECT 
            o.id AS trade_id,
            'option'::VARCHAR(10) AS trade_type,
            o.symbol,
            o.entry_date,
            o.exit_date,
            o.entry_price,
            o.exit_price,
            (o.exit_price - o.entry_price) * o.number_of_contracts * 100 AS profit_loss,
            CASE 
                WHEN o.exit_price IS NOT NULL AND o.entry_price > 0 THEN 
                    ((o.exit_price - o.entry_price) / o.entry_price) * 100
                ELSE NULL 
            END AS return_pct,
            CASE 
                WHEN o.exit_price IS NULL THEN 'open' 
                ELSE 'closed' 
            END AS status,
            ts.confidence_rating,
            ts.notes
        FROM 
            public.trade_setups ts
            JOIN public.options o ON ts.option_id = o.id
        WHERE 
            ts.setup_id = p_setup_id 
            AND ts.user_id = p_user_id
            AND ts.option_id IS NOT NULL
            AND (p_status IS NULL OR 
                (p_status = 'open' AND o.exit_price IS NULL) OR
                (p_status = 'closed' AND o.exit_price IS NOT NULL)
            )
    )
    SELECT 
        st.trade_id,
        st.trade_type,
        st.symbol,
        st.entry_date,
        st.exit_date,
        st.entry_price,
        st.exit_price,
        st.profit_loss,
        st.return_pct,
        st.status,
        st.confidence_rating,
        st.notes
    FROM 
        setup_trades st
    ORDER BY 
        st.entry_date DESC
    LIMIT 
        p_limit
    OFFSET 
        p_offset;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error retrieving trades for setup: %', SQLERRM;
END;
$$;


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
GRANT EXECUTE ON FUNCTION public.get_setup_analytics(UUID, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trades_by_setup(UUID, INTEGER, VARCHAR, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_stock_to_setup(UUID, INTEGER, INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_option_to_setup(UUID, INTEGER, INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_stock_from_setup(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_option_from_setup(UUID, INTEGER, INTEGER) TO authenticated;
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