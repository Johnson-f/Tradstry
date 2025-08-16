-- Function to calculate loss rate for stock trades
CREATE OR REPLACE FUNCTION public.get_stock_loss_rate(
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
        CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(
                (COUNT(CASE 
                    WHEN (exit_price - entry_price) * 
                        CASE WHEN trade_type = 'BUY' THEN 1 ELSE -1 END - commissions < 0 
                    THEN 1 
                END)::NUMERIC / COUNT(*)) * 100, 2
            )
        END as loss_rate
    FROM public.stocks
    WHERE 
        user_id = auth.uid()
        AND status = 'closed'
        AND exit_price IS NOT NULL
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
        );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_stock_loss_rate(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_stock_loss_rate IS 'Returns the loss rate for stock trades as a percentage.

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
- Loss rate as a percentage (0-100) as NUMERIC
- Returns 0 if no trades found matching the criteria

Calculation:
- For BUY trades: Loss when (exit_price - entry_price) - commissions < 0
- For SELL trades: Loss when (entry_price - exit_price) - commissions < 0
- Loss rate = (number of losing trades / total trades) * 100

Example usage:
- Last 30 days: SELECT get_stock_loss_rate(''30d'');
- Custom range: SELECT get_stock_loss_rate(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT get_stock_loss_rate();';

-- Testing on Supabase SQL Editor
-- SELECT get_stock_loss_rate('30d');  -- Last 30 days
-- SELECT get_stock_loss_rate('ytd');  -- Year to date
-- SELECT get_stock_loss_rate();       -- All time (default)