-- =================================================================
-- GET INCOME STATEMENT FUNCTION
--
-- This function retrieves historical income statement data for a
-- given stock symbol. It allows specifying the frequency (annual or
-- quarterly) and the number of periods to return.
--
-- The data is returned in descending order by fiscal date, providing
-- the most recent data first.
-- =================================================================

CREATE OR REPLACE FUNCTION get_income_statement(
    p_symbol VARCHAR,
    p_frequency VARCHAR,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    frequency VARCHAR(10),
    fiscal_date DATE,
    total_revenue NUMERIC(25, 2),
    operating_revenue NUMERIC(25, 2),
    cost_of_revenue NUMERIC(25, 2),
    gross_profit NUMERIC(25, 2),
    reconciled_cost_of_revenue NUMERIC(25, 2),
    operating_expense NUMERIC(25, 2),
    selling_general_and_administrative NUMERIC(25, 2),
    research_and_development NUMERIC(25, 2),
    total_expenses NUMERIC(25, 2),
    reconciled_depreciation NUMERIC(25, 2),
    operating_income NUMERIC(25, 2),
    total_operating_income_as_reported NUMERIC(25, 2),
    net_non_operating_interest_income_expense NUMERIC(25, 2),
    non_operating_interest_income NUMERIC(25, 2),
    non_operating_interest_expense NUMERIC(25, 2),
    other_income_expense NUMERIC(25, 2),
    other_non_operating_income_expenses NUMERIC(25, 2),
    pretax_income NUMERIC(25, 2),
    net_income_common_stockholders NUMERIC(25, 2),
    net_income_attributable_to_parent_shareholders NUMERIC(25, 2),
    net_income_including_non_controlling_interests NUMERIC(25, 2),
    net_income_continuous_operations NUMERIC(25, 2),
    diluted_ni_available_to_common_stockholders NUMERIC(25, 2),
    net_income_from_continuing_discontinued_operation NUMERIC(25, 2),
    net_income_from_continuing_operation_net_minority_interest NUMERIC(25, 2),
    normalized_income NUMERIC(25, 2),
    interest_income NUMERIC(25, 2),
    interest_expense NUMERIC(25, 2),
    net_interest_income NUMERIC(25, 2),
    basic_eps NUMERIC(10, 4),
    diluted_eps NUMERIC(10, 4),
    basic_average_shares BIGINT,
    diluted_average_shares BIGINT,
    ebit NUMERIC(25, 2),
    ebitda NUMERIC(25, 2),
    normalized_ebitda NUMERIC(25, 2),
    tax_provision NUMERIC(25, 2),
    tax_rate_for_calcs NUMERIC(10, 4),
    tax_effect_of_unusual_items NUMERIC(25, 2),
    data_provider VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ist.symbol,
        ist.frequency,
        ist.fiscal_date,
        ist.total_revenue,
        ist.operating_revenue,
        ist.cost_of_revenue,
        ist.gross_profit,
        ist.reconciled_cost_of_revenue,
        ist.operating_expense,
        ist.selling_general_and_administrative,
        ist.research_and_development,
        ist.total_expenses,
        ist.reconciled_depreciation,
        ist.operating_income,
        ist.total_operating_income_as_reported,
        ist.net_non_operating_interest_income_expense,
        ist.non_operating_interest_income,
        ist.non_operating_interest_expense,
        ist.other_income_expense,
        ist.other_non_operating_income_expenses,
        ist.pretax_income,
        ist.net_income_common_stockholders,
        ist.net_income_attributable_to_parent_shareholders,
        ist.net_income_including_non_controlling_interests,
        ist.net_income_continuous_operations,
        ist.diluted_ni_available_to_common_stockholders,
        ist.net_income_from_continuing_discontinued_operation,
        ist.net_income_from_continuing_operation_net_minority_interest,
        ist.normalized_income,
        ist.interest_income,
        ist.interest_expense,
        ist.net_interest_income,
        ist.basic_eps,
        ist.diluted_eps,
        ist.basic_average_shares,
        ist.diluted_average_shares,
        ist.ebit,
        ist.ebitda,
        ist.normalized_ebitda,
        ist.tax_provision,
        ist.tax_rate_for_calcs,
        ist.tax_effect_of_unusual_items,
        ist.data_provider,
        ist.created_at,
        ist.updated_at
    FROM
        income_statement ist
    WHERE
        ist.symbol = UPPER(p_symbol) AND ist.frequency = p_frequency
    ORDER BY
        ist.fiscal_date DESC
    LIMIT
        p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Get the last 10 quarters of income statement data for Apple
SELECT * FROM get_income_statement('AAPL', 'quarterly', 10);

-- Get the last 5 years of annual income statement data for Microsoft
SELECT * FROM get_income_statement('MSFT', 'annual', 5);

-- Get the last 20 quarters of income statement data for Google
SELECT * FROM get_income_statement('GOOGL', 'quarterly', 20);
*/
