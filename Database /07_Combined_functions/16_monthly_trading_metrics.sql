-- Function to calculate monthly trading metrics from both stocks and options
CREATE OR REPLACE FUNCTION public.get_monthly_trading_metrics()
RETURNS TABLE (
    month_start_date DATE,
    month_end_date DATE,
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
    v_month_start DATE;
    v_month_end DATE;
BEGIN
    -- Get the start of the current month and end of the current month
    v_month_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    v_month_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
    
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
            AND exit_date >= v_month_start 
            AND exit_date <= v_month_end
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
            AND exit_date >= v_month_start 
            AND exit_date <= v_month_end
            AND status = 'closed'
    ),
    
    -- Calculate metrics
    trade_metrics AS (
        SELECT
            v_month_start as month_start_date,
            v_month_end as month_end_date,
            COUNT(*) as total_trades,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as profitable_trades,
            SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as unprofitable_trades,
            CASE 
                WHEN COUNT(*) = 0 THEN 0 
                ELSE ROUND(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2) 
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
                ELSE ROUND(SUM(pnl) / NULLIF(COUNT(*), 0), 2) 
            END as expectancy_per_trade
        FROM combined_trades
    )
    
    SELECT 
        tm.month_start_date,
        tm.month_end_date,
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
GRANT EXECUTE ON FUNCTION public.get_monthly_trading_metrics() TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_monthly_trading_metrics IS 'Returns monthly trading metrics from both stocks and options for the authenticated user for the current month.

Example usage:
SELECT * FROM get_monthly_trading_metrics();';
