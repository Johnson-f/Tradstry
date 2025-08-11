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
