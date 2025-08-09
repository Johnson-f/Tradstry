-- Function to calculate average gain for stock trades with date range filtering
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

-- Testing on supabase SQL Editor 
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.stock_average_gain('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range 
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.stock_average_gain(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid, 
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;



-- Old function body
/*
CREATE OR REPLACE FUNCTION public.stock_average_gain(
    user_id uuid
)
RETURNS numeric AS $$

DECLARE
    average_gain numeric;
BEGIN
    -- Calculate average gain for winning trades
    SELECT COALESCE(AVG(
        CASE 
            WHEN stocks.trade_type = 'BUY' THEN (stocks.exit_price - stocks.entry_price) * stocks.number_shares - stocks.commissions
            WHEN stocks.trade_type = 'SELL' THEN (stocks.entry_price - stocks.exit_price) * stocks.number_shares - stocks.commissions
        END
    ), 0) INTO average_gain
    FROM public.stocks
    WHERE stocks.user_id = stock_average_gain.user_id
    AND stocks.status = 'closed'
    AND (
        (stocks.trade_type = 'BUY' AND stocks.exit_price > stocks.entry_price) OR
        (stocks.trade_type = 'SELL' AND stocks.exit_price < stocks.entry_price)
    );
    
    RETURN average_gain;
END;
$$ LANGUAGE plpgsql;
-- Testing on supabase SQL editor
-- SELECT public.stock_average_gain('99369696-8c65-43bb-96bc-5999275e8be1'::uuid) as average_gain;
*/
