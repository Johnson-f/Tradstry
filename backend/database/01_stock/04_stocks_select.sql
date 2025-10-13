-- Function to get all stocks for the current user
CREATE OR REPLACE FUNCTION public.select_stocks()
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR,
    trade_type TRADE_TYPE_ENUM,
    order_type ORDER_TYPE_ENUM,
    entry_price NUMERIC,
    exit_price NUMERIC,
    stop_loss NUMERIC,
    commissions NUMERIC,
    number_shares NUMERIC,
    take_profit NUMERIC,
    entry_date TIMESTAMP,
    exit_date TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        id,
        symbol,
        trade_type,
        order_type,
        entry_price,
        exit_price,
        stop_loss,
        commissions,
        number_shares,
        take_profit,
        entry_date,
        exit_date,
        created_at,
        updated_at
    FROM public.stocks
    WHERE user_id = auth.uid()
    ORDER BY entry_date DESC;
$$;

-- Function to get a specific stock by ID for the current user
CREATE OR REPLACE FUNCTION public.get_stock_by_id(p_stock_id INTEGER)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR,
    trade_type TRADE_TYPE_ENUM,
    order_type ORDER_TYPE_ENUM,
    entry_price NUMERIC,
    exit_price NUMERIC,
    stop_loss NUMERIC,
    commissions NUMERIC,
    number_shares NUMERIC,
    take_profit NUMERIC,
    entry_date TIMESTAMP,
    exit_date TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        id,
        symbol,
        trade_type,
        order_type,
        entry_price,
        exit_price,
        stop_loss,
        commissions,
        number_shares,
        take_profit,
        entry_date,
        exit_date,
        created_at,
        updated_at
    FROM public.stocks
    WHERE id = p_stock_id
    AND user_id = auth.uid();
$$;
