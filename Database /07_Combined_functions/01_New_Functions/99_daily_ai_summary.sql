-- Comprehensive AI Daily Summary Function
-- Combines all AI report functions into a single JSON output for AI model consumption
CREATE OR REPLACE FUNCTION public.get_daily_ai_summary(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
    streak_data RECORD;
    winning_streak BIGINT := 0;
    losing_streak BIGINT := 0;
BEGIN
    -- Get streak data
    FOR streak_data IN 
        SELECT * FROM get_streaks(p_time_range, p_custom_start_date, p_custom_end_date)
    LOOP
        IF streak_data.streak_type = 'Winning' THEN
            winning_streak := streak_data.streak_length;
        ELSIF streak_data.streak_type = 'Losing' THEN
            losing_streak := streak_data.streak_length;
        END IF;
    END LOOP;

    -- Build comprehensive JSON summary
    SELECT json_build_object(
        'summary_metadata', json_build_object(
            'generated_at', NOW(),
            'time_range', p_time_range,
            'custom_start_date', p_custom_start_date,
            'custom_end_date', p_custom_end_date,
            'user_id', auth.uid()
        ),
        'core_performance_metrics', json_build_object(
            'profit_factor', get_combined_profit_factor(p_time_range, p_custom_start_date, p_custom_end_date),
            'win_rate_percentage', get_combined_win_rate(p_time_range, p_custom_start_date, p_custom_end_date),
            'loss_rate_percentage', (
                SELECT loss_rate FROM get_combined_loss_rate(p_time_range, p_custom_start_date, p_custom_end_date)
                WHERE asset_type = 'Combined'
            ),
            'trade_expectancy', get_combined_trade_expectancy(p_time_range, p_custom_start_date, p_custom_end_date),
            'risk_reward_ratio', get_combined_risk_reward_ratio(p_time_range, p_custom_start_date, p_custom_end_date)
        ),
        'profit_loss_analysis', json_build_object(
            'biggest_winner', get_combined_biggest_winner(p_time_range, p_custom_start_date, p_custom_end_date),
            'biggest_loser', get_combined_biggest_loser(p_time_range, p_custom_start_date, p_custom_end_date),
            'average_gain', get_combined_average_gain(p_time_range, p_custom_start_date, p_custom_end_date),
            'average_loss', get_combined_average_loss(p_time_range, p_custom_start_date, p_custom_end_date)
        ),
        'trading_behavior_metrics', json_build_object(
            'average_hold_time_winners_hours', get_combined_avg_hold_time_winners(p_time_range, p_custom_start_date, p_custom_end_date),
            'average_hold_time_losers_hours', get_combined_avg_hold_time_losers(p_time_range, p_custom_start_date, p_custom_end_date),
            'average_trade_duration_hours', get_average_trade_duration(p_time_range, p_custom_start_date, p_custom_end_date),
            'average_position_size', (
                SELECT json_build_object(
                    'stocks', (SELECT average_position_size FROM get_combined_average_position_size(p_time_range, p_custom_start_date, p_custom_end_date) WHERE asset_type = 'Stocks'),
                    'options', (SELECT average_position_size FROM get_combined_average_position_size(p_time_range, p_custom_start_date, p_custom_end_date) WHERE asset_type = 'Options'),
                    'combined', (SELECT average_position_size FROM get_combined_average_position_size(p_time_range, p_custom_start_date, p_custom_end_date) WHERE asset_type = 'Combined')
                )
            ),
            'trade_size_consistency', get_trade_size_consistency(p_time_range, p_custom_start_date, p_custom_end_date)
        ),
        'streak_analysis', json_build_object(
            'longest_winning_streak', winning_streak,
            'longest_losing_streak', losing_streak
        ),
        'cost_analysis', json_build_object(
            'total_commissions_paid', get_total_commissions(p_time_range, p_custom_start_date, p_custom_end_date),
            'average_commission_per_trade', get_average_commission_per_trade(p_time_range, p_custom_start_date, p_custom_end_date),
            'risk_per_trade', (
                SELECT json_build_object(
                    'stocks', (SELECT average_risk_per_trade FROM get_combined_risk_per_trade(p_time_range, p_custom_start_date, p_custom_end_date) WHERE asset_type = 'Stocks'),
                    'options', (SELECT average_risk_per_trade FROM get_combined_risk_per_trade(p_time_range, p_custom_start_date, p_custom_end_date) WHERE asset_type = 'Options'),
                    'combined', (SELECT average_risk_per_trade FROM get_combined_risk_per_trade(p_time_range, p_custom_start_date, p_custom_end_date) WHERE asset_type = 'Combined')
                )
            )
        ),
        'directional_performance', json_build_object(
            'bullish_win_rate', (
                SELECT win_rate FROM get_win_rate_by_trade_direction(p_time_range, p_custom_start_date, p_custom_end_date)
                WHERE trade_direction = 'Bullish'
            ),
            'bearish_win_rate', (
                SELECT win_rate FROM get_win_rate_by_trade_direction(p_time_range, p_custom_start_date, p_custom_end_date)
                WHERE trade_direction = 'Bearish'
            ),
            'bullish_loss_rate', (
                SELECT loss_rate FROM get_loss_rate_by_trade_direction(p_time_range, p_custom_start_date, p_custom_end_date)
                WHERE trade_direction = 'Bullish'
            ),
            'bearish_loss_rate', (
                SELECT loss_rate FROM get_loss_rate_by_trade_direction(p_time_range, p_custom_start_date, p_custom_end_date)
                WHERE trade_direction = 'Bearish'
            ),
            'bullish_performance', (
                SELECT json_build_object(
                    'total_trades', total_trades,
                    'net_pnl', net_pnl,
                    'win_rate', win_rate,
                    'average_gain', average_gain,
                    'average_loss', average_loss,
                    'profit_factor', profit_factor
                )
                FROM get_performance_by_trade_direction(p_time_range, p_custom_start_date, p_custom_end_date)
                WHERE trade_direction = 'Bullish'
            ),
            'bearish_performance', (
                SELECT json_build_object(
                    'total_trades', total_trades,
                    'net_pnl', net_pnl,
                    'win_rate', win_rate,
                    'average_gain', average_gain,
                    'average_loss', average_loss,
                    'profit_factor', profit_factor
                )
                FROM get_performance_by_trade_direction(p_time_range, p_custom_start_date, p_custom_end_date)
                WHERE trade_direction = 'Bearish'
            )
        ),
        'top_symbols_performance', (
            SELECT json_agg(
                json_build_object(
                    'symbol', symbol,
                    'total_pnl', total_pnl,
                    'ranking_type', ranking_type
                )
            )
            FROM (
                SELECT * FROM get_symbol_profitability_ranking(10, p_time_range, p_custom_start_date, p_custom_end_date)
            ) top_symbols
        ),
        'trading_frequency_patterns', (
            SELECT json_agg(
                json_build_object(
                    'pattern_type', pattern_type,
                    'pattern_value', pattern_value,
                    'trade_count', trade_count,
                    'win_rate', win_rate,
                    'net_pnl', net_pnl
                )
            )
            FROM get_trade_frequency_patterns(p_time_range, p_custom_start_date, p_custom_end_date)
        ),
        'symbol_trading_frequency', (
            SELECT json_agg(
                json_build_object(
                    'symbol', symbol,
                    'trade_count', trade_count,
                    'frequency_category', frequency_category
                )
            )
            FROM (
                SELECT * FROM get_trading_frequency_by_symbol(p_time_range, p_custom_start_date, p_custom_end_date)
                LIMIT 15
            ) freq_symbols
        )
    ) INTO result;

    RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_daily_ai_summary(TEXT, DATE, DATE) TO authenticated;

-- Add comprehensive documentation
COMMENT ON FUNCTION public.get_daily_ai_summary IS 'Generates a comprehensive daily trading summary in JSON format for AI model consumption.

This function combines all individual AI report functions into a single, structured JSON output containing:

1. **Summary Metadata**: Timestamp, time range, user context
2. **Core Performance Metrics**: Profit factor, win rate, loss rate, trade expectancy, risk-reward ratio
3. **Profit/Loss Analysis**: Biggest winner/loser, average gains/losses
4. **Trading Behavior Metrics**: Hold times, trade duration, position sizing, consistency
5. **Streak Analysis**: Longest winning and losing streaks
6. **Cost Analysis**: Commissions, risk per trade
7. **Directional Performance**: Bullish vs bearish trade performance
8. **Top Symbols Performance**: Best performing symbols with metrics
9. **Trading Frequency Patterns**: Time-based trading patterns
10. **Symbol Trading Frequency**: Most frequently traded symbols

Parameters:
- p_time_range: Time range filter. Valid values:
  - ''7d'': Last 7 days
  - ''30d'': Last 30 days  
  - ''90d'': Last 90 days
  - ''1y'': Last year
  - ''ytd'': Year to date
  - ''custom'': Use custom date range (requires p_custom_start_date and/or p_custom_end_date)
  - ''all_time'': All available data (default)
- p_custom_start_date: Start date for custom range (only used when p_time_range = ''custom'')
- p_custom_end_date: End date for custom range (only used when p_time_range = ''custom'')

Returns:
- Comprehensive JSON object with all trading metrics and analysis

Example usage:
-- Get daily summary for the last 30 days
SELECT get_daily_ai_summary(''30d'');

-- Get year-to-date summary
SELECT get_daily_ai_summary(''ytd'');

-- Get custom date range summary
SELECT get_daily_ai_summary(''custom'', ''2024-01-01'', ''2024-03-31'');

-- Get all-time summary (default)
SELECT get_daily_ai_summary();

The JSON structure is optimized for AI model consumption with consistent naming conventions,
proper data types, and comprehensive coverage of all trading performance aspects.';

-- Example test queries
/*
-- Test the function with different time ranges
SELECT get_daily_ai_summary('7d');
SELECT get_daily_ai_summary('30d');  
SELECT get_daily_ai_summary('ytd');
SELECT get_daily_ai_summary();

-- Pretty print JSON for debugging
SELECT jsonb_pretty(get_daily_ai_summary('30d')::jsonb);
*/
