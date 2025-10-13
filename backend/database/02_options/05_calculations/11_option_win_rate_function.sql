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
