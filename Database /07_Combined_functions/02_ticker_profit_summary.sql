-- Function to get ticker symbols and their total profit from both stocks and options
CREATE OR REPLACE FUNCTION public.get_ticker_profit_summary(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL,
    p_limit INTEGER DEFAULT NULL
)
RETURNS TABLE (
    symbol VARCHAR,
    total_profit NUMERIC,
    stock_trades BIGINT,
    option_trades BIGINT,
    total_trades BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH 
    -- Stock trades profit
    stock_profits AS (
        SELECT 
            symbol,
            SUM(
                CASE 
                    WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
                    WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
                END
            ) AS profit,
            COUNT(*) AS trade_count
        FROM 
            public.stocks
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL  -- Only count closed trades
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
        GROUP BY 
            symbol
    ),
    
    -- Option trades profit
    option_profits AS (
        SELECT 
            symbol,
            SUM(
                CASE 
                    WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN 
                        (COALESCE(exit_price, 0) - entry_price) * 100 * number_of_contracts - COALESCE(commissions, 0)
                    WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN 
                        -((COALESCE(exit_price, 0) - entry_price) * 100 * number_of_contracts) - COALESCE(commissions, 0)
                    WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN 
                        (entry_price - COALESCE(exit_price, 0)) * 100 * number_of_contracts - COALESCE(commissions, 0)
                    WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN 
                        -((entry_price - COALESCE(exit_price, 0)) * 100 * number_of_contracts) - COALESCE(commissions, 0)
                    ELSE 0
                END
            ) AS profit,
            COUNT(*) AS trade_count
        FROM 
            public.options
        WHERE 
            user_id = auth.uid()
            AND status = 'closed'
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
        GROUP BY 
            symbol
    )
    
    -- Combine results
    SELECT 
        COALESCE(s.symbol, o.symbol) AS symbol,
        COALESCE(s.profit, 0) + COALESCE(o.profit, 0) AS total_profit,
        COALESCE(s.trade_count, 0) AS stock_trades,
        COALESCE(o.trade_count, 0) AS option_trades,
        COALESCE(s.trade_count, 0) + COALESCE(o.trade_count, 0) AS total_trades
    FROM 
        stock_profits s
    FULL OUTER JOIN 
        option_profits o ON s.symbol = o.symbol
    WHERE 
        (s.profit IS NOT NULL AND s.profit != 0) OR 
        (o.profit IS NOT NULL AND o.profit != 0)
    ORDER BY 
        ABS(COALESCE(s.profit, 0) + COALESCE(o.profit, 0)) DESC
    LIMIT 
        CASE WHEN p_limit IS NOT NULL AND p_limit > 0 THEN p_limit ELSE NULL END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_ticker_profit_summary(TEXT, DATE, DATE, INTEGER) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_ticker_profit_summary IS 'Returns ticker symbols and their total profit from both stocks and options for the authenticated user.

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
- p_limit: Limit the number of results returned (optional)

Returns:
- symbol: The ticker symbol
- total_profit: Total profit/loss for the symbol
- stock_trades: Number of stock trades for the symbol
- option_trades: Number of option trades for the symbol
- total_trades: Total number of trades (stocks + options) for the symbol

Example usage:
-- Last 30 days
SELECT * FROM get_ticker_profit_summary(''30d'');

-- Year to date
SELECT * FROM get_ticker_profit_summary(''ytd'');

-- Custom range
SELECT * FROM get_ticker_profit_summary(''custom'', ''2024-01-01'', ''2024-12-31'');

-- All time (default)
SELECT * FROM get_ticker_profit_summary();';


-- Testing on Supabase SQL Editor
-- SELECT * FROM get_ticker_profit_summary();