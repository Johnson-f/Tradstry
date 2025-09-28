-- Function to get daily P&L and trade counts from both stocks and options for the authenticated user
CREATE OR REPLACE FUNCTION public.get_daily_pnl_trades(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    trade_date DATE,
    total_pnl NUMERIC,
    total_trades BIGINT,
    stock_trades BIGINT,
    option_trades BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH 
    -- Stock trades P&L and count
    stock_trades AS (
        SELECT 
            DATE(entry_date) AS trade_date,
            SUM(
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                END
            ) AS pnl,
            COUNT(*) AS trade_count
        FROM 
            public.stocks
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL  -- Only count closed trades
            AND (
                (p_time_range = '7d' AND entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
                OR (p_time_range = '30d' AND entry_date >= (CURRENT_DATE - INTERVAL '30 days'))
                OR (p_time_range = '90d' AND entry_date >= (CURRENT_DATE - INTERVAL '90 days'))
                OR (p_time_range = '1y' AND entry_date >= (CURRENT_DATE - INTERVAL '1 year'))
                OR (p_time_range = 'ytd' AND entry_date >= DATE_TRUNC('year', CURRENT_DATE))
                OR (p_time_range = 'custom' AND 
                    (p_custom_start_date IS NULL OR DATE(entry_date) >= p_custom_start_date) AND
                    (p_custom_end_date IS NULL OR DATE(entry_date) <= p_custom_end_date))
                OR (p_time_range = 'all_time')
            )
        GROUP BY 
            DATE(entry_date)
    ),
    
    -- Option trades P&L and count
    option_trades AS (
        SELECT 
            DATE(entry_date) AS trade_date,
            SUM(
                CASE 
                    WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN (exit_price - entry_price) * 100 * number_of_contracts - commissions
                    WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN -((exit_price - entry_price) * 100 * number_of_contracts) - commissions
                    WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN (entry_price - exit_price) * 100 * number_of_contracts - commissions
                    WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN -((entry_price - exit_price) * 100 * number_of_contracts) - commissions
                    -- For neutral strategies, we'll need to handle them based on the specific strategy
                    ELSE 0
                END
            ) AS pnl,
            COUNT(*) AS trade_count
        FROM 
            public.options
        WHERE 
            user_id = auth.uid()
            AND status = 'closed'
            AND (
                (p_time_range = '7d' AND entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
                OR (p_time_range = '30d' AND entry_date >= (CURRENT_DATE - INTERVAL '30 days'))
                OR (p_time_range = '90d' AND entry_date >= (CURRENT_DATE - INTERVAL '90 days'))
                OR (p_time_range = '1y' AND entry_date >= (CURRENT_DATE - INTERVAL '1 year'))
                OR (p_time_range = 'ytd' AND entry_date >= DATE_TRUNC('year', CURRENT_DATE))
                OR (p_time_range = 'custom' AND 
                    (p_custom_start_date IS NULL OR DATE(entry_date) >= p_custom_start_date) AND
                    (p_custom_end_date IS NULL OR DATE(entry_date) <= p_custom_end_date))
                OR (p_time_range = 'all_time')
            )
        GROUP BY 
            DATE(entry_date)
    )
    
    -- Combine results
    SELECT 
        COALESCE(s.trade_date, o.trade_date) AS trade_date,
        COALESCE(s.pnl, 0) + COALESCE(o.pnl, 0) AS total_pnl,
        COALESCE(s.trade_count, 0) + COALESCE(o.trade_count, 0) AS total_trades,
        COALESCE(s.trade_count, 0) AS stock_trades,
        COALESCE(o.trade_count, 0) AS option_trades
    FROM 
        (SELECT DISTINCT trade_date FROM stock_trades 
         UNION 
         SELECT DISTINCT trade_date FROM option_trades) AS dates
    LEFT JOIN stock_trades s ON dates.trade_date = s.trade_date
    LEFT JOIN option_trades o ON dates.trade_date = o.trade_date
    ORDER BY 
        trade_date DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_daily_pnl_trades(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_daily_pnl_trades IS 'Returns daily P&L and trade counts from both stocks and options for the authenticated user.

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

Example usage:
- Last 30 days: SELECT * FROM get_daily_pnl_trades(''30d'');
- Custom range: SELECT * FROM get_daily_pnl_trades(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT * FROM get_daily_pnl_trades(''all_time'');';
 

 -- Testing on supabase 
-- SELECT * FROM get_daily_pnl_trades('all_time');

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
    total_trades BIGINT,
    most_recent_exit_date DATE
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
            COUNT(*) AS trade_count,
            MAX(exit_date) AS latest_exit_date
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
            COUNT(*) AS trade_count,
            MAX(exit_date) AS latest_exit_date
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
        COALESCE(s.trade_count, 0) + COALESCE(o.trade_count, 0) AS total_trades,
        GREATEST(COALESCE(s.latest_exit_date, '1900-01-01'::DATE), COALESCE(o.latest_exit_date, '1900-01-01'::DATE)) AS most_recent_exit_date
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
- most_recent_exit_date: The most recent exit date across all trades for this symbol

Example usage:
-- Last 30 days
SELECT * FROM get_ticker_profit_summary(''30d'');

-- Year to date
SELECT * FROM get_ticker_profit_summary(''ytd'');

-- Custom range
SELECT * FROM get_ticker_profit_summary(''custom'', ''2024-01-01'', ''2024-12-31'');

-- All time (default)
SELECT * FROM get_ticker_profit_summary();';


/*
Old functions
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
*/

-- Combined function to calculate profit factor from both stocks and options
CREATE OR REPLACE FUNCTION public.get_combined_profit_factor(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH stock_trades AS (
        -- Stock trades
        SELECT 
            CASE 
                WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
                ELSE 0
            END AS profit
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
                WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN 
                    (COALESCE(exit_price, 0) - entry_price) * 100 * number_of_contracts - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN 
                    -((COALESCE(exit_price, 0) - entry_price) * 100 * number_of_contracts) - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN 
                    (entry_price - COALESCE(exit_price, 0)) * 100 * number_of_contracts - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN 
                    -((entry_price - COALESCE(exit_price, 0)) * 100 * number_of_contracts) - COALESCE(commissions, 0)
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
            stock_trades
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
GRANT EXECUTE ON FUNCTION public.get_combined_profit_factor(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_profit_factor IS 'Calculates the profit factor for both stock and options trades.

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
-- SELECT get_combined_profit_factor('30d');  -- Last 30 days
-- SELECT get_combined_profit_factor('ytd');  -- Year to date
-- SELECT get_combined_profit_factor();       -- All time (default)


-- Combined function to calculate average hold time for winning trades (stocks and options)
CREATE OR REPLACE FUNCTION public.get_combined_avg_hold_time_winners(
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
        -- Stock winning trades
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
        
        UNION ALL
        
        -- Options winning trades
        SELECT 
            EXTRACT(EPOCH FROM (exit_date - entry_date)) / 86400.0 AS hold_days
        FROM 
            public.options
        WHERE 
            user_id = auth.uid()
            AND status = 'closed'
            AND exit_date IS NOT NULL
            AND (
                (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price > entry_price) OR
                (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price < entry_price) OR
                (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price > entry_price) OR
                (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price < entry_price)
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
GRANT EXECUTE ON FUNCTION public.get_combined_avg_hold_time_winners(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_avg_hold_time_winners IS 'Calculates the average hold time in days for winning trades (stocks and options).

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
- Returns 0 if there are no winning trades';

-- Testing on Supabase SQL Editor
-- SELECT get_combined_avg_hold_time_winners('30d');  -- Last 30 days
-- SELECT get_combined_avg_hold_time_winners('ytd');  -- Year to date
-- SELECT get_combined_avg_hold_time_winners();       -- All time (default)


-- Combined function to calculate average hold time for losing trades (stocks and options)
CREATE OR REPLACE FUNCTION public.get_combined_avg_hold_time_losers(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH losing_trades AS (
        -- Stock losing trades
        SELECT 
            EXTRACT(EPOCH FROM (exit_date - entry_date)) / 86400.0 AS hold_days
        FROM 
            public.stocks
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_price IS NOT NULL
            AND (
                (trade_type = 'BUY' AND exit_price < entry_price) OR
                (trade_type = 'SELL' AND exit_price > entry_price)
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
        
        UNION ALL
        
        -- Options losing trades
        SELECT 
            EXTRACT(EPOCH FROM (exit_date - entry_date)) / 86400.0 AS hold_days
        FROM 
            public.options
        WHERE 
            user_id = auth.uid()
            AND status = 'closed'
            AND exit_date IS NOT NULL
            AND (
                (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price < entry_price) OR
                (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price > entry_price) OR
                (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price < entry_price) OR
                (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price > entry_price)
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
        losing_trades;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_avg_hold_time_losers(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_avg_hold_time_losers IS 'Calculates the average hold time in days for losing trades (stocks and options).

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
- Returns 0 if there are no losing trades';

-- Testing on Supabase SQL Editor
-- SELECT get_combined_avg_hold_time_losers('30d');  -- Last 30 days
-- SELECT get_combined_avg_hold_time_losers('ytd');  -- Year to date
-- SELECT get_combined_avg_hold_time_losers();       -- All time (default)

-- Combined function to get the biggest winning trade (stocks and options)
CREATE OR REPLACE FUNCTION public.get_combined_biggest_winner(
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
        -- Stock winning trades
        SELECT 
            CASE 
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
                ELSE 0
            END AS profit
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
        
        UNION ALL
        
        -- Options winning trades
        SELECT 
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
            END AS profit
        FROM 
            public.options
        WHERE 
            user_id = auth.uid()
            AND status = 'closed'
            AND exit_date IS NOT NULL
            AND (
                (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price > entry_price) OR
                (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price < entry_price) OR
                (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price > entry_price) OR
                (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price < entry_price)
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
        COALESCE(MAX(profit), 0) AS biggest_winner
    FROM 
        winning_trades;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_biggest_winner(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_biggest_winner IS 'Returns the profit amount of the biggest winning trade from both stocks and options.

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
- The profit amount of the biggest winning trade (returns 0 if no winning trades found)';

-- Testing on Supabase SQL Editor
-- SELECT get_combined_biggest_winner('30d');  -- Last 30 days
-- SELECT get_combined_biggest_winner('ytd');  -- Year to date
-- SELECT get_combined_biggest_winner();       -- All time (default)

-- Combined function to get the biggest losing trade (stocks and options)
CREATE OR REPLACE FUNCTION public.get_combined_biggest_loser(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH losing_trades AS (
        -- Stock losing trades
        SELECT 
            CASE 
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
                ELSE 0
            END AS loss
        FROM 
            public.stocks
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_price IS NOT NULL
            AND (
                (trade_type = 'BUY' AND exit_price < entry_price) OR
                (trade_type = 'SELL' AND exit_price > entry_price)
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
        
        UNION ALL
        
        -- Options losing trades
        SELECT 
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
            END AS loss
        FROM 
            public.options
        WHERE 
            user_id = auth.uid()
            AND status = 'closed'
            AND exit_date IS NOT NULL
            AND (
                (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price < entry_price) OR
                (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price > entry_price) OR
                (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price < entry_price) OR
                (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price > entry_price)
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
        COALESCE(MIN(loss), 0) AS biggest_loser
    FROM 
        losing_trades;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_biggest_loser(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_biggest_loser IS 'Returns the loss amount of the biggest losing trade from both stocks and options.

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
- The loss amount of the biggest losing trade (a negative number, returns 0 if no losing trades found)';

-- Testing on Supabase SQL Editor
-- SELECT get_combined_biggest_loser('30d');  -- Last 30 days
-- SELECT get_combined_biggest_loser('ytd');  -- Year to date
-- SELECT get_combined_biggest_loser();       -- All time (default)

-- Combined function to calculate average gain from winning trades (stocks and options)
CREATE OR REPLACE FUNCTION public.get_combined_average_gain(
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
        -- Stock winning trades
        SELECT 
            CASE 
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
            END AS gain
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
        
        UNION ALL
        
        -- Options winning trades
        SELECT 
            CASE 
                WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN 
                    (exit_price - entry_price) * 100 * number_of_contracts - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN 
                    -((exit_price - entry_price) * 100 * number_of_contracts) - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN 
                    (entry_price - exit_price) * 100 * number_of_contracts - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN 
                    -((entry_price - exit_price) * 100 * number_of_contracts) - COALESCE(commissions, 0)
            END AS gain
        FROM 
            public.options
        WHERE 
            user_id = auth.uid()
            AND status = 'closed'
            AND exit_date IS NOT NULL
            AND (
                (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price > entry_price) OR
                (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price < entry_price) OR
                (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price > entry_price) OR
                (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price < entry_price)
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
        COALESCE(AVG(gain), 0) AS average_gain
    FROM 
        winning_trades;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_average_gain(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_average_gain IS 'Calculates the average gain from winning trades (stocks and options).

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
- Average gain from winning trades (returns 0 if no winning trades found)';

-- Testing on Supabase SQL Editor
-- SELECT get_combined_average_gain('30d');  -- Last 30 days
-- SELECT get_combined_average_gain('ytd');  -- Year to date
-- SELECT get_combined_average_gain();       -- All time (default)


-- Combined function to calculate average loss from losing trades (stocks and options)
CREATE OR REPLACE FUNCTION public.get_combined_average_loss(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH losing_trades AS (
        -- Stock losing trades
        SELECT 
            CASE 
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
            END AS loss
        FROM 
            public.stocks
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_price IS NOT NULL
            AND (
                (trade_type = 'BUY' AND exit_price < entry_price) OR
                (trade_type = 'SELL' AND exit_price > entry_price)
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
        
        UNION ALL
        
        -- Options losing trades
        SELECT 
            CASE 
                WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN 
                    (exit_price - entry_price) * 100 * number_of_contracts - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN 
                    -((exit_price - entry_price) * 100 * number_of_contracts) - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN 
                    (entry_price - exit_price) * 100 * number_of_contracts - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN 
                    -((entry_price - exit_price) * 100 * number_of_contracts) - COALESCE(commissions, 0)
            END AS loss
        FROM 
            public.options
        WHERE 
            user_id = auth.uid()
            AND status = 'closed'
            AND exit_date IS NOT NULL
            AND (
                (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price < entry_price) OR
                (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price > entry_price) OR
                (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price < entry_price) OR
                (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price > entry_price)
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
        COALESCE(AVG(loss), 0) AS average_loss
    FROM 
        losing_trades;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_average_loss(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_average_loss IS 'Calculates the average loss from losing trades (stocks and options).

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
- Average loss from losing trades (returns 0 if no losing trades found)';

-- Testing on Supabase SQL Editor
-- SELECT get_combined_average_loss('30d');  -- Last 30 days
-- SELECT get_combined_average_loss('ytd');  -- Year to date
-- SELECT get_combined_average_loss();       -- All time (default)

-- Combined function to calculate risk-reward ratio (stocks and options)
-- Uses get_combined_average_gain and get_combined_average_loss functions
CREATE OR REPLACE FUNCTION public.get_combined_risk_reward_ratio(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_avg_gain NUMERIC;
    v_avg_loss NUMERIC;
    v_risk_reward_ratio NUMERIC;
BEGIN
    -- Get average gain from winning trades
    SELECT public.get_combined_average_gain(p_time_range, p_custom_start_date, p_custom_end_date) INTO v_avg_gain;

    -- Get average loss from losing trades (absolute value)
    SELECT ABS(public.get_combined_average_loss(p_time_range, p_custom_start_date, p_custom_end_date)) INTO v_avg_loss;

    -- Calculate risk-reward ratio (average gain / average loss)
    -- If there are no losing trades, return the average gain as the ratio
    IF v_avg_loss = 0 THEN
        v_risk_reward_ratio := v_avg_gain;
    ELSE
        v_risk_reward_ratio := v_avg_gain / v_avg_loss;
    END IF;

    -- Return 0 if the result is NULL
    RETURN COALESCE(v_risk_reward_ratio, 0);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_risk_reward_ratio(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_risk_reward_ratio IS 'Calculates the average risk-reward ratio for trades (stocks and options).

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
- Average risk-reward ratio (returns 0 if no trades found or calculation not possible)';

-- Testing on Supabase SQL Editor
-- SELECT get_combined_risk_reward_ratio('30d');  -- Last 30 days
-- SELECT get_combined_risk_reward_ratio('ytd');  -- Year to date
-- SELECT get_combined_risk_reward_ratio();       -- All time (default)


/*
Old function
-- Combined function to calculate risk-reward ratio (stocks and options)
CREATE OR REPLACE FUNCTION public.get_combined_risk_reward_ratio(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH trade_metrics AS (
        -- Stock trades
        SELECT
            CASE
                WHEN trade_type = 'BUY' AND exit_price > entry_price THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' AND exit_price < entry_price THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'BUY' AND exit_price < entry_price THEN (entry_price - exit_price) * number_shares + COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' AND exit_price > entry_price THEN (exit_price - entry_price) * number_shares + COALESCE(commissions, 0)
                ELSE 0
            END / NULLIF(
                CASE
                    WHEN trade_type = 'BUY' THEN (entry_price - stop_loss) * number_shares + COALESCE(commissions, 0)
                    WHEN trade_type = 'SELL' THEN (stop_loss - entry_price) * number_shares + COALESCE(commissions, 0)
                    ELSE 1
                END, 0
            ) AS risk_reward_ratio
        FROM
            public.stocks
        WHERE
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_price IS NOT NULL
            AND stop_loss IS NOT NULL
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

        -- Options trades (simplified risk-reward as options don't have stop_loss)
        SELECT
            CASE
                WHEN (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price > entry_price) OR
                     (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price < entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price > entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price < entry_price)
                THEN
                    CASE
                        WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN
                            (exit_price - entry_price) * 100 * number_of_contracts - COALESCE(commissions, 0)
                        WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN
                            -((exit_price - entry_price) * 100 * number_of_contracts) - COALESCE(commissions, 0)
                        WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN
                            (entry_price - exit_price) * 100 * number_of_contracts - COALESCE(commissions, 0)
                        WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN
                            -((entry_price - exit_price) * 100 * number_of_contracts) - COALESCE(commissions, 0)
                    END
                ELSE
                    CASE
                        WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN
                            (entry_price - exit_price) * 100 * number_of_contracts + COALESCE(commissions, 0)
                        WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN
                            -((entry_price - exit_price) * 100 * number_of_contracts) + COALESCE(commissions, 0)
                        WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN
                            (exit_price - entry_price) * 100 * number_of_contracts + COALESCE(commissions, 0)
                        WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN
                            -((exit_price - entry_price) * 100 * number_of_contracts) + COALESCE(commissions, 0)
                    END
            END / NULLIF(
                entry_price * 100 * number_of_contracts + COALESCE(commissions, 0),
                0
            ) AS risk_reward_ratio
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
    )
    SELECT
        COALESCE(AVG(risk_reward_ratio), 0) AS avg_risk_reward_ratio
    FROM
        trade_metrics
    WHERE
        risk_reward_ratio IS NOT NULL;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_risk_reward_ratio(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_risk_reward_ratio IS 'Calculates the average risk-reward ratio for trades (stocks and options).

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
- Average risk-reward ratio (returns 0 if no trades found or calculation not possible)';

-- Testing on Supabase SQL Editor
-- SELECT get_combined_risk_reward_ratio('30d');  -- Last 30 days
-- SELECT get_combined_risk_reward_ratio('ytd');  -- Year to date
-- SELECT get_combined_risk_reward_ratio();       -- All time (default)

*/

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

-- Combined function to calculate win rate (stocks and options)
CREATE OR REPLACE FUNCTION public.get_combined_win_rate(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH trade_results AS (
        -- Stock trades
        SELECT 
            CASE 
                WHEN (trade_type = 'BUY' AND exit_price > entry_price) OR
                     (trade_type = 'SELL' AND exit_price < entry_price) THEN 1
                ELSE 0
            END AS is_winner
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
            END AS is_winner
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
    )
    SELECT 
        CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(100.0 * SUM(is_winner) / COUNT(*), 2)
        END AS win_rate_percentage
    FROM 
        trade_results;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_win_rate(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_win_rate IS 'Calculates the win rate percentage for trades (stocks and options).

Win Rate = (Number of Winning Trades / Total Number of Trades) * 100

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
- Win rate as a percentage (0-100)';

-- Testing on Supabase SQL Editor
-- SELECT get_combined_win_rate('30d');  -- Last 30 days
-- SELECT get_combined_win_rate('ytd');  -- Year to date
-- SELECT get_combined_win_rate();       -- All time (default)

-- Function to get combined average position size from both stocks and options
CREATE OR REPLACE FUNCTION public.get_combined_average_position_size(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    asset_type TEXT,
    average_position_size NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    -- Stocks average position size
    SELECT 
        'Stocks' as asset_type,
        COALESCE(ROUND(AVG(entry_price * number_shares), 2), 0) as average_position_size
    FROM public.stocks
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
    
    UNION ALL
    
    -- Options average position size (premium * contracts * 100)
    SELECT 
        'Options' as asset_type,
        COALESCE(ROUND(AVG(
            CASE 
                WHEN number_of_contracts > 0 THEN (total_premium * number_of_contracts * 100)
                ELSE 0
            END
        ), 2), 0) as average_position_size
    FROM public.options
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
    
    UNION ALL
    
    -- Combined total
    SELECT 
        'Combined' as asset_type,
        COALESCE(
            (SELECT COALESCE(ROUND(AVG(entry_price * number_shares), 2), 0)
             FROM public.stocks
             WHERE user_id = auth.uid()
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
             ))
            +
            (SELECT COALESCE(ROUND(AVG(
                CASE 
                    WHEN number_of_contracts > 0 THEN (total_premium * number_of_contracts * 100)
                    ELSE 0
                END
            ), 2), 0)
             FROM public.options
             WHERE user_id = auth.uid()
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
             )),
            0
        ) as average_position_size;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_average_position_size(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_average_position_size IS 'Returns the average position size for both stocks and options.

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
- asset_type: Type of asset (''Stocks'', ''Options'', or ''Combined'')
- average_position_size: Average position size in USD

Example usage:
- Last 30 days: SELECT * FROM get_combined_average_position_size(''30d'');
- Custom range: SELECT * FROM get_combined_average_position_size(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT * FROM get_combined_average_position_size();';

-- Testing on Supabase SQL Editor
-- SELECT * FROM get_combined_average_position_size('30d');  -- Last 30 days
-- SELECT * FROM get_combined_average_position_size('ytd');  -- Year to date
-- SELECT * FROM get_combined_average_position_size();       -- All time (default)

-- Function to get combined loss rate from both stocks and options
CREATE OR REPLACE FUNCTION public.get_combined_loss_rate(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    asset_type TEXT,
    loss_rate NUMERIC,
    total_trades BIGINT,
    losing_trades BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    -- Stocks loss rate
    WITH stock_trades AS (
        SELECT 
            COUNT(*) as total_trades,
            SUM(CASE WHEN (exit_price - entry_price) * 
                CASE WHEN trade_type = 'BUY' THEN 1 ELSE -1 END < 0 
                THEN 1 ELSE 0 
            END) as losing_trades
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
            )
    ),
    
    -- Options loss rate
    options_trades AS (
        SELECT 
            COUNT(*) as total_trades,
            SUM(CASE WHEN 
                (CASE 
                    WHEN status = 'closed' AND exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * number_of_contracts * 100 - total_premium
                    ELSE 0 
                END) < 0 
                THEN 1 ELSE 0 
            END) as losing_trades
        FROM public.options
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
    
    -- Combine the results
    SELECT 
        'Stocks' as asset_type,
        CASE 
            WHEN total_trades = 0 THEN 0 
            ELSE ROUND((losing_trades::NUMERIC / total_trades) * 100, 2)
        END as loss_rate,
        total_trades,
        losing_trades
    FROM stock_trades
    
    UNION ALL
    
    SELECT 
        'Options' as asset_type,
        CASE 
            WHEN total_trades = 0 THEN 0 
            ELSE ROUND((losing_trades::NUMERIC / total_trades) * 100, 2)
        END as loss_rate,
        total_trades,
        losing_trades
    FROM options_trades
    
    UNION ALL
    
    -- Combined total
    SELECT 
        'Combined' as asset_type,
        CASE 
            WHEN (SELECT COALESCE(SUM(total_trades), 0) FROM (
                SELECT total_trades FROM stock_trades
                UNION ALL
                SELECT total_trades FROM options_trades
            ) t) = 0 THEN 0
            ELSE ROUND((
                SELECT COALESCE(SUM(losing_trades), 0) FROM (
                    SELECT losing_trades FROM stock_trades
                    UNION ALL
                    SELECT losing_trades FROM options_trades
                ) t
            )::NUMERIC / (
                SELECT COALESCE(SUM(total_trades), 1) FROM (
                    SELECT total_trades FROM stock_trades
                    UNION ALL
                    SELECT total_trades FROM options_trades
                ) t
            ) * 100, 2)
        END as loss_rate,
        (SELECT COALESCE(SUM(total_trades), 0) FROM (
            SELECT total_trades FROM stock_trades
            UNION ALL
            SELECT total_trades FROM options_trades
        ) t) as total_trades,
        (SELECT COALESCE(SUM(losing_trades), 0) FROM (
            SELECT losing_trades FROM stock_trades
            UNION ALL
            SELECT losing_trades FROM options_trades
        ) t) as losing_trades;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_loss_rate(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_loss_rate IS 'Returns the loss rate for both stocks and options.

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
- asset_type: Type of asset (''Stocks'', ''Options'', or ''Combined'')
- loss_rate: Percentage of losing trades (0-100)
- total_trades: Total number of trades
- losing_trades: Number of losing trades

Example usage:
- Last 30 days: SELECT * FROM get_combined_loss_rate(''30d'');
- Custom range: SELECT * FROM get_combined_loss_rate(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT * FROM get_combined_loss_rate();';

-- Testing on Supabase SQL Editor
-- SELECT * FROM get_combined_loss_rate('30d');  -- Last 30 days
-- SELECT * FROM get_combined_loss_rate('ytd');  -- Year to date
-- SELECT * FROM get_combined_loss_rate();       -- All time (default)

-- Function to get combined risk per trade from both stocks and options
CREATE OR REPLACE FUNCTION public.get_combined_risk_per_trade(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    asset_type TEXT,
    average_risk_per_trade NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    -- Stocks average risk per trade
    SELECT 
        'Stocks' as asset_type,
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
    
    UNION ALL
    
    -- Options average risk per trade
    SELECT 
        'Options' as asset_type,
        COALESCE(ROUND(AVG(
            CASE 
                WHEN option_type = 'CALL' AND trade_direction = 'BUY' THEN (total_premium * number_of_contracts * 100)
                WHEN option_type = 'PUT' AND trade_direction = 'BUY' THEN (total_premium * number_of_contracts * 100)
                WHEN option_type = 'CALL' AND trade_direction = 'SELL' THEN 
                    CASE 
                        WHEN strike_price IS NOT NULL THEN ((strike_price - entry_price + total_premium) * number_of_contracts * 100)
                        ELSE (total_premium * number_of_contracts * 100)
                    END
                WHEN option_type = 'PUT' AND trade_direction = 'SELL' THEN 
                    CASE 
                        WHEN strike_price IS NOT NULL THEN ((entry_price - strike_price + total_premium) * number_of_contracts * 100)
                        ELSE (total_premium * number_of_contracts * 100)
                    END
                ELSE 0
            END
        ), 2), 0) as average_risk_per_trade
    FROM public.options
    WHERE 
        user_id = auth.uid()
        AND status = 'closed'
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
    
    UNION ALL
    
    -- Combined average risk per trade
    SELECT 
        'Combined' as asset_type,
        COALESCE(
            (SELECT COALESCE(ROUND(AVG(
                CASE 
                    WHEN trade_type = 'BUY' THEN (entry_price - stop_loss) * number_shares
                    WHEN trade_type = 'SELL' THEN (stop_loss - entry_price) * number_shares
                END
            ), 2), 0)
             FROM public.stocks
             WHERE user_id = auth.uid()
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
             ))
            +
            (SELECT COALESCE(ROUND(AVG(
                CASE 
                    WHEN option_type = 'CALL' AND trade_direction = 'BUY' THEN (total_premium * number_of_contracts * 100)
                    WHEN option_type = 'PUT' AND trade_direction = 'BUY' THEN (total_premium * number_of_contracts * 100)
                    WHEN option_type = 'CALL' AND trade_direction = 'SELL' THEN 
                        CASE 
                            WHEN strike_price IS NOT NULL THEN ((strike_price - entry_price + total_premium) * number_of_contracts * 100)
                            ELSE (total_premium * number_of_contracts * 100)
                        END
                    WHEN option_type = 'PUT' AND trade_direction = 'SELL' THEN 
                        CASE 
                            WHEN strike_price IS NOT NULL THEN ((entry_price - strike_price + total_premium) * number_of_contracts * 100)
                            ELSE (total_premium * number_of_contracts * 100)
                        END
                    ELSE 0
                END
            ), 2), 0)
             FROM public.options
             WHERE user_id = auth.uid()
             AND status = 'closed'
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
             )),
            0
        ) as average_risk_per_trade;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_risk_per_trade(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_risk_per_trade IS 'Returns the average risk per trade for both stocks and options.

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
- asset_type: Type of asset (''Stocks'', ''Options'', or ''Combined'')
- average_risk_per_trade: Average risk per trade in USD

Example usage:
- Last 30 days: SELECT * FROM get_combined_risk_per_trade(''30d'');
- Custom range: SELECT * FROM get_combined_risk_per_trade(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT * FROM get_combined_risk_per_trade();';

-- Testing on Supabase SQL Editor
-- SELECT * FROM get_combined_risk_per_trade('30d');  -- Last 30 days
-- SELECT * FROM get_combined_risk_per_trade('ytd');  -- Year to date
-- SELECT * FROM get_combined_risk_per_trade();       -- All time (default)

-- Function to calculate monthly trading metrics from both stocks and options
CREATE OR REPLACE FUNCTION public.get_monthly_trading_metrics()
RETURNS TABLE (
    month_start_date DATE,
    month_end_date DATE,
    total_trades BIGINT,
    profitable_trades BIGINT,
    unprofitable_trades BIGINT,
    win_rate NUMERIC(10,2),
    net_pnl NUMERIC(20,2),
    profit_factor NUMERIC(10,2),
    max_drawdown NUMERIC(20,2),
    expectancy_per_trade NUMERIC(20,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month_start DATE;
    v_month_end DATE;
BEGIN
    -- Get the start of the current month and end of the current month
    v_month_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    v_month_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
    
    RETURN QUERY
    WITH 
    -- Combine stocks and options data
    combined_trades AS (
        -- Stock trades
        SELECT 
            'STOCK' as trade_type,
            id,
            entry_date,
            exit_date,
            (exit_price - entry_price) * number_shares - commissions as pnl,
            (exit_price - entry_price) * number_shares - commissions as profit_loss,
            CASE WHEN (exit_price - entry_price) * number_shares - commissions > 0 THEN 1 ELSE 0 END as is_profitable,
            commissions
        FROM public.stocks
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_date >= v_month_start 
            AND exit_date <= v_month_end
            AND status = 'closed'
        
        UNION ALL
        
        -- Options trades
        SELECT 
            'OPTION' as trade_type,
            id,
            entry_date,
            exit_date,
            (exit_price - entry_price) * number_of_contracts * 100 - commissions as pnl,
            (exit_price - entry_price) * number_of_contracts * 100 - commissions as profit_loss,
            CASE WHEN (exit_price - entry_price) * number_of_contracts * 100 - commissions > 0 THEN 1 ELSE 0 END as is_profitable,
            commissions
        FROM public.options
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_date >= v_month_start 
            AND exit_date <= v_month_end
            AND status = 'closed'
    ),
    
    -- Calculate metrics
    trade_metrics AS (
        SELECT
            v_month_start as month_start_date,
            v_month_end as month_end_date,
            COUNT(*) as total_trades,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as profitable_trades,
            SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as unprofitable_trades,
            CASE 
                WHEN COUNT(*) = 0 THEN 0 
                ELSE ROUND(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2) 
            END as win_rate,
            COALESCE(SUM(pnl), 0) as net_pnl,
            CASE 
                WHEN SUM(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END) = 0 THEN NULL
                ELSE ROUND(SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) / 
                      NULLIF(SUM(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END), 0), 2)
            END as profit_factor,
            (
                SELECT MIN(cumulative_pnl) as max_drawdown
                FROM (
                    SELECT 
                        SUM(pnl) OVER (ORDER BY exit_date) - pnl as running_pnl,
                        SUM(pnl) OVER (ORDER BY exit_date) as cumulative_pnl
                    FROM combined_trades
                ) t
                WHERE running_pnl > 0
            ) as max_drawdown,
            CASE 
                WHEN COUNT(*) = 0 THEN 0 
                ELSE ROUND(SUM(pnl) / NULLIF(COUNT(*), 0), 2) 
            END as expectancy_per_trade
        FROM combined_trades
    )
    
    SELECT 
        tm.month_start_date,
        tm.month_end_date,
        tm.total_trades,
        tm.profitable_trades,
        tm.unprofitable_trades,
        tm.win_rate,
        tm.net_pnl,
        COALESCE(tm.profit_factor, 0) as profit_factor,
        COALESCE(ABS(tm.max_drawdown), 0) as max_drawdown,
        tm.expectancy_per_trade
    FROM trade_metrics tm;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_monthly_trading_metrics() TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_monthly_trading_metrics IS 'Returns monthly trading metrics from both stocks and options for the authenticated user for the current month.

Example usage:
SELECT * FROM get_monthly_trading_metrics();';

-- Function to calculate weekly trading metrics from both stocks and options
CREATE OR REPLACE FUNCTION public.get_weekly_trading_metrics()
RETURNS TABLE (
    week_start_date DATE,
    week_end_date DATE,
    total_trades BIGINT,
    profitable_trades BIGINT,
    unprofitable_trades BIGINT,
    win_rate NUMERIC(10,2),
    net_pnl NUMERIC(20,2),
    profit_factor NUMERIC(10,2),
    max_drawdown NUMERIC(20,2),
    expectancy_per_trade NUMERIC(20,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_week_start DATE;
    v_week_end DATE;
BEGIN
    -- Get the start of the current week (Sunday) and end of the week (Saturday)
    v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;
    v_week_end := (v_week_start + INTERVAL '6 days')::DATE;
    
    RETURN QUERY
    WITH 
    -- Combine stocks and options data
    combined_trades AS (
        -- Stock trades
        SELECT 
            'STOCK' as trade_type,
            id,
            entry_date,
            exit_date,
            (exit_price - entry_price) * number_shares - commissions as pnl,
            (exit_price - entry_price) * number_shares - commissions as profit_loss,
            CASE WHEN (exit_price - entry_price) * number_shares - commissions > 0 THEN 1 ELSE 0 END as is_profitable,
            commissions
        FROM public.stocks
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_date >= v_week_start 
            AND exit_date <= v_week_end
            AND status = 'closed'
        
        UNION ALL
        
        -- Options trades
        SELECT 
            'OPTION' as trade_type,
            id,
            entry_date,
            exit_date,
            (exit_price - entry_price) * number_of_contracts * 100 - commissions as pnl,
            (exit_price - entry_price) * number_of_contracts * 100 - commissions as profit_loss,
            CASE WHEN (exit_price - entry_price) * number_of_contracts * 100 - commissions > 0 THEN 1 ELSE 0 END as is_profitable,
            commissions
        FROM public.options
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_date >= v_week_start 
            AND exit_date <= v_week_end
            AND status = 'closed'
    ),
    
    -- Calculate metrics
    trade_metrics AS (
        SELECT
            v_week_start as week_start_date,
            v_week_end as week_end_date,
            COUNT(*) as total_trades,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as profitable_trades,
            SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as unprofitable_trades,
            CASE 
                WHEN COUNT(*) = 0 THEN 0 
                ELSE ROUND(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) 
            END as win_rate,
            COALESCE(SUM(pnl), 0) as net_pnl,
            CASE 
                WHEN SUM(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END) = 0 THEN NULL
                ELSE ROUND(SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) / 
                      NULLIF(SUM(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END), 0), 2)
            END as profit_factor,
            (
                SELECT MIN(cumulative_pnl) as max_drawdown
                FROM (
                    SELECT 
                        SUM(pnl) OVER (ORDER BY exit_date) - pnl as running_pnl,
                        SUM(pnl) OVER (ORDER BY exit_date) as cumulative_pnl
                    FROM combined_trades
                ) t
                WHERE running_pnl > 0
            ) as max_drawdown,
            CASE 
                WHEN COUNT(*) = 0 THEN 0 
                ELSE ROUND(SUM(pnl) / COUNT(*), 2) 
            END as expectancy_per_trade
        FROM combined_trades
    )
    
    SELECT 
        tm.week_start_date,
        tm.week_end_date,
        tm.total_trades,
        tm.profitable_trades,
        tm.unprofitable_trades,
        tm.win_rate,
        tm.net_pnl,
        COALESCE(tm.profit_factor, 0) as profit_factor,
        COALESCE(ABS(tm.max_drawdown), 0) as max_drawdown,
        tm.expectancy_per_trade
    FROM trade_metrics tm;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_weekly_trading_metrics() TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_weekly_trading_metrics IS 'Returns weekly trading metrics from both stocks and options for the authenticated user for the current week (Sunday to Saturday)';

-- Example usage:
-- SELECT * FROM get_weekly_trading_metrics();

-- Function to get combined trade metrics from both stocks and options
CREATE OR REPLACE FUNCTION public.get_combined_trade_metrics(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    trade_date DATE,
    total_trades BIGINT,
    activity_level TEXT,
    net_pnl NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH combined_trades AS (
        -- Stock trades
        SELECT 
            DATE(s.entry_date) AS trade_date,
            s.id,
            (s.exit_price - s.entry_price) * s.number_shares - s.commissions AS pnl
        FROM 
            public.stocks s
        WHERE 
            s.user_id = auth.uid()
            AND s.exit_price IS NOT NULL
            AND (
                (p_time_range = '7d' AND s.entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
                OR (p_time_range = '30d' AND s.entry_date >= (CURRENT_DATE - INTERVAL '30 days'))
                OR (p_time_range = '90d' AND s.entry_date >= (CURRENT_DATE - INTERVAL '90 days'))
                OR (p_time_range = '1y' AND s.entry_date >= (CURRENT_DATE - INTERVAL '1 year'))
                OR (p_time_range = 'ytd' AND s.entry_date >= DATE_TRUNC('year', CURRENT_DATE))
                OR (p_time_range = 'custom' AND 
                    (p_custom_start_date IS NULL OR s.entry_date >= p_custom_start_date) AND
                    (p_custom_end_date IS NULL OR s.entry_date <= p_custom_end_date))
                OR (p_time_range = 'all_time')
            )
            
        UNION ALL
        
        -- Option trades
        SELECT 
            DATE(o.entry_date) AS trade_date,
            o.id,
            (o.exit_price - o.entry_price) * o.number_of_contracts * 100 - o.commissions AS pnl
        FROM 
            public.options o
        WHERE 
            o.user_id = auth.uid()
            AND o.exit_price IS NOT NULL
            AND (
                (p_time_range = '7d' AND o.entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
                OR (p_time_range = '30d' AND o.entry_date >= (CURRENT_DATE - INTERVAL '30 days'))
                OR (p_time_range = '90d' AND o.entry_date >= (CURRENT_DATE - INTERVAL '90 days'))
                OR (p_time_range = '1y' AND o.entry_date >= (CURRENT_DATE - INTERVAL '1 year'))
                OR (p_time_range = 'ytd' AND o.entry_date >= DATE_TRUNC('year', CURRENT_DATE))
                OR (p_time_range = 'custom' AND 
                    (p_custom_start_date IS NULL OR o.entry_date >= p_custom_start_date) AND
                    (p_custom_end_date IS NULL OR o.entry_date <= p_custom_end_date))
                OR (p_time_range = 'all_time')
            )
    )
    SELECT 
        ct.trade_date,
        COUNT(ct.id)::BIGINT AS total_trades,
        CASE 
            WHEN COUNT(ct.id) >= 10 THEN 'High'
            WHEN COUNT(ct.id) >= 5 THEN 'Medium'
            ELSE 'Low'
        END AS activity_level,
        COALESCE(SUM(ct.pnl), 0) AS net_pnl
    FROM 
        combined_trades ct
    GROUP BY 
        ct.trade_date
    ORDER BY 
        ct.trade_date;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_trade_metrics(TEXT, DATE, DATE) TO authenticated;

-- Function to get win rate by symbol from both stocks and options
CREATE OR REPLACE FUNCTION public.get_win_rate_by_symbol(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    symbol VARCHAR,
    total_trades BIGINT,
    winning_trades BIGINT,
    win_rate NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH all_trades AS (
        -- Stock trades
        SELECT
            symbol,
            CASE
                WHEN (trade_type = 'BUY' AND exit_price > entry_price) OR
                     (trade_type = 'SELL' AND exit_price < entry_price) THEN 1
                ELSE 0
            END AS is_winner
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
            symbol,
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
        at.symbol,
        COUNT(*) AS total_trades,
        SUM(at.is_winner) AS winning_trades,
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(100.0 * SUM(at.is_winner) / COUNT(*), 2)
        END AS win_rate
    FROM
        all_trades at
    GROUP BY
        at.symbol
    ORDER BY
        total_trades DESC,
        win_rate DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_win_rate_by_symbol(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_win_rate_by_symbol IS 'Returns the win rate for each symbol, combining data from both stocks and options.

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
- symbol: The ticker symbol
- total_trades: Total number of closed trades for the symbol
- winning_trades: Number of profitable trades for the symbol
- win_rate: The calculated win rate percentage for the symbol

Example usage:
-- Get win rate by symbol for the last 90 days
SELECT * FROM get_win_rate_by_symbol(''90d'');

-- Get win rate by symbol for all time
SELECT * FROM get_win_rate_by_symbol();
';

-- Function to get win rate by strategy_type from the options table
CREATE OR REPLACE FUNCTION public.get_win_rate_by_strategy(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    strategy_type TEXT,
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
            strategy_type,
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
        ot.strategy_type,
        COUNT(*) AS total_trades,
        SUM(ot.is_winner) AS winning_trades,
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(100.0 * SUM(ot.is_winner) / COUNT(*), 2)
        END AS win_rate
    FROM
        option_trades ot
    GROUP BY
        ot.strategy_type
    ORDER BY
        total_trades DESC,
        win_rate DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_win_rate_by_strategy(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_win_rate_by_strategy IS 'Returns the win rate for each option strategy type.

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
- winning_trades: Number of profitable trades for the strategy
- win_rate: The calculated win rate percentage for the strategy

Example usage:
-- Get win rate by strategy for the last 90 days
SELECT * FROM get_win_rate_by_strategy(''90d'');

-- Get win rate by strategy for all time
SELECT * FROM get_win_rate_by_strategy();
';

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


-- Function to get loss rate by symbol from both stocks and options
CREATE OR REPLACE FUNCTION public.get_loss_rate_by_symbol(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    symbol VARCHAR,
    total_trades BIGINT,
    losing_trades BIGINT,
    loss_rate NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH all_trades AS (
        -- Stock trades
        SELECT
            symbol,
            CASE
                WHEN (trade_type = 'BUY' AND exit_price < entry_price) OR
                     (trade_type = 'SELL' AND exit_price > entry_price) THEN 1
                ELSE 0
            END AS is_loser
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
            symbol,
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
        at.symbol,
        COUNT(*) AS total_trades,
        SUM(at.is_loser) AS losing_trades,
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(100.0 * SUM(at.is_loser) / COUNT(*), 2)
        END AS loss_rate
    FROM
        all_trades at
    GROUP BY
        at.symbol
    ORDER BY
        total_trades DESC,
        loss_rate DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_loss_rate_by_symbol(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_loss_rate_by_symbol IS 'Returns the loss rate for each symbol, combining data from both stocks and options.

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
- symbol: The ticker symbol
- total_trades: Total number of closed trades for the symbol
- losing_trades: Number of unprofitable trades for the symbol
- loss_rate: The calculated loss rate percentage for the symbol

Example usage:
-- Get loss rate by symbol for the last 90 days
SELECT * FROM get_loss_rate_by_symbol(''90d'');

-- Get loss rate by symbol for all time
SELECT * FROM get_loss_rate_by_symbol();
';

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

-- Function to get loss rate by trade_direction from the options table
CREATE OR REPLACE FUNCTION public.get_loss_rate_by_trade_direction(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    trade_direction VARCHAR,
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
            trade_direction,
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
        ot.trade_direction,
        COUNT(*) AS total_trades,
        SUM(ot.is_loser) AS losing_trades,
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(100.0 * SUM(ot.is_loser) / COUNT(*), 2)
        END AS loss_rate
    FROM
        option_trades ot
    GROUP BY
        ot.trade_direction
    ORDER BY
        total_trades DESC,
        loss_rate DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_loss_rate_by_trade_direction(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_loss_rate_by_trade_direction IS 'Returns the loss rate for each option trade direction (Bullish, Bearish, Neutral).

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
- losing_trades: Number of unprofitable trades for the direction
- loss_rate: The calculated loss rate percentage for the direction

Example usage:
-- Get loss rate by trade direction for the last 90 days
SELECT * FROM get_loss_rate_by_trade_direction(''90d'');

-- Get loss rate by trade direction for all time
SELECT * FROM get_loss_rate_by_trade_direction();
';

-- Function to get the longest winning and losing streaks from both stocks and options
CREATE OR REPLACE FUNCTION public.get_streaks(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    streak_type TEXT,
    streak_length BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH all_trades_with_outcome AS (
        -- Combine stocks and options and determine the outcome (win, loss, or break-even)
        SELECT
            exit_date,
            CASE
                WHEN (trade_type = 'BUY' AND exit_price > entry_price) OR (trade_type = 'SELL' AND exit_price < entry_price) THEN 'WIN'
                WHEN (trade_type = 'BUY' AND exit_price < entry_price) OR (trade_type = 'SELL' AND exit_price > entry_price) THEN 'LOSS'
                ELSE 'BREAK_EVEN'
            END AS outcome
        FROM public.stocks
        WHERE user_id = auth.uid() AND exit_date IS NOT NULL AND exit_price IS NOT NULL
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

        SELECT
            exit_date,
            CASE
                WHEN (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price > entry_price) OR
                     (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price < entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price > entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price < entry_price) THEN 'WIN'
                WHEN (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price < entry_price) OR
                     (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price > entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price < entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price > entry_price) THEN 'LOSS'
                ELSE 'BREAK_EVEN'
            END AS outcome
        FROM public.options
        WHERE user_id = auth.uid() AND status = 'closed' AND exit_price IS NOT NULL
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
    streaks AS (
        -- Identify streaks of consecutive wins or losses
        SELECT
            outcome,
            COUNT(*) AS length
        FROM (
            SELECT
                outcome,
                SUM(CASE WHEN outcome = prev_outcome THEN 0 ELSE 1 END) OVER (ORDER BY exit_date) as streak_group
            FROM (
                SELECT
                    exit_date,
                    outcome,
                    LAG(outcome, 1, ''::text) OVER (ORDER BY exit_date) AS prev_outcome
                FROM all_trades_with_outcome
                WHERE outcome != 'BREAK_EVEN'
            ) AS sub
        ) AS sub2
        GROUP BY streak_group, outcome
    )
    -- Final result: max winning and losing streaks
    SELECT 'Winning' as streak_type, COALESCE(MAX(length), 0)::BIGINT as streak_length FROM streaks WHERE outcome = 'WIN'
    UNION ALL
    SELECT 'Losing' as streak_type, COALESCE(MAX(length), 0)::BIGINT as streak_length FROM streaks WHERE outcome = 'LOSS';
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_streaks(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_streaks IS 'Calculates the longest consecutive winning and losing trade streaks.

Parameters:
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- streak_type: ''Winning'' or ''Losing''.
- streak_length: The length of the longest streak.

Example usage:
-- Get streaks for the last 90 days
SELECT * FROM get_streaks(''90d'');

-- Get streaks for all time
SELECT * FROM get_streaks();
';

-- Function to get the average trade duration from both stocks and options
CREATE OR REPLACE FUNCTION public.get_average_trade_duration(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH all_durations AS (
        -- Stock trade durations
        SELECT
            EXTRACT(EPOCH FROM (exit_date - entry_date)) AS duration_seconds
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

        -- Option trade durations
        SELECT
            EXTRACT(EPOCH FROM (exit_date - entry_date)) AS duration_seconds
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
    )
    SELECT
        COALESCE(ROUND((AVG(duration_seconds) / 86400.0)::numeric, 2), 0)
    FROM
        all_durations;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_average_trade_duration(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_average_trade_duration IS 'Calculates the average duration of all trades (stocks and options) in days.

Parameters:
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- The average trade duration in days.

Example usage:
-- Get average duration for the last 90 days
SELECT * FROM get_average_trade_duration(''90d'');

-- Get average duration for all time
SELECT * FROM get_average_trade_duration();
';

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

-- Function to get the most and least profitable symbols
CREATE OR REPLACE FUNCTION public.get_symbol_profitability_ranking(
    p_limit INTEGER DEFAULT 5,
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    symbol VARCHAR,
    total_pnl NUMERIC,
    ranking_type TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH symbol_pnl AS (
        -- Calculate PnL for each symbol from both stocks and options
        SELECT
            s.symbol,
            CASE
                WHEN s.trade_type = 'BUY' THEN (s.exit_price - s.entry_price) * s.number_shares - s.commissions
                ELSE (s.entry_price - s.exit_price) * s.number_shares - s.commissions
            END AS pnl
        FROM public.stocks s
        WHERE s.user_id = auth.uid() AND s.exit_date IS NOT NULL AND s.exit_price IS NOT NULL
          AND (
            (p_time_range = '7d' AND s.exit_date >= (CURRENT_DATE - INTERVAL '7 days')) OR
            (p_time_range = '30d' AND s.exit_date >= (CURRENT_DATE - INTERVAL '30 days')) OR
            (p_time_range = '90d' AND s.exit_date >= (CURRENT_DATE - INTERVAL '90 days')) OR
            (p_time_range = '1y' AND s.exit_date >= (CURRENT_DATE - INTERVAL '1 year')) OR
            (p_time_range = 'ytd' AND s.exit_date >= DATE_TRUNC('year', CURRENT_DATE)) OR
            (p_time_range = 'custom' AND s.exit_date >= p_custom_start_date AND s.exit_date <= p_custom_end_date) OR
            (p_time_range = 'all_time')
          )

        UNION ALL

        SELECT
            o.symbol,
            CASE
                WHEN o.trade_direction = 'Bullish' AND o.option_type = 'Call' THEN (o.exit_price - o.entry_price) * 100 * o.number_of_contracts - o.commissions
                WHEN o.trade_direction = 'Bullish' AND o.option_type = 'Put' THEN -((o.exit_price - o.entry_price) * 100 * o.number_of_contracts) - o.commissions
                WHEN o.trade_direction = 'Bearish' AND o.option_type = 'Put' THEN (o.entry_price - o.exit_price) * 100 * o.number_of_contracts - o.commissions
                WHEN o.trade_direction = 'Bearish' AND o.option_type = 'Call' THEN -((o.entry_price - o.exit_price) * 100 * o.number_of_contracts) - o.commissions
                ELSE 0
            END AS pnl
        FROM public.options o
        WHERE o.user_id = auth.uid() AND o.status = 'closed' AND o.exit_price IS NOT NULL
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
    aggregated_pnl AS (
        -- Sum up the PnL for each symbol
        SELECT
            symbol,
            SUM(pnl) as total_pnl
        FROM symbol_pnl
        GROUP BY symbol
    ),
    most_profitable AS (
        -- Rank most profitable
        SELECT
            symbol,
            total_pnl,
            'Most Profitable'::TEXT as ranking_type
        FROM aggregated_pnl
        WHERE total_pnl > 0
        ORDER BY total_pnl DESC
        LIMIT p_limit
    ),
    least_profitable AS (
        -- Rank least profitable
        SELECT
            symbol,
            total_pnl,
            'Least Profitable'::TEXT as ranking_type
        FROM aggregated_pnl
        WHERE total_pnl < 0
        ORDER BY total_pnl ASC
        LIMIT p_limit
    )
    -- Combine the two lists
    SELECT * FROM most_profitable
    UNION ALL
    SELECT * FROM least_profitable;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_symbol_profitability_ranking(INTEGER, TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_symbol_profitability_ranking IS 'Returns the most and least profitable symbols based on net PnL.

Parameters:
- p_limit: The number of symbols to return for each category (most/least profitable).
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- symbol: The ticker symbol.
- total_pnl: The total net profit or loss for the symbol.
- ranking_type: ''Most Profitable'' or ''Least Profitable''.

Example usage:
-- Get the top 3 most and least profitable symbols for all time
SELECT * FROM get_symbol_profitability_ranking(3);

-- Get the top 5 for the last 90 days
SELECT * FROM get_symbol_profitability_ranking(5, ''90d'');
';

-- Function to get trading frequency by symbol
CREATE OR REPLACE FUNCTION public.get_trading_frequency_by_symbol(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    symbol VARCHAR,
    trade_count BIGINT,
    frequency_category TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH all_trades AS (
        -- Stock trades
        SELECT
            symbol
        FROM
            public.stocks
        WHERE
            user_id = auth.uid()
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

        UNION ALL

        -- Option trades
        SELECT
            symbol
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
    ),
    symbol_counts AS (
        SELECT
            at.symbol,
            COUNT(*) AS trade_count
        FROM
            all_trades at
        GROUP BY
            at.symbol
    )
    SELECT
        sc.symbol,
        sc.trade_count,
        CASE
            WHEN sc.trade_count >= 20 THEN 'Very High'
            WHEN sc.trade_count >= 10 THEN 'High'
            WHEN sc.trade_count >= 5 THEN 'Medium'
            ELSE 'Low'
        END AS frequency_category
    FROM
        symbol_counts sc
    ORDER BY
        sc.trade_count DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_trading_frequency_by_symbol(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_trading_frequency_by_symbol IS 'Returns the trading frequency for each symbol, categorized as High, Medium, or Low.

Parameters:
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- symbol: The ticker symbol.
- trade_count: The total number of trades for that symbol.
- frequency_category: A text category for the trade frequency.

Example usage:
-- Get trade frequency for the last 90 days
SELECT * FROM get_trading_frequency_by_symbol(''90d'');

-- Get trade frequency for all time
SELECT * FROM get_trading_frequency_by_symbol();
';

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

-- Function to get the total commissions paid from both stocks and options
CREATE OR REPLACE FUNCTION public.get_total_commissions(
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
        COALESCE(SUM(total_commissions), 0)
    FROM (
        -- Stock commissions
        SELECT
            commissions AS total_commissions
        FROM
            public.stocks
        WHERE
            user_id = auth.uid()
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

        UNION ALL

        -- Option commissions
        SELECT
            commissions AS total_commissions
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
    ) AS all_commissions;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_total_commissions(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_total_commissions IS 'Calculates the total commissions paid for all trades (stocks and options).

Parameters:
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- The total sum of commissions paid.

Example usage:
-- Get total commissions for the last 90 days
SELECT * FROM get_total_commissions(''90d'');

-- Get total commissions for all time
SELECT * FROM get_total_commissions();
';

-- Function to get trading frequency patterns by day of the week and hour of the day
CREATE OR REPLACE FUNCTION public.get_trade_frequency_patterns(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    pattern_type TEXT,
    pattern_value TEXT,
    trade_count BIGINT,
    win_rate NUMERIC,
    net_pnl NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH all_trades AS (
        -- Combine stocks and options with their PnL and entry timestamp
        SELECT
            entry_date,
            CASE
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                ELSE (entry_price - exit_price) * number_shares - commissions
            END AS pnl
        FROM public.stocks
        WHERE user_id = auth.uid() AND exit_date IS NOT NULL AND exit_price IS NOT NULL
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

        SELECT
            entry_date,
            CASE
                WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN (exit_price - entry_price) * 100 * number_of_contracts - commissions
                WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN -((exit_price - entry_price) * 100 * number_of_contracts) - commissions
                WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN (entry_price - exit_price) * 100 * number_of_contracts - commissions
                WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN -((entry_price - exit_price) * 100 * number_of_contracts) - commissions
                ELSE 0
            END AS pnl
        FROM public.options
        WHERE user_id = auth.uid() AND status = 'closed' AND exit_price IS NOT NULL
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
    by_day AS (
        SELECT
            'Day of Week' AS pattern_type,
            TRIM(TO_CHAR(entry_date, 'Day')) AS pattern_value,
            COUNT(*) AS trade_count,
            COALESCE(ROUND(100.0 * SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2), 0) AS win_rate,
            COALESCE(SUM(pnl), 0) AS net_pnl
        FROM all_trades
        GROUP BY pattern_value
    ),
    by_hour AS (
        SELECT
            'Hour of Day' AS pattern_type,
            TO_CHAR(entry_date, 'HH24:00') AS pattern_value,
            COUNT(*) AS trade_count,
            COALESCE(ROUND(100.0 * SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2), 0) AS win_rate,
            COALESCE(SUM(pnl), 0) AS net_pnl
        FROM all_trades
        GROUP BY pattern_value
    )
    SELECT * FROM by_day
    UNION ALL
    SELECT * FROM by_hour
    ORDER BY pattern_type, pattern_value;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_trade_frequency_patterns(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_trade_frequency_patterns IS 'Returns trading frequency and performance patterns by day of the week and hour of the day.

Parameters:
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- pattern_type: The type of pattern (e.g., ''Day of Week'', ''Hour of Day'').
- pattern_value: The specific value for the pattern (e.g., ''Monday'', ''14:00'').
- trade_count: The total number of trades for that pattern.
- win_rate: The win rate for that pattern.
- net_pnl: The net PnL for that pattern.

Example usage:
-- Get frequency patterns for the last 90 days
SELECT * FROM get_trade_frequency_patterns(''90d'');

-- Get frequency patterns for all time
SELECT * FROM get_trade_frequency_patterns();
';

-- Function to get the average commission per trade from both stocks and options
CREATE OR REPLACE FUNCTION public.get_average_commission_per_trade(
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
        COALESCE(ROUND(AVG(commissions)::numeric, 2), 0)
    FROM (
        -- Stock commissions
        SELECT
            commissions
        FROM
            public.stocks
        WHERE
            user_id = auth.uid()
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

        UNION ALL

        -- Option commissions
        SELECT
            commissions
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
    ) AS all_commissions;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_average_commission_per_trade(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_average_commission_per_trade IS 'Calculates the average commission paid per trade across all stocks and options.

Parameters:
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- The average commission paid per trade.

Example usage:
-- Get average commission for the last 90 days
SELECT * FROM get_average_commission_per_trade(''90d'');

-- Get average commission for all time
SELECT * FROM get_average_commission_per_trade();
';


-- Function to calculate trade size consistency using the coefficient of variation
CREATE OR REPLACE FUNCTION public.get_trade_size_consistency(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    consistency_score NUMERIC,
    consistency_label TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH all_trade_sizes AS (
        -- Stock trade sizes (position value at entry)
        SELECT
            entry_price * number_shares AS trade_size
        FROM
            public.stocks
        WHERE
            user_id = auth.uid()
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

        UNION ALL

        -- Option trade sizes (total premium paid/received)
        SELECT
            total_premium AS trade_size
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
    ),
    stats AS (
        SELECT
            STDDEV(trade_size) as std_dev_size,
            AVG(trade_size) as avg_size
        FROM all_trade_sizes
    )
    SELECT
        -- Calculate Coefficient of Variation (CV)
        COALESCE(ROUND((stats.std_dev_size / NULLIF(stats.avg_size, 0))::numeric, 2), 0) AS consistency_score,
        -- Assign a label based on the CV score
        CASE
            WHEN (stats.std_dev_size / NULLIF(stats.avg_size, 0)) <= 0.3 THEN 'Consistent'
            WHEN (stats.std_dev_size / NULLIF(stats.avg_size, 0)) <= 0.7 THEN 'Moderately Consistent'
            WHEN (stats.std_dev_size / NULLIF(stats.avg_size, 0)) > 0.7 THEN 'Inconsistent'
            ELSE 'N/A'
        END AS consistency_label
    FROM stats;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_trade_size_consistency(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_trade_size_consistency IS 'Calculates trade size consistency using the coefficient of variation (StdDev / Avg).

Parameters:
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- consistency_score: The coefficient of variation (lower is more consistent).
- consistency_label: A text label describing the consistency.

Example usage:
-- Get trade size consistency for the last 90 days
SELECT * FROM get_trade_size_consistency(''90d'');

-- Get trade size consistency for all time
SELECT * FROM get_trade_size_consistency();
';

-- Comprehensive AI Daily Summary Function
-- Combines all AI report functions into a single JSON output for AI model consumption
CREATE OR REPLACE FUNCTION public.get_daily_ai_summary(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
    streak_data RECORD;
    winning_streak BIGINT := 0;
    losing_streak BIGINT := 0;
BEGIN
    -- Get streak data
    FOR streak_data IN 
        SELECT * FROM get_streaks(p_time_range, p_custom_start_date, p_custom_end_date)
    LOOP
        IF streak_data.streak_type = 'Winning' THEN
            winning_streak := streak_data.streak_length;
        ELSIF streak_data.streak_type = 'Losing' THEN
            losing_streak := streak_data.streak_length;
        END IF;
    END LOOP;

    -- Build comprehensive JSON summary
    SELECT json_build_object(
        'summary_metadata', json_build_object(
            'generated_at', NOW(),
            'time_range', p_time_range,
            'custom_start_date', p_custom_start_date,
            'custom_end_date', p_custom_end_date,
            'user_id', auth.uid()
        ),
        'core_performance_metrics', json_build_object(
            'profit_factor', get_combined_profit_factor(p_time_range, p_custom_start_date, p_custom_end_date),
            'win_rate_percentage', get_combined_win_rate(p_time_range, p_custom_start_date, p_custom_end_date),
            'loss_rate_percentage', (
                SELECT loss_rate FROM get_combined_loss_rate(p_time_range, p_custom_start_date, p_custom_end_date)
                WHERE asset_type = 'Combined'
            ),
            'trade_expectancy', get_combined_trade_expectancy(p_time_range, p_custom_start_date, p_custom_end_date),
            'risk_reward_ratio', get_combined_risk_reward_ratio(p_time_range, p_custom_start_date, p_custom_end_date)
        ),
        'profit_loss_analysis', json_build_object(
            'biggest_winner', get_combined_biggest_winner(p_time_range, p_custom_start_date, p_custom_end_date),
            'biggest_loser', get_combined_biggest_loser(p_time_range, p_custom_start_date, p_custom_end_date),
            'average_gain', get_combined_average_gain(p_time_range, p_custom_start_date, p_custom_end_date),
            'average_loss', get_combined_average_loss(p_time_range, p_custom_start_date, p_custom_end_date)
        ),
        'trading_behavior_metrics', json_build_object(
            'average_hold_time_winners_hours', get_combined_avg_hold_time_winners(p_time_range, p_custom_start_date, p_custom_end_date),
            'average_hold_time_losers_hours', get_combined_avg_hold_time_losers(p_time_range, p_custom_start_date, p_custom_end_date),
            'average_trade_duration_hours', get_average_trade_duration(p_time_range, p_custom_start_date, p_custom_end_date),
            'average_position_size', (
                SELECT json_build_object(
                    'stocks', (SELECT average_position_size FROM get_combined_average_position_size(p_time_range, p_custom_start_date, p_custom_end_date) WHERE asset_type = 'Stocks'),
                    'options', (SELECT average_position_size FROM get_combined_average_position_size(p_time_range, p_custom_start_date, p_custom_end_date) WHERE asset_type = 'Options'),
                    'combined', (SELECT average_position_size FROM get_combined_average_position_size(p_time_range, p_custom_start_date, p_custom_end_date) WHERE asset_type = 'Combined')
                )
            ),
            'trade_size_consistency', get_trade_size_consistency(p_time_range, p_custom_start_date, p_custom_end_date)
        ),
        'streak_analysis', json_build_object(
            'longest_winning_streak', winning_streak,
            'longest_losing_streak', losing_streak
        ),
        'cost_analysis', json_build_object(
            'total_commissions_paid', get_total_commissions(p_time_range, p_custom_start_date, p_custom_end_date),
            'average_commission_per_trade', get_average_commission_per_trade(p_time_range, p_custom_start_date, p_custom_end_date),
            'risk_per_trade', (
                SELECT json_build_object(
                    'stocks', (SELECT average_risk_per_trade FROM get_combined_risk_per_trade(p_time_range, p_custom_start_date, p_custom_end_date) WHERE asset_type = 'Stocks'),
                    'options', (SELECT average_risk_per_trade FROM get_combined_risk_per_trade(p_time_range, p_custom_start_date, p_custom_end_date) WHERE asset_type = 'Options'),
                    'combined', (SELECT average_risk_per_trade FROM get_combined_risk_per_trade(p_time_range, p_custom_start_date, p_custom_end_date) WHERE asset_type = 'Combined')
                )
            )
        ),
        'directional_performance', json_build_object(
            'bullish_win_rate', (
                SELECT win_rate FROM get_win_rate_by_trade_direction(p_time_range, p_custom_start_date, p_custom_end_date)
                WHERE trade_direction = 'Bullish'
            ),
            'bearish_win_rate', (
                SELECT win_rate FROM get_win_rate_by_trade_direction(p_time_range, p_custom_start_date, p_custom_end_date)
                WHERE trade_direction = 'Bearish'
            ),
            'bullish_loss_rate', (
                SELECT loss_rate FROM get_loss_rate_by_trade_direction(p_time_range, p_custom_start_date, p_custom_end_date)
                WHERE trade_direction = 'Bullish'
            ),
            'bearish_loss_rate', (
                SELECT loss_rate FROM get_loss_rate_by_trade_direction(p_time_range, p_custom_start_date, p_custom_end_date)
                WHERE trade_direction = 'Bearish'
            ),
            'bullish_performance', (
                SELECT json_build_object(
                    'total_trades', total_trades,
                    'net_pnl', net_pnl,
                    'win_rate', win_rate,
                    'average_gain', average_gain,
                    'average_loss', average_loss,
                    'profit_factor', profit_factor
                )
                FROM get_performance_by_trade_direction(p_time_range, p_custom_start_date, p_custom_end_date)
                WHERE trade_direction = 'Bullish'
            ),
            'bearish_performance', (
                SELECT json_build_object(
                    'total_trades', total_trades,
                    'net_pnl', net_pnl,
                    'win_rate', win_rate,
                    'average_gain', average_gain,
                    'average_loss', average_loss,
                    'profit_factor', profit_factor
                )
                FROM get_performance_by_trade_direction(p_time_range, p_custom_start_date, p_custom_end_date)
                WHERE trade_direction = 'Bearish'
            )
        ),
        'top_symbols_performance', (
            SELECT json_agg(
                json_build_object(
                    'symbol', symbol,
                    'total_pnl', total_pnl,
                    'ranking_type', ranking_type
                )
            )
            FROM (
                SELECT * FROM get_symbol_profitability_ranking(10, p_time_range, p_custom_start_date, p_custom_end_date)
            ) top_symbols
        ),
        'trading_frequency_patterns', (
            SELECT json_agg(
                json_build_object(
                    'pattern_type', pattern_type,
                    'pattern_value', pattern_value,
                    'trade_count', trade_count,
                    'win_rate', win_rate,
                    'net_pnl', net_pnl
                )
            )
            FROM get_trade_frequency_patterns(p_time_range, p_custom_start_date, p_custom_end_date)
        ),
        'symbol_trading_frequency', (
            SELECT json_agg(
                json_build_object(
                    'symbol', symbol,
                    'trade_count', trade_count,
                    'frequency_category', frequency_category
                )
            )
            FROM (
                SELECT * FROM get_trading_frequency_by_symbol(p_time_range, p_custom_start_date, p_custom_end_date)
                LIMIT 15
            ) freq_symbols
        )
    ) INTO result;

    RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_daily_ai_summary(TEXT, DATE, DATE) TO authenticated;

-- Add comprehensive documentation
COMMENT ON FUNCTION public.get_daily_ai_summary IS 'Generates a comprehensive daily trading summary in JSON format for AI model consumption.

This function combines all individual AI report functions into a single, structured JSON output containing:

1. **Summary Metadata**: Timestamp, time range, user context
2. **Core Performance Metrics**: Profit factor, win rate, loss rate, trade expectancy, risk-reward ratio
3. **Profit/Loss Analysis**: Biggest winner/loser, average gains/losses
4. **Trading Behavior Metrics**: Hold times, trade duration, position sizing, consistency
5. **Streak Analysis**: Longest winning and losing streaks
6. **Cost Analysis**: Commissions, risk per trade
7. **Directional Performance**: Bullish vs bearish trade performance
8. **Top Symbols Performance**: Best performing symbols with metrics
9. **Trading Frequency Patterns**: Time-based trading patterns
10. **Symbol Trading Frequency**: Most frequently traded symbols

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
- Comprehensive JSON object with all trading metrics and analysis

Example usage:
-- Get daily summary for the last 30 days
SELECT get_daily_ai_summary(''30d'');

-- Get year-to-date summary
SELECT get_daily_ai_summary(''ytd'');

-- Get custom date range summary
SELECT get_daily_ai_summary(''custom'', ''2024-01-01'', ''2024-03-31'');

-- Get all-time summary (default)
SELECT get_daily_ai_summary();

The JSON structure is optimized for AI model consumption with consistent naming conventions,
proper data types, and comprehensive coverage of all trading performance aspects.';

-- Example test queries
/*
-- Test the function with different time ranges
SELECT get_daily_ai_summary('7d');
SELECT get_daily_ai_summary('30d');  
SELECT get_daily_ai_summary('ytd');
SELECT get_daily_ai_summary();

-- Pretty print JSON for debugging
SELECT jsonb_pretty(get_daily_ai_summary('30d')::jsonb);
*/
