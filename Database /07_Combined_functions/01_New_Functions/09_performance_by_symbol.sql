-- Function to get detailed performance metrics for a specific symbol
CREATE OR REPLACE FUNCTION public.get_performance_by_symbol(
    p_symbol TEXT,
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    symbol TEXT,
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
    WITH all_trades AS (
        -- Stock trades
        SELECT
            CASE
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
            END AS pnl
        FROM public.stocks
        WHERE user_id = auth.uid()
          AND public.stocks.symbol = p_symbol
          AND exit_date IS NOT NULL AND exit_price IS NOT NULL
          AND (
            (p_time_range = '7d' AND exit_date >= (CURRENT_DATE - INTERVAL '7 days')) OR
            (p_time_range = '30d' AND exit_date >= (CURRENT_DATE - INTERVAL '30 days')) OR
            (p_time_range = '90d' AND exit_date >= (CURRENT_DATE - INTERVAL '90 days')) OR
            (p_time_range = '1y' AND exit_date >= (CURRENT_DATE - INTERVAL '1 year')) OR
            (p_time_range = 'ytd' AND exit_date >= DATE_TRUNC('year', CURRENT_DATE)) OR
            (p_time_range = 'custom' AND exit_date >= p_custom_start_date AND exit_date <= p_custom_end_date) OR
            (p_time_range = 'all_time')
          )

        UNION ALL

        -- Options trades
        SELECT
            CASE
                WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN (exit_price - entry_price) * 100 * number_of_contracts - commissions
                WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN -((exit_price - entry_price) * 100 * number_of_contracts) - commissions
                WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN (entry_price - exit_price) * 100 * number_of_contracts - commissions
                WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN -((entry_price - exit_price) * 100 * number_of_contracts) - commissions
                ELSE 0
            END AS pnl
        FROM public.options
        WHERE user_id = auth.uid()
          AND public.options.symbol = p_symbol
          AND status = 'closed' AND exit_price IS NOT NULL
          AND (
            (p_time_range = '7d' AND exit_date >= (CURRENT_DATE - INTERVAL '7 days')) OR
            (p_time_range = '30d' AND exit_date >= (CURRENT_DATE - INTERVAL '30 days')) OR
            (p_time_range = '90d' AND exit_date >= (CURRENT_DATE - INTERVAL '90 days')) OR
            (p_time_range = '1y' AND exit_date >= (CURRENT_DATE - INTERVAL '1 year')) OR
            (p_time_range = 'ytd' AND exit_date >= DATE_TRUNC('year', CURRENT_DATE)) OR
            (p_time_range = 'custom' AND exit_date >= p_custom_start_date AND exit_date <= p_custom_end_date) OR
            (p_time_range = 'all_time')
          )
    ),
    metrics AS (
        SELECT
            COUNT(*) AS total_trades,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS winning_trades,
            SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) AS losing_trades,
            COALESCE(SUM(pnl), 0) AS net_pnl,
            COALESCE(SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END), 0) AS gross_profit,
            COALESCE(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END), 0) AS gross_loss
        FROM all_trades
    )
    SELECT
        p_symbol AS symbol,
        m.total_trades,
        COALESCE(ROUND(100.0 * m.winning_trades / NULLIF(m.total_trades, 0), 2), 0) AS win_rate,
        COALESCE(ROUND(100.0 * m.losing_trades / NULLIF(m.total_trades, 0), 2), 0) AS loss_rate,
        m.net_pnl,
        COALESCE(ROUND(m.gross_profit / NULLIF(m.winning_trades, 0), 2), 0) AS average_gain,
        COALESCE(ROUND(m.gross_loss / NULLIF(m.losing_trades, 0), 2), 0) AS average_loss,
        COALESCE(ROUND(m.gross_profit / NULLIF(ABS(m.gross_loss), 0), 2), 0) AS profit_factor
    FROM metrics m;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_performance_by_symbol(TEXT, TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_performance_by_symbol IS 'Returns a comprehensive performance summary for a given symbol.

Parameters:
- p_symbol: The ticker symbol to analyze.
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- symbol: The ticker symbol.
- total_trades: Total number of trades.
- win_rate: Percentage of winning trades.
- loss_rate: Percentage of losing trades.
- net_pnl: Net profit or loss.
- average_gain: Average profit of winning trades.
- average_loss: Average loss of losing trades.
- profit_factor: Gross profit divided by gross loss.

Example usage:
-- Get performance for AAPL for all time
SELECT * FROM get_performance_by_symbol(''AAPL'');

-- Get performance for TSLA for the last 90 days
SELECT * FROM get_performance_by_symbol(''TSLA'', ''90d'');
';
