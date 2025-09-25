-- =================================================================
-- GET KEY STATS FUNCTION
--
-- This function retrieves a comprehensive set of key financial
-- statistics for a given stock symbol. It combines data from
-- company_info, balance_sheet, income_statement, and cash_flow
-- tables to provide a snapshot of a company's financial health.
--
-- The function allows specifying the frequency of financial data
-- (annual or quarterly) and returns the most recent data available
-- for that period.
-- =================================================================

CREATE OR REPLACE FUNCTION get_key_stats(
    p_symbol VARCHAR(20),
    p_frequency VARCHAR(10) DEFAULT 'annual'
)
RETURNS TABLE (
    market_cap BIGINT,
    cash_and_cash_equivalents NUMERIC(25, 2),
    total_debt NUMERIC(25, 2),
    enterprise_value NUMERIC(30, 2),
    revenue NUMERIC(25, 2),
    gross_profit NUMERIC(25, 2),
    ebitda NUMERIC(25, 2),
    net_income_common_stockholders NUMERIC(25, 2),
    diluted_eps NUMERIC(10, 4),
    operating_cash_flow NUMERIC(25, 2),
    capital_expenditure NUMERIC(25, 2),
    free_cash_flow NUMERIC(25, 2)
) AS $$
BEGIN
    RETURN QUERY
    WITH latest_company_info AS (
        SELECT
            ci.symbol,
            ci.market_cap
        FROM company_info ci
        WHERE ci.symbol = UPPER(p_symbol)
        ORDER BY ci.updated_at DESC
        LIMIT 1
    ),
    latest_balance_sheet AS (
        SELECT
            bs.symbol,
            bs.cash_and_cash_equivalents,
            bs.total_debt
        FROM balance_sheet bs
        WHERE bs.symbol = UPPER(p_symbol) AND bs.frequency = p_frequency
        ORDER BY bs.fiscal_date DESC
        LIMIT 1
    ),
    latest_income_statement AS (
        SELECT
            ist.symbol,
            ist.total_revenue,
            ist.gross_profit,
            ist.ebitda,
            ist.net_income_common_stockholders,
            ist.diluted_eps
        FROM income_statement ist
        WHERE ist.symbol = UPPER(p_symbol) AND ist.frequency = p_frequency
        ORDER BY ist.fiscal_date DESC
        LIMIT 1
    ),
    latest_cash_flow AS (
        SELECT
            cf.symbol,
            cf.operating_cash_flow,
            cf.capital_expenditure,
            cf.free_cash_flow
        FROM cash_flow cf
        WHERE cf.symbol = UPPER(p_symbol) AND cf.frequency = p_frequency
        ORDER BY cf.fiscal_date DESC
        LIMIT 1
    )
    SELECT
        lci.market_cap,
        lbs.cash_and_cash_equivalents,
        lbs.total_debt,
        (lci.market_cap + lbs.total_debt - lbs.cash_and_cash_equivalents)::NUMERIC(30, 2) AS enterprise_value,
        lis.total_revenue AS revenue,
        lis.gross_profit,
        lis.ebitda,
        lis.net_income_common_stockholders,
        lis.diluted_eps,
        lcf.operating_cash_flow,
        lcf.capital_expenditure,
        lcf.free_cash_flow
    FROM
        latest_company_info lci
    LEFT JOIN
        latest_balance_sheet lbs ON lci.symbol = lbs.symbol
    LEFT JOIN
        latest_income_statement lis ON lci.symbol = lis.symbol
    LEFT JOIN
        latest_cash_flow lcf ON lci.symbol = lcf.symbol;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Get annual key stats for Apple
SELECT * FROM get_key_stats('AAPL');

-- Get quarterly key stats for Microsoft
SELECT * FROM get_key_stats('MSFT', 'quarterly');

-- Get annual key stats for Google
SELECT * FROM get_key_stats('GOOGL', 'annual');
*/
