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
