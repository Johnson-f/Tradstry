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

-- Function to calculate average hold time for winning stock trades (in days)
CREATE OR REPLACE FUNCTION public.get_avg_hold_time_winners(
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
GRANT EXECUTE ON FUNCTION public.get_avg_hold_time_winners(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_avg_hold_time_winners IS 'Calculates the average hold time in days for winning stock trades.

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
- Returns 0 if there are no winning trades

Example usage:
-- Last 30 days
SELECT get_avg_hold_time_winners(''30d'');

-- Year to date
SELECT get_avg_hold_time_winners(''ytd'');

-- All time (default)
SELECT get_avg_hold_time_winners();';

-- Testing on Supabase SQL Editor
-- SELECT get_avg_hold_time_winners('30d');  -- Last 30 days
-- SELECT get_avg_hold_time_winners('ytd');  -- Year to date
-- SELECT get_avg_hold_time_winners();       -- All time (default)


-- Function to calculate average hold time for losing stock trades (in days)
CREATE OR REPLACE FUNCTION public.get_avg_hold_time_losers(
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
GRANT EXECUTE ON FUNCTION public.get_avg_hold_time_losers(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_avg_hold_time_losers IS 'Calculates the average hold time in days for losing stock trades.

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
- Returns 0 if there are no losing trades

Example usage:
-- Last 30 days
SELECT get_avg_hold_time_losers(''30d'');

-- Year to date
SELECT get_avg_hold_time_losers(''ytd'');

-- All time (default)
SELECT get_avg_hold_time_losers();';

-- Testing on Supabase SQL Editor
-- SELECT get_avg_hold_time_losers('30d');  -- Last 30 days
-- SELECT get_avg_hold_time_losers('ytd');  -- Year to date
-- SELECT get_avg_hold_time_losers();       -- All time (default)

-- Function to get the biggest winning trade profit from stocks
CREATE OR REPLACE FUNCTION public.get_biggest_winner(
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
        SELECT
            id,
            symbol,
            trade_type,
            entry_date,
            exit_date,
            entry_price,
            exit_price,
            number_shares,
            COALESCE(commissions, 0) AS commissions,
            CASE
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
            END AS profit,
            EXTRACT(EPOCH FROM (exit_date - entry_date)) / 86400.0 AS hold_days,
            CASE
                WHEN trade_type = 'BUY' THEN ROUND(((exit_price - entry_price) / entry_price * 100)::numeric, 2)
                WHEN trade_type = 'SELL' THEN ROUND(((entry_price - exit_price) / entry_price * 100)::numeric, 2)
            END AS profit_percentage
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
    )
    SELECT
        COALESCE(MAX(profit), 0) AS biggest_winner
    FROM
        winning_trades;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_biggest_winner(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_biggest_winner IS 'Returns the profit amount of the biggest winning trade from stocks.

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
- The profit amount of the biggest winning trade (returns 0 if no winning trades found)

Example usage:
-- Last 30 days
SELECT * FROM get_biggest_winner(''30d'');

-- Year to date
SELECT * FROM get_biggest_winner(''ytd'');

-- All time (default)
SELECT * FROM get_biggest_winner();';

-- Testing on Supabase SQL Editor
-- SELECT get_biggest_winner('30d');  -- Last 30 days
-- SELECT get_biggest_winner('ytd');  -- Year to date
-- SELECT get_biggest_winner();       -- All time (default)

-- Function to get the biggest losing trade loss from stocks
CREATE OR REPLACE FUNCTION public.get_biggest_loser(
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
    )
    SELECT
        COALESCE(MIN(loss), 0) AS biggest_loser
    FROM
        losing_trades;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_biggest_loser(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_biggest_loser IS 'Returns the loss amount of the biggest losing trade from stocks.

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
- The loss amount of the biggest losing trade (returns 0 if no losing trades found).
  The value will be negative to represent a loss.

Example usage:
-- Last 30 days
SELECT get_biggest_loser(''30d'');

-- Year to date
SELECT get_biggest_loser(''ytd'');

-- All time (default)
SELECT get_biggest_loser();';

-- Testing on Supabase SQL Editor
-- SELECT get_biggest_loser('30d');  -- Last 30 days
-- SELECT get_biggest_loser('ytd');  -- Year to date
-- SELECT get_biggest_loser();       -- All time (default)

-- Function to calculate average gain for stock trades with date range filtering
CREATE OR REPLACE FUNCTION public.stock_average_gain(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH trade_gains AS (
        SELECT
            id,
            CASE
                WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
            END AS gain
        FROM
            public.stocks
        WHERE
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_price IS NOT NULL
            AND status = 'closed'
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
    )
    SELECT
        COALESCE(AVG(gain), 0)
    FROM
        trade_gains;
$$;
-- Test the function
-- SELECT stock_average_gain('30d');  -- Last 30 days
-- SELECT stock_average_gain('ytd');  -- Year to date
-- SELECT stock_average_gain();       -- All time (default)


-- Old function body
/*
CREATE OR REPLACE FUNCTION public.stock_average_gain(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    average_gain numeric;
    start_date TIMESTAMP WITH TIME ZONE;
    end_date TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- Set date range based on period_type
    CASE period_type
        WHEN '7d' THEN start_date := NOW() - INTERVAL '7 days';
        WHEN '30d' THEN start_date := NOW() - INTERVAL '30 days';
        WHEN '90d' THEN start_date := NOW() - INTERVAL '90 days';
        WHEN '1y' THEN start_date := NOW() - INTERVAL '1 year';
        WHEN 'custom' THEN
            start_date := custom_start_date;
            end_date := COALESCE(custom_end_date, NOW());
        ELSE start_date := '1970-01-01'::TIMESTAMP; -- All time
    END CASE;

    -- Calculate average gain for winning trades within the date range
    SELECT COALESCE(AVG(
        CASE
            WHEN stocks.trade_type = 'BUY' THEN (stocks.exit_price - stocks.entry_price) * stocks.number_shares - stocks.commissions
            WHEN stocks.trade_type = 'SELL' THEN (stocks.entry_price - stocks.exit_price) * stocks.number_shares - stocks.commissions
        END
    ), 0) INTO average_gain
    FROM public.stocks
    WHERE stocks.user_id = $1
    AND stocks.status = 'closed'
    AND stocks.exit_date BETWEEN start_date AND end_date
    AND (
        (stocks.trade_type = 'BUY' AND stocks.exit_price > stocks.entry_price) OR
        (stocks.trade_type = 'SELL' AND stocks.exit_price < stocks.entry_price)
    );

    RETURN average_gain;
END;
$$ LANGUAGE plpgsql;
*/

-- Testing on supabase SQL editor
-- SELECT public.stock_average_gain('99369696-8c65-43bb-96bc-5999275e8be1'::uuid) as average_gain;

-- Function to calculate average loss for stock trades with date range filtering
CREATE OR REPLACE FUNCTION public.stock_average_loss(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH trade_losses AS (
        SELECT
            id,
            ABS(CASE
                WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
            END) AS loss
        FROM
            public.stocks
        WHERE
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_price IS NOT NULL
            AND status = 'closed'
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
    )
    SELECT
        COALESCE(AVG(loss), 0)
    FROM
        trade_losses;
$$;
-- Testing on supabase SQL editor
-- Testing on supabase SQL Editor
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.stock_average_loss('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.stock_average_loss(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid,
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;



/*
CREATE OR REPLACE FUNCTION public.stock_average_loss(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    average_loss numeric;
    start_date TIMESTAMP WITH TIME ZONE;
    end_date TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- Set date range based on period_type
    CASE period_type
        WHEN '7d' THEN start_date := NOW() - INTERVAL '7 days';
        WHEN '30d' THEN start_date := NOW() - INTERVAL '30 days';
        WHEN '90d' THEN start_date := NOW() - INTERVAL '90 days';
        WHEN '1y' THEN start_date := NOW() - INTERVAL '1 year';
        WHEN 'custom' THEN
            start_date := custom_start_date;
            end_date := COALESCE(custom_end_date, NOW());
        ELSE start_date := '1970-01-01'::TIMESTAMP; -- All time
    END CASE;

    -- Calculate average loss for losing trades within the date range (as a positive number)
    SELECT COALESCE(AVG(
        ABS(CASE
            WHEN stocks.trade_type = 'BUY' THEN (stocks.exit_price - stocks.entry_price) * stocks.number_shares - stocks.commissions
            WHEN stocks.trade_type = 'SELL' THEN (stocks.entry_price - stocks.exit_price) * stocks.number_shares - stocks.commissions
        END)
    ), 0) INTO average_loss
    FROM public.stocks
    WHERE stocks.user_id = $1
    AND stocks.status = 'closed'
    AND stocks.exit_date BETWEEN start_date AND end_date
    AND (
        (stocks.trade_type = 'BUY' AND stocks.exit_price < stocks.entry_price) OR
        (stocks.trade_type = 'SELL' AND stocks.exit_price > stocks.entry_price)
    );

    RETURN average_loss;
END;
$$ LANGUAGE plpgsql;
*/
-- Old Testing
-- SELECT public.stock_average_loss('99369696-8c65-43bb-96bc-5999275e8be1'::uuid) as average_loss;

-- Function to calculate net PnL for stock trades with date range filtering
CREATE OR REPLACE FUNCTION public.stock_net_pnl(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH trade_pnl AS (
        SELECT
            id,
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
    )
    SELECT
        COALESCE(SUM(pnl), 0)
    FROM
        trade_pnl;
$$;

-- Test the function
-- SELECT stock_net_pnl('30d');  -- Last 30 days
-- SELECT stock_net_pnl('ytd');  -- Year to date
-- SELECT stock_net_pnl();       -- All time (default)

/*
Old function
CREATE OR REPLACE FUNCTION public.stock_net_pnl(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    net_pnl numeric;
    start_date TIMESTAMP WITH TIME ZONE;
    end_date TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- Set date range based on period_type
    CASE period_type
        WHEN '7d' THEN start_date := NOW() - INTERVAL '7 days';
        WHEN '30d' THEN start_date := NOW() - INTERVAL '30 days';
        WHEN '90d' THEN start_date := NOW() - INTERVAL '90 days';
        WHEN '1y' THEN start_date := NOW() - INTERVAL '1 year';
        WHEN 'custom' THEN
            start_date := custom_start_date;
            end_date := COALESCE(custom_end_date, NOW());
        ELSE start_date := '1970-01-01'::TIMESTAMP; -- All time
    END CASE;

    -- Calculate net PnL for all closed trades within the date range
    SELECT COALESCE(SUM(
        CASE
            WHEN stocks.trade_type = 'BUY' THEN (stocks.exit_price - stocks.entry_price) * stocks.number_shares - stocks.commissions
            WHEN stocks.trade_type = 'SELL' THEN (stocks.entry_price - stocks.exit_price) * stocks.number_shares - stocks.commissions
        END
    ), 0) INTO net_pnl
    FROM public.stocks
    WHERE stocks.user_id = $1
    AND stocks.status = 'closed'
    AND stocks.exit_date BETWEEN start_date AND end_date
    AND stocks.exit_price IS NOT NULL;

    RETURN net_pnl;
END;
$$ LANGUAGE plpgsql;
*/

-- Function to calculate risk to reward ratio for stock trades with date range filtering
-- Risk/Reward Ratio = Average Loss / Average Gain
CREATE OR REPLACE FUNCTION public.stock_risk_reward_ratio(
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
    gain_loss_stats AS (
        SELECT
            -- Average gain from winning trades
            COALESCE(AVG(CASE WHEN pnl > 0 THEN pnl END), 0) AS avg_gain,
            -- Average loss from losing trades (as positive number)
            COALESCE(AVG(CASE WHEN pnl < 0 THEN ABS(pnl) END), 0) AS avg_loss,
            COUNT(CASE WHEN pnl > 0 THEN 1 END) AS winning_trades,
            COUNT(CASE WHEN pnl < 0 THEN 1 END) AS losing_trades
        FROM
            trade_metrics
    )
    SELECT
        CASE
            WHEN avg_gain = 0 OR avg_gain IS NULL THEN 0  -- No gains = 0 ratio
            WHEN avg_loss = 0 OR avg_loss IS NULL THEN 0  -- No losses = 0 risk
            ELSE ROUND(avg_loss / avg_gain, 2)
        END AS risk_reward_ratio
    FROM
        gain_loss_stats;
$$;

-- Test the function
-- SELECT stock_risk_reward_ratio('30d');  -- Last 30 days
-- SELECT stock_risk_reward_ratio('ytd');  -- Year to date
-- SELECT stock_risk_reward_ratio();       -- All time (default)



/*
Old function
CREATE OR REPLACE FUNCTION public.stock_risk_reward_ratio(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    avg_gain numeric;
    avg_loss numeric;
    risk_reward_ratio numeric;
BEGIN
    -- Get average gain using the stock_average_gain function
    SELECT public.stock_average_gain(
        user_id,
        period_type,
        custom_start_date,
        custom_end_date
    ) INTO avg_gain;

    -- Get average loss using the stock_average_loss function
    SELECT public.stock_average_loss(
        user_id,
        period_type,
        custom_start_date,
        custom_end_date
    ) INTO avg_loss;

    -- Calculate risk/reward ratio (avoid division by zero)
    IF COALESCE(avg_gain, 0) > 0 THEN
        risk_reward_ratio := ABS(avg_loss) / avg_gain;
    ELSE
        risk_reward_ratio := 0;
    END IF;

    RETURN ROUND(COALESCE(risk_reward_ratio, 0), 2);
END;
$$ LANGUAGE plpgsql;

-- Testing on supabase SQL editor
-- Testing on supabase SQL Editor
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.stock_risk_reward_ratio('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.stock_risk_reward_ratio(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid,
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;
*/

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

-- Function to calculate the win rate of stocks for a given time range
CREATE OR REPLACE FUNCTION public.stock_win_rate(
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
        SELECT
            id,
            -- Determine if trade is winning or losing
            CASE
                WHEN (trade_type = 'BUY' AND exit_price > entry_price) OR
                     (trade_type = 'SELL' AND exit_price < entry_price) THEN 1
                ELSE 0
            END AS is_winning_trade
        FROM
            public.stocks
        WHERE
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_price IS NOT NULL
            AND entry_price IS NOT NULL
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
    win_rate_stats AS (
        SELECT
            COUNT(*) AS total_trades,
            SUM(is_winning_trade) AS winning_trades
        FROM
            trade_results
    )
    SELECT
        CASE
            WHEN total_trades = 0 THEN 0
            ELSE ROUND((winning_trades::NUMERIC / total_trades::NUMERIC) * 100, 2)
        END AS win_rate_percentage
    FROM
        win_rate_stats;
$$;

-- Test the function
-- SELECT stock_win_rate('30d');  -- Last 30 days
-- SELECT stock_win_rate('ytd');  -- Year to date
-- SELECT stock_win_rate();       -- All time (default)

/*
Old function
CREATE OR REPLACE FUNCTION public.stock_win_rate(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    total_closed_trades integer;
    winning_trades integer;
    win_rate numeric;
    start_date TIMESTAMP WITH TIME ZONE;
    end_date TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- Set date range based on period_type
    CASE period_type
        WHEN '7d' THEN start_date := NOW() - INTERVAL '7 days';
        WHEN '30d' THEN start_date := NOW() - INTERVAL '30 days';
        WHEN '90d' THEN start_date := NOW() - INTERVAL '90 days';
        WHEN '1y' THEN start_date := NOW() - INTERVAL '1 year';
        WHEN 'custom' THEN
            start_date := custom_start_date;
            end_date := COALESCE(custom_end_date, NOW());
        ELSE start_date := '1970-01-01'::TIMESTAMP; -- All time
    END CASE;

    -- Debug: Print the user_id and date range being used
    RAISE NOTICE 'Calculating win rate for user_id: %', user_id;
    RAISE NOTICE 'Date range: % to %', start_date, end_date;

    -- Count total closed trades for the user within the date range
    SELECT COUNT(*) INTO total_closed_trades
    FROM public.stocks
    WHERE stocks.user_id = $1
    AND stocks.status = 'closed'
    AND stocks.exit_date BETWEEN start_date AND end_date
    AND stocks.entry_price IS NOT NULL
    AND stocks.exit_price IS NOT NULL;

    -- Debug: Print total closed trades
    RAISE NOTICE 'Total closed trades: %', total_closed_trades;

    -- Count winning trades for the user within the date range
    SELECT COUNT(*) INTO winning_trades
    FROM public.stocks
    WHERE stocks.user_id = $1
    AND stocks.status = 'closed'
    AND stocks.exit_date BETWEEN start_date AND end_date
    AND stocks.entry_price IS NOT NULL
    AND stocks.exit_price IS NOT NULL
    AND (
        (stocks.trade_type = 'BUY' AND stocks.exit_price > stocks.entry_price) OR
        (stocks.trade_type = 'SELL' AND stocks.exit_price < stocks.entry_price)
    );

    -- Debug: Print winning trades
    RAISE NOTICE 'Winning trades: %', winning_trades;

    -- Calculate win rate percentage with 2 decimal places
    IF total_closed_trades > 0 THEN
        win_rate := ROUND((winning_trades::numeric / total_closed_trades::numeric) * 100, 2);
        -- Debug: Print calculated win rate
        RAISE NOTICE 'Calculated win rate: %', win_rate;
    ELSE
        win_rate := 0;
        RAISE NOTICE 'No closed trades found for win rate calculation in the specified date range';
    END IF;

    RETURN win_rate;
END;
$$ LANGUAGE plpgsql;

-- Testing with Supabase SQL Editor
-- Testing on supabase SQL Editor
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.stock_win_rate('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.stock_win_rate(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid,
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;
*/

-- Function to calculate average position size for stock trades
CREATE OR REPLACE FUNCTION public.get_average_position_size(
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
        );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_average_position_size(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_average_position_size IS 'Returns the average position size for stock trades.

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
- Average position size (entry_price * number_shares) as NUMERIC
- Returns 0 if no trades found matching the criteria

Example usage:
- Last 30 days: SELECT get_average_position_size(''30d'');
- Custom range: SELECT get_average_position_size(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT get_average_position_size();';

-- Testing on Supabase SQL Editor
-- SELECT get_average_position_size('30d');  -- Last 30 days
-- SELECT get_average_position_size('ytd');  -- Year to date
-- SELECT get_average_position_size();       -- All time (default)


-- Function to calculate average risk per trade for stock trades
CREATE OR REPLACE FUNCTION public.get_average_risk_per_trade(
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
    GROUP BY user_id;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_average_risk_per_trade(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_average_risk_per_trade IS 'Returns the average risk per trade for stock trades.

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
- Average risk per trade in dollars as NUMERIC

Example usage:
- Last 30 days: SELECT get_average_risk_per_trade(''30d'');
- Custom range: SELECT get_average_risk_per_trade(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT get_average_risk_per_trade();';

-- Testing on Supabase SQL Editor
-- SELECT get_average_risk_per_trade('30d');  -- Last 30 days
-- SELECT get_average_risk_per_trade('ytd');  -- Year to date
-- SELECT get_average_risk_per_trade();       -- All time (default)


-- Function to calculate loss rate for stock trades
CREATE OR REPLACE FUNCTION public.get_stock_loss_rate(
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
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(
                (COUNT(CASE
                    WHEN (exit_price - entry_price) *
                        CASE WHEN trade_type = 'BUY' THEN 1 ELSE -1 END - commissions < 0
                    THEN 1
                END)::NUMERIC / COUNT(*)) * 100, 2
            )
        END as loss_rate
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
        );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_stock_loss_rate(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_stock_loss_rate IS 'Returns the loss rate for stock trades as a percentage.

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
- Loss rate as a percentage (0-100) as NUMERIC
- Returns 0 if no trades found matching the criteria

Calculation:
- For BUY trades: Loss when (exit_price - entry_price) - commissions < 0
- For SELL trades: Loss when (entry_price - exit_price) - commissions < 0
- Loss rate = (number of losing trades / total trades) * 100

Example usage:
- Last 30 days: SELECT get_stock_loss_rate(''30d'');
- Custom range: SELECT get_stock_loss_rate(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT get_stock_loss_rate();';

-- Testing on Supabase SQL Editor
-- SELECT get_stock_loss_rate('30d');  -- Last 30 days
-- SELECT get_stock_loss_rate('ytd');  -- Year to date
-- SELECT get_stock_loss_rate();       -- All time (default)

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

-- Function to calculate average hold time for winning options trades (in days)
CREATE OR REPLACE FUNCTION public.get_options_avg_hold_time_winners(
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
GRANT EXECUTE ON FUNCTION public.get_options_avg_hold_time_winners(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_options_avg_hold_time_winners IS 'Calculates the average hold time in days for winning options trades.

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
-- SELECT get_options_avg_hold_time_winners('30d');  -- Last 30 days
-- SELECT get_options_avg_hold_time_winners('ytd');  -- Year to date
-- SELECT get_options_avg_hold_time_winners();       -- All time (default)


-- Function to calculate average hold time for losing options trades (in days)
CREATE OR REPLACE FUNCTION public.get_options_avg_hold_time_losers(
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
GRANT EXECUTE ON FUNCTION public.get_options_avg_hold_time_losers(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_options_avg_hold_time_losers IS 'Calculates the average hold time in days for losing options trades.

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
-- SELECT get_options_avg_hold_time_losers('30d');  -- Last 30 days
-- SELECT get_options_avg_hold_time_losers('ytd');  -- Year to date
-- SELECT get_options_avg_hold_time_losers();       -- All time (default)


-- Function to get the biggest winning trade profit from options
CREATE OR REPLACE FUNCTION public.get_options_biggest_winner(
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
        SELECT
            CASE
                WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN
                    (exit_price - entry_price) * 100 * number_of_contracts - commissions
                WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN
                    -((exit_price - entry_price) * 100 * number_of_contracts) - commissions
                WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN
                    (entry_price - exit_price) * 100 * number_of_contracts - commissions
                WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN
                    -((entry_price - exit_price) * 100 * number_of_contracts) - commissions
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
GRANT EXECUTE ON FUNCTION public.get_options_biggest_winner(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_options_biggest_winner IS 'Returns the profit amount of the biggest winning trade from options.

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
-- SELECT get_options_biggest_winner('30d');  -- Last 30 days
-- SELECT get_options_biggest_winner('ytd');  -- Year to date
-- SELECT get_options_biggest_winner();       -- All time (default)


-- Function to get the biggest losing trade loss from options
CREATE OR REPLACE FUNCTION public.get_options_biggest_loser(
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
        SELECT
            CASE
                WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN
                    (exit_price - entry_price) * 100 * number_of_contracts - commissions
                WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN
                    -((exit_price - entry_price) * 100 * number_of_contracts) - commissions
                WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN
                    (entry_price - exit_price) * 100 * number_of_contracts - commissions
                WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN
                    -((entry_price - exit_price) * 100 * number_of_contracts) - commissions
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
GRANT EXECUTE ON FUNCTION public.get_options_biggest_loser(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_options_biggest_loser IS 'Returns the loss amount of the biggest losing trade from options.

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
-- SELECT get_options_biggest_loser('30d');  -- Last 30 days
-- SELECT get_options_biggest_loser('ytd');  -- Year to date
-- SELECT get_options_biggest_loser();       -- All time (default)

-- Function to calculate average gain for option trades with date range filtering
CREATE OR REPLACE FUNCTION public.option_average_gain(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH option_gains AS (
        SELECT
            id,
            -- Calculate gain based on strategy type or trade direction
            CASE
                WHEN strategy_type ILIKE '%long%' THEN
                    (COALESCE(exit_price, 0) - entry_price) * number_of_contracts - COALESCE(commissions, 0)
                WHEN strategy_type ILIKE '%short%' THEN
                    (entry_price - COALESCE(exit_price, 0)) * number_of_contracts - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bullish' THEN
                    (COALESCE(exit_price, 0) - entry_price) * number_of_contracts - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bearish' THEN
                    (entry_price - COALESCE(exit_price, 0)) * number_of_contracts - COALESCE(commissions, 0)
                ELSE 0
            END AS gain
        FROM
            public.options
        WHERE
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_price IS NOT NULL
            AND status = 'closed'
            AND (
                -- Winning trade conditions
                (strategy_type ILIKE '%long%' AND exit_price > entry_price) OR
                (strategy_type ILIKE '%short%' AND exit_price < entry_price) OR
                (trade_direction = 'Bullish' AND exit_price > entry_price) OR
                (trade_direction = 'Bearish' AND exit_price < entry_price)
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
        COALESCE(AVG(gain), 0)
    FROM
        option_gains;
$$;

-- Test the function
-- SELECT option_average_gain('30d');  -- Last 30 days
-- SELECT option_average_gain('ytd');  -- Year to date
-- SELECT option_average_gain();       -- All time (default)

/*
Old Function
CREATE OR REPLACE FUNCTION public.option_average_gain(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    average_gain numeric;
    start_date TIMESTAMP WITH TIME ZONE;
    end_date TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- Set date range based on period_type
    CASE period_type
        WHEN '7d' THEN start_date := NOW() - INTERVAL '7 days';
        WHEN '30d' THEN start_date := NOW() - INTERVAL '30 days';
        WHEN '90d' THEN start_date := NOW() - INTERVAL '90 days';
        WHEN '1y' THEN start_date := NOW() - INTERVAL '1 year';
        WHEN 'custom' THEN
            start_date := custom_start_date;
            end_date := COALESCE(custom_end_date, NOW());
        ELSE start_date := '1970-01-01'::TIMESTAMP; -- All time
    END CASE;

    -- Calculate average gain for winning trades within the date range
    SELECT COALESCE(AVG(
        CASE
            WHEN options.strategy_type ILIKE '%long%' THEN (options.exit_price - options.entry_price) * options.number_of_contracts - options.commissions
            WHEN options.strategy_type ILIKE '%short%' THEN (options.entry_price - options.exit_price) * options.number_of_contracts - options.commissions
            WHEN options.trade_direction = 'Bullish' THEN (options.exit_price - options.entry_price) * options.number_of_contracts - options.commissions
            WHEN options.trade_direction = 'Bearish' THEN (options.entry_price - options.exit_price) * options.number_of_contracts - options.commissions
            ELSE 0
        END
    ), 0) INTO average_gain
    FROM public.options
    WHERE options.user_id = $1
    AND options.status = 'closed'
    AND options.exit_date BETWEEN start_date AND end_date
    AND (
        -- For long positions (BUY), winning trades have higher exit prices
        (options.strategy_type ILIKE '%long%' AND options.exit_price > options.entry_price) OR
        -- For short positions (SELL), winning trades have lower exit prices
        (options.strategy_type ILIKE '%short%' AND options.exit_price < options.entry_price) OR
        -- For bullish trades, winning when exit_price > entry_price
        (options.trade_direction = 'Bullish' AND options.exit_price > options.entry_price) OR
        -- For bearish trades, winning when exit_price < entry_price
        (options.trade_direction = 'Bearish' AND options.exit_price < options.entry_price)
    );

    RETURN average_gain;
END;
$$ LANGUAGE plpgsql;

-- Testing with Supabase SQL Editor
-- Testing on supabase SQL Editor
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.option_average_gain('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.option_average_gain(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid,
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;
*/


-- Function to calculate average loss for option trades with date range filtering
-- Converting option_average_loss to Pattern 1 style
CREATE OR REPLACE FUNCTION public.option_average_loss(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH option_losses AS (
        SELECT
            id,
            -- Calculate loss based on strategy type or trade direction (as positive number)
            ABS(CASE
                WHEN strategy_type ILIKE '%long%' THEN
                    (COALESCE(exit_price, 0) - entry_price) * number_of_contracts - COALESCE(commissions, 0)
                WHEN strategy_type ILIKE '%short%' THEN
                    (entry_price - COALESCE(exit_price, 0)) * number_of_contracts - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bullish' THEN
                    (COALESCE(exit_price, 0) - entry_price) * number_of_contracts - COALESCE(commissions, 0)
                WHEN trade_direction = 'Bearish' THEN
                    (entry_price - COALESCE(exit_price, 0)) * number_of_contracts - COALESCE(commissions, 0)
                ELSE 0
            END) AS loss
        FROM
            public.options
        WHERE
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_price IS NOT NULL
            AND status = 'closed'
            AND (
                -- Losing trade conditions
                (strategy_type ILIKE '%long%' AND exit_price < entry_price) OR
                (strategy_type ILIKE '%short%' AND exit_price > entry_price) OR
                (trade_direction = 'Bullish' AND exit_price < entry_price) OR
                (trade_direction = 'Bearish' AND exit_price > entry_price)
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
        COALESCE(AVG(loss), 0)
    FROM
        option_losses;
$$;

-- Test the function
-- SELECT option_average_loss('30d');  -- Last 30 days
-- SELECT option_average_loss('ytd');  -- Year to date
-- SELECT option_average_loss();       -- All time (default)

/*
Old function
CREATE OR REPLACE FUNCTION public.option_average_loss(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    average_loss numeric;
    start_date TIMESTAMP WITH TIME ZONE;
    end_date TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- Set date range based on period_type
    CASE period_type
        WHEN '7d' THEN start_date := NOW() - INTERVAL '7 days';
        WHEN '30d' THEN start_date := NOW() - INTERVAL '30 days';
        WHEN '90d' THEN start_date := NOW() - INTERVAL '90 days';
        WHEN '1y' THEN start_date := NOW() - INTERVAL '1 year';
        WHEN 'custom' THEN
            start_date := custom_start_date;
            end_date := COALESCE(custom_end_date, NOW());
        ELSE start_date := '1970-01-01'::TIMESTAMP; -- All time
    END CASE;

    -- Calculate average loss for losing trades within the date range (as a positive number)
    SELECT COALESCE(AVG(
        ABS(CASE
            WHEN options.strategy_type ILIKE '%long%' THEN (options.exit_price - options.entry_price) * options.number_of_contracts - options.commissions
            WHEN options.strategy_type ILIKE '%short%' THEN (options.entry_price - options.exit_price) * options.number_of_contracts - options.commissions
            WHEN options.trade_direction = 'Bullish' THEN (options.exit_price - options.entry_price) * options.number_of_contracts - options.commissions
            WHEN options.trade_direction = 'Bearish' THEN (options.entry_price - options.exit_price) * options.number_of_contracts - options.commissions
            ELSE 0
        END)
    ), 0) INTO average_loss
    FROM public.options
    WHERE options.user_id = $1
    AND options.status = 'closed'
    AND options.exit_date BETWEEN start_date AND end_date
    AND (
        -- For long positions (BUY), losing trades have lower exit prices
        (options.strategy_type ILIKE '%long%' AND options.exit_price < options.entry_price) OR
        -- For short positions (SELL), losing trades have higher exit prices
        (options.strategy_type ILIKE '%short%' AND options.exit_price > options.entry_price) OR
        -- For bullish trades, losing when exit_price < entry_price
        (options.trade_direction = 'Bullish' AND options.exit_price < options.entry_price) OR
        -- For bearish trades, losing when exit_price > entry_price
        (options.trade_direction = 'Bearish' AND options.exit_price > options.entry_price)
    );

    RETURN average_loss;
END;
$$ LANGUAGE plpgsql;

-- Testing with Supabase SQL Editor
-- Testing on supabase SQL Editor
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.option_average_loss('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.option_average_loss(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid,
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;
*/


-- Function to calculate Net Profit and Loss (P&L) for option trades with date range filtering
-- Net P&L = Sum of (Profit/Loss for each closed trade)
-- For long positions: P&L = (Exit Price - Entry Price) * Number of Contracts * 100 - Commissions
-- For short positions: P&L = (Entry Price - Exit Price) * Number of Contracts * 100 - Commissions
-- (Multiplied by 100 as standard options contract represents 100 shares)
CREATE OR REPLACE FUNCTION public.option_net_pnl(
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
        COALESCE(ROUND(SUM(
            CASE
                -- Long positions (buy to open, sell to close)
                WHEN o.strategy_type ILIKE '%long%' OR o.trade_direction = 'Bullish' THEN
                    (COALESCE(o.exit_price, 0) - o.entry_price) * o.number_of_contracts * 100 - COALESCE(o.commissions, 0)
                -- Short positions (sell to open, buy to close)
                WHEN o.strategy_type ILIKE '%short%' OR o.trade_direction = 'Bearish' THEN
                    (o.entry_price - COALESCE(o.exit_price, 0)) * o.number_of_contracts * 100 - COALESCE(o.commissions, 0)
                ELSE 0
            END
        ), 2), 0) AS net_pnl
    FROM
        public.options o
    WHERE
        o.user_id = auth.uid()
        AND o.status = 'closed'
        AND o.exit_date IS NOT NULL
        AND (
            (p_time_range = '7d' AND o.exit_date >= (CURRENT_DATE - INTERVAL '7 days'))
            OR (p_time_range = '30d' AND o.exit_date >= (CURRENT_DATE - INTERVAL '30 days'))
            OR (p_time_range = '90d' AND o.exit_date >= (CURRENT_DATE - INTERVAL '90 days'))
            OR (p_time_range = '1y' AND o.exit_date >= (CURRENT_DATE - INTERVAL '1 year'))
            OR (p_time_range = 'ytd' AND o.exit_date >= DATE_TRUNC('year', CURRENT_DATE))
            OR (p_time_range = 'custom' AND
                (p_custom_start_date IS NULL OR o.exit_date >= p_custom_start_date) AND
                (p_custom_end_date IS NULL OR o.exit_date <= p_custom_end_date))
            OR (p_time_range = 'all_time')
        );
$$;

/*
Old function
CREATE OR REPLACE FUNCTION public.option_net_pnl(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    net_pnl numeric;
    start_date TIMESTAMP WITH TIME ZONE;
    end_date TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- Set date range based on period_type
    CASE period_type
        WHEN '7d' THEN start_date := NOW() - INTERVAL '7 days';
        WHEN '30d' THEN start_date := NOW() - INTERVAL '30 days';
        WHEN '90d' THEN start_date := NOW() - INTERVAL '90 days';
        WHEN '1y' THEN start_date := NOW() - INTERVAL '1 year';
        WHEN 'custom' THEN
            start_date := custom_start_date;
            end_date := COALESCE(custom_end_date, NOW());
        ELSE start_date := '1970-01-01'::TIMESTAMP; -- All time
    END CASE;

    -- Calculate total P&L for closed option trades within the date range
    SELECT COALESCE(SUM(
        CASE
            -- Long positions (buy to open, sell to close)
            WHEN o.strategy_type ILIKE '%long%' OR o.trade_direction = 'Bullish' THEN
                (o.exit_price - o.entry_price) * o.number_of_contracts * 100 - o.commissions
            -- Short positions (sell to open, buy to close)
            WHEN o.strategy_type ILIKE '%short%' OR o.trade_direction = 'Bearish' THEN
                (o.entry_price - o.exit_price) * o.number_of_contracts * 100 - o.commissions
            ELSE 0
        END
    ), 0) INTO net_pnl
    FROM public.options o
    WHERE o.user_id = $1
    AND o.status = 'closed'
    AND o.exit_date BETWEEN start_date AND end_date;

    RETURN ROUND(net_pnl, 2);
END;
$$ LANGUAGE plpgsql;

-- Testing with Supabase SQL Editor
-- Testing on supabase SQL Editor
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.option_net_pnl('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.option_net_pnl(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid,
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;
*/


-- Function to calculate risk to reward ratio for option trades with date range filtering
-- Risk/Reward Ratio = Average Loss / Average Gain
CREATE OR REPLACE FUNCTION public.option_risk_reward_ratio(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH gain_loss_data AS (
        SELECT
            public.option_average_gain(p_time_range, p_custom_start_date, p_custom_end_date) AS average_gain,
            public.option_average_loss(p_time_range, p_custom_start_date, p_custom_end_date) AS average_loss
    )
    SELECT
        ROUND(
            CASE
                WHEN COALESCE(average_gain, 0) > 0 THEN average_loss / average_gain
                ELSE 0
            END,
            2
        ) AS risk_reward_ratio
    FROM gain_loss_data;
$$;

-- Testing examples with new parameter structure:
-- SELECT option_risk_reward_ratio('7d');  -- Last 7 days
-- SELECT option_risk_reward_ratio('30d'); -- Last 30 days
-- SELECT option_risk_reward_ratio('ytd'); -- Year to date
-- SELECT option_risk_reward_ratio();      -- All time (default)

-- Custom date range test:
-- SELECT option_risk_reward_ratio(
--     'custom',
--     '2024-01-01'::DATE,
--     '2024-12-31'::DATE
-- );



/*
Old function
CREATE OR REPLACE FUNCTION public.option_risk_reward_ratio(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    average_gain numeric;
    average_loss numeric;
    risk_reward_ratio numeric;
BEGIN
    -- Get average gain for winning trades with the same date range
    EXECUTE 'SELECT public.option_average_gain($1, $2, $3, $4)'
    INTO average_gain
    USING user_id, period_type, custom_start_date, custom_end_date;

    -- Get average loss for losing trades with the same date range
    EXECUTE 'SELECT public.option_average_loss($1, $2, $3, $4)'
    INTO average_loss
    USING user_id, period_type, custom_start_date, custom_end_date;

    -- Calculate risk/reward ratio (avoid division by zero)
    IF COALESCE(average_gain, 0) > 0 THEN
        risk_reward_ratio := average_loss / average_gain;
    ELSE
        risk_reward_ratio := 0;
    END IF;

    RETURN ROUND(COALESCE(risk_reward_ratio, 0), 2);
END;
$$ LANGUAGE plpgsql;

-- Testing with Supabase SQL Editor
-- Testing on supabase SQL Editor
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.option_risk_reward_ratio('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.option_risk_reward_ratio(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid,
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;
*/

-- Function to calculate win rate percentage for option trades with date range filtering
-- Win rate = (number of winning trades / total number of closed trades) * 100
CREATE OR REPLACE FUNCTION public.option_win_rate(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH trade_counts AS (
        SELECT
            COUNT(*) AS total_closed_trades,
            COUNT(
                CASE
                    WHEN (
                        -- For long positions (BUY), winning trades have higher exit prices
                        (strategy_type ILIKE '%long%' AND exit_price > entry_price) OR
                        -- For short positions (SELL), winning trades have lower exit prices
                        (strategy_type ILIKE '%short%' AND exit_price < entry_price) OR
                        -- For bullish trades, winning when exit_price > entry_price
                        (trade_direction = 'Bullish' AND exit_price > entry_price) OR
                        -- For bearish trades, winning when exit_price < entry_price
                        (trade_direction = 'Bearish' AND exit_price < entry_price)
                    ) THEN 1
                END
            ) AS winning_trades
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
            WHEN total_closed_trades > 0 THEN
                ROUND((winning_trades::NUMERIC / total_closed_trades::NUMERIC) * 100, 2)
            ELSE 0
        END AS win_rate
    FROM trade_counts;
$$;

-- Testing examples with new parameter structure:
-- SELECT option_win_rate('7d');   -- Last 7 days
-- SELECT option_win_rate('30d');  -- Last 30 days
-- SELECT option_win_rate('90d');  -- Last 90 days
-- SELECT option_win_rate('1y');   -- Last year
-- SELECT option_win_rate('ytd');  -- Year to date
-- SELECT option_win_rate();       -- All time (default)

-- Custom date range test:
-- SELECT option_win_rate(
--     'custom',
--     '2024-01-01'::DATE,
--     '2024-12-31'::DATE
-- );

/*
Old function
CREATE OR REPLACE FUNCTION public.option_win_rate(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    total_closed_trades integer;
    winning_trades integer;
    win_rate numeric;
    start_date TIMESTAMP WITH TIME ZONE;
    end_date TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- Set date range based on period_type
    CASE period_type
        WHEN '7d' THEN start_date := NOW() - INTERVAL '7 days';
        WHEN '30d' THEN start_date := NOW() - INTERVAL '30 days';
        WHEN '90d' THEN start_date := NOW() - INTERVAL '90 days';
        WHEN '1y' THEN start_date := NOW() - INTERVAL '1 year';
        WHEN 'custom' THEN
            start_date := custom_start_date;
            end_date := COALESCE(custom_end_date, NOW());
        ELSE start_date := '1970-01-01'::TIMESTAMP; -- All time
    END CASE;

    -- Count total closed trades for the user within the date range
    SELECT COUNT(*) INTO total_closed_trades
    FROM public.options
    WHERE options.user_id = $1
    AND options.status = 'closed'
    AND options.exit_date BETWEEN start_date AND end_date;

    -- Count winning trades for the user within the date range
    -- A winning trade has a positive profit/loss (exit_price > entry_price for long positions, exit_price < entry_price for short positions)
    SELECT COUNT(*) INTO winning_trades
    FROM public.options
    WHERE options.user_id = $1
    AND options.status = 'closed'
    AND options.exit_date BETWEEN start_date AND end_date
    AND (
        -- For long positions (BUY), winning trades have higher exit prices
        (options.strategy_type ILIKE '%long%' AND options.exit_price > options.entry_price) OR
        -- For short positions (SELL), winning trades have lower exit prices
        (options.strategy_type ILIKE '%short%' AND options.exit_price < options.entry_price) OR
        -- For bullish trades, winning when exit_price > entry_price
        (options.trade_direction = 'Bullish' AND options.exit_price > options.entry_price) OR
        -- For bearish trades, winning when exit_price < entry_price
        (options.trade_direction = 'Bearish' AND options.exit_price < options.entry_price)
        -- Note: Neutral trades are not specifically handled here as their win condition depends on the specific strategy
    );

    -- Calculate win rate percentage with 2 decimal places
    IF total_closed_trades > 0 THEN
        win_rate := ROUND((winning_trades::numeric / total_closed_trades::numeric) * 100, 2);
    ELSE
        win_rate := 0;
    END IF;

    RETURN win_rate;
END;
$$ LANGUAGE plpgsql;


-- Testing with Supabase SQL Editor
-- Testing on supabase SQL Editor
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.option_win_rate('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.option_win_rate(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid,
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;
*/

-- Function to calculate trade expectancy for option trades with date range filtering
-- Trade Expectancy = (Win Rate * Average Gain) - (Loss Rate * Average Loss)
CREATE OR REPLACE FUNCTION public.option_trade_expectancy(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH expectancy_data AS (
        SELECT
            public.option_win_rate(p_time_range, p_custom_start_date, p_custom_end_date) / 100.0 AS win_rate_decimal,
            public.option_average_gain(p_time_range, p_custom_start_date, p_custom_end_date) AS avg_gain,
            public.option_average_loss(p_time_range, p_custom_start_date, p_custom_end_date) AS avg_loss
    )
    SELECT
        ROUND(
            CASE
                WHEN win_rate_decimal IS NOT NULL
                 AND avg_gain IS NOT NULL
                 AND avg_loss IS NOT NULL THEN
                    (win_rate_decimal * avg_gain) - ((1 - win_rate_decimal) * avg_loss)
                ELSE 0
            END,
            2
        ) AS trade_expectancy
    FROM expectancy_data;
$$;

-- Testing examples with new parameter structure:
-- SELECT option_trade_expectancy('7d');   -- Last 7 days
-- SELECT option_trade_expectancy('30d');  -- Last 30 days
-- SELECT option_trade_expectancy('90d');  -- Last 90 days
-- SELECT option_trade_expectancy('1y');   -- Last year
-- SELECT option_trade_expectancy('ytd');  -- Year to date
-- SELECT option_trade_expectancy();       -- All time (default)

-- Custom date range test:
-- SELECT option_trade_expectancy(
--     'custom',
--     '2024-01-01'::DATE,
--     '2024-12-31'::DATE
-- );

/*
Old function
CREATE OR REPLACE FUNCTION public.option_trade_expectancy(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    win_rate numeric;
    avg_gain numeric;
    avg_loss numeric;
    trade_expectancy numeric;
    win_rate_decimal numeric;
    start_date TIMESTAMP WITH TIME ZONE;
    end_date TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- Set date range based on period_type
    CASE period_type
        WHEN '7d' THEN start_date := NOW() - INTERVAL '7 days';
        WHEN '30d' THEN start_date := NOW() - INTERVAL '30 days';
        WHEN '90d' THEN start_date := NOW() - INTERVAL '90 days';
        WHEN '1y' THEN start_date := NOW() - INTERVAL '1 year';
        WHEN 'custom' THEN
            start_date := custom_start_date;
            end_date := COALESCE(custom_end_date, NOW());
        ELSE start_date := '1970-01-01'::TIMESTAMP; -- All time
    END CASE;

    -- Get win rate with the same date range (as a decimal between 0 and 1)
    EXECUTE 'SELECT public.option_win_rate($1, $2, $3, $4) / 100.0'
    INTO win_rate_decimal
    USING user_id, period_type, custom_start_date, custom_end_date;

    -- Get average gain for winning trades with the same date range
    EXECUTE 'SELECT public.option_average_gain($1, $2, $3, $4)'
    INTO avg_gain
    USING user_id, period_type, custom_start_date, custom_end_date;

    -- Get average loss for losing trades with the same date range
    EXECUTE 'SELECT public.option_average_loss($1, $2, $3, $4)'
    INTO avg_loss
    USING user_id, period_type, custom_start_date, custom_end_date;

    -- Calculate trade expectancy
    IF win_rate_decimal IS NOT NULL AND avg_gain IS NOT NULL AND avg_loss IS NOT NULL THEN
        trade_expectancy := (win_rate_decimal * avg_gain) - ((1 - win_rate_decimal) * avg_loss);
    ELSE
        trade_expectancy := 0;
    END IF;

    RETURN ROUND(COALESCE(trade_expectancy, 0), 2);
END;
$$ LANGUAGE plpgsql;

-- Testing with Supabase SQL Editor
-- Testing on supabase SQL Editor
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.option_trade_expectancy('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.option_trade_expectancy(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid,
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;
*/


-- Function to calculate average position size for options trades
CREATE OR REPLACE FUNCTION public.get_options_average_position_size(
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
        COALESCE(ROUND(AVG(
            CASE
                WHEN number_of_contracts > 0 THEN (total_premium * number_of_contracts * 100) -- Premium * contracts * 100 (standard options multiplier)
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
        );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_options_average_position_size(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_options_average_position_size IS 'Returns the average position size for options trades.

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
- Average position size in dollars (premium * number_contracts * 100) as NUMERIC
- Returns 0 if no trades found matching the criteria

Example usage:
- Last 30 days: SELECT get_options_average_position_size(''30d'');
- Custom range: SELECT get_options_average_position_size(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT get_options_average_position_size();';

-- Testing on Supabase SQL Editor
-- SELECT get_options_average_position_size('30d');  -- Last 30 days
-- SELECT get_options_average_position_size('ytd');  -- Year to date
-- SELECT get_options_average_position_size();       -- All time (default)


-- Function to calculate average risk per trade for options
CREATE OR REPLACE FUNCTION public.get_options_average_risk_per_trade(
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
        COALESCE(ROUND(AVG(
            CASE
                WHEN option_type = 'CALL' AND trade_direction = 'BUY' THEN (total_premium * number_of_contracts * 100)  -- Max risk is premium paid
                WHEN option_type = 'PUT' AND trade_direction = 'BUY' THEN (total_premium * number_of_contracts * 100)   -- Max risk is premium paid
                WHEN option_type = 'CALL' AND trade_direction = 'SELL' THEN
                    CASE
                        WHEN strike_price IS NOT NULL THEN ((strike_price - entry_price + total_premium) * number_of_contracts * 100)  -- Max risk is (strike - entry + premium)
                        ELSE (total_premium * number_of_contracts * 100)  -- Fallback to just premium if strike is not set
                    END
                WHEN option_type = 'PUT' AND trade_direction = 'SELL' THEN
                    CASE
                        WHEN strike_price IS NOT NULL THEN ((entry_price - strike_price + total_premium) * number_of_contracts * 100)  -- Max risk is (entry - strike + premium)
                        ELSE (total_premium * number_of_contracts * 100)  -- Fallback to just premium if strike is not set
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
        );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_options_average_risk_per_trade(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_options_average_risk_per_trade IS 'Returns the average risk per trade for options.

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

Risk Calculation:
- For long options (BUY): Risk is limited to premium paid (total_premium * number_of_contracts * 100)
- For short calls (SELL CALL): Risk is (strike - entry + premium) * contracts * 100
- For short puts (SELL PUT): Risk is (entry - strike + premium) * contracts * 100

Returns:
- Average risk per trade in dollars as NUMERIC
- Returns 0 if no trades found matching the criteria

Example usage:
- Last 30 days: SELECT get_options_average_risk_per_trade(''30d'');
- Custom range: SELECT get_options_average_risk_per_trade(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT get_options_average_risk_per_trade();';

-- Testing on Supabase SQL Editor
-- SELECT get_options_average_risk_per_trade('30d');  -- Last 30 days
-- SELECT get_options_average_risk_per_trade('ytd');  -- Year to date
-- SELECT get_options_average_risk_per_trade();       -- All time (default)


-- Function to calculate loss rate for options trades
CREATE OR REPLACE FUNCTION public.get_options_loss_rate(
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
        SELECT
            COUNT(*) as total_trades,
            SUM(CASE WHEN
                    (CASE
                        WHEN status = 'closed' AND exit_price IS NOT NULL THEN
                            (exit_price - entry_price) * number_of_contracts * 100 - total_premium
                        ELSE 0
                    END) < 0
                THEN 1 ELSE 0 END) as losing_trades
        FROM public.options
        WHERE
            user_id = auth.uid()
            AND status = 'closed'
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
        CASE
            WHEN total_trades = 0 THEN 0
            ELSE ROUND((losing_trades::NUMERIC / total_trades) * 100, 2)
        END as loss_rate_percentage
    FROM trade_stats;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_options_loss_rate(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_options_loss_rate IS 'Returns the loss rate (percentage of losing trades) for options trades.

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
- Loss rate as a percentage (0-100) with 2 decimal places
- Returns 0 if no trades found matching the criteria

Example usage:
- Last 30 days: SELECT get_options_loss_rate(''30d'');
- Custom range: SELECT get_options_loss_rate(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT get_options_loss_rate();';

-- Testing on Supabase SQL Editor
-- SELECT get_options_loss_rate('30d');  -- Last 30 days
-- SELECT get_options_loss_rate('ytd');  -- Year to date
-- SELECT get_options_loss_rate();       -- All time (default)
