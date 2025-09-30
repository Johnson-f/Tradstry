-- Function to calculate weekly trading metrics from both stocks and options
CREATE OR REPLACE FUNCTION public.get_weekly_trading_metrics()
RETURNS TABLE (
    week_start_date DATE,
    week_end_date DATE,
    total_trades BIGINT,
    profitable_trades BIGINT,
    unprofitable_trades BIGINT,
    win_rate NUMERIC(10,2),
    net_pnl NUMERIC(20,2),
    profit_factor NUMERIC(10,2),
    max_drawdown NUMERIC(20,2),
    expectancy_per_trade NUMERIC(20,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_week_start DATE;
    v_week_end DATE;
BEGIN
    -- Get the start of the current week (Sunday) and end of the week (Saturday)
    v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;
    v_week_end := (v_week_start + INTERVAL '6 days')::DATE;
    
    RETURN QUERY
    WITH 
    -- Combine stocks and options data
    combined_trades AS (
        -- Stock trades
        SELECT 
            'STOCK' as trade_type,
            id,
            entry_date,
            exit_date,
            (exit_price - entry_price) * number_shares - commissions as pnl,
            (exit_price - entry_price) * number_shares - commissions as profit_loss,
            CASE WHEN (exit_price - entry_price) * number_shares - commissions > 0 THEN 1 ELSE 0 END as is_profitable,
            commissions
        FROM public.stocks
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_date >= v_week_start 
            AND exit_date <= v_week_end
            AND status = 'closed'
        
        UNION ALL
        
        -- Options trades
        SELECT 
            'OPTION' as trade_type,
            id,
            entry_date,
            exit_date,
            (exit_price - entry_price) * number_of_contracts * 100 - commissions as pnl,
            (exit_price - entry_price) * number_of_contracts * 100 - commissions as profit_loss,
            CASE WHEN (exit_price - entry_price) * number_of_contracts * 100 - commissions > 0 THEN 1 ELSE 0 END as is_profitable,
            commissions
        FROM public.options
        WHERE 
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_date >= v_week_start 
            AND exit_date <= v_week_end
            AND status = 'closed'
    ),
    
    -- Calculate metrics
    trade_metrics AS (
        SELECT
            v_week_start as week_start_date,
            v_week_end as week_end_date,
            COUNT(*) as total_trades,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as profitable_trades,
            SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as unprofitable_trades,
            CASE 
                WHEN COUNT(*) = 0 THEN 0 
                ELSE ROUND(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) 
            END as win_rate,
            COALESCE(SUM(pnl), 0) as net_pnl,
            CASE 
                WHEN SUM(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END) = 0 THEN NULL
                ELSE ROUND(SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) / 
                      NULLIF(SUM(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END), 0), 2)
            END as profit_factor,
            (
                SELECT MIN(cumulative_pnl) as max_drawdown
                FROM (
                    SELECT 
                        SUM(pnl) OVER (ORDER BY exit_date) - pnl as running_pnl,
                        SUM(pnl) OVER (ORDER BY exit_date) as cumulative_pnl
                    FROM combined_trades
                ) t
                WHERE running_pnl > 0
            ) as max_drawdown,
            CASE 
                WHEN COUNT(*) = 0 THEN 0 
                ELSE ROUND(SUM(pnl) / COUNT(*), 2) 
            END as expectancy_per_trade
        FROM combined_trades
    )
    
    SELECT 
        tm.week_start_date,
        tm.week_end_date,
        tm.total_trades,
        tm.profitable_trades,
        tm.unprofitable_trades,
        tm.win_rate,
        tm.net_pnl,
        COALESCE(tm.profit_factor, 0) as profit_factor,
        COALESCE(ABS(tm.max_drawdown), 0) as max_drawdown,
        tm.expectancy_per_trade
    FROM trade_metrics tm;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_weekly_trading_metrics() TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_weekly_trading_metrics IS 'Returns weekly trading metrics from both stocks and options for the authenticated user for the current week (Sunday to Saturday)'.

--Example usage:
--SELECT * FROM get_weekly_trading_metrics();';