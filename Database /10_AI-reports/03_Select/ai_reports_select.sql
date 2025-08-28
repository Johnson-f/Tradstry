-- AI Reports Select Functions
-- Functions for retrieving and searching AI-generated trading reports

-- Function to get user's AI reports with filtering and pagination
CREATE OR REPLACE FUNCTION get_ai_reports(
    p_time_period VARCHAR(50) DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_order_by VARCHAR(20) DEFAULT 'generated_at',
    p_order_direction VARCHAR(4) DEFAULT 'DESC',
    p_user_id UUID DEFAULT NULL  -- Optional parameter for manual testing
)
RETURNS TABLE(
    id UUID,
    time_period VARCHAR(50),
    start_date DATE,
    end_date DATE,
    generated_at TIMESTAMP WITH TIME ZONE,
    report_title VARCHAR(255),
    executive_summary TEXT,
    win_rate DECIMAL(5,2),
    profit_factor DECIMAL(8,2),
    trade_expectancy DECIMAL(10,2),
    total_trades INTEGER,
    net_pnl DECIMAL(12,2),
    tags TEXT[],
    processing_time_ms INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
BEGIN
    -- Use provided user_id if given, otherwise get from auth context
    IF p_user_id IS NOT NULL THEN
        current_user_id := p_user_id;
    ELSE
        current_user_id := auth.uid();

        -- Raise an error if no authenticated user and no manual user_id provided
        IF current_user_id IS NULL THEN
            RAISE EXCEPTION 'No authenticated user found and no user_id provided. Please ensure you are logged in or provide a user_id parameter for testing.';
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        r.id,
        r.time_period,
        r.start_date,
        r.end_date,
        r.generated_at,
        r.report_title,
        r.executive_summary,
        r.win_rate,
        r.profit_factor,
        r.trade_expectancy,
        r.total_trades,
        r.net_pnl,
        r.tags,
        r.processing_time_ms
    FROM ai_reports r
    WHERE r.user_id = current_user_id
        AND (p_time_period IS NULL OR r.time_period = p_time_period)
        AND (p_start_date IS NULL OR r.start_date >= p_start_date)
        AND (p_end_date IS NULL OR r.end_date <= p_end_date)
        AND (p_tags IS NULL OR r.tags && p_tags) -- Array overlap operator
    ORDER BY
        CASE
            WHEN p_order_by = 'generated_at' AND p_order_direction = 'DESC' THEN r.generated_at
        END DESC,
        CASE
            WHEN p_order_by = 'generated_at' AND p_order_direction = 'ASC' THEN r.generated_at
        END ASC,
        CASE
            WHEN p_order_by = 'win_rate' AND p_order_direction = 'DESC' THEN r.win_rate
        END DESC,
        CASE
            WHEN p_order_by = 'win_rate' AND p_order_direction = 'ASC' THEN r.win_rate
        END ASC,
        CASE
            WHEN p_order_by = 'net_pnl' AND p_order_direction = 'DESC' THEN r.net_pnl
        END DESC,
        CASE
            WHEN p_order_by = 'net_pnl' AND p_order_direction = 'ASC' THEN r.net_pnl
        END ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get full AI report by ID
CREATE OR REPLACE FUNCTION get_ai_report_by_id(
    p_report_id UUID,
    p_user_id UUID DEFAULT NULL  -- Optional parameter for manual testing
)
RETURNS TABLE(
    id UUID,
    time_period VARCHAR(50),
    start_date DATE,
    end_date DATE,
    generated_at TIMESTAMP WITH TIME ZONE,
    report_title VARCHAR(255),
    executive_summary TEXT,
    full_report TEXT,
    data_analysis TEXT,
    insights TEXT,
    win_rate DECIMAL(5,2),
    profit_factor DECIMAL(8,2),
    trade_expectancy DECIMAL(10,2),
    total_trades INTEGER,
    net_pnl DECIMAL(12,2),
    tags TEXT[],
    model_versions JSONB,
    processing_time_ms INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
BEGIN
    -- Use provided user_id if given, otherwise get from auth context
    IF p_user_id IS NOT NULL THEN
        current_user_id := p_user_id;
    ELSE
        current_user_id := auth.uid();

        -- Raise an error if no authenticated user and no manual user_id provided
        IF current_user_id IS NULL THEN
            RAISE EXCEPTION 'No authenticated user found and no user_id provided. Please ensure you are logged in or provide a user_id parameter for testing.';
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        r.id,
        r.time_period,
        r.start_date,
        r.end_date,
        r.generated_at,
        r.report_title,
        r.executive_summary,
        r.full_report,
        r.data_analysis,
        r.insights,
        r.win_rate,
        r.profit_factor,
        r.trade_expectancy,
        r.total_trades,
        r.net_pnl,
        r.tags,
        r.model_versions,
        r.processing_time_ms
    FROM ai_reports r
    WHERE r.user_id = current_user_id
        AND r.id = p_report_id;
END;
$$;

-- Function for semantic similarity search using vector embeddings
CREATE OR REPLACE FUNCTION search_similar_ai_reports(
    p_query_embedding vector(1536),
    p_similarity_threshold FLOAT DEFAULT 0.8,
    p_limit INTEGER DEFAULT 10,
    p_search_type VARCHAR(10) DEFAULT 'report', -- 'report' or 'summary'
    p_user_id UUID DEFAULT NULL  -- Optional parameter for manual testing
)
RETURNS TABLE(
    id UUID,
    time_period VARCHAR(50),
    start_date DATE,
    end_date DATE,
    generated_at TIMESTAMP WITH TIME ZONE,
    report_title VARCHAR(255),
    executive_summary TEXT,
    similarity_score FLOAT,
    win_rate DECIMAL(5,2),
    profit_factor DECIMAL(8,2),
    net_pnl DECIMAL(12,2),
    tags TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
BEGIN
    -- Use provided user_id if given, otherwise get from auth context
    IF p_user_id IS NOT NULL THEN
        current_user_id := p_user_id;
    ELSE
        current_user_id := auth.uid();

        -- Raise an error if no authenticated user and no manual user_id provided
        IF current_user_id IS NULL THEN
            RAISE EXCEPTION 'No authenticated user found and no user_id provided. Please ensure you are logged in or provide a user_id parameter for testing.';
        END IF;
    END IF;

    IF p_search_type = 'summary' THEN
        RETURN QUERY
        SELECT
            r.id,
            r.time_period,
            r.start_date,
            r.end_date,
            r.generated_at,
            r.report_title,
            r.executive_summary,
            (1 - (r.summary_embedding <=> p_query_embedding))::FLOAT as similarity_score,
            r.win_rate,
            r.profit_factor,
            r.net_pnl,
            r.tags
        FROM ai_reports r
        WHERE r.user_id = current_user_id
            AND r.summary_embedding IS NOT NULL
            AND (1 - (r.summary_embedding <=> p_query_embedding)) >= p_similarity_threshold
        ORDER BY r.summary_embedding <=> p_query_embedding
        LIMIT p_limit;
    ELSE
        RETURN QUERY
        SELECT
            r.id,
            r.time_period,
            r.start_date,
            r.end_date,
            r.generated_at,
            r.report_title,
            r.executive_summary,
            (1 - (r.report_embedding <=> p_query_embedding))::FLOAT as similarity_score,
            r.win_rate,
            r.profit_factor,
            r.net_pnl,
            r.tags
        FROM ai_reports r
        WHERE r.user_id = current_user_id
            AND r.report_embedding IS NOT NULL
            AND (1 - (r.report_embedding <=> p_query_embedding)) >= p_similarity_threshold
        ORDER BY r.report_embedding <=> p_query_embedding
        LIMIT p_limit;
    END IF;
END;
$$;

-- Function to get AI report statistics for dashboard
CREATE OR REPLACE FUNCTION get_ai_report_stats(
    p_days_back INTEGER DEFAULT 30,
    p_user_id UUID DEFAULT NULL  -- Optional parameter for manual testing
)
RETURNS TABLE(
    total_reports INTEGER,
    avg_win_rate DECIMAL(5,2),
    avg_profit_factor DECIMAL(8,2),
    avg_processing_time_ms INTEGER,
    most_common_tags TEXT[],
    best_performing_period VARCHAR(50),
    reports_this_month INTEGER,
    improvement_trend VARCHAR(20) -- 'improving', 'declining', 'stable'
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    v_recent_avg_win_rate DECIMAL(5,2);
    v_older_avg_win_rate DECIMAL(5,2);
    v_trend VARCHAR(20);
BEGIN
    -- Use provided user_id if given, otherwise get from auth context
    IF p_user_id IS NOT NULL THEN
        current_user_id := p_user_id;
    ELSE
        current_user_id := auth.uid();

        -- Raise an error if no authenticated user and no manual user_id provided
        IF current_user_id IS NULL THEN
            RAISE EXCEPTION 'No authenticated user found and no user_id provided. Please ensure you are logged in or provide a user_id parameter for testing.';
        END IF;
    END IF;

    -- Calculate recent vs older performance for trend analysis
    SELECT AVG(win_rate) INTO v_recent_avg_win_rate
    FROM ai_reports
    WHERE user_id = current_user_id
        AND generated_at >= NOW() - INTERVAL '15 days'
        AND win_rate IS NOT NULL;

    SELECT AVG(win_rate) INTO v_older_avg_win_rate
    FROM ai_reports
    WHERE user_id = current_user_id
        AND generated_at >= NOW() - INTERVAL '30 days'
        AND generated_at < NOW() - INTERVAL '15 days'
        AND win_rate IS NOT NULL;

    -- Determine trend
    IF v_recent_avg_win_rate IS NULL OR v_older_avg_win_rate IS NULL THEN
        v_trend := 'insufficient_data';
    ELSIF v_recent_avg_win_rate > v_older_avg_win_rate + 2 THEN
        v_trend := 'improving';
    ELSIF v_recent_avg_win_rate < v_older_avg_win_rate - 2 THEN
        v_trend := 'declining';
    ELSE
        v_trend := 'stable';
    END IF;

    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_reports,
        AVG(r.win_rate)::DECIMAL(5,2) as avg_win_rate,
        AVG(r.profit_factor)::DECIMAL(8,2) as avg_profit_factor,
        AVG(r.processing_time_ms)::INTEGER as avg_processing_time_ms,
        (
            SELECT ARRAY_AGG(tag ORDER BY tag_count DESC)
            FROM (
                SELECT UNNEST(tags) as tag, COUNT(*) as tag_count
                FROM ai_reports
                WHERE user_id = current_user_id
                    AND generated_at >= NOW() - INTERVAL '30 days'
                    AND tags IS NOT NULL
                GROUP BY UNNEST(tags)
                ORDER BY tag_count DESC
                LIMIT 5
            ) tag_stats
        ) as most_common_tags,
        (
            SELECT time_period
            FROM ai_reports
            WHERE user_id = current_user_id
                AND generated_at >= NOW() - INTERVAL '30 days'
                AND win_rate IS NOT NULL
            ORDER BY win_rate DESC
            LIMIT 1
        ) as best_performing_period,
        (
            SELECT COUNT(*)::INTEGER
            FROM ai_reports
            WHERE user_id = current_user_id
                AND generated_at >= DATE_TRUNC('month', NOW())
        ) as reports_this_month,
        v_trend as improvement_trend
    FROM ai_reports r
    WHERE r.user_id = current_user_id
        AND r.generated_at >= NOW() - INTERVAL '30 days';
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_ai_reports TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_report_by_id TO authenticated;
GRANT EXECUTE ON FUNCTION search_similar_ai_reports TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_report_stats TO authenticated;

-- Example usage:
-- For production (authenticated user):
-- SELECT * FROM get_ai_reports();
-- SELECT * FROM get_ai_report_by_id('550e8400-e29b-41d4-a716-446655440000');
-- SELECT * FROM get_ai_report_stats();
--
-- For testing (manual user_id):
-- SELECT * FROM get_ai_reports(NULL, NULL, NULL, NULL, 20, 0, 'generated_at', 'DESC', '550e8400-e29b-41d4-a716-446655440000'::uuid);
-- SELECT * FROM get_ai_report_by_id('report-id-here', '550e8400-e29b-41d4-a716-446655440000'::uuid);
-- SELECT * FROM get_ai_report_stats(30, '550e8400-e29b-41d4-a716-446655440000'::uuid);
