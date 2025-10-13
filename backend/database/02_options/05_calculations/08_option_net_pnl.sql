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
