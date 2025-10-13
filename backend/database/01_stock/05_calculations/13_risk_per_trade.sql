-- Function to calculate average risk per trade for stock trades
CREATE OR REPLACE FUNCTION public.get_average_risk_per_trade(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        COALESCE(ROUND(AVG(
            CASE 
                WHEN trade_type = 'BUY' THEN (entry_price - stop_loss) * number_shares
                WHEN trade_type = 'SELL' THEN (stop_loss - entry_price) * number_shares
            END
        ), 2), 0) as average_risk_per_trade
    FROM public.stocks
    WHERE 
        user_id = auth.uid()
        AND status = 'closed'
        AND stop_loss IS NOT NULL
        AND (
            (p_time_range = '7d' AND entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
            OR (p_time_range = '30d' AND entry_date >= (CURRENT_DATE - INTERVAL '30 days'))
            OR (p_time_range = '90d' AND entry_date >= (CURRENT_DATE - INTERVAL '90 days'))
            OR (p_time_range = '1y' AND entry_date >= (CURRENT_DATE - INTERVAL '1 year'))
            OR (p_time_range = 'ytd' AND entry_date >= DATE_TRUNC('year', CURRENT_DATE))
            OR (p_time_range = 'custom' AND
                (p_custom_start_date IS NULL OR entry_date >= p_custom_start_date) AND
                (p_custom_end_date IS NULL OR entry_date <= p_custom_end_date))
            OR (p_time_range = 'all_time')
        )
    GROUP BY user_id;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_average_risk_per_trade(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_average_risk_per_trade IS 'Returns the average risk per trade for stock trades.

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
- Average risk per trade in dollars as NUMERIC

Example usage:
- Last 30 days: SELECT get_average_risk_per_trade(''30d'');
- Custom range: SELECT get_average_risk_per_trade(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT get_average_risk_per_trade();';

-- Testing on Supabase SQL Editor
-- SELECT get_average_risk_per_trade('30d');  -- Last 30 days
-- SELECT get_average_risk_per_trade('ytd');  -- Year to date
-- SELECT get_average_risk_per_trade();       -- All time (default)
