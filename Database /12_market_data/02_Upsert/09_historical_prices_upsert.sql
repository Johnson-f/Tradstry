-- ----------------------------------------------------------------------------
-- Function: upsert_historical_price
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_historical_price(
    p_symbol TEXT,
    p_date DATE,
    p_open NUMERIC,
    p_high NUMERIC,
    p_low NUMERIC,
    p_close NUMERIC,
    p_adjusted_close NUMERIC,
    p_volume BIGINT,
    p_dividend_amount NUMERIC,
    p_split_coefficient NUMERIC,
    p_data_provider TEXT,
    p_data_source_url TEXT
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO historical_prices (
        symbol, date, open, high, low, close, adjusted_close, volume, 
        dividend_amount, split_coefficient, data_provider, data_source_url
    )
    VALUES (
        p_symbol, p_date, p_open, p_high, p_low, p_close, p_adjusted_close, p_volume, 
        p_dividend_amount, p_split_coefficient, p_data_provider, p_data_source_url
    )
    ON CONFLICT (symbol, date, data_provider) DO UPDATE SET
        open = COALESCE(p_open, excluded.open),
        high = COALESCE(p_high, excluded.high),
        low = COALESCE(p_low, excluded.low),
        close = COALESCE(p_close, excluded.close),
        adjusted_close = COALESCE(p_adjusted_close, excluded.adjusted_close),
        volume = COALESCE(p_volume, excluded.volume),
        dividend_amount = COALESCE(p_dividend_amount, excluded.dividend_amount),
        split_coefficient = COALESCE(p_split_coefficient, excluded.split_coefficient),
        data_source_url = COALESCE(p_data_source_url, excluded.data_source_url),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Permissions
-- ----------------------------------------------------------------------------

ALTER FUNCTION upsert_historical_price(TEXT, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BIGINT, NUMERIC, NUMERIC, TEXT, TEXT) OWNER TO api_user;
GRANT EXECUTE ON FUNCTION upsert_historical_price(TEXT, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BIGINT, NUMERIC, NUMERIC, TEXT, TEXT) TO api_user;
