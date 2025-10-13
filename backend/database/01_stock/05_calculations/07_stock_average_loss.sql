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
