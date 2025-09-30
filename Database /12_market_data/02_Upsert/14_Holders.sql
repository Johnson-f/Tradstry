-- =============================================
-- Holders Data Upsert Functions
-- Comprehensive upsert functions for all holder types from finance-query API
-- Handles institutional, mutual fund, and insider data
-- =============================================

-- =============================================
-- Function: upsert_institutional_holder
-- Upserts institutional holder data
-- =============================================

CREATE OR REPLACE FUNCTION upsert_institutional_holder(
    p_symbol VARCHAR(10),
    p_holder_name VARCHAR(500),
    p_shares BIGINT,
    p_date_reported TIMESTAMPTZ,
    p_value BIGINT DEFAULT NULL,
    p_data_source VARCHAR(50) DEFAULT 'finance_api'
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    -- Insert or update institutional holder data
    INSERT INTO public.holders (
        symbol,
        holder_type,
        holder_name,
        shares,
        value,
        date_reported,
        data_source
    ) VALUES (
        p_symbol,
        'institutional',
        p_holder_name,
        p_shares,
        p_value,
        p_date_reported,
        p_data_source
    )
    ON CONFLICT (symbol, holder_type, holder_name, date_reported)
    WHERE holder_type = 'institutional'
    DO UPDATE SET
        shares = EXCLUDED.shares,
        value = EXCLUDED.value,
        data_source = EXCLUDED.data_source,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: upsert_mutualfund_holder
-- Upserts mutual fund holder data
-- =============================================

CREATE OR REPLACE FUNCTION upsert_mutualfund_holder(
    p_symbol VARCHAR(10),
    p_holder_name VARCHAR(500),
    p_shares BIGINT,
    p_date_reported TIMESTAMPTZ,
    p_value BIGINT DEFAULT NULL,
    p_data_source VARCHAR(50) DEFAULT 'finance_api'
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    -- Insert or update mutual fund holder data
    INSERT INTO public.holders (
        symbol,
        holder_type,
        holder_name,
        shares,
        value,
        date_reported,
        data_source
    ) VALUES (
        p_symbol,
        'mutualfund',
        p_holder_name,
        p_shares,
        p_value,
        p_date_reported,
        p_data_source
    )
    ON CONFLICT (symbol, holder_type, holder_name, date_reported)
    WHERE holder_type = 'mutualfund'
    DO UPDATE SET
        shares = EXCLUDED.shares,
        value = EXCLUDED.value,
        data_source = EXCLUDED.data_source,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: upsert_insider_transaction
-- Upserts insider transaction data
-- =============================================

CREATE OR REPLACE FUNCTION upsert_insider_transaction(
    p_symbol VARCHAR(10),
    p_insider_name VARCHAR(500),
    p_insider_position VARCHAR(100),
    p_transaction_type VARCHAR(50),
    p_shares BIGINT,
    p_value BIGINT DEFAULT NULL,
    p_date_reported TIMESTAMPTZ,
    p_ownership_type VARCHAR(10) DEFAULT NULL,
    p_data_source VARCHAR(50) DEFAULT 'finance_api'
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    -- Insert or update insider transaction data
    INSERT INTO public.holders (
        symbol,
        holder_type,
        holder_name,
        insider_position,
        transaction_type,
        shares,
        value,
        date_reported,
        ownership_type,
        data_source
    ) VALUES (
        p_symbol,
        'insider_transactions',
        p_insider_name,
        p_insider_position,
        p_transaction_type,
        p_shares,
        p_value,
        p_date_reported,
        p_ownership_type,
        p_data_source
    )
    ON CONFLICT (symbol, holder_type, holder_name, date_reported, transaction_type, shares, value)
    WHERE holder_type = 'insider_transactions'
    DO UPDATE SET
        insider_position = EXCLUDED.insider_position,
        ownership_type = EXCLUDED.ownership_type,
        data_source = EXCLUDED.data_source,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: upsert_insider_purchases
-- Upserts insider purchases summary data
-- =============================================

CREATE OR REPLACE FUNCTION upsert_insider_purchases(
    p_symbol VARCHAR(10),
    p_summary_period VARCHAR(10),
    p_purchases_shares BIGINT,
    p_purchases_transactions INTEGER,
    p_sales_shares BIGINT,
    p_sales_transactions INTEGER,
    p_net_shares BIGINT,
    p_net_transactions INTEGER,
    p_total_insider_shares BIGINT,
    p_net_percent_insider_shares DECIMAL(10,6),
    p_buy_percent_insider_shares DECIMAL(10,6),
    p_sell_percent_insider_shares DECIMAL(10,6),
    p_data_source VARCHAR(50) DEFAULT 'finance_api'
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    -- Insert or update insider purchases summary data
    INSERT INTO public.holders (
        symbol,
        holder_type,
        summary_period,
        purchases_shares,
        purchases_transactions,
        sales_shares,
        sales_transactions,
        net_shares,
        net_transactions,
        total_insider_shares,
        net_percent_insider_shares,
        buy_percent_insider_shares,
        sell_percent_insider_shares,
        data_source
    ) VALUES (
        p_symbol,
        'insider_purchases',
        p_summary_period,
        p_purchases_shares,
        p_purchases_transactions,
        p_sales_shares,
        p_sales_transactions,
        p_net_shares,
        p_net_transactions,
        p_total_insider_shares,
        p_net_percent_insider_shares,
        p_buy_percent_insider_shares,
        p_sell_percent_insider_shares,
        p_data_source
    )
    ON CONFLICT (symbol, holder_type, summary_period)
    WHERE holder_type = 'insider_purchases'
    DO UPDATE SET
        purchases_shares = EXCLUDED.purchases_shares,
        purchases_transactions = EXCLUDED.purchases_transactions,
        sales_shares = EXCLUDED.sales_shares,
        sales_transactions = EXCLUDED.sales_transactions,
        net_shares = EXCLUDED.net_shares,
        net_transactions = EXCLUDED.net_transactions,
        total_insider_shares = EXCLUDED.total_insider_shares,
        net_percent_insider_shares = EXCLUDED.net_percent_insider_shares,
        buy_percent_insider_shares = EXCLUDED.buy_percent_insider_shares,
        sell_percent_insider_shares = EXCLUDED.sell_percent_insider_shares,
        data_source = EXCLUDED.data_source,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: upsert_insider_roster
-- Upserts insider roster data
-- =============================================

CREATE OR REPLACE FUNCTION upsert_insider_roster(
    p_symbol VARCHAR(10),
    p_insider_name VARCHAR(500),
    p_insider_position VARCHAR(100),
    p_most_recent_transaction VARCHAR(100),
    p_latest_transaction_date TIMESTAMPTZ,
    p_shares_owned_directly BIGINT,
    p_shares_owned_indirectly BIGINT DEFAULT NULL,
    p_position_direct_date TIMESTAMPTZ DEFAULT NULL,
    p_data_source VARCHAR(50) DEFAULT 'finance_api'
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    -- Insert or update insider roster data
    INSERT INTO public.holders (
        symbol,
        holder_type,
        holder_name,
        insider_position,
        most_recent_transaction,
        latest_transaction_date,
        shares_owned_directly,
        shares_owned_indirectly,
        position_direct_date,
        data_source
    ) VALUES (
        p_symbol,
        'insider_roster',
        p_insider_name,
        p_insider_position,
        p_most_recent_transaction,
        p_latest_transaction_date,
        p_shares_owned_directly,
        p_shares_owned_indirectly,
        p_position_direct_date,
        p_data_source
    )
    ON CONFLICT (symbol, holder_type, holder_name)
    WHERE holder_type = 'insider_roster'
    DO UPDATE SET
        insider_position = EXCLUDED.insider_position,
        most_recent_transaction = EXCLUDED.most_recent_transaction,
        latest_transaction_date = EXCLUDED.latest_transaction_date,
        shares_owned_directly = EXCLUDED.shares_owned_directly,
        shares_owned_indirectly = EXCLUDED.shares_owned_indirectly,
        position_direct_date = EXCLUDED.position_direct_date,
        data_source = EXCLUDED.data_source,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: upsert_holders_batch
-- Batch upsert function for processing multiple holders at once
-- =============================================

CREATE OR REPLACE FUNCTION upsert_holders_batch(
    p_holders_data JSONB
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB := '{"success": true, "inserted": 0, "updated": 0, "errors": []}'::jsonb;
    v_holder JSONB;
    v_holder_type TEXT;
    v_count INTEGER := 0;
    v_error_count INTEGER := 0;
BEGIN
    -- Process each holder in the batch
    FOR v_holder IN SELECT * FROM jsonb_array_elements(p_holders_data)
    LOOP
        BEGIN
            v_holder_type := v_holder->>'holder_type';

            CASE v_holder_type
                WHEN 'institutional' THEN
                    PERFORM upsert_institutional_holder(
                        v_holder->>'symbol',
                        v_holder->>'holder_name',
                        (v_holder->>'shares')::BIGINT,
                        (v_holder->>'date_reported')::TIMESTAMPTZ,
                        (v_holder->>'value')::BIGINT,
                        COALESCE(v_holder->>'data_source', 'finance_api')
                    );

                WHEN 'mutualfund' THEN
                    PERFORM upsert_mutualfund_holder(
                        v_holder->>'symbol',
                        v_holder->>'holder_name',
                        (v_holder->>'shares')::BIGINT,
                        (v_holder->>'date_reported')::TIMESTAMPTZ,
                        (v_holder->>'value')::BIGINT,
                        COALESCE(v_holder->>'data_source', 'finance_api')
                    );

                WHEN 'insider_transactions' THEN
                    PERFORM upsert_insider_transaction(
                        v_holder->>'symbol',
                        v_holder->>'insider_name',
                        v_holder->>'insider_position',
                        v_holder->>'transaction_type',
                        (v_holder->>'shares')::BIGINT,
                        (v_holder->>'value')::BIGINT,
                        (v_holder->>'date_reported')::TIMESTAMPTZ,
                        v_holder->>'ownership_type',
                        COALESCE(v_holder->>'data_source', 'finance_api')
                    );

                WHEN 'insider_purchases' THEN
                    PERFORM upsert_insider_purchases(
                        v_holder->>'symbol',
                        v_holder->>'summary_period',
                        (v_holder->>'purchases_shares')::BIGINT,
                        (v_holder->>'purchases_transactions')::INTEGER,
                        (v_holder->>'sales_shares')::BIGINT,
                        (v_holder->>'sales_transactions')::INTEGER,
                        (v_holder->>'net_shares')::BIGINT,
                        (v_holder->>'net_transactions')::INTEGER,
                        (v_holder->>'total_insider_shares')::BIGINT,
                        (v_holder->>'net_percent_insider_shares')::DECIMAL(10,6),
                        (v_holder->>'buy_percent_insider_shares')::DECIMAL(10,6),
                        (v_holder->>'sell_percent_insider_shares')::DECIMAL(10,6),
                        COALESCE(v_holder->>'data_source', 'finance_api')
                    );

                WHEN 'insider_roster' THEN
                    PERFORM upsert_insider_roster(
                        v_holder->>'symbol',
                        v_holder->>'insider_name',
                        v_holder->>'insider_position',
                        v_holder->>'most_recent_transaction',
                        (v_holder->>'latest_transaction_date')::TIMESTAMPTZ,
                        (v_holder->>'shares_owned_directly')::BIGINT,
                        (v_holder->>'shares_owned_indirectly')::BIGINT,
                        (v_holder->>'position_direct_date')::TIMESTAMPTZ,
                        COALESCE(v_holder->>'data_source', 'finance_api')
                    );

                ELSE
                    RAISE EXCEPTION 'Unknown holder type: %', v_holder_type;
            END CASE;

            v_count := v_count + 1;

        EXCEPTION WHEN OTHERS THEN
            v_error_count := v_error_count + 1;
            v_result := jsonb_set(v_result, '{errors}', (v_result->'errors') || jsonb_build_object(
                'holder', v_holder,
                'error', SQLERRM
            )::jsonb);
        END;
    END LOOP;

    -- Update result counts
    v_result := jsonb_set(v_result, '{inserted}', to_jsonb(v_count));
    v_result := jsonb_set(v_result, '{updated}', to_jsonb(v_count)); -- Upsert handles both
    v_result := jsonb_set(v_result, '{success}', to_jsonb(v_error_count = 0));

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: get_holders_summary
-- Returns summary statistics for holders data
-- =============================================

CREATE OR REPLACE FUNCTION get_holders_summary(
    p_symbol VARCHAR(10) DEFAULT NULL
) RETURNS TABLE (
    symbol VARCHAR(10),
    holder_type VARCHAR(20),
    total_holders BIGINT,
    total_shares BIGINT,
    total_value BIGINT,
    last_updated TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        h.symbol,
        h.holder_type,
        COUNT(*)::BIGINT as total_holders,
        COALESCE(SUM(h.shares), 0)::BIGINT as total_shares,
        COALESCE(SUM(h.value), 0)::BIGINT as total_value,
        MAX(h.updated_at) as last_updated
    FROM public.holders h
    WHERE (p_symbol IS NULL OR h.symbol = p_symbol)
    GROUP BY h.symbol, h.holder_type
    ORDER BY h.symbol, h.holder_type;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: cleanup_old_holders_data
-- Removes old holder data based on retention period
-- =============================================

CREATE OR REPLACE FUNCTION cleanup_old_holders_data(
    p_retention_days INTEGER DEFAULT 365,
    p_symbol VARCHAR(10) DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete old holder data (keeping data for institutional and mutual fund holders)
    DELETE FROM public.holders
    WHERE (p_symbol IS NULL OR symbol = p_symbol)
      AND holder_type IN ('institutional', 'mutualfund')
      AND date_reported < (CURRENT_TIMESTAMP - INTERVAL '1 day' * p_retention_days);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- GRANT EXECUTE PERMISSIONS
-- =============================================

-- Grant execute permissions on upsert functions to appropriate roles
-- These functions should only be callable by system processes, not regular users
GRANT EXECUTE ON FUNCTION upsert_institutional_holder TO service_role;
GRANT EXECUTE ON FUNCTION upsert_mutualfund_holder TO service_role;
GRANT EXECUTE ON FUNCTION upsert_insider_transaction TO service_role;
GRANT EXECUTE ON FUNCTION upsert_insider_purchases TO service_role;
GRANT EXECUTE ON FUNCTION upsert_insider_roster TO service_role;
GRANT EXECUTE ON FUNCTION upsert_holders_batch TO service_role;
GRANT EXECUTE ON FUNCTION get_holders_summary TO PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_old_holders_data TO service_role;

-- =============================================
-- USAGE EXAMPLES AND TESTING
-- =============================================

/*
USAGE EXAMPLES:

-- Insert institutional holder data
SELECT upsert_institutional_holder(
    'AAPL',
    'Vanguard Group Inc',
    1415932804,
    '2025-06-30T00:00:00Z'::timestamptz,
    36197344705000  -- value in cents
);

-- Insert insider transaction
SELECT upsert_insider_transaction(
    'AAPL',
    'COOK TIMOTHY D',
    'Chief Executive Officer',
    'Sale',
    108136,
    24184658,
    '2025-04-02T00:00:00Z'::timestamptz,
    'D'
);

-- Batch upsert from JSON data
SELECT upsert_holders_batch('[
    {
        "holder_type": "institutional",
        "symbol": "AAPL",
        "holder_name": "Vanguard Group Inc",
        "shares": 1415932804,
        "date_reported": "2025-06-30T00:00:00Z",
        "value": 36197344705000
    },
    {
        "holder_type": "insider_transactions",
        "symbol": "AAPL",
        "insider_name": "COOK TIMOTHY D",
        "insider_position": "Chief Executive Officer",
        "transaction_type": "Sale",
        "shares": 108136,
        "value": 24184658,
        "date_reported": "2025-04-02T00:00:00Z",
        "ownership_type": "D"
    }
]'::jsonb);

-- Get summary statistics
SELECT * FROM get_holders_summary('AAPL');

-- Cleanup old data (older than 1 year)
SELECT cleanup_old_holders_data(365, 'AAPL');
*/