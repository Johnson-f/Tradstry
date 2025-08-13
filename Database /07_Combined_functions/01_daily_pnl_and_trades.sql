-- Function to get daily P&L and trade counts from both stocks and options for the authenticated user
CREATE OR REPLACE FUNCTION public.get_daily_pnl_trades(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    trade_date DATE,
    total_pnl NUMERIC,
    total_trades BIGINT,
    stock_trades BIGINT,
    option_trades BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH 
    -- Stock trades P&L and count
    stock_trades AS (
        SELECT 
            DATE(entry_date) AS trade_date,
            SUM(
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                END
            ) AS pnl,
            COUNT(*) AS trade_count
        FROM 
            public.stocks
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL  -- Only count closed trades
            AND (
                (p_time_range = '7d' AND entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
                OR (p_time_range = '30d' AND entry_date >= (CURRENT_DATE - INTERVAL '30 days'))
                OR (p_time_range = '90d' AND entry_date >= (CURRENT_DATE - INTERVAL '90 days'))
                OR (p_time_range = '1y' AND entry_date >= (CURRENT_DATE - INTERVAL '1 year'))
                OR (p_time_range = 'ytd' AND entry_date >= DATE_TRUNC('year', CURRENT_DATE))
                OR (p_time_range = 'custom' AND 
                    (p_custom_start_date IS NULL OR DATE(entry_date) >= p_custom_start_date) AND
                    (p_custom_end_date IS NULL OR DATE(entry_date) <= p_custom_end_date))
                OR (p_time_range = 'all_time')
            )
        GROUP BY 
            DATE(entry_date)
    ),
    
    -- Option trades P&L and count
    option_trades AS (
        SELECT 
            DATE(entry_date) AS trade_date,
            SUM(
                CASE 
                    WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN (exit_price - entry_price) * 100 * number_of_contracts - commissions
                    WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN -((exit_price - entry_price) * 100 * number_of_contracts) - commissions
                    WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN (entry_price - exit_price) * 100 * number_of_contracts - commissions
                    WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN -((entry_price - exit_price) * 100 * number_of_contracts) - commissions
                    -- For neutral strategies, we'll need to handle them based on the specific strategy
                    ELSE 0
                END
            ) AS pnl,
            COUNT(*) AS trade_count
        FROM 
            public.options
        WHERE 
            user_id = auth.uid()
            AND status = 'closed'
            AND (
                (p_time_range = '7d' AND entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
                OR (p_time_range = '30d' AND entry_date >= (CURRENT_DATE - INTERVAL '30 days'))
                OR (p_time_range = '90d' AND entry_date >= (CURRENT_DATE - INTERVAL '90 days'))
                OR (p_time_range = '1y' AND entry_date >= (CURRENT_DATE - INTERVAL '1 year'))
                OR (p_time_range = 'ytd' AND entry_date >= DATE_TRUNC('year', CURRENT_DATE))
                OR (p_time_range = 'custom' AND 
                    (p_custom_start_date IS NULL OR DATE(entry_date) >= p_custom_start_date) AND
                    (p_custom_end_date IS NULL OR DATE(entry_date) <= p_custom_end_date))
                OR (p_time_range = 'all_time')
            )
        GROUP BY 
            DATE(entry_date)
    )
    
    -- Combine results
    SELECT 
        COALESCE(s.trade_date, o.trade_date) AS trade_date,
        COALESCE(s.pnl, 0) + COALESCE(o.pnl, 0) AS total_pnl,
        COALESCE(s.trade_count, 0) + COALESCE(o.trade_count, 0) AS total_trades,
        COALESCE(s.trade_count, 0) AS stock_trades,
        COALESCE(o.trade_count, 0) AS option_trades
    FROM 
        (SELECT DISTINCT trade_date FROM stock_trades 
         UNION 
         SELECT DISTINCT trade_date FROM option_trades) AS dates
    LEFT JOIN stock_trades s ON dates.trade_date = s.trade_date
    LEFT JOIN option_trades o ON dates.trade_date = o.trade_date
    ORDER BY 
        trade_date DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_daily_pnl_trades(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_daily_pnl_trades IS 'Returns daily P&L and trade counts from both stocks and options for the authenticated user.

Parameters:
- p_time_range: Time range filter. Valid values:
  - ''7d'': Last 7 days
  - ''30d'': Last 30 days
  - ''90d'': Last 90 days
  - ''1y'': Last year
  - ''ytd'': Year to date
  - ''custom'': Use custom date range (requires p_custom_start_date and/or p_custom_end_date)
  - ''all_time'': All available data (default)
- p_custom_start_date: Start date for custom range (only used when p_time_range = ''custom'')
- p_custom_end_date: End date for custom range (only used when p_time_range = ''custom'')

Example usage:
- Last 30 days: SELECT * FROM get_daily_pnl_trades(''30d'');
- Custom range: SELECT * FROM get_daily_pnl_trades(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT * FROM get_daily_pnl_trades(''all_time'');';
 

 -- Testing on supabase 
-- SELECT * FROM get_daily_pnl_trades('all_time');