-- Function to get analytics for a specific setup
CREATE OR REPLACE FUNCTION public.get_setup_analytics(
    p_user_id UUID,
    p_setup_id INTEGER,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    total_trades BIGINT,
    winning_trades BIGINT,
    losing_trades BIGINT,
    win_rate NUMERIC,
    total_profit_loss NUMERIC,
    avg_profit NUMERIC,
    avg_loss NUMERIC,
    profit_factor NUMERIC,
    max_drawdown NUMERIC,
    avg_holding_period INTERVAL,
    avg_confidence_rating NUMERIC,
    trade_type_distribution JSONB,
    symbol_distribution JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_setup_name TEXT;
    v_setup_category TEXT;
    v_setup_conditions TEXT;
    v_has_access BOOLEAN;
BEGIN
    -- Check if user has access to the setup and get setup details
    SELECT
        s.name,
        s.category,
        s.setup_conditions,
        TRUE
    INTO
        v_setup_name,
        v_setup_category,
        v_setup_conditions,
        v_has_access
    FROM
        public.setups s
    WHERE
        s.id = p_setup_id
        AND s.user_id = p_user_id;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Setup not found or access denied.';
    END IF;

    -- Return analytics for the setup
    RETURN QUERY
    WITH trade_data AS (
        -- Stock trades
        SELECT
            'stock' AS trade_type,
            s.symbol,
            s.entry_date,
            s.exit_date,
            (s.exit_price - s.entry_price) * s.number_shares *
                CASE WHEN s.trade_type = 'BUY' THEN 1 ELSE -1 END AS profit_loss,
            CASE
                WHEN s.exit_price IS NOT NULL THEN
                    ((s.exit_price - s.entry_price) / s.entry_price) *
                    CASE WHEN s.trade_type = 'BUY' THEN 1 ELSE -1 END * 100
                ELSE NULL
            END AS return_pct,
            ts.confidence_rating,
            s.exit_date - s.entry_date AS holding_period
        FROM
            public.trade_setups ts
            JOIN public.stocks s ON ts.stock_id = s.id
        WHERE
            ts.setup_id = p_setup_id
            AND ts.user_id = p_user_id
            AND ts.stock_id IS NOT NULL
            AND (p_start_date IS NULL OR s.entry_date >= p_start_date)
            AND (p_end_date IS NULL OR s.entry_date <= p_end_date)
            AND s.exit_price IS NOT NULL  -- Only count closed trades for analytics

        UNION ALL

        -- Option trades
        SELECT
            'option' AS trade_type,
            o.symbol,
            o.entry_date,
            o.exit_date,
            (o.exit_price - o.entry_price) * o.number_of_contracts * 100 AS profit_loss,
            CASE
                WHEN o.exit_price IS NOT NULL AND o.entry_price > 0 THEN
                    ((o.exit_price - o.entry_price) / o.entry_price) * 100
                ELSE NULL
            END AS return_pct,
            ts.confidence_rating,
            o.exit_date - o.entry_date AS holding_period
        FROM
            public.trade_setups ts
            JOIN public.options o ON ts.option_id = o.id
        WHERE
            ts.setup_id = p_setup_id
            AND ts.user_id = p_user_id
            AND ts.option_id IS NOT NULL
            AND (p_start_date IS NULL OR o.entry_date >= p_start_date)
            AND (p_end_date IS NULL OR o.entry_date <= p_end_date)
            AND o.exit_price IS NOT NULL  -- Only count closed trades for analytics
    ),
    analytics AS (
        SELECT
            COUNT(*) AS total_trades,
            COUNT(*) FILTER (WHERE profit_loss > 0) AS winning_trades,
            COUNT(*) FILTER (WHERE profit_loss < 0) AS losing_trades,
            ROUND(COUNT(*) FILTER (WHERE profit_loss > 0) * 100.0 /
                  NULLIF(COUNT(*) FILTER (WHERE profit_loss IS NOT NULL), 0), 2) AS win_rate,
            COALESCE(SUM(profit_loss), 0) AS total_profit_loss,
            ROUND(AVG(profit_loss) FILTER (WHERE profit_loss > 0), 2) AS avg_profit,
            ROUND(AVG(profit_loss) FILTER (WHERE profit_loss < 0), 2) AS avg_loss,
            ROUND(COALESCE(
                SUM(profit_loss) FILTER (WHERE profit_loss > 0) /
                NULLIF(ABS(SUM(profit_loss) FILTER (WHERE profit_loss < 0)), 0),
                0
            ), 2) AS profit_factor,
            (
                SELECT MIN(equity_curve.drawdown)
                FROM (
                    SELECT
                        entry_date,
                        SUM(profit_loss) OVER (ORDER BY entry_date) AS running_total,
                        SUM(profit_loss) OVER (ORDER BY entry_date) -
                        MAX(SUM(profit_loss) OVER (ORDER BY entry_date)) OVER (ORDER BY entry_date) AS drawdown
                    FROM trade_data
                ) AS equity_curve
            ) AS max_drawdown,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY holding_period) AS median_holding_period,
            ROUND(AVG(confidence_rating) FILTER (WHERE confidence_rating IS NOT NULL), 2) AS avg_confidence_rating,
            (
                SELECT jsonb_object_agg(trade_type, count)
                FROM (
                    SELECT trade_type, COUNT(*) as count
                    FROM trade_data
                    GROUP BY trade_type
                ) AS type_counts
            ) AS trade_type_distribution,
            (
                SELECT jsonb_object_agg(symbol, count)
                FROM (
                    SELECT symbol, COUNT(*) as count
                    FROM trade_data
                    GROUP BY symbol
                    ORDER BY count DESC
                    LIMIT 10  -- Limit to top 10 symbols
                ) AS symbol_counts
            ) AS symbol_distribution
        FROM
            trade_data
    )
    SELECT
        a.total_trades::BIGINT,
        a.winning_trades::BIGINT,
        a.losing_trades::BIGINT,
        a.win_rate,
        a.total_profit_loss,
        a.avg_profit,
        a.avg_loss,
        a.profit_factor,
        COALESCE(a.max_drawdown, 0) AS max_drawdown,
        a.median_holding_period AS avg_holding_period,
        a.avg_confidence_rating,
        COALESCE(a.trade_type_distribution, '{}'::jsonb) AS trade_type_distribution,
        COALESCE(a.symbol_distribution, '{}'::jsonb) AS symbol_distribution
        ROUND(COALESCE(tm.avg_confidence, 0), 2) AS avg_confidence
    FROM
        trade_metrics tm
        LEFT JOIN setup_trades st ON tm.setup_id = st.setup_id
    GROUP BY
        tm.setup_id, tm.setup_name, tm.category, tm.total_trades, tm.stock_trades,
        tm.option_trades, tm.closed_trades, tm.winning_trades, tm.losing_trades,
        tm.avg_profit_loss, tm.avg_win_pct, tm.avg_loss_pct, tm.largest_win,
        tm.largest_loss, tm.avg_confidence
    ORDER BY
        tm.setup_name;
END;
$$;


-- Testing
-- SELECT get_setup_analytics();
