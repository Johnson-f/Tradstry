-- Function to calculate average hold time for winning stock trades (in days)
CREATE OR REPLACE FUNCTION public.get_avg_hold_time_winners(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH winning_trades AS (
        SELECT 
            EXTRACT(EPOCH FROM (exit_date - entry_date)) / 86400.0 AS hold_days
        FROM 
            public.stocks
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_price IS NOT NULL
            AND (
                (trade_type = 'BUY' AND exit_price > entry_price) OR
                (trade_type = 'SELL' AND exit_price < entry_price)
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
        CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(AVG(hold_days)::numeric, 2)
        END AS avg_hold_days
    FROM 
        winning_trades;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_avg_hold_time_winners(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_avg_hold_time_winners IS 'Calculates the average hold time in days for winning stock trades.

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
- Average hold time in days (rounded to 2 decimal places)
- Returns 0 if there are no winning trades

Example usage:
-- Last 30 days
SELECT get_avg_hold_time_winners(''30d'');

-- Year to date
SELECT get_avg_hold_time_winners(''ytd'');

-- All time (default)
SELECT get_avg_hold_time_winners();';

-- Testing on Supabase SQL Editor
-- SELECT get_avg_hold_time_winners('30d');  -- Last 30 days
-- SELECT get_avg_hold_time_winners('ytd');  -- Year to date
-- SELECT get_avg_hold_time_winners();       -- All time (default)
