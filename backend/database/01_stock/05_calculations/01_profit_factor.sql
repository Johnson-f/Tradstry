-- Fixed function to handle edge cases better
CREATE OR REPLACE FUNCTION public.get_stock_profit_factor(
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
            id,
            CASE
                WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
            END AS profit
        FROM
            public.stocks
        WHERE
            user_id = auth.uid()
            AND exit_date IS NOT NULL  -- Only count closed trades
            AND exit_price IS NOT NULL  -- Ensure exit_price is not null
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

-- Testing on Supabase SQL Editor
-- SELECT get_stock_profit_factor('30d');  -- Last 30 days
-- SELECT get_stock_profit_factor('ytd');  -- Year to date
-- SELECT get_stock_profit_factor();       -- All time (default)
