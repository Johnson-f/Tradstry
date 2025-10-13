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
