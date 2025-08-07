-- Function to calculate Net Profit and Loss (P&L) for option trades
-- Net P&L = Sum of (Profit/Loss for each closed trade)
-- For long positions: P&L = (Exit Price - Entry Price) * Number of Contracts * 100 - Commissions
-- For short positions: P&L = (Entry Price - Exit Price) * Number of Contracts * 100 - Commissions
-- (Multiplied by 100 as standard options contract represents 100 shares)
CREATE OR REPLACE FUNCTION public.option_net_pnl(user_id uuid)
RETURNS numeric AS $$
DECLARE
    net_pnl numeric;
BEGIN
    -- Calculate total P&L for all closed option trades
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
    WHERE o.user_id = option_net_pnl.user_id
    AND o.status = 'closed';
    
    RETURN ROUND(net_pnl, 2);
END;
$$ LANGUAGE plpgsql;

-- Testing on supabase SQL editor
-- SELECT public.option_net_pnl('99369696-8c65-43bb-96bc-5999275e8be1'::uuid) as net_pnl;
