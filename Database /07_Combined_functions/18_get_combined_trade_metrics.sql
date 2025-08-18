-- Function to get combined trade metrics from both stocks and options
CREATE OR REPLACE FUNCTION public.get_combined_trade_metrics(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    trade_date DATE,
    total_trades BIGINT,
    activity_level TEXT,
    net_pnl NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH combined_trades AS (
        -- Stock trades
        SELECT 
            DATE(s.entry_date) AS trade_date,
            s.id,
            (s.exit_price - s.entry_price) * s.number_shares - s.commissions AS pnl
        FROM 
            public.stocks s
        WHERE 
            s.user_id = auth.uid()
            AND s.exit_price IS NOT NULL
            AND (
                (p_time_range = '7d' AND s.entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
                OR (p_time_range = '30d' AND s.entry_date >= (CURRENT_DATE - INTERVAL '30 days'))
                OR (p_time_range = '90d' AND s.entry_date >= (CURRENT_DATE - INTERVAL '90 days'))
                OR (p_time_range = '1y' AND s.entry_date >= (CURRENT_DATE - INTERVAL '1 year'))
                OR (p_time_range = 'ytd' AND s.entry_date >= DATE_TRUNC('year', CURRENT_DATE))
                OR (p_time_range = 'custom' AND 
                    (p_custom_start_date IS NULL OR s.entry_date >= p_custom_start_date) AND
                    (p_custom_end_date IS NULL OR s.entry_date <= p_custom_end_date))
                OR (p_time_range = 'all_time')
            )
            
        UNION ALL
        
        -- Option trades
        SELECT 
            DATE(o.entry_date) AS trade_date,
            o.id,
            (o.exit_price - o.entry_price) * o.number_of_contracts * 100 - o.commissions AS pnl
        FROM 
            public.options o
        WHERE 
            o.user_id = auth.uid()
            AND o.exit_price IS NOT NULL
            AND (
                (p_time_range = '7d' AND o.entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
                OR (p_time_range = '30d' AND o.entry_date >= (CURRENT_DATE - INTERVAL '30 days'))
                OR (p_time_range = '90d' AND o.entry_date >= (CURRENT_DATE - INTERVAL '90 days'))
                OR (p_time_range = '1y' AND o.entry_date >= (CURRENT_DATE - INTERVAL '1 year'))
                OR (p_time_range = 'ytd' AND o.entry_date >= DATE_TRUNC('year', CURRENT_DATE))
                OR (p_time_range = 'custom' AND 
                    (p_custom_start_date IS NULL OR o.entry_date >= p_custom_start_date) AND
                    (p_custom_end_date IS NULL OR o.entry_date <= p_custom_end_date))
                OR (p_time_range = 'all_time')
            )
    )
    SELECT 
        ct.trade_date,
        COUNT(ct.id)::BIGINT AS total_trades,
        CASE 
            WHEN COUNT(ct.id) >= 10 THEN 'High'
            WHEN COUNT(ct.id) >= 5 THEN 'Medium'
            ELSE 'Low'
        END AS activity_level,
        COALESCE(SUM(ct.pnl), 0) AS net_pnl
    FROM 
        combined_trades ct
    GROUP BY 
        ct.trade_date
    ORDER BY 
        ct.trade_date;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_trade_metrics(TEXT, DATE, DATE) TO authenticated;
