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
