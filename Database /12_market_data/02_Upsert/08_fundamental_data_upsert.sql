-- ----------------------------------------------------------------------------
-- Function: upsert_fundamental_data
-- Updated to match the new fundamental_data table structure
-- ----------------------------------------------------------------------------

-- Tested 

CREATE OR REPLACE FUNCTION upsert_fundamental_data(
    p_symbol VARCHAR(20),
    p_fiscal_year INTEGER,
    p_fiscal_quarter INTEGER,
    p_data_provider VARCHAR(50),
    
    -- Exchange parameters (for automatic exchange handling)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Fundamental data parameters
    p_sector VARCHAR(100) DEFAULT NULL,
    p_pe_ratio DECIMAL(10,2) DEFAULT NULL,
    p_pb_ratio DECIMAL(10,2) DEFAULT NULL,
    p_ps_ratio DECIMAL(10,2) DEFAULT NULL,
    p_pegr_ratio DECIMAL(10,2) DEFAULT NULL,
    p_dividend_yield DECIMAL(7,4) DEFAULT NULL,
    p_roe DECIMAL(7,4) DEFAULT NULL,
    p_roa DECIMAL(7,4) DEFAULT NULL,
    p_roic DECIMAL(7,4) DEFAULT NULL,
    p_gross_margin DECIMAL(7,4) DEFAULT NULL,
    p_operating_margin DECIMAL(7,4) DEFAULT NULL,
    p_net_margin DECIMAL(7,4) DEFAULT NULL,
    p_ebitda_margin DECIMAL(7,4) DEFAULT NULL,
    p_current_ratio DECIMAL(10,2) DEFAULT NULL,
    p_quick_ratio DECIMAL(10,2) DEFAULT NULL,
    p_debt_to_equity DECIMAL(10,2) DEFAULT NULL,
    p_debt_to_assets DECIMAL(10,2) DEFAULT NULL,
    p_interest_coverage DECIMAL(10,2) DEFAULT NULL,
    p_asset_turnover DECIMAL(10,2) DEFAULT NULL,
    p_inventory_turnover DECIMAL(10,2) DEFAULT NULL,
    p_receivables_turnover DECIMAL(10,2) DEFAULT NULL,
    p_payables_turnover DECIMAL(10,2) DEFAULT NULL,
    p_revenue_growth DECIMAL(7,4) DEFAULT NULL,
    p_earnings_growth DECIMAL(7,4) DEFAULT NULL,
    p_book_value_growth DECIMAL(7,4) DEFAULT NULL,
    p_dividend_growth DECIMAL(7,4) DEFAULT NULL,
    p_eps DECIMAL(10,2) DEFAULT NULL,
    p_book_value_per_share DECIMAL(10,2) DEFAULT NULL,
    p_revenue_per_share DECIMAL(10,2) DEFAULT NULL,
    p_cash_flow_per_share DECIMAL(10,2) DEFAULT NULL,
    p_dividend_per_share DECIMAL(10,2) DEFAULT NULL,
    p_market_cap BIGINT DEFAULT NULL,
    p_enterprise_value BIGINT DEFAULT NULL,
    p_beta DECIMAL(7,4) DEFAULT NULL,
    p_shares_outstanding BIGINT DEFAULT NULL,
    p_period_end_date DATE DEFAULT NULL,
    p_report_type VARCHAR(20) DEFAULT NULL
) RETURNS INTEGER AS $
DECLARE
    v_id INTEGER;
    v_exchange_id INTEGER;
BEGIN
    -- Step 1: Handle exchange upsert if exchange data is provided
    IF p_exchange_code IS NOT NULL THEN
        SELECT upsert_exchange(
            p_exchange_code,
            p_exchange_name,
            p_exchange_country,
            p_exchange_timezone
        ) INTO v_exchange_id;
    END IF;

    -- Step 2: Insert/update fundamental data
    INSERT INTO fundamental_data (
        symbol, exchange_id, sector, pe_ratio, pb_ratio, ps_ratio, pegr_ratio,
        dividend_yield, roe, roa, roic, gross_margin, operating_margin,
        net_margin, ebitda_margin, current_ratio, quick_ratio, debt_to_equity,
        debt_to_assets, interest_coverage, asset_turnover, inventory_turnover,
        receivables_turnover, payables_turnover, revenue_growth, earnings_growth,
        book_value_growth, dividend_growth, eps, book_value_per_share,
        revenue_per_share, cash_flow_per_share, dividend_per_share, market_cap,
        enterprise_value, beta, shares_outstanding, fiscal_year, fiscal_quarter,
        period_end_date, report_type, data_provider, created_at, updated_at
    ) VALUES (
        p_symbol, v_exchange_id, p_sector, p_pe_ratio, p_pb_ratio, p_ps_ratio, p_pegr_ratio,
        p_dividend_yield, p_roe, p_roa, p_roic, p_gross_margin, p_operating_margin,
        p_net_margin, p_ebitda_margin, p_current_ratio, p_quick_ratio, p_debt_to_equity,
        p_debt_to_assets, p_interest_coverage, p_asset_turnover, p_inventory_turnover,
        p_receivables_turnover, p_payables_turnover, p_revenue_growth, p_earnings_growth,
        p_book_value_growth, p_dividend_growth, p_eps, p_book_value_per_share,
        p_revenue_per_share, p_cash_flow_per_share, p_dividend_per_share, p_market_cap,
        p_enterprise_value, p_beta, p_shares_outstanding, p_fiscal_year, p_fiscal_quarter,
        p_period_end_date, p_report_type, p_data_provider, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, fiscal_year, fiscal_quarter, data_provider) 
    DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, fundamental_data.exchange_id),
        sector = COALESCE(EXCLUDED.sector, fundamental_data.sector),
        pe_ratio = COALESCE(EXCLUDED.pe_ratio, fundamental_data.pe_ratio),
        pb_ratio = COALESCE(EXCLUDED.pb_ratio, fundamental_data.pb_ratio),
        ps_ratio = COALESCE(EXCLUDED.ps_ratio, fundamental_data.ps_ratio),
        pegr_ratio = COALESCE(EXCLUDED.pegr_ratio, fundamental_data.pegr_ratio),
        dividend_yield = COALESCE(EXCLUDED.dividend_yield, fundamental_data.dividend_yield),
        roe = COALESCE(EXCLUDED.roe, fundamental_data.roe),
        roa = COALESCE(EXCLUDED.roa, fundamental_data.roa),
        roic = COALESCE(EXCLUDED.roic, fundamental_data.roic),
        gross_margin = COALESCE(EXCLUDED.gross_margin, fundamental_data.gross_margin),
        operating_margin = COALESCE(EXCLUDED.operating_margin, fundamental_data.operating_margin),
        net_margin = COALESCE(EXCLUDED.net_margin, fundamental_data.net_margin),
        ebitda_margin = COALESCE(EXCLUDED.ebitda_margin, fundamental_data.ebitda_margin),
        current_ratio = COALESCE(EXCLUDED.current_ratio, fundamental_data.current_ratio),
        quick_ratio = COALESCE(EXCLUDED.quick_ratio, fundamental_data.quick_ratio),
        debt_to_equity = COALESCE(EXCLUDED.debt_to_equity, fundamental_data.debt_to_equity),
        debt_to_assets = COALESCE(EXCLUDED.debt_to_assets, fundamental_data.debt_to_assets),
        interest_coverage = COALESCE(EXCLUDED.interest_coverage, fundamental_data.interest_coverage),
        asset_turnover = COALESCE(EXCLUDED.asset_turnover, fundamental_data.asset_turnover),
        inventory_turnover = COALESCE(EXCLUDED.inventory_turnover, fundamental_data.inventory_turnover),
        receivables_turnover = COALESCE(EXCLUDED.receivables_turnover, fundamental_data.receivables_turnover),
        payables_turnover = COALESCE(EXCLUDED.payables_turnover, fundamental_data.payables_turnover),
        revenue_growth = COALESCE(EXCLUDED.revenue_growth, fundamental_data.revenue_growth),
        earnings_growth = COALESCE(EXCLUDED.earnings_growth, fundamental_data.earnings_growth),
        book_value_growth = COALESCE(EXCLUDED.book_value_growth, fundamental_data.book_value_growth),
        dividend_growth = COALESCE(EXCLUDED.dividend_growth, fundamental_data.dividend_growth),
        eps = COALESCE(EXCLUDED.eps, fundamental_data.eps),
        book_value_per_share = COALESCE(EXCLUDED.book_value_per_share, fundamental_data.book_value_per_share),
        revenue_per_share = COALESCE(EXCLUDED.revenue_per_share, fundamental_data.revenue_per_share),
        cash_flow_per_share = COALESCE(EXCLUDED.cash_flow_per_share, fundamental_data.cash_flow_per_share),
        dividend_per_share = COALESCE(EXCLUDED.dividend_per_share, fundamental_data.dividend_per_share),
        market_cap = COALESCE(EXCLUDED.market_cap, fundamental_data.market_cap),
        enterprise_value = COALESCE(EXCLUDED.enterprise_value, fundamental_data.enterprise_value),
        beta = COALESCE(EXCLUDED.beta, fundamental_data.beta),
        shares_outstanding = COALESCE(EXCLUDED.shares_outstanding, fundamental_data.shares_outstanding),
        period_end_date = COALESCE(EXCLUDED.period_end_date, fundamental_data.period_end_date),
        report_type = COALESCE(EXCLUDED.report_type, fundamental_data.report_type),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_fundamental_data IS 'Upserts fundamental data with conflict resolution on symbol, fiscal_year, fiscal_quarter, and data_provider';

-- Example usage:
/*
SELECT upsert_fundamental_data(
    'AAPL',                    -- symbol
    2023,                      -- fiscal_year
    4,                         -- fiscal_quarter
    'fmp',                     -- data_provider
    'NASDAQ',                  -- exchange_code
    'NASDAQ Stock Market',     -- exchange_name
    'US',                      -- exchange_country
    'America/New_York',        -- exchange_timezone
    'Technology',              -- sector
    25.50,                     -- pe_ratio
    5.25,                      -- pb_ratio
    7.80,                      -- ps_ratio
    1.15,                      -- pegr_ratio
    0.0055,                    -- dividend_yield (0.55%)
    0.2850,                    -- roe (28.5%)
    0.1950,                    -- roa (19.5%)
    0.3200,                    -- roic (32%)
    0.4350,                    -- gross_margin (43.5%)
    0.2950,                    -- operating_margin (29.5%)
    0.2350,                    -- net_margin (23.5%)
    0.3150,                    -- ebitda_margin (31.5%)
    1.50,                      -- current_ratio
    1.25,                      -- quick_ratio
    1.85,                      -- debt_to_equity
    0.35,                      -- debt_to_assets
    25.60,                     -- interest_coverage
    0.95,                      -- asset_turnover
    65.50,                     -- inventory_turnover
    12.25,                     -- receivables_turnover
    8.75,                      -- payables_turnover
    0.0850,                    -- revenue_growth (8.5%)
    0.1250,                    -- earnings_growth (12.5%)
    0.0650,                    -- book_value_growth (6.5%)
    0.0450,                    -- dividend_growth (4.5%)
    6.15,                      -- eps
    22.50,                     -- book_value_per_share
    24.75,                     -- revenue_per_share
    7.25,                      -- cash_flow_per_share
    0.96,                      -- dividend_per_share
    2850000000000,             -- market_cap (2.85T)
    2750000000000,             -- enterprise_value (2.75T)
    1.15,                      -- beta
    15500000000,               -- shares_outstanding (15.5B)
    '2023-12-31'::DATE,        -- period_end_date
    'quarterly'                -- report_type
);
*/