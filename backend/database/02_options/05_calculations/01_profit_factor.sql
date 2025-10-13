-- Function to calculate profit factor for options trades
CREATE OR REPLACE FUNCTION public.get_options_profit_factor(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH trade_profits AS (
        SELECT 
            CASE 
                WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN 
                    (COALESCE(exit_price, 0) - entry_price) * 100 * number_of_contracts - commissions
                WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN 
                    -((COALESCE(exit_price, 0) - entry_price) * 100 * number_of_contracts) - commissions
                WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN 
                    (entry_price - COALESCE(exit_price, 0)) * 100 * number_of_contracts - commissions
                WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN 
                    -((entry_price - COALESCE(exit_price, 0)) * 100 * number_of_contracts) - commissions
                ELSE 0
            END AS profit
        FROM 
            public.options
        WHERE 
            user_id = auth.uid()
            AND status = 'closed'
            AND exit_date IS NOT NULL
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
    ),
    profit_metrics AS (
        SELECT
            SUM(CASE WHEN profit > 0 THEN profit ELSE 0 END) AS gross_profit,
            ABS(SUM(CASE WHEN profit < 0 THEN profit ELSE 0 END)) AS gross_loss,
            COUNT(*) AS total_trades
        FROM 
            trade_profits
    )
    SELECT 
        CASE 
            WHEN total_trades = 0 THEN 0  -- No trades = 0
            WHEN gross_loss = 0 AND gross_profit > 0 THEN 999.99  -- All wins = very high number
            WHEN gross_loss = 0 THEN 0  -- No profit and no loss = 0
            ELSE ROUND(gross_profit / gross_loss, 2) 
        END AS profit_factor
    FROM 
        profit_metrics;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_options_profit_factor(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_options_profit_factor IS 'Calculates the profit factor for options trades.

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
- profit_factor: Gross profit divided by gross loss (returns 0 if no trades or no losses)';

-- Testing on Supabase SQL Editor
-- SELECT get_options_profit_factor('30d');  -- Last 30 days
-- SELECT get_options_profit_factor('ytd');  -- Year to date
-- SELECT get_options_profit_factor();       -- All time (default)
