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
