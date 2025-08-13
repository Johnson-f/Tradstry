-- Fixed function to calculate trade expectancy (stocks and options)
CREATE OR REPLACE FUNCTION public.get_combined_trade_expectancy(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH trade_stats AS (
        -- Stock trades
        SELECT 
            CASE 
                WHEN (trade_type = 'BUY' AND exit_price > entry_price) OR
                     (trade_type = 'SELL' AND exit_price < entry_price) THEN 1
                ELSE 0
            END AS is_winner,
            CASE 
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
                ELSE 0
            END AS profit_loss
        FROM 
            public.stocks
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL
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
            )
        
        UNION ALL
        
        -- Options trades
        SELECT 
            CASE 
                WHEN (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price > entry_price) OR
                     (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price < entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price > entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price < entry_price)
                THEN 1
                ELSE 0
            END AS is_winner,
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
            END AS profit_loss
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
    expectancy_calc AS (
        SELECT 
            COUNT(*) AS total_trades,
            SUM(is_winner) AS winning_trades,
            COUNT(*) - SUM(is_winner) AS losing_trades,
            AVG(CASE WHEN is_winner = 1 THEN profit_loss ELSE NULL END) AS avg_winner,
            AVG(CASE WHEN is_winner = 0 THEN ABS(profit_loss) ELSE NULL END) AS avg_loser
        FROM 
            trade_stats
    )
    SELECT 
        CASE 
            WHEN total_trades = 0 THEN 0
            ELSE ROUND(
                ((winning_trades::NUMERIC / NULLIF(total_trades, 0)) * COALESCE(avg_winner, 0) -
                (losing_trades::NUMERIC / NULLIF(total_trades, 0)) * COALESCE(avg_loser, 0))::NUMERIC,
                2
            )
        END AS trade_expectancy
    FROM 
        expectancy_calc;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_trade_expectancy(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_trade_expectancy IS 'Calculates the trade expectancy (stocks and options).

Trade Expectancy = (Win% * Avg Win) - (Loss% * Avg Loss)

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
- Trade expectancy value (average expected profit per trade)';

-- Testing on Supabase SQL Editor 
