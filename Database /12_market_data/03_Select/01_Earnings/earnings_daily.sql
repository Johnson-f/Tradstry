-- DAILY EARNINGS SUMMARY FUNCTION
-- This function fetches daily earnings data by combining:
-- 1. earnings_calendar - for scheduled/upcoming earnings
-- 2. earnings_data - for actual reported earnings
-- Returns: number of stocks reporting, companies, news, sentiment, relevance, mention type, sentiment impact, confidence score, and quarters

CREATE OR REPLACE FUNCTION get_daily_earnings_summary(
    target_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    earnings_date DATE,
    total_companies_reporting INTEGER,
    companies_scheduled JSONB,
    companies_reported JSONB,
    quarterly_breakdown JSONB,
    summary_stats JSONB,
    news_summary JSONB
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
    combined_data AS (
        -- Use only scheduled earnings (earnings_data table deleted)
        SELECT 
            target_date as earnings_date,
            se.symbol,
            se.fiscal_year,
            se.fiscal_quarter,
            se.time_of_day,
            se.status,
            se.sector,
            se.industry,
            se.eps_estimated as scheduled_eps_estimate,
            se.revenue_estimated as scheduled_revenue_estimate,
            NULL::NUMERIC as actual_eps,
            NULL::NUMERIC as eps_surprise_percent,
            NULL::BIGINT as actual_revenue,
            NULL::NUMERIC as revenue_surprise_percent,
            NULL::TEXT as eps_beat_miss_met,
            NULL::TEXT as revenue_beat_miss_met,
            'scheduled' as report_status
        FROM scheduled_earnings se
    ),
    stock_news AS (
        -- Get recent news for stocks appearing in earnings data using finance_news_stocks relationship table
        SELECT 
            cd.symbol,
            jsonb_agg(
                jsonb_build_object(
                    'title', fn.title,
                    'news_url', fn.news_url,
                    'source', fn.source_name,
                    'published_at', fn.published_at,
                    'sentiment_score', fn.sentiment_score,
                    'relevance_score', fn.relevance_score,
                    'time_published', fn.time_published,
                    'image_url', fn.image_url,
                    'mention_type', fns.mention_type,
                    'sentiment_impact', fns.sentiment_impact,
                    'confidence_score', fns.confidence_score
                ) ORDER BY fn.published_at DESC
            ) as news_articles,
            COUNT(fn.id) as news_count,
            AVG(fn.sentiment_score) as avg_sentiment,
            AVG(fns.sentiment_impact) as avg_sentiment_impact,
            MAX(fn.published_at) as latest_news_date
        FROM combined_data cd
        LEFT JOIN finance_news_stocks fns ON cd.symbol = fns.stock_symbol
        LEFT JOIN finance_news fn ON fns.finance_news_id = fn.id
        WHERE fn.published_at >= (target_date - INTERVAL '7 days')  -- Get news from past week
            AND fn.published_at <= (target_date + INTERVAL '1 day')  -- Include day after earnings
        GROUP BY cd.symbol
    ),
    quarterly_stats AS (
        -- Pre-calculate quarterly breakdown to avoid nested aggregates
        SELECT 
            CONCAT('Q', cd.fiscal_quarter, '_', cd.fiscal_year) as quarter_key,
            cd.fiscal_quarter,
            cd.fiscal_year,
            COUNT(*) as company_count,
            jsonb_agg(cd.symbol) as companies
        FROM combined_data cd
        WHERE cd.fiscal_quarter IS NOT NULL
        GROUP BY cd.fiscal_quarter, cd.fiscal_year
    )
    SELECT 
        target_date as earnings_date,
        
        -- Total number of companies reporting/scheduled
        COUNT(*)::INTEGER as total_companies_reporting,
        
        -- Detailed breakdown of scheduled companies
        jsonb_agg(
            CASE WHEN cd.report_status = 'scheduled' THEN
                jsonb_build_object(
                    'symbol', cd.symbol,
                    'fiscal_year', cd.fiscal_year,
                    'fiscal_quarter', cd.fiscal_quarter,
                    'time_of_day', cd.time_of_day,
                    'status', cd.status,
                    'sector', cd.sector,
                    'industry', cd.industry,
                    'eps_estimated', cd.scheduled_eps_estimate,
                    'revenue_estimated', cd.scheduled_revenue_estimate,
                    'news_count', COALESCE(sn.news_count, 0),
                    'avg_sentiment', sn.avg_sentiment,
                    'latest_news_date', sn.latest_news_date,
                    'recent_news', COALESCE(sn.news_articles, '[]'::jsonb)
                )
            END
        ) FILTER (WHERE cd.report_status = 'scheduled') as companies_scheduled,
        
        -- Detailed breakdown of companies that have reported
        jsonb_agg(
            CASE WHEN cd.report_status = 'reported' THEN
                jsonb_build_object(
                    'symbol', cd.symbol,
                    'fiscal_year', cd.fiscal_year,
                    'fiscal_quarter', cd.fiscal_quarter,
                    'actual_eps', cd.actual_eps,
                    'eps_surprise_percent', cd.eps_surprise_percent,
                    'actual_revenue', cd.actual_revenue,
                    'revenue_surprise_percent', cd.revenue_surprise_percent,
                    'eps_beat_miss_met', cd.eps_beat_miss_met,
                    'revenue_beat_miss_met', cd.revenue_beat_miss_met,
                    'news_count', COALESCE(sn.news_count, 0),
                    'avg_sentiment', sn.avg_sentiment,
                    'latest_news_date', sn.latest_news_date,
                    'recent_news', COALESCE(sn.news_articles, '[]'::jsonb)
                )
            END
        ) FILTER (WHERE cd.report_status = 'reported') as companies_reported,
        
        -- Quarterly breakdown (fixed - no nested aggregates)
        (
            SELECT jsonb_object_agg(
                qs.quarter_key,
                jsonb_build_object(
                    'quarter', qs.fiscal_quarter,
                    'year', qs.fiscal_year,
                    'company_count', qs.company_count,
                    'companies', qs.companies
                )
            )
            FROM quarterly_stats qs
        ) as quarterly_breakdown,
        
        -- Summary statistics
        jsonb_build_object(
            'total_scheduled', COUNT(*) FILTER (WHERE cd.report_status = 'scheduled'),
            'total_reported', COUNT(*) FILTER (WHERE cd.report_status = 'reported'),
            'quarters_represented', COUNT(DISTINCT CONCAT(cd.fiscal_quarter, '_', cd.fiscal_year)),
            'sectors_represented', COUNT(DISTINCT cd.sector),
            'avg_eps_surprise', ROUND(AVG(cd.eps_surprise_percent), 2),
            'eps_beats', COUNT(*) FILTER (WHERE cd.eps_beat_miss_met = 'beat'),
            'eps_misses', COUNT(*) FILTER (WHERE cd.eps_beat_miss_met = 'miss'),
            'eps_meets', COUNT(*) FILTER (WHERE cd.eps_beat_miss_met = 'met'),
            'revenue_beats', COUNT(*) FILTER (WHERE cd.revenue_beat_miss_met = 'beat'),
            'revenue_misses', COUNT(*) FILTER (WHERE cd.revenue_beat_miss_met = 'miss'),
            'revenue_meets', COUNT(*) FILTER (WHERE cd.revenue_beat_miss_met = 'met'),
            'companies_with_news', COUNT(*) FILTER (WHERE sn.news_count > 0),
            'total_news_articles', COALESCE(SUM(sn.news_count), 0),
            'avg_news_sentiment', ROUND(AVG(sn.avg_sentiment), 3)
        ) as summary_stats,
        
        -- News summary aggregation
        jsonb_build_object(
            'total_articles_found', COALESCE(SUM(sn.news_count), 0),
            'companies_with_news', COUNT(*) FILTER (WHERE sn.news_count > 0),
            'avg_sentiment_all_stocks', ROUND(AVG(sn.avg_sentiment), 3),
            'most_recent_news', MAX(sn.latest_news_date),
            'sentiment_distribution', jsonb_build_object(
                'positive', COUNT(*) FILTER (WHERE sn.avg_sentiment > 0.1),
                'neutral', COUNT(*) FILTER (WHERE sn.avg_sentiment BETWEEN -0.1 AND 0.1),
                'negative', COUNT(*) FILTER (WHERE sn.avg_sentiment < -0.1)
            ),
            'top_news_by_relevance', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'symbol', fns2.stock_symbol,
                        'title', fn2.title,
                        'source', fn2.source_name,
                        'published_at', fn2.published_at,
                        'sentiment_score', fn2.sentiment_score,
                        'relevance_score', fn2.relevance_score,
                        'mention_type', fns2.mention_type,
                        'sentiment_impact', fns2.sentiment_impact,
                        'confidence_score', fns2.confidence_score
                    ) ORDER BY fn2.relevance_score DESC, fn2.published_at DESC
                )
                FROM finance_news fn2
                JOIN finance_news_stocks fns2 ON fn2.id = fns2.finance_news_id
                WHERE EXISTS (
                    SELECT 1 FROM combined_data cd2 
                    WHERE cd2.symbol = fns2.stock_symbol
                )
                AND fn2.published_at >= (target_date - INTERVAL '7 days')
                AND fn2.published_at <= (target_date + INTERVAL '1 day')
                LIMIT 10
            )
        ) as news_summary
        
    FROM combined_data cd
    LEFT JOIN stock_news sn ON cd.symbol = sn.symbol;
END;
$$;

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_date_symbol ON earnings_calendar (earnings_date, symbol);
CREATE INDEX IF NOT EXISTS idx_earnings_data_date_symbol ON earnings_data (reported_date, symbol);
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_fiscal ON earnings_calendar (fiscal_year, fiscal_quarter, symbol);
CREATE INDEX IF NOT EXISTS idx_earnings_data_fiscal ON earnings_data (fiscal_year, fiscal_quarter, symbol);

-- Grant permissions for the functions
GRANT EXECUTE ON FUNCTION get_daily_earnings_summary(DATE) TO PUBLIC;


-- USAGE EXAMPLES
/*
-- Get comprehensive daily earnings summary for today
SELECT * FROM get_daily_earnings_summary();

-- Get daily earnings summary for a specific date
SELECT * FROM get_daily_earnings_summary('2024-01-15');
*/