-- ----------------------------------------------------------------------------
-- Function: upsert_options_chain
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_options_chain(
    p_symbol TEXT,
    p_expiration_date DATE,
    p_strike_price NUMERIC,
    p_option_type TEXT,
    p_contract_symbol TEXT,
    p_last_price NUMERIC,
    p_bid NUMERIC,
    p_ask NUMERIC,
    p_volume BIGINT,
    p_open_interest BIGINT,
    p_implied_volatility NUMERIC,
    p_delta NUMERIC,
    p_gamma NUMERIC,
    p_theta NUMERIC,
    p_vega NUMERIC,
    p_rho NUMERIC,
    p_intrinsic_value NUMERIC,
    p_time_value NUMERIC,
    p_data_provider TEXT,
    p_data_source_url TEXT
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO options_chain (
        symbol, expiration_date, strike_price, option_type, contract_symbol,
        last_price, bid, ask, volume, open_interest, implied_volatility,
        delta, gamma, theta, vega, rho, intrinsic_value, time_value,
        data_provider, data_source_url
    )
    VALUES (
        p_symbol, p_expiration_date, p_strike_price, p_option_type, p_contract_symbol,
        p_last_price, p_bid, p_ask, p_volume, p_open_interest, p_implied_volatility,
        p_delta, p_gamma, p_theta, p_vega, p_rho, p_intrinsic_value, p_time_value,
        p_data_provider, p_data_source_url
    )
    ON CONFLICT (symbol, expiration_date, strike_price, option_type, data_provider) DO UPDATE SET
        contract_symbol = COALESCE(p_contract_symbol, excluded.contract_symbol),
        last_price = COALESCE(p_last_price, excluded.last_price),
        bid = COALESCE(p_bid, excluded.bid),
        ask = COALESCE(p_ask, excluded.ask),
        volume = COALESCE(p_volume, excluded.volume),
        open_interest = COALESCE(p_open_interest, excluded.open_interest),
        implied_volatility = COALESCE(p_implied_volatility, excluded.implied_volatility),
        delta = COALESCE(p_delta, excluded.delta),
        gamma = COALESCE(p_gamma, excluded.gamma),
        theta = COALESCE(p_theta, excluded.theta),
        vega = COALESCE(p_vega, excluded.vega),
        rho = COALESCE(p_rho, excluded.rho),
        intrinsic_value = COALESCE(p_intrinsic_value, excluded.intrinsic_value),
        time_value = COALESCE(p_time_value, excluded.time_value),
        data_source_url = COALESCE(p_data_source_url, excluded.data_source_url),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Permissions
-- ----------------------------------------------------------------------------

ALTER FUNCTION upsert_options_chain(TEXT, DATE, NUMERIC, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, BIGINT, BIGINT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) OWNER TO api_user;
GRANT EXECUTE ON FUNCTION upsert_options_chain(TEXT, DATE, NUMERIC, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, BIGINT, BIGINT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) TO api_user;
