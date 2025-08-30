-- Function to get loss rate by strategy_type from the options table
CREATE OR REPLACE FUNCTION public.get_loss_rate_by_strategy(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    strategy_type TEXT,
    total_trades BIGINT,
    losing_trades BIGINT,
    loss_rate NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH option_trades AS (
        SELECT
            strategy_type,
            CASE
                WHEN (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price < entry_price) OR
                     (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price > entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price < entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price > entry_price)
                THEN 1
                ELSE 0
            END AS is_loser
        FROM
            public.options
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
            )
    )
    SELECT
        ot.strategy_type,
        COUNT(*) AS total_trades,
        SUM(ot.is_loser) AS losing_trades,
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(100.0 * SUM(ot.is_loser) / COUNT(*), 2)
        END AS loss_rate
    FROM
        option_trades ot
    GROUP BY
        ot.strategy_type
    ORDER BY
        total_trades DESC,
        loss_rate DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_loss_rate_by_strategy(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_loss_rate_by_strategy IS 'Returns the loss rate for each option strategy type.

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
- strategy_type: The name of the option strategy
- total_trades: Total number of closed trades for the strategy
- losing_trades: Number of unprofitable trades for the strategy
- loss_rate: The calculated loss rate percentage for the strategy

Example usage:
-- Get loss rate by strategy for the last 90 days
SELECT * FROM get_loss_rate_by_strategy(''90d'');

-- Get loss rate by strategy for all time
SELECT * FROM get_loss_rate_by_strategy();
';
