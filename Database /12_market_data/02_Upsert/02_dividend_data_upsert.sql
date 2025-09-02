-- Dividend Data Upsert Function
-- Upserts dividend data with conflict resolution on symbol, ex_dividend_date, and data_provider

CREATE OR REPLACE FUNCTION upsert_dividend_data(
    -- Required parameters (no defaults)
    p_symbol VARCHAR(20),
    p_data_provider VARCHAR(50),
    p_ex_dividend_date DATE,
    p_dividend_amount DECIMAL(10,4),
    -- Optional parameters (with defaults)
    p_exchange_id INTEGER DEFAULT NULL,
    p_declaration_date DATE DEFAULT NULL,
    p_record_date DATE DEFAULT NULL,
    p_payment_date DATE DEFAULT NULL,
    p_dividend_type VARCHAR(20) DEFAULT 'regular',
    p_currency VARCHAR(3) DEFAULT 'USD',
    p_frequency VARCHAR(20) DEFAULT NULL,
    p_dividend_status VARCHAR(20) DEFAULT 'active',
    p_dividend_yield DECIMAL(7,4) DEFAULT NULL,
    p_payout_ratio DECIMAL(7,4) DEFAULT NULL,
    p_consecutive_years INTEGER DEFAULT NULL,
    p_qualified_dividend BOOLEAN DEFAULT TRUE,
    p_tax_rate DECIMAL(7,4) DEFAULT NULL,
    p_fiscal_year INTEGER DEFAULT NULL,
    p_fiscal_quarter INTEGER DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_dividend_id INTEGER;
BEGIN
    INSERT INTO dividend_data (
        symbol, exchange_id, declaration_date, ex_dividend_date, record_date,
        payment_date, dividend_amount, dividend_type, currency, frequency,
        dividend_status, dividend_yield, payout_ratio, consecutive_years,
        qualified_dividend, tax_rate, fiscal_year, fiscal_quarter, data_provider,
        created_at, updated_at
    ) VALUES (
        p_symbol, p_exchange_id, p_declaration_date, p_ex_dividend_date, p_record_date,
        p_payment_date, p_dividend_amount, p_dividend_type, p_currency, p_frequency,
        p_dividend_status, p_dividend_yield, p_payout_ratio, p_consecutive_years,
        p_qualified_dividend, p_tax_rate, p_fiscal_year, p_fiscal_quarter, p_data_provider,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, ex_dividend_date, data_provider) 
    DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, dividend_data.exchange_id),
        declaration_date = COALESCE(EXCLUDED.declaration_date, dividend_data.declaration_date),
        record_date = COALESCE(EXCLUDED.record_date, dividend_data.record_date),
        payment_date = COALESCE(EXCLUDED.payment_date, dividend_data.payment_date),
        dividend_amount = COALESCE(EXCLUDED.dividend_amount, dividend_data.dividend_amount),
        dividend_type = COALESCE(EXCLUDED.dividend_type, dividend_data.dividend_type),
        currency = COALESCE(EXCLUDED.currency, dividend_data.currency),
        frequency = COALESCE(EXCLUDED.frequency, dividend_data.frequency),
        dividend_status = COALESCE(EXCLUDED.dividend_status, dividend_data.dividend_status),
        dividend_yield = COALESCE(EXCLUDED.dividend_yield, dividend_data.dividend_yield),
        payout_ratio = COALESCE(EXCLUDED.payout_ratio, dividend_data.payout_ratio),
        consecutive_years = COALESCE(EXCLUDED.consecutive_years, dividend_data.consecutive_years),
        qualified_dividend = COALESCE(EXCLUDED.qualified_dividend, dividend_data.qualified_dividend),
        tax_rate = COALESCE(EXCLUDED.tax_rate, dividend_data.tax_rate),
        fiscal_year = COALESCE(EXCLUDED.fiscal_year, dividend_data.fiscal_year),
        fiscal_quarter = COALESCE(EXCLUDED.fiscal_quarter, dividend_data.fiscal_quarter),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_dividend_id;

    RETURN v_dividend_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_dividend_data IS 'Upserts dividend data with conflict resolution on symbol, ex_dividend_date, and data_provider';