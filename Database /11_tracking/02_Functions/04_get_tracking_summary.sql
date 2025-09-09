-- Comprehensive Tracking Summary Function
-- Combines trade notes with their associated stock/option trades for AI consumption
CREATE OR REPLACE FUNCTION public.get_tracking_summary(
    p_user_id UUID DEFAULT NULL,
    p_trade_type trade_note_type DEFAULT NULL,
    p_phase trade_phase DEFAULT NULL,
    p_rating_min INTEGER DEFAULT NULL,
    p_rating_max INTEGER DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
    v_user_id UUID;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    -- Set user_id (use provided or authenticated user)
    v_user_id := COALESCE(p_user_id, auth.uid());
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User authentication required';
    END IF;

    -- Calculate date range based on time_range parameter
    CASE p_time_range
        WHEN '7d' THEN
            v_start_date := CURRENT_DATE - INTERVAL '7 days';
            v_end_date := CURRENT_DATE;
        WHEN '30d' THEN
            v_start_date := CURRENT_DATE - INTERVAL '30 days';
            v_end_date := CURRENT_DATE;
        WHEN '90d' THEN
            v_start_date := CURRENT_DATE - INTERVAL '90 days';
            v_end_date := CURRENT_DATE;
        WHEN '1y' THEN
            v_start_date := CURRENT_DATE - INTERVAL '1 year';
            v_end_date := CURRENT_DATE;
        WHEN 'ytd' THEN
            v_start_date := DATE_TRUNC('year', CURRENT_DATE);
            v_end_date := CURRENT_DATE;
        WHEN 'custom' THEN
            v_start_date := p_custom_start_date;
            v_end_date := p_custom_end_date;
        ELSE -- 'all_time'
            v_start_date := NULL;
            v_end_date := NULL;
    END CASE;

    -- Build comprehensive JSON summary
    SELECT json_build_object(
        'summary_metadata', json_build_object(
            'generated_at', NOW(),
            'user_id', v_user_id,
            'time_range', p_time_range,
            'start_date', v_start_date,
            'end_date', v_end_date,
            'filters', json_build_object(
                'trade_type', p_trade_type,
                'phase', p_phase,
                'rating_range', CASE 
                    WHEN p_rating_min IS NOT NULL OR p_rating_max IS NOT NULL 
                    THEN json_build_object('min', p_rating_min, 'max', p_rating_max)
                    ELSE NULL 
                END,
                'tags', p_tags
            )
        ),
        'tracking_overview', json_build_object(
            'total_notes', (
                SELECT COUNT(*)
                FROM trade_notes tn
                WHERE tn.user_id = v_user_id
                    AND (p_trade_type IS NULL OR tn.trade_type = p_trade_type)
                    AND (p_phase IS NULL OR tn.phase = p_phase)
                    AND (p_rating_min IS NULL OR tn.rating >= p_rating_min)
                    AND (p_rating_max IS NULL OR tn.rating <= p_rating_max)
                    AND (p_tags IS NULL OR tn.tags && p_tags)
                    AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                    AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
            ),
            'notes_by_asset_type', (
                SELECT json_build_object(
                    'stock_notes', COUNT(*) FILTER (WHERE trade_type = 'stock'),
                    'option_notes', COUNT(*) FILTER (WHERE trade_type = 'option')
                )
                FROM trade_notes tn
                WHERE tn.user_id = v_user_id
                    AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                    AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
            ),
            'notes_by_phase', (
                SELECT json_object_agg(
                    COALESCE(phase::text, 'unspecified'),
                    phase_count
                )
                FROM (
                    SELECT phase, COUNT(*) as phase_count
                    FROM trade_notes tn
                    WHERE tn.user_id = v_user_id
                        AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                        AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
                    GROUP BY phase
                ) phase_stats
            ),
            'average_rating', (
                SELECT ROUND(AVG(rating), 2)
                FROM trade_notes tn
                WHERE tn.user_id = v_user_id
                    AND rating IS NOT NULL
                    AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                    AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
            ),
            'rating_distribution', (
                SELECT json_object_agg(rating::text, rating_count)
                FROM (
                    SELECT rating, COUNT(*) as rating_count
                    FROM trade_notes tn
                    WHERE tn.user_id = v_user_id
                        AND rating IS NOT NULL
                        AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                        AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
                    GROUP BY rating
                    ORDER BY rating
                ) rating_stats
            )
        ),
        'detailed_trade_notes', (
            SELECT json_agg(
                json_build_object(
                    'note_info', json_build_object(
                        'id', tn.id,
                        'title', tn.title,
                        'content', tn.content,
                        'trade_type', tn.trade_type,
                        'phase', tn.phase,
                        'rating', tn.rating,
                        'tags', tn.tags,
                        'created_at', tn.created_at,
                        'updated_at', tn.updated_at
                    ),
                    'trade_details', CASE 
                        WHEN tn.trade_type = 'stock' THEN (
                            SELECT json_build_object(
                                'asset_type', 'stock',
                                'symbol', s.symbol,
                                'trade_type', s.trade_type,
                                'order_type', s.order_type,
                                'entry_price', s.entry_price,
                                'exit_price', s.exit_price,
                                'stop_loss', s.stop_loss,
                                'take_profit', s.take_profit,
                                'number_shares', s.number_shares,
                                'commissions', s.commissions,
                                'entry_date', s.entry_date,
                                'exit_date', s.exit_date,
                                'pnl', CASE 
                                    WHEN s.exit_price IS NOT NULL THEN 
                                        CASE s.trade_type
                                            WHEN 'BUY' THEN (s.exit_price - s.entry_price) * s.number_shares - s.commissions
                                            WHEN 'SELL' THEN (s.entry_price - s.exit_price) * s.number_shares - s.commissions
                                        END
                                    ELSE NULL
                                END,
                                'is_closed', s.exit_price IS NOT NULL,
                                'hold_time_hours', CASE 
                                    WHEN s.exit_date IS NOT NULL THEN 
                                        EXTRACT(EPOCH FROM (s.exit_date - s.entry_date)) / 3600
                                    ELSE 
                                        EXTRACT(EPOCH FROM (NOW() - s.entry_date)) / 3600
                                END
                            )
                            FROM stocks s
                            WHERE s.id = tn.trade_id AND s.user_id = v_user_id
                        )
                        WHEN tn.trade_type = 'option' THEN (
                            SELECT json_build_object(
                                'asset_type', 'option',
                                'symbol', o.symbol,
                                'strategy_type', o.strategy_type,
                                'trade_direction', o.trade_direction,
                                'option_type', o.option_type,
                                'strike_price', o.strike_price,
                                'expiration_date', o.expiration_date,
                                'entry_price', o.entry_price,
                                'exit_price', o.exit_price,
                                'number_of_contracts', o.number_of_contracts,
                                'total_premium', o.total_premium,
                                'commissions', o.commissions,
                                'implied_volatility', o.implied_volatility,
                                'entry_date', o.entry_date,
                                'exit_date', o.exit_date,
                                'status', o.status,
                                'pnl', CASE 
                                    WHEN o.exit_price IS NOT NULL THEN 
                                        (o.exit_price - o.entry_price) * o.number_of_contracts * 100 - o.commissions
                                    ELSE NULL
                                END,
                                'is_closed', o.status = 'closed',
                                'days_to_expiration', CASE 
                                    WHEN o.expiration_date IS NOT NULL THEN 
                                        EXTRACT(DAYS FROM (o.expiration_date - NOW()))
                                    ELSE NULL
                                END,
                                'hold_time_hours', CASE 
                                    WHEN o.exit_date IS NOT NULL THEN 
                                        EXTRACT(EPOCH FROM (o.exit_date - o.entry_date)) / 3600
                                    ELSE 
                                        EXTRACT(EPOCH FROM (NOW() - o.entry_date)) / 3600
                                END
                            )
                            FROM options o
                            WHERE o.id = tn.trade_id AND o.user_id = v_user_id
                        )
                        ELSE NULL
                    END
                )
                ORDER BY tn.created_at DESC
            )
            FROM trade_notes tn
            WHERE tn.user_id = v_user_id
                AND (p_trade_type IS NULL OR tn.trade_type = p_trade_type)
                AND (p_phase IS NULL OR tn.phase = p_phase)
                AND (p_rating_min IS NULL OR tn.rating >= p_rating_min)
                AND (p_rating_max IS NULL OR tn.rating <= p_rating_max)
                AND (p_tags IS NULL OR tn.tags && p_tags)
                AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
            LIMIT p_limit
        ),
        'tag_analysis', (
            SELECT json_build_object(
                'most_common_tags', (
                    SELECT json_agg(
                        json_build_object(
                            'tag', tag,
                            'count', tag_count,
                            'percentage', ROUND((tag_count::numeric / total_notes) * 100, 2)
                        )
                        ORDER BY tag_count DESC
                    )
                    FROM (
                        SELECT 
                            unnest(tags) as tag,
                            COUNT(*) as tag_count,
                            (SELECT COUNT(*) FROM trade_notes WHERE user_id = v_user_id AND tags IS NOT NULL) as total_notes
                        FROM trade_notes tn
                        WHERE tn.user_id = v_user_id
                            AND tags IS NOT NULL
                            AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                            AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
                        GROUP BY unnest(tags)
                        ORDER BY COUNT(*) DESC
                        LIMIT 20
                    ) tag_stats
                ),
                'unique_tags_count', (
                    SELECT COUNT(DISTINCT unnest(tags))
                    FROM trade_notes tn
                    WHERE tn.user_id = v_user_id
                        AND tags IS NOT NULL
                        AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                        AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
                )
            )
        ),
        'performance_correlation', (
            SELECT json_build_object(
                'high_rated_trades_performance', (
                    SELECT json_build_object(
                        'average_pnl', AVG(trade_pnl),
                        'win_rate', AVG(CASE WHEN trade_pnl > 0 THEN 1.0 ELSE 0.0 END),
                        'trade_count', COUNT(*)
                    )
                    FROM (
                        SELECT 
                            CASE 
                                WHEN tn.trade_type = 'stock' THEN 
                                    CASE s.trade_type
                                        WHEN 'BUY' THEN (COALESCE(s.exit_price, s.entry_price) - s.entry_price) * s.number_shares - s.commissions
                                        WHEN 'SELL' THEN (s.entry_price - COALESCE(s.exit_price, s.entry_price)) * s.number_shares - s.commissions
                                    END
                                WHEN tn.trade_type = 'option' THEN 
                                    (COALESCE(o.exit_price, o.entry_price) - o.entry_price) * o.number_of_contracts * 100 - o.commissions
                            END as trade_pnl
                        FROM trade_notes tn
                        LEFT JOIN stocks s ON tn.trade_type = 'stock' AND tn.trade_id = s.id AND s.user_id = v_user_id
                        LEFT JOIN options o ON tn.trade_type = 'option' AND tn.trade_id = o.id AND o.user_id = v_user_id
                        WHERE tn.user_id = v_user_id
                            AND tn.rating >= 4
                            AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                            AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
                    ) high_rated_trades
                ),
                'low_rated_trades_performance', (
                    SELECT json_build_object(
                        'average_pnl', AVG(trade_pnl),
                        'win_rate', AVG(CASE WHEN trade_pnl > 0 THEN 1.0 ELSE 0.0 END),
                        'trade_count', COUNT(*)
                    )
                    FROM (
                        SELECT 
                            CASE 
                                WHEN tn.trade_type = 'stock' THEN 
                                    CASE s.trade_type
                                        WHEN 'BUY' THEN (COALESCE(s.exit_price, s.entry_price) - s.entry_price) * s.number_shares - s.commissions
                                        WHEN 'SELL' THEN (s.entry_price - COALESCE(s.exit_price, s.entry_price)) * s.number_shares - s.commissions
                                    END
                                WHEN tn.trade_type = 'option' THEN 
                                    (COALESCE(o.exit_price, o.entry_price) - o.entry_price) * o.number_of_contracts * 100 - o.commissions
                            END as trade_pnl
                        FROM trade_notes tn
                        LEFT JOIN stocks s ON tn.trade_type = 'stock' AND tn.trade_id = s.id AND s.user_id = v_user_id
                        LEFT JOIN options o ON tn.trade_type = 'option' AND tn.trade_id = o.id AND o.user_id = v_user_id
                        WHERE tn.user_id = v_user_id
                            AND tn.rating <= 2
                            AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                            AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
                    ) low_rated_trades
                )
            )
        )
    ) INTO result;

    RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_tracking_summary(UUID, trade_note_type, trade_phase, INTEGER, INTEGER, TEXT[], TEXT, DATE, DATE, INTEGER) TO authenticated;

-- Add comprehensive documentation
COMMENT ON FUNCTION public.get_tracking_summary IS 'Generates a comprehensive tracking summary combining trade notes with their associated stock/option trades for AI consumption.

This function provides a complete view of user trading notes and their relationship to actual trades, including:

1. **Summary Metadata**: Timestamp, user context, filters applied
2. **Tracking Overview**: Note counts by asset type, phase, ratings distribution
3. **Detailed Trade Notes**: Full note content with associated trade details
4. **Tag Analysis**: Most common tags and usage patterns
5. **Performance Correlation**: How note ratings correlate with trade performance

Parameters:
- p_user_id: User ID (defaults to authenticated user)
- p_trade_type: Filter by asset type (''stock'', ''option'')
- p_phase: Filter by trade phase (''planning'', ''execution'', ''reflection'')
- p_rating_min/max: Filter by rating range (1-5)
- p_tags: Filter by tags (array overlap)
- p_time_range: Time range filter (''7d'', ''30d'', ''90d'', ''1y'', ''ytd'', ''custom'', ''all_time'')
- p_custom_start_date/end_date: Custom date range
- p_limit: Maximum number of detailed notes to return

Returns:
- Comprehensive JSON object with tracking analytics and trade correlations

Example usage:
-- Get all tracking data for authenticated user
SELECT get_tracking_summary();

-- Get high-rated notes from last 30 days
SELECT get_tracking_summary(NULL, NULL, NULL, 4, 5, NULL, ''30d'');

-- Get reflection phase notes for options
SELECT get_tracking_summary(NULL, ''option'', ''reflection'');';
