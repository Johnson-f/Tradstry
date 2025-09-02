-- ----------------------------------------------------------------------------
-- Function: upsert_stock_quote
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_stock_quote(
    p_symbol TEXT,
    p_quote_timestamp TIMESTAMP WITH TIME ZONE,
    p_price NUMERIC,
    p_bid NUMERIC,
    p_ask NUMERIC,
    p_bid_size BIGINT,
    p_ask_size BIGINT,
    p_volume BIGINT,
    p_day_high NUMERIC,
    p_day_low NUMERIC,
    p_day_open NUMERIC,
    p_previous_close NUMERIC,
    p_change_amount NUMERIC,
    p_change_percent NUMERIC,
    p_data_provider TEXT,
    p_data_source_url TEXT
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO stock_quotes (
        symbol, quote_timestamp, price, bid, ask, bid_size, ask_size, volume,
        day_high, day_low, day_open, previous_close, change_amount, change_percent,
        data_provider, data_source_url
    )
    VALUES (
        p_symbol, p_quote_timestamp, p_price, p_bid, p_ask, p_bid_size, p_ask_size, p_volume,
        p_day_high, p_day_low, p_day_open, p_previous_close, p_change_amount, p_change_percent,
        p_data_provider, p_data_source_url
    )
    ON CONFLICT (symbol, quote_timestamp, data_provider) DO UPDATE SET
        price = COALESCE(p_price, excluded.price),
        bid = COALESCE(p_bid, excluded.bid),
        ask = COALESCE(p_ask, excluded.ask),
        bid_size = COALESCE(p_bid_size, excluded.bid_size),
        ask_size = COALESCE(p_ask_size, excluded.ask_size),
        volume = COALESCE(p_volume, excluded.volume),
        day_high = COALESCE(p_day_high, excluded.day_high),
        day_low = COALESCE(p_day_low, excluded.day_low),
        day_open = COALESCE(p_day_open, excluded.day_open),
        previous_close = COALESCE(p_previous_close, excluded.previous_close),
        change_amount = COALESCE(p_change_amount, excluded.change_amount),
        change_percent = COALESCE(p_change_percent, excluded.change_percent),
        data_source_url = COALESCE(p_data_source_url, excluded.data_source_url),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Permissions
-- ----------------------------------------------------------------------------

ALTER FUNCTION upsert_stock_quote(TEXT, TIMESTAMP WITH TIME ZONE, NUMERIC, NUMERIC, NUMERIC, BIGINT, BIGINT, BIGINT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) OWNER TO api_user;
GRANT EXECUTE ON FUNCTION upsert_stock_quote(TEXT, TIMESTAMP WITH TIME ZONE, NUMERIC, NUMERIC, NUMERIC, BIGINT, BIGINT, BIGINT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) TO api_user;
