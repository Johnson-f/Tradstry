-- Function to get detailed performance metrics by trade direction for options
CREATE OR REPLACE FUNCTION public.get_performance_by_trade_direction(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    trade_direction VARCHAR,
    total_trades BIGINT,
    win_rate NUMERIC,
    loss_rate NUMERIC,
    net_pnl NUMERIC,
    average_gain NUMERIC,
    average_loss NUMERIC,
    profit_factor NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH trades_with_pnl AS (
        -- Calculate PnL for each option trade
        SELECT
            o.trade_direction,
            CASE
                WHEN o.trade_direction = 'Bullish' AND o.option_type = 'Call' THEN (o.exit_price - o.entry_price) * 100 * o.number_of_contracts - o.commissions
                WHEN o.trade_direction = 'Bullish' AND o.option_type = 'Put' THEN -((o.exit_price - o.entry_price) * 100 * o.number_of_contracts) - o.commissions
                WHEN o.trade_direction = 'Bearish' AND o.option_type = 'Put' THEN (o.entry_price - o.exit_price) * 100 * o.number_of_contracts - o.commissions
                WHEN o.trade_direction = 'Bearish' AND o.option_type = 'Call' THEN -((o.entry_price - o.exit_price) * 100 * o.number_of_contracts) - o.commissions
                ELSE 0
            END AS pnl
        FROM public.options o
        WHERE o.user_id = auth.uid()
          AND o.status = 'closed' AND o.exit_price IS NOT NULL
          AND (
            (p_time_range = '7d' AND o.exit_date >= (CURRENT_DATE - INTERVAL '7 days')) OR
            (p_time_range = '30d' AND o.exit_date >= (CURRENT_DATE - INTERVAL '30 days')) OR
            (p_time_range = '90d' AND o.exit_date >= (CURRENT_DATE - INTERVAL '90 days')) OR
            (p_time_range = '1y' AND o.exit_date >= (CURRENT_DATE - INTERVAL '1 year')) OR
            (p_time_range = 'ytd' AND o.exit_date >= DATE_TRUNC('year', CURRENT_DATE)) OR
            (p_time_range = 'custom' AND o.exit_date >= p_custom_start_date AND o.exit_date <= p_custom_end_date) OR
            (p_time_range = 'all_time')
          )
    ),
    metrics AS (
        SELECT
            t.trade_direction,
            COUNT(*) AS total_trades,
            SUM(CASE WHEN t.pnl > 0 THEN 1 ELSE 0 END) AS winning_trades,
            SUM(CASE WHEN t.pnl < 0 THEN 1 ELSE 0 END) AS losing_trades,
            COALESCE(SUM(t.pnl), 0) AS net_pnl,
            COALESCE(SUM(CASE WHEN t.pnl > 0 THEN t.pnl ELSE 0 END), 0) AS gross_profit,
            COALESCE(SUM(CASE WHEN t.pnl < 0 THEN t.pnl ELSE 0 END), 0) AS gross_loss
        FROM trades_with_pnl t
        GROUP BY t.trade_direction
    )
    SELECT
        m.trade_direction,
        m.total_trades,
        COALESCE(ROUND(100.0 * m.winning_trades / NULLIF(m.total_trades, 0), 2), 0) AS win_rate,
        COALESCE(ROUND(100.0 * m.losing_trades / NULLIF(m.total_trades, 0), 2), 0) AS loss_rate,
        m.net_pnl,
        COALESCE(ROUND(m.gross_profit / NULLIF(m.winning_trades, 0), 2), 0) AS average_gain,
        COALESCE(ROUND(m.gross_loss / NULLIF(m.losing_trades, 0), 2), 0) AS average_loss,
        COALESCE(ROUND(m.gross_profit / NULLIF(ABS(m.gross_loss), 0), 2), 0) AS profit_factor
    FROM metrics m
    ORDER BY m.trade_direction;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_performance_by_trade_direction(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_performance_by_trade_direction IS 'Returns a comprehensive performance summary for each trade direction (Bullish, Bearish, Neutral) for options.

Parameters:
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- trade_direction: The direction of the trade.
- total_trades: Total number of trades.
- win_rate: Percentage of winning trades.
- loss_rate: Percentage of losing trades.
- net_pnl: Net profit or loss.
- average_gain: Average profit of winning trades.
- average_loss: Average loss of losing trades.
- profit_factor: Gross profit divided by gross loss.

Example usage:
-- Get performance by direction for all time
SELECT * FROM get_performance_by_trade_direction();

-- Get performance by direction for the last 90 days
SELECT * FROM get_performance_by_trade_direction(''90d'');
';
