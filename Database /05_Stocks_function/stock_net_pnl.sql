-- Function to calculate Net Profit and Loss (P&L) for stock trades
-- Net P&L = Sum of (Profit/Loss for each closed trade)
-- For BUY trades: P&L = (Exit Price - Entry Price) * Number of Shares - Commissions
-- For SELL trades: P&L = (Entry Price - Exit Price) * Number of Shares - Commissions
CREATE OR REPLACE FUNCTION public.stock_net_pnl(user_id uuid)
RETURNS numeric AS $$
DECLARE
    net_pnl numeric;
BEGIN
    -- Calculate total P&L for all closed trades
    SELECT COALESCE(SUM(
        CASE 
            WHEN s.trade_type = 'BUY' THEN 
                (s.exit_price - s.entry_price) * s.number_shares - s.commissions
            WHEN s.trade_type = 'SELL' THEN 
                (s.entry_price - s.exit_price) * s.number_shares - s.commissions
            ELSE 0
        END
    ), 0) INTO net_pnl
    FROM public.stocks s
    WHERE s.user_id = stock_net_pnl.user_id
    AND s.status = 'closed';
    
    RETURN ROUND(net_pnl, 2);
END;
$$ LANGUAGE plpgsql;

-- Testing on supabase SQL editor
-- SELECT public.stock_net_pnl('99369696-8c65-43bb-96bc-5999275e8be1'::uuid) as net_pnl;
