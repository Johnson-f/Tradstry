-- AI Reports Upsert Function
-- Stores or updates AI-generated trading reports with vector embeddings

CREATE OR REPLACE FUNCTION upsert_ai_report(
    p_time_period VARCHAR(50),
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_report_title VARCHAR(255),
    p_executive_summary TEXT,
    p_full_report TEXT,
    p_data_analysis TEXT,
    p_insights TEXT,
    p_win_rate DECIMAL(5,2) DEFAULT NULL,
    p_profit_factor DECIMAL(8,2) DEFAULT NULL,
    p_trade_expectancy DECIMAL(10,2) DEFAULT NULL,
    p_total_trades INTEGER DEFAULT NULL,
    p_net_pnl DECIMAL(12,2) DEFAULT NULL,
    p_report_embedding vector(1536) DEFAULT NULL,
    p_summary_embedding vector(1536) DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_model_versions JSONB DEFAULT NULL,
    p_processing_time_ms INTEGER DEFAULT NULL,
    p_user_id UUID DEFAULT NULL  -- Optional parameter for manual testing
)
RETURNS TABLE(
    report_id UUID,
    created BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    v_report_hash VARCHAR(64);
    v_existing_id UUID;
    v_new_id UUID;
    v_created BOOLEAN := FALSE;
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

    -- Generate hash of report content to prevent duplicates
    v_report_hash := encode(
        digest(
            CONCAT(
                COALESCE(current_user_id::TEXT, ''),
                COALESCE(p_time_period, ''),
                COALESCE(p_start_date::TEXT, ''),
                COALESCE(p_end_date::TEXT, ''),
                COALESCE(p_full_report, '')
            ),
            'sha256'
        ),
        'hex'
    );

    -- Check if report already exists
    SELECT id INTO v_existing_id
    FROM ai_reports
    WHERE report_hash = v_report_hash
    AND user_id = current_user_id;

    IF v_existing_id IS NOT NULL THEN
        -- Update existing report
        UPDATE ai_reports SET
            report_title = p_report_title,
            executive_summary = p_executive_summary,
            full_report = p_full_report,
            data_analysis = p_data_analysis,
            insights = p_insights,
            win_rate = p_win_rate,
            profit_factor = p_profit_factor,
            trade_expectancy = p_trade_expectancy,
            total_trades = p_total_trades,
            net_pnl = p_net_pnl,
            report_embedding = p_report_embedding,
            summary_embedding = p_summary_embedding,
            tags = p_tags,
            model_versions = p_model_versions,
            processing_time_ms = p_processing_time_ms,
            updated_at = NOW()
        WHERE id = v_existing_id;

        RETURN QUERY SELECT
            v_existing_id,
            FALSE,
            'Report updated successfully'::TEXT;
    ELSE
        -- Insert new report
        INSERT INTO ai_reports (
            user_id,
            time_period,
            start_date,
            end_date,
            report_title,
            executive_summary,
            full_report,
            data_analysis,
            insights,
            win_rate,
            profit_factor,
            trade_expectancy,
            total_trades,
            net_pnl,
            report_embedding,
            summary_embedding,
            report_hash,
            tags,
            model_versions,
            processing_time_ms
        ) VALUES (
            current_user_id,
            p_time_period,
            p_start_date,
            p_end_date,
            p_report_title,
            p_executive_summary,
            p_full_report,
            p_data_analysis,
            p_insights,
            p_win_rate,
            p_profit_factor,
            p_trade_expectancy,
            p_total_trades,
            p_net_pnl,
            p_report_embedding,
            p_summary_embedding,
            v_report_hash,
            p_tags,
            p_model_versions,
            p_processing_time_ms
        ) RETURNING id INTO v_new_id;

        v_created := TRUE;

        RETURN QUERY SELECT
            v_new_id,
            v_created,
            'Report created successfully'::TEXT;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT
            NULL::UUID,
            FALSE,
            ('Error: ' || SQLERRM)::TEXT;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION upsert_ai_report TO authenticated;

-- Example usage:
-- For production (authenticated user):
-- SELECT * FROM upsert_ai_report('weekly', '2024-01-01', '2024-01-07', 'Weekly Report', 'Executive summary...', 'Full report...', 'Data analysis...', 'Insights...');
--
-- For testing (manual user_id):
-- SELECT * FROM upsert_ai_report('weekly', '2024-01-01', '2024-01-07', 'Weekly Report', 'Executive summary...', 'Full report...', 'Data analysis...', 'Insights...', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '550e8400-e29b-41d4-a716-446655440000'::uuid);
