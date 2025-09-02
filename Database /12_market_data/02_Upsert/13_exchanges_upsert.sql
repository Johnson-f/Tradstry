-- ----------------------------------------------------------------------------
-- Function: upsert_exchange
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_exchange(
    p_exchange_code TEXT,
    p_exchange_name TEXT,
    p_country TEXT,
    p_timezone TEXT,
    p_currency TEXT,
    p_data_provider TEXT
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO exchanges (
        exchange_code, exchange_name, country, timezone, currency, data_provider
    )
    VALUES (
        p_exchange_code, p_exchange_name, p_country, p_timezone, p_currency, p_data_provider
    )
    ON CONFLICT (exchange_code, data_provider) DO UPDATE SET
        exchange_name = COALESCE(p_exchange_name, excluded.exchange_name),
        country = COALESCE(p_country, excluded.country),
        timezone = COALESCE(p_timezone, excluded.timezone),
        currency = COALESCE(p_currency, excluded.currency),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Permissions
-- ----------------------------------------------------------------------------

ALTER FUNCTION upsert_exchange(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) OWNER TO api_user;
GRANT EXECUTE ON FUNCTION upsert_exchange(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO api_user;
