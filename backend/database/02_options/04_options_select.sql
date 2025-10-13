-- Function to get all options for the current user
CREATE OR REPLACE FUNCTION public.select_options()
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR,
    strategy_type TEXT,
    trade_direction VARCHAR,
    number_of_contracts INTEGER,
    option_type VARCHAR,
    strike_price NUMERIC,
    expiration_date TIMESTAMP,
    entry_price NUMERIC,
    exit_price NUMERIC,
    total_premium NUMERIC,
    commissions NUMERIC,
    implied_volatility NUMERIC,
    entry_date TIMESTAMP,
    exit_date TIMESTAMP,
    status TRADE_STATUS,
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
        strategy_type,
        trade_direction,
        number_of_contracts,
        option_type,
        strike_price,
        expiration_date,
        entry_price,
        exit_price,
        total_premium,
        commissions,
        implied_volatility,
        entry_date,
        exit_date,
        status,
        created_at,
        updated_at
    FROM public.options
    WHERE user_id = auth.uid()
    ORDER BY entry_date DESC;
$$;

-- Function to get a specific option by ID for the current user
CREATE OR REPLACE FUNCTION public.get_option_by_id(p_option_id INTEGER)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR,
    strategy_type TEXT,
    trade_direction VARCHAR,
    number_of_contracts INTEGER,
    option_type VARCHAR,
    strike_price NUMERIC,
    expiration_date TIMESTAMP,
    entry_price NUMERIC,
    exit_price NUMERIC,
    total_premium NUMERIC,
    commissions NUMERIC,
    implied_volatility NUMERIC,
    entry_date TIMESTAMP,
    exit_date TIMESTAMP,
    status TRADE_STATUS,
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
        strategy_type,
        trade_direction,
        number_of_contracts,
        option_type,
        strike_price,
        expiration_date,
        entry_price,
        exit_price,
        total_premium,
        commissions,
        implied_volatility,
        entry_date,
        exit_date,
        status,
        created_at,
        updated_at
    FROM public.options
    WHERE id = p_option_id
    AND user_id = auth.uid();
$$;
