-- =====================================================
-- DAILY EARNINGS SUMMARY FUNCTION
-- =====================================================
-- This function fetches daily earnings data by combining:
-- 1. earnings_calendar - for scheduled/upcoming earnings
-- 2. earnings_data - for actual reported earnings
-- Returns: number of stocks reporting, companies, and quarters

CREATE OR REPLACE FUNCTION get_daily_earnings_summary(
    target_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    earnings_date DATE,
    total_companies_reporting INTEGER,
    companies_scheduled JSONB,
    companies_reported JSONB,
    quarterly_breakdown JSONB,
    summary_stats JSONB
) 
LANGUAGE plpgsql 
AS $$
BEGIN
    RETURN QUERY
    WITH scheduled_earnings AS (
        -- Get companies scheduled to report earnings on the target date
        SELECT 
            ec.earnings_date,
            ec.symbol,
            ec.fiscal_year,
            ec.fiscal_quarter,
            ec.time_of_day,
            ec.status,
            ec.sector,
            ec.industry,
            ec.eps_estimated,
            ec.revenue_estimated
        FROM earnings_calendar ec
        WHERE ec.earnings_date = target_date
            AND ec.status IN ('scheduled', 'confirmed')
    ),
    reported_earnings AS (
        -- Get companies that have reported earnings on the target date
        SELECT 
            ed.reported_date,
            ed.symbol,
            ed.fiscal_year,
            ed.fiscal_quarter,
            ed.eps,
            ed.eps_estimated,
            ed.eps_surprise_percent,
            ed.revenue,
            ed.revenue_estimated,
            ed.revenue_surprise_percent,
            ed.eps_beat_miss_met,
            ed.revenue_beat_miss_met
        FROM earnings_data ed
        WHERE ed.reported_date = target_date
    ),
    combined_data AS (
        -- Combine scheduled and reported earnings
        SELECT 
            target_date as earnings_date,
            COALESCE(se.symbol, re.symbol) as symbol,
            COALESCE(se.fiscal_year, re.fiscal_year) as fiscal_year,
            COALESCE(se.fiscal_quarter, re.fiscal_quarter) as fiscal_quarter,
            se.time_of_day,
            se.status,
            se.sector,
            se.industry,
            se.eps_estimated as scheduled_eps_estimate,
            se.revenue_estimated as scheduled_revenue_estimate,
            re.eps as actual_eps,
            re.eps_surprise_percent,
            re.revenue as actual_revenue,
            re.revenue_surprise_percent,
            re.eps_beat_miss_met,
            re.revenue_beat_miss_met,
            CASE 
                WHEN re.symbol IS NOT NULL THEN 'reported'
                WHEN se.symbol IS NOT NULL THEN 'scheduled'
            END as report_status
        FROM scheduled_earnings se
        FULL OUTER JOIN reported_earnings re ON se.symbol = re.symbol 
            AND se.fiscal_year = re.fiscal_year 
            AND se.fiscal_quarter = re.fiscal_quarter
    )
    SELECT 
        target_date as earnings_date,
        
        -- Total number of companies reporting/scheduled
        COUNT(*)::INTEGER as total_companies_reporting,
        
        -- Detailed breakdown of scheduled companies
        jsonb_agg(
            CASE WHEN report_status = 'scheduled' THEN
                jsonb_build_object(
                    'symbol', symbol,
                    'fiscal_year', fiscal_year,
                    'fiscal_quarter', fiscal_quarter,
                    'time_of_day', time_of_day,
                    'status', status,
                    'sector', sector,
                    'industry', industry,
                    'eps_estimated', scheduled_eps_estimate,
                    'revenue_estimated', scheduled_revenue_estimate
                )
            END
        ) FILTER (WHERE report_status = 'scheduled') as companies_scheduled,
        
        -- Detailed breakdown of companies that have reported
        jsonb_agg(
            CASE WHEN report_status = 'reported' THEN
                jsonb_build_object(
                    'symbol', symbol,
                    'fiscal_year', fiscal_year,
                    'fiscal_quarter', fiscal_quarter,
                    'actual_eps', actual_eps,
                    'eps_surprise_percent', eps_surprise_percent,
                    'actual_revenue', actual_revenue,
                    'revenue_surprise_percent', revenue_surprise_percent,
                    'eps_beat_miss_met', eps_beat_miss_met,
                    'revenue_beat_miss_met', revenue_beat_miss_met
                )
            END
        ) FILTER (WHERE report_status = 'reported') as companies_reported,
        
        -- Quarterly breakdown
        jsonb_object_agg(
            CONCAT('Q', fiscal_quarter, '_', fiscal_year),
            jsonb_build_object(
                'quarter', fiscal_quarter,
                'year', fiscal_year,
                'company_count', COUNT(*) FILTER (WHERE fiscal_quarter IS NOT NULL),
                'companies', jsonb_agg(symbol) FILTER (WHERE fiscal_quarter IS NOT NULL)
            )
        ) as quarterly_breakdown,
        
        -- Summary statistics
        jsonb_build_object(
            'total_scheduled', COUNT(*) FILTER (WHERE report_status = 'scheduled'),
            'total_reported', COUNT(*) FILTER (WHERE report_status = 'reported'),
            'quarters_represented', COUNT(DISTINCT CONCAT(fiscal_quarter, '_', fiscal_year)),
            'sectors_represented', COUNT(DISTINCT sector),
            'avg_eps_surprise', ROUND(AVG(eps_surprise_percent), 2),
            'eps_beats', COUNT(*) FILTER (WHERE eps_beat_miss_met = 'beat'),
            'eps_misses', COUNT(*) FILTER (WHERE eps_beat_miss_met = 'miss'),
            'eps_meets', COUNT(*) FILTER (WHERE eps_beat_miss_met = 'met'),
            'revenue_beats', COUNT(*) FILTER (WHERE revenue_beat_miss_met = 'beat'),
            'revenue_misses', COUNT(*) FILTER (WHERE revenue_beat_miss_met = 'miss'),
            'revenue_meets', COUNT(*) FILTER (WHERE revenue_beat_miss_met = 'met')
        ) as summary_stats
        
    FROM combined_data;
END;
$$;



-- USAGE EXAMPLES

/*
-- Get comprehensive daily earnings summary for today
SELECT * FROM get_daily_earnings_summary();

-- Get daily earnings summary for a specific date
SELECT * FROM get_daily_earnings_summary('2024-01-15');
*/


-- INDEXES FOR PERFORMANCE

-- Additional indexes to optimize the functions (if not already exists)
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_date_symbol ON earnings_calendar (earnings_date, symbol);
CREATE INDEX IF NOT EXISTS idx_earnings_data_date_symbol ON earnings_data (reported_date, symbol);
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_fiscal ON earnings_calendar (fiscal_year, fiscal_quarter, symbol);
CREATE INDEX IF NOT EXISTS idx_earnings_data_fiscal ON earnings_data (fiscal_year, fiscal_quarter, symbol);

-- Grant permissions for the functions
GRANT EXECUTE ON FUNCTION get_daily_earnings_summary(DATE) TO PUBLIC;