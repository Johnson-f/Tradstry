-- Combined function to get the biggest losing trade (stocks and options)
CREATE OR REPLACE FUNCTION public.get_combined_biggest_loser(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH losing_trades AS (
        -- Stock losing trades
        SELECT 
            CASE 
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
                ELSE 0
            END AS loss
        FROM 
            public.stocks
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_price IS NOT NULL
            AND (
                (trade_type = 'BUY' AND exit_price < entry_price) OR
                (trade_type = 'SELL' AND exit_price > entry_price)
            )
            AND (
                (p_time_range = '7d' AND exit_date >= (CURRENT_DATE - INTERVAL '7 days'))
                OR (p_time_range = '30d' AND exit_date >= (CURRENT_DATE - INTERVAL '30 days'))
                OR (p_time_range = '90d' AND exit_date >= (CURRENT_DATE - INTERVAL '90 days'))
                OR (p_time_range = '1y' AND exit_date >= (CURRENT_DATE - INTERVAL '1 year'))
                OR (p_time_range = 'ytd' AND exit_date >= DATE_TRUNC('year', CURRENT_DATE))
                OR (p_time_range = 'custom' AND 
                    (p_custom_start_date IS NULL OR exit_date >= p_custom_start_date) AND
                    (p_custom_end_date IS NULL OR exit_date <= p_custom_end_date))
                OR (p_time_range = 'all_time')
            )
        
        UNION ALL
        
        -- Options losing trades
        SELECT 
            CASE 
                WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN 
                    (exit_price - entry_price) * 100 * number_of_contracts - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN 
                    -((exit_price - entry_price) * 100 * number_of_contracts) - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN 
                    (entry_price - exit_price) * 100 * number_of_contracts - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN 
                    -((entry_price - exit_price) * 100 * number_of_contracts) - COALESCE(commissions, 0)
                ELSE 0
            END AS loss
        FROM 
            public.options
        WHERE 
            user_id = auth.uid()
            AND status = 'closed'
            AND exit_date IS NOT NULL
            AND (
                (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price < entry_price) OR
                (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price > entry_price) OR
                (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price < entry_price) OR
                (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price > entry_price)
            )
            AND (
                (p_time_range = '7d' AND exit_date >= (CURRENT_DATE - INTERVAL '7 days'))
                OR (p_time_range = '30d' AND exit_date >= (CURRENT_DATE - INTERVAL '30 days'))
                OR (p_time_range = '90d' AND exit_date >= (CURRENT_DATE - INTERVAL '90 days'))
                OR (p_time_range = '1y' AND exit_date >= (CURRENT_DATE - INTERVAL '1 year'))
                OR (p_time_range = 'ytd' AND exit_date >= DATE_TRUNC('year', CURRENT_DATE))
                OR (p_time_range = 'custom' AND 
                    (p_custom_start_date IS NULL OR exit_date >= p_custom_start_date) AND
                    (p_custom_end_date IS NULL OR exit_date <= p_custom_end_date))
                OR (p_time_range = 'all_time')
            )
    )
    SELECT 
        COALESCE(MIN(loss), 0) AS biggest_loser
    FROM 
        losing_trades;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_biggest_loser(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_biggest_loser IS 'Returns the loss amount of the biggest losing trade from both stocks and options.

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

Returns:
- The loss amount of the biggest losing trade (a negative number, returns 0 if no losing trades found)';

-- Testing on Supabase SQL Editor
-- SELECT get_combined_biggest_loser('30d');  -- Last 30 days
-- SELECT get_combined_biggest_loser('ytd');  -- Year to date
-- SELECT get_combined_biggest_loser();       -- All time (default)
