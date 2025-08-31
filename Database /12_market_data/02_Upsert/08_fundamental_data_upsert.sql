-- Fundamental Data Upsert Function
-- Handles INSERT or UPDATE operations for fundamental_data table
-- Uses PostgreSQL's ON CONFLICT for atomic upsert operations

CREATE OR REPLACE FUNCTION upsert_fundamental_data(
    p_symbol VARCHAR(20),
    p_exchange_id INTEGER DEFAULT NULL,
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
    p_fiscal_year INTEGER,
    p_fiscal_quarter INTEGER,
    p_period_end_date DATE DEFAULT NULL,
    p_report_type VARCHAR(20) DEFAULT 'quarterly',
    p_data_provider VARCHAR(50)
)
RETURNS INTEGER AS $$
DECLARE
    result_id INTEGER;
BEGIN
    -- Attempt to insert or update the fundamental data record
    INSERT INTO fundamental_data (
        symbol,
        exchange_id,
        pe_ratio,
        pb_ratio,
        ps_ratio,
        pegr_ratio,
        dividend_yield,
        roe,
        roa,
        roic,
        gross_margin,
        operating_margin,
        net_margin,
        ebitda_margin,
        current_ratio,
        quick_ratio,
        debt_to_equity,
        debt_to_assets,
        interest_coverage,
        asset_turnover,
        inventory_turnover,
        receivables_turnover,
        payables_turnover,
        revenue_growth,
        earnings_growth,
        book_value_growth,
        dividend_growth,
        eps,
        book_value_per_share,
        revenue_per_share,
        cash_flow_per_share,
        dividend_per_share,
        market_cap,
        enterprise_value,
        beta,
        shares_outstanding,
        fiscal_year,
        fiscal_quarter,
        period_end_date,
        report_type,
        data_provider,
        updated_at
    ) VALUES (
        p_symbol,
        p_exchange_id,
        p_pe_ratio,
        p_pb_ratio,
        p_ps_ratio,
        p_pegr_ratio,
        p_dividend_yield,
        p_roe,
        p_roa,
        p_roic,
        p_gross_margin,
        p_operating_margin,
        p_net_margin,
        p_ebitda_margin,
        p_current_ratio,
        p_quick_ratio,
        p_debt_to_equity,
        p_debt_to_assets,
        p_interest_coverage,
        p_asset_turnover,
        p_inventory_turnover,
        p_receivables_turnover,
        p_payables_turnover,
        p_revenue_growth,
        p_earnings_growth,
        p_book_value_growth,
        p_dividend_growth,
        p_eps,
        p_book_value_per_share,
        p_revenue_per_share,
        p_cash_flow_per_share,
        p_dividend_per_share,
        p_market_cap,
        p_enterprise_value,
        p_beta,
        p_shares_outstanding,
        p_fiscal_year,
        p_fiscal_quarter,
        p_period_end_date,
        p_report_type,
        p_data_provider,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, fiscal_year, fiscal_quarter, data_provider)
    DO UPDATE SET
        exchange_id = EXCLUDED.exchange_id,
        pe_ratio = EXCLUDED.pe_ratio,
        pb_ratio = EXCLUDED.pb_ratio,
        ps_ratio = EXCLUDED.ps_ratio,
        pegr_ratio = EXCLUDED.pegr_ratio,
        dividend_yield = EXCLUDED.dividend_yield,
        roe = EXCLUDED.roe,
        roa = EXCLUDED.roa,
        roic = EXCLUDED.roic,
        gross_margin = EXCLUDED.gross_margin,
        operating_margin = EXCLUDED.operating_margin,
        net_margin = EXCLUDED.net_margin,
        ebitda_margin = EXCLUDED.ebitda_margin,
        current_ratio = EXCLUDED.current_ratio,
        quick_ratio = EXCLUDED.quick_ratio,
        debt_to_equity = EXCLUDED.debt_to_equity,
        debt_to_assets = EXCLUDED.debt_to_assets,
        interest_coverage = EXCLUDED.interest_coverage,
        asset_turnover = EXCLUDED.asset_turnover,
        inventory_turnover = EXCLUDED.inventory_turnover,
        receivables_turnover = EXCLUDED.receivables_turnover,
        payables_turnover = EXCLUDED.payables_turnover,
        revenue_growth = EXCLUDED.revenue_growth,
        earnings_growth = EXCLUDED.earnings_growth,
        book_value_growth = EXCLUDED.book_value_growth,
        dividend_growth = EXCLUDED.dividend_growth,
        eps = EXCLUDED.eps,
        book_value_per_share = EXCLUDED.book_value_per_share,
        revenue_per_share = EXCLUDED.revenue_per_share,
        cash_flow_per_share = EXCLUDED.cash_flow_per_share,
        dividend_per_share = EXCLUDED.dividend_per_share,
        market_cap = EXCLUDED.market_cap,
        enterprise_value = EXCLUDED.enterprise_value,
        beta = EXCLUDED.beta,
        shares_outstanding = EXCLUDED.shares_outstanding,
        period_end_date = EXCLUDED.period_end_date,
        report_type = EXCLUDED.report_type,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO result_id;

    -- Log the operation for audit purposes
    RAISE NOTICE 'Fundamental data upserted for symbol % Q% % from provider %, ID: %',
                 p_symbol, p_fiscal_quarter, p_fiscal_year, p_data_provider, result_id;

    RETURN result_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Error upserting fundamental data for symbol % Q% %: %',
                       p_symbol, p_fiscal_quarter, p_fiscal_year, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_fundamental_data(
    VARCHAR(20), INTEGER, DECIMAL(10,2), DECIMAL(10,2), DECIMAL(10,2),
    DECIMAL(10,2), DECIMAL(7,4), DECIMAL(7,4), DECIMAL(7,4), DECIMAL(7,4),
    DECIMAL(7,4), DECIMAL(7,4), DECIMAL(7,4), DECIMAL(7,4), DECIMAL(10,2),
    DECIMAL(10,2), DECIMAL(10,2), DECIMAL(10,2), DECIMAL(10,2), DECIMAL(10,2),
    DECIMAL(10,2), DECIMAL(10,2), DECIMAL(10,2), DECIMAL(7,4), DECIMAL(7,4),
    DECIMAL(7,4), DECIMAL(7,4), DECIMAL(10,2), DECIMAL(10,2), DECIMAL(10,2),
    DECIMAL(10,2), DECIMAL(10,2), BIGINT, BIGINT, DECIMAL(7,4), BIGINT,
    INTEGER, INTEGER, DATE, VARCHAR(20), VARCHAR(50)
) IS 'Upserts fundamental data. Inserts new record or updates existing based on symbol + fiscal_year + fiscal_quarter + data_provider.';

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Example 1: Insert new fundamental data
SELECT upsert_fundamental_data(
    'AAPL',           -- symbol
    1,               -- exchange_id
    28.5,            -- pe_ratio
    8.2,             -- pb_ratio
    7.3,             -- ps_ratio
    2.1,             -- pegr_ratio
    0.0052,          -- dividend_yield
    1.47,            -- roe (147%)
    0.22,            -- roa (22%)
    0.31,            -- roic (31%)
    0.38,            -- gross_margin (38%)
    0.30,            -- operating_margin (30%)
    0.25,            -- net_margin (25%)
    0.34,            -- ebitda_margin (34%)
    1.04,            -- current_ratio
    0.94,            -- quick_ratio
    1.79,            -- debt_to_equity
    0.32,            -- debt_to_assets
    30.5,            -- interest_coverage
    1.13,            -- asset_turnover
    34.7,            -- inventory_turnover
    12.6,            -- receivables_turnover
    4.8,             -- payables_turnover
    0.02,            -- revenue_growth (2%)
    0.12,            -- earnings_growth (12%)
    0.05,            -- book_value_growth (5%)
    0.08,            -- dividend_growth (8%)
    6.13,            -- eps
    4.51,            -- book_value_per_share
    24.32,           -- revenue_per_share
    7.12,            -- cash_flow_per_share
    0.96,            -- dividend_per_share
    2500000000000,   -- market_cap
    2580000000000,   -- enterprise_value
    1.24,            -- beta
    15634200000,     -- shares_outstanding
    2024,            -- fiscal_year
    1,               -- fiscal_quarter
    '2023-12-30',    -- period_end_date
    'quarterly',     -- report_type
    'fmp'            -- data_provider
);

-- Example 2: Update existing fundamental data
SELECT upsert_fundamental_data(
    'AAPL',           -- Same symbol
    1,               -- Same exchange_id
    29.2,            -- Updated pe_ratio
    8.5,             -- Updated pb_ratio
    7.5,             -- Updated ps_ratio
    2.2,             -- Updated pegr_ratio
    0.0050,          -- Updated dividend_yield
    1.52,            -- Updated roe
    0.24,            -- Updated roa
    0.33,            -- Updated roic
    0.39,            -- Updated gross_margin
    0.31,            -- Updated operating_margin
    0.26,            -- Updated net_margin
    0.35,            -- Updated ebitda_margin
    1.08,            -- Updated current_ratio
    0.98,            -- Updated quick_ratio
    1.85,            -- Updated debt_to_equity
    0.33,            -- Updated debt_to_assets
    32.1,            -- Updated interest_coverage
    1.15,            -- Updated asset_turnover
    36.2,            -- Updated inventory_turnover
    13.1,            -- Updated receivables_turnover
    5.1,             -- Updated payables_turnover
    0.03,            -- Updated revenue_growth
    0.15,            -- Updated earnings_growth
    0.06,            -- Updated book_value_growth
    0.10,            -- Updated dividend_growth
    6.42,            -- Updated eps
    4.68,            -- Updated book_value_per_share
    24.85,           -- Updated revenue_per_share
    7.35,            -- Updated cash_flow_per_share
    0.98,            -- Updated dividend_per_share
    2550000000000,   -- Updated market_cap
    2620000000000,   -- Updated enterprise_value
    1.26,            -- Updated beta
    15642000000,     -- Updated shares_outstanding
    2024,            -- Same fiscal_year
    1,               -- Same fiscal_quarter
    '2023-12-30',    -- Same period_end_date
    'quarterly',     -- Same report_type
    'fmp'            -- Same data_provider
);

-- Example 3: Annual fundamental data
SELECT upsert_fundamental_data(
    'MSFT',
    1,
    32.4, 12.8, 9.7, 2.3, 0.0072,
    0.36, 0.18, 0.28, 0.69, 0.42, 0.36, 0.48,
    2.08, 1.95, 0.32, 0.14, 25.8,
    0.52, 18.5, 6.2, 3.8,
    0.16, 0.22, 0.12, 0.15,
    11.52, 15.36, 61.27, 14.85, 3.08,
    3000000000000, 3100000000000, 0.92, 7430000000,
    2023, NULL, '2023-06-30', 'annual', 'fmp'
);

-- Batch processing example
-- Your application can call this function in a loop for bulk fundamental data updates
*/

-- =====================================================
-- FUNCTION FEATURES
-- =====================================================

/*
FUNCTION FEATURES:

1. ATOMIC UPSERT:
   - Uses PostgreSQL ON CONFLICT for thread-safe operations
   - Either inserts new record or updates existing
   - Based on (symbol, fiscal_year, fiscal_quarter, data_provider) unique constraint
   - No race conditions or duplicate data

2. COMPREHENSIVE PARAMETERS:
   - All fundamental_data table columns supported (35+ parameters)
   - Optional parameters with sensible defaults
   - Type-safe with proper data types for all parameters

3. FINANCIAL ANALYSIS SUPPORT:
   - Valuation ratios (P/E, P/B, P/S, PEG)
   - Profitability ratios (ROE, ROA, ROIC, margins)
   - Liquidity ratios (current, quick, debt ratios)
   - Efficiency ratios (turnover ratios)
   - Growth metrics (revenue, earnings, book value growth)
   - Per-share metrics (EPS, book value, cash flow per share)

4. AUDIT TRAIL:
   - Automatically updates updated_at timestamp
   - Logs operations for monitoring
   - Returns the record ID for reference

INTEGRATION NOTES:

- Call this function from your market data ingestion processes
- Use the returned ID for logging or further processing
- Handle exceptions in your application code
- Consider batch processing for multiple fundamental data updates
- Function supports both quarterly and annual fundamental data
*/
