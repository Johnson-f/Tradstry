-- Function to get win rate by trade_direction from the options table
CREATE OR REPLACE FUNCTION public.get_win_rate_by_trade_direction(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    trade_direction VARCHAR,
    total_trades BIGINT,
    winning_trades BIGINT,
    win_rate NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH option_trades AS (
        SELECT
            trade_direction,
            CASE
                WHEN (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price > entry_price) OR
                     (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price < entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price > entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price < entry_price)
                THEN 1
                ELSE 0
            END AS is_winner
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
        ot.trade_direction,
        COUNT(*) AS total_trades,
        SUM(ot.is_winner) AS winning_trades,
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(100.0 * SUM(ot.is_winner) / COUNT(*), 2)
        END AS win_rate
    FROM
        option_trades ot
    GROUP BY
        ot.trade_direction
    ORDER BY
        total_trades DESC,
        win_rate DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_win_rate_by_trade_direction(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_win_rate_by_trade_direction IS 'Returns the win rate for each option trade direction (Bullish, Bearish, Neutral).

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
- trade_direction: The direction of the trade
- total_trades: Total number of closed trades for the direction
- winning_trades: Number of profitable trades for the direction
- win_rate: The calculated win rate percentage for the direction

Example usage:
-- Get win rate by trade direction for the last 90 days
SELECT * FROM get_win_rate_by_trade_direction(''90d'');

-- Get win rate by trade direction for all time
SELECT * FROM get_win_rate_by_trade_direction();
';
