-- Function to calculate trade expectancy for stock trades with date range filtering
-- Trade Expectancy = (Win% * Avg Win) - (Loss% * Avg Loss)
CREATE OR REPLACE FUNCTION public.stock_trade_expectancy(
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
        SELECT
            -- Calculate individual trade P&L
            CASE
                WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
            END AS pnl
        FROM
            public.stocks
        WHERE
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_price IS NOT NULL
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
    expectancy_stats AS (
        SELECT
            -- Win rate (as decimal between 0 and 1)
            CASE
                WHEN COUNT(*) = 0 THEN 0
                ELSE CAST(COUNT(CASE WHEN pnl > 0 THEN 1 END) AS NUMERIC) / COUNT(*)
            END AS win_rate_decimal,

            -- Average gain from winning trades
            COALESCE(AVG(CASE WHEN pnl > 0 THEN pnl END), 0) AS avg_gain,

            -- Average loss from losing trades (as positive number)
            COALESCE(AVG(CASE WHEN pnl < 0 THEN ABS(pnl) END), 0) AS avg_loss,

            -- Trade counts for validation
            COUNT(*) AS total_trades,
            COUNT(CASE WHEN pnl > 0 THEN 1 END) AS winning_trades,
            COUNT(CASE WHEN pnl < 0 THEN 1 END) AS losing_trades
        FROM
            trade_metrics
    )
    SELECT
        CASE
            WHEN total_trades = 0 THEN 0  -- No trades = 0 expectancy
            ELSE ROUND(
                (win_rate_decimal * avg_gain) - ((1 - win_rate_decimal) * avg_loss),
                2
            )
        END AS trade_expectancy
    FROM
        expectancy_stats;
$$;

-- Test the function
-- SELECT stock_trade_expectancy('30d');  -- Last 30 days
-- SELECT stock_trade_expectancy('ytd');  -- Year to date
-- SELECT stock_trade_expectancy();       -- All time (default)



/*
Old function
CREATE OR REPLACE FUNCTION public.stock_trade_expectancy(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    win_rate numeric;
    average_gain numeric;
    average_loss numeric;
    trade_expectancy numeric;
    win_rate_decimal numeric;
BEGIN
    -- Get win rate with the same date range (as a decimal between 0 and 1)
    EXECUTE 'SELECT public.stock_win_rate($1, $2, $3, $4) / 100.0'
    INTO win_rate_decimal
    USING user_id, period_type, custom_start_date, custom_end_date;

    -- Get average gain for winning trades with the same date range
    EXECUTE 'SELECT public.stock_average_gain($1, $2, $3, $4)'
    INTO average_gain
    USING user_id, period_type, custom_start_date, custom_end_date;

    -- Get average loss for losing trades with the same date range
    EXECUTE 'SELECT public.stock_average_loss($1, $2, $3, $4)'
    INTO average_loss
    USING user_id, period_type, custom_start_date, custom_end_date;

    -- Calculate trade expectancy
    IF win_rate_decimal IS NOT NULL AND average_gain IS NOT NULL AND average_loss IS NOT NULL THEN
        trade_expectancy := (win_rate_decimal * average_gain) - ((1 - win_rate_decimal) * average_loss);
    ELSE
        trade_expectancy := 0;
    END IF;

    RETURN ROUND(COALESCE(trade_expectancy, 0), 2);
END;
$$ LANGUAGE plpgsql;

-- Testing on supabase SQL editor
-- Testing on supabase SQL Editor
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.stock_trade_expectancy('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.stock_trade_expectancy(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid,
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;
*/
