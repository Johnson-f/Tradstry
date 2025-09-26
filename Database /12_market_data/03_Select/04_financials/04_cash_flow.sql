-- =================================================================
-- GET CASH FLOW FUNCTION
--
-- This function retrieves historical cash flow statement data for a
-- given stock symbol. It allows specifying the frequency (annual or
-- quarterly) and the number of periods to return.
--
-- The data is returned in descending order by fiscal date, providing
-- the most recent data first.
-- =================================================================

CREATE OR REPLACE FUNCTION get_cash_flow(
    p_symbol VARCHAR,
    p_frequency VARCHAR,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    frequency VARCHAR(10),
    fiscal_date DATE,
    operating_cash_flow NUMERIC(25, 2),
    net_income_from_continuing_operations NUMERIC(25, 2),
    depreciation_and_amortization NUMERIC(25, 2),
    deferred_income_tax NUMERIC(25, 2),
    stock_based_compensation NUMERIC(25, 2),
    other_non_cash_items NUMERIC(25, 2),
    change_in_working_capital NUMERIC(25, 2),
    change_in_receivables NUMERIC(25, 2),
    change_in_inventory NUMERIC(25, 2),
    change_in_payables_and_accrued_expense NUMERIC(25, 2),
    change_in_other_current_assets NUMERIC(25, 2),
    change_in_other_current_liabilities NUMERIC(25, 2),
    change_in_other_working_capital NUMERIC(25, 2),
    investing_cash_flow NUMERIC(25, 2),
    net_investment_purchase_and_sale NUMERIC(25, 2),
    purchase_of_investment NUMERIC(25, 2),
    sale_of_investment NUMERIC(25, 2),
    net_ppe_purchase_and_sale NUMERIC(25, 2),
    purchase_of_ppe NUMERIC(25, 2),
    net_business_purchase_and_sale NUMERIC(25, 2),
    purchase_of_business NUMERIC(25, 2),
    net_other_investing_changes NUMERIC(25, 2),
    capital_expenditure NUMERIC(25, 2),
    financing_cash_flow NUMERIC(25, 2),
    net_issuance_payments_of_debt NUMERIC(25, 2),
    net_long_term_debt_issuance NUMERIC(25, 2),
    long_term_debt_issuance NUMERIC(25, 2),
    long_term_debt_payments NUMERIC(25, 2),
    net_short_term_debt_issuance NUMERIC(25, 2),
    short_term_debt_issuance NUMERIC(25, 2),
    short_term_debt_payments NUMERIC(25, 2),
    net_common_stock_issuance NUMERIC(25, 2),
    common_stock_issuance NUMERIC(25, 2),
    common_stock_payments NUMERIC(25, 2),
    cash_dividends_paid NUMERIC(25, 2),
    net_other_financing_charges NUMERIC(25, 2),
    issuance_of_capital_stock NUMERIC(25, 2),
    issuance_of_debt NUMERIC(25, 2),
    repayment_of_debt NUMERIC(25, 2),
    repurchase_of_capital_stock NUMERIC(25, 2),
    end_cash_position NUMERIC(25, 2),
    changes_in_cash NUMERIC(25, 2),
    beginning_cash_position NUMERIC(25, 2),
    free_cash_flow NUMERIC(25, 2),
    income_tax_paid_supplemental_data NUMERIC(25, 2),
    interest_paid_supplemental_data NUMERIC(25, 2),
    data_provider VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cf.symbol,
        cf.frequency,
        cf.fiscal_date,
        cf.operating_cash_flow,
        cf.net_income_from_continuing_operations,
        cf.depreciation_and_amortization,
        cf.deferred_income_tax,
        cf.stock_based_compensation,
        cf.other_non_cash_items,
        cf.change_in_working_capital,
        cf.change_in_receivables,
        cf.change_in_inventory,
        cf.change_in_payables_and_accrued_expense,
        cf.change_in_other_current_assets,
        cf.change_in_other_current_liabilities,
        cf.change_in_other_working_capital,
        cf.investing_cash_flow,
        cf.net_investment_purchase_and_sale,
        cf.purchase_of_investment,
        cf.sale_of_investment,
        cf.net_ppe_purchase_and_sale,
        cf.purchase_of_ppe,
        cf.net_business_purchase_and_sale,
        cf.purchase_of_business,
        cf.net_other_investing_changes,
        cf.capital_expenditure,
        cf.financing_cash_flow,
        cf.net_issuance_payments_of_debt,
        cf.net_long_term_debt_issuance,
        cf.long_term_debt_issuance,
        cf.long_term_debt_payments,
        cf.net_short_term_debt_issuance,
        cf.short_term_debt_issuance,
        cf.short_term_debt_payments,
        cf.net_common_stock_issuance,
        cf.common_stock_issuance,
        cf.common_stock_payments,
        cf.cash_dividends_paid,
        cf.net_other_financing_charges,
        cf.issuance_of_capital_stock,
        cf.issuance_of_debt,
        cf.repayment_of_debt,
        cf.repurchase_of_capital_stock,
        cf.end_cash_position,
        cf.changes_in_cash,
        cf.beginning_cash_position,
        cf.free_cash_flow,
        cf.income_tax_paid_supplemental_data,
        cf.interest_paid_supplemental_data,
        cf.data_provider,
        cf.created_at,
        cf.updated_at
    FROM
        cash_flow cf
    WHERE
        cf.symbol = UPPER(p_symbol) AND cf.frequency = p_frequency
    ORDER BY
        cf.fiscal_date DESC
    LIMIT
        p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Get the last 10 quarters of cash flow data for Apple
SELECT * FROM get_cash_flow('AAPL', 'quarterly', 10);

-- Get the last 5 years of annual cash flow data for Microsoft
SELECT * FROM get_cash_flow('MSFT', 'annual', 5);

-- Get the last 20 quarters of cash flow data for Google
SELECT * FROM get_cash_flow('GOOGL', 'quarterly', 20);
*/
