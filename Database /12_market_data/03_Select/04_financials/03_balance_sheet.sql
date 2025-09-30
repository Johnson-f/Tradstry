-- =================================================================
-- GET BALANCE SHEET FUNCTION
--
-- This function retrieves historical balance sheet data for a
-- given stock symbol. It allows specifying the frequency (annual or
-- quarterly) and the number of periods to return.
--
-- The data is returned in descending order by fiscal date, providing
-- the most recent data first.
-- =================================================================

CREATE OR REPLACE FUNCTION get_balance_sheet(
    p_symbol VARCHAR,
    p_frequency VARCHAR,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    frequency VARCHAR(10),
    fiscal_date DATE,
    total_assets NUMERIC(25, 2),
    total_current_assets NUMERIC(25, 2),
    cash_cash_equivalents_and_short_term_investments NUMERIC(25, 2),
    cash_and_cash_equivalents NUMERIC(25, 2),
    cash NUMERIC(25, 2),
    cash_equivalents NUMERIC(25, 2),
    other_short_term_investments NUMERIC(25, 2),
    receivables NUMERIC(25, 2),
    accounts_receivable NUMERIC(25, 2),
    other_receivables NUMERIC(25, 2),
    inventory NUMERIC(25, 2),
    other_current_assets NUMERIC(25, 2),
    total_non_current_assets NUMERIC(25, 2),
    net_ppe NUMERIC(25, 2),
    gross_ppe NUMERIC(25, 2),
    properties NUMERIC(25, 2),
    land_and_improvements NUMERIC(25, 2),
    machinery_furniture_equipment NUMERIC(25, 2),
    other_properties NUMERIC(25, 2),
    leases NUMERIC(25, 2),
    accumulated_depreciation NUMERIC(25, 2),
    investments_and_advances NUMERIC(25, 2),
    investment_in_financial_assets NUMERIC(25, 2),
    available_for_sale_securities NUMERIC(25, 2),
    other_investments NUMERIC(25, 2),
    non_current_deferred_assets NUMERIC(25, 2),
    non_current_deferred_taxes_assets NUMERIC(25, 2),
    other_non_current_assets NUMERIC(25, 2),
    net_tangible_assets NUMERIC(25, 2),
    tangible_book_value NUMERIC(25, 2),
    total_liabilities NUMERIC(25, 2),
    total_current_liabilities NUMERIC(25, 2),
    payables_and_accrued_expenses NUMERIC(25, 2),
    payables NUMERIC(25, 2),
    accounts_payable NUMERIC(25, 2),
    total_tax_payable NUMERIC(25, 2),
    income_tax_payable NUMERIC(25, 2),
    current_debt_and_capital_lease_obligation NUMERIC(25, 2),
    current_debt NUMERIC(25, 2),
    commercial_paper NUMERIC(25, 2),
    other_current_borrowings NUMERIC(25, 2),
    current_capital_lease_obligation NUMERIC(25, 2),
    current_deferred_liabilities NUMERIC(25, 2),
    current_deferred_revenue NUMERIC(25, 2),
    other_current_liabilities NUMERIC(25, 2),
    total_non_current_liabilities NUMERIC(25, 2),
    long_term_debt_and_capital_lease_obligation NUMERIC(25, 2),
    long_term_debt NUMERIC(25, 2),
    long_term_capital_lease_obligation NUMERIC(25, 2),
    trade_and_other_payables_non_current NUMERIC(25, 2),
    other_non_current_liabilities NUMERIC(25, 2),
    capital_lease_obligations NUMERIC(25, 2),
    total_debt NUMERIC(25, 2),
    net_debt NUMERIC(25, 2),
    total_equity NUMERIC(25, 2),
    stockholders_equity NUMERIC(25, 2),
    capital_stock NUMERIC(25, 2),
    common_stock NUMERIC(25, 2),
    retained_earnings NUMERIC(25, 2),
    gains_losses_not_affecting_retained_earnings NUMERIC(25, 2),
    other_equity_adjustments NUMERIC(25, 2),
    common_stock_equity NUMERIC(25, 2),
    shares_issued BIGINT,
    ordinary_shares_number BIGINT,
    treasury_shares_number BIGINT,
    working_capital NUMERIC(25, 2),
    invested_capital NUMERIC(25, 2),
    total_capitalization NUMERIC(25, 2),
    data_provider VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        bs.symbol,
        bs.frequency,
        bs.fiscal_date,
        bs.total_assets,
        bs.total_current_assets,
        bs.cash_cash_equivalents_and_short_term_investments,
        bs.cash_and_cash_equivalents,
        bs.cash,
        bs.cash_equivalents,
        bs.other_short_term_investments,
        bs.receivables,
        bs.accounts_receivable,
        bs.other_receivables,
        bs.inventory,
        bs.other_current_assets,
        bs.total_non_current_assets,
        bs.net_ppe,
        bs.gross_ppe,
        bs.properties,
        bs.land_and_improvements,
        bs.machinery_furniture_equipment,
        bs.other_properties,
        bs.leases,
        bs.accumulated_depreciation,
        bs.investments_and_advances,
        bs.investment_in_financial_assets,
        bs.available_for_sale_securities,
        bs.other_investments,
        bs.non_current_deferred_assets,
        bs.non_current_deferred_taxes_assets,
        bs.other_non_current_assets,
        bs.net_tangible_assets,
        bs.tangible_book_value,
        bs.total_liabilities,
        bs.total_current_liabilities,
        bs.payables_and_accrued_expenses,
        bs.payables,
        bs.accounts_payable,
        bs.total_tax_payable,
        bs.income_tax_payable,
        bs.current_debt_and_capital_lease_obligation,
        bs.current_debt,
        bs.commercial_paper,
        bs.other_current_borrowings,
        bs.current_capital_lease_obligation,
        bs.current_deferred_liabilities,
        bs.current_deferred_revenue,
        bs.other_current_liabilities,
        bs.total_non_current_liabilities,
        bs.long_term_debt_and_capital_lease_obligation,
        bs.long_term_debt,
        bs.long_term_capital_lease_obligation,
        bs.trade_and_other_payables_non_current,
        bs.other_non_current_liabilities,
        bs.capital_lease_obligations,
        bs.total_debt,
        bs.net_debt,
        bs.total_equity,
        bs.stockholders_equity,
        bs.capital_stock,
        bs.common_stock,
        bs.retained_earnings,
        bs.gains_losses_not_affecting_retained_earnings,
        bs.other_equity_adjustments,
        bs.common_stock_equity,
        bs.shares_issued,
        bs.ordinary_shares_number,
        bs.treasury_shares_number,
        bs.working_capital,
        bs.invested_capital,
        bs.total_capitalization,
        bs.data_provider,
        bs.created_at,
        bs.updated_at
    FROM
        balance_sheet bs
    WHERE
        bs.symbol = UPPER(p_symbol) AND bs.frequency = p_frequency
    ORDER BY
        bs.fiscal_date DESC
    LIMIT
        p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Get the last 10 quarters of balance sheet data for Apple
SELECT * FROM get_balance_sheet('AAPL', 'quarterly', 10);

-- Get the last 5 years of annual balance sheet data for Microsoft
SELECT * FROM get_balance_sheet('MSFT', 'annual', 5);

-- Get the last 20 quarters of balance sheet data for Google
SELECT * FROM get_balance_sheet('GOOGL', 'quarterly', 20);
*/
