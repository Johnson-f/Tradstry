-- SIGNIFICANT PRICE MOVEMENTS WITH NEWS
-- Functions to detect stock price movements ±3% and retrieve related news

-- 1. GET SIGNIFICANT PRICE MOVEMENTS WITH NEWS

CREATE OR REPLACE FUNCTION get_significant_price_movements_with_news(
    p_symbol VARCHAR(20) DEFAULT NULL,
    p_days_back INTEGER DEFAULT 30,
    p_min_change_percent DECIMAL(7,4) DEFAULT 3.0,
    p_limit INTEGER DEFAULT 50,
    p_data_provider VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    symbol VARCHAR(20),
    movement_date DATE,
    price_change_percent DECIMAL(7,4),
    price_change_amount DECIMAL(15,4),
    open_price DECIMAL(15,4),
    close_price DECIMAL(15,4),
    high_price DECIMAL(15,4),
    low_price DECIMAL(15,4),
    volume BIGINT,
    movement_type VARCHAR(10),
    quote_timestamp TIMESTAMP,
    news_id BIGINT,
    news_title TEXT,
    news_url TEXT,
    news_source VARCHAR(100),
    news_published_at TIMESTAMP,
    news_sentiment DECIMAL(4,3),
    news_relevance DECIMAL(4,3),
    time_diff_hours INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH significant_movements AS (
        SELECT 
            sq.symbol,
            DATE(sq.quote_timestamp) as movement_date,
            sq.change_percent as price_change_percent,
            sq.change_amount as price_change_amount,
            sq.open_price,
            sq.price as close_price,
            sq.high_price,
            sq.low_price,
            sq.volume,
            CASE 
                WHEN sq.change_percent >= p_min_change_percent THEN 'SURGE'::VARCHAR(10)
                WHEN sq.change_percent <= -p_min_change_percent THEN 'DROP'::VARCHAR(10)
            END as movement_type,
            sq.quote_timestamp,
            ROW_NUMBER() OVER (
                PARTITION BY sq.symbol, DATE(sq.quote_timestamp) 
                ORDER BY ABS(sq.change_percent) DESC
            ) as rn
        FROM stock_quotes sq
        WHERE 
            (p_symbol IS NULL OR sq.symbol = UPPER(p_symbol))
            AND sq.quote_timestamp >= CURRENT_TIMESTAMP - (p_days_back || ' days')::INTERVAL
            AND (
                sq.change_percent >= p_min_change_percent 
                OR sq.change_percent <= -p_min_change_percent
            )
            AND (p_data_provider IS NULL OR sq.data_provider = p_data_provider)
    ),
    movement_news AS (
        SELECT 
            sm.*,
            fn.id as news_id,
            fn.title as news_title,
            fn.news_url,
            fn.source_name as news_source,
            fn.published_at as news_published_at,
            fn.sentiment_score as news_sentiment,
            fn.relevance_score as news_relevance,
            EXTRACT(EPOCH FROM (sm.quote_timestamp - fn.published_at))/3600 as time_diff_hours,
            ROW_NUMBER() OVER (
                PARTITION BY sm.symbol, sm.movement_date 
                ORDER BY 
                    ABS(EXTRACT(EPOCH FROM (sm.quote_timestamp - fn.published_at))/3600),
                    fn.relevance_score DESC NULLS LAST,
                    fn.published_at DESC
            ) as news_rn
        FROM significant_movements sm
        LEFT JOIN finance_news fn ON (
            (UPPER(sm.symbol) = ANY(fn.mentioned_symbols) OR UPPER(sm.symbol) = ANY(fn.primary_symbols))
            AND fn.published_at BETWEEN sm.quote_timestamp - INTERVAL '24 hours' 
                                   AND sm.quote_timestamp + INTERVAL '6 hours'
        )
        WHERE sm.rn = 1
    )
    SELECT 
        mn.symbol,
        mn.movement_date,
        mn.price_change_percent,
        mn.price_change_amount,
        mn.open_price,
        mn.close_price,
        mn.high_price,
        mn.low_price,
        mn.volume,
        mn.movement_type,
        mn.quote_timestamp,
        mn.news_id,
        mn.news_title,
        mn.news_url,
        mn.news_source,
        mn.news_published_at,
        mn.news_sentiment,
        mn.news_relevance,
        mn.time_diff_hours::INTEGER
    FROM movement_news mn
    WHERE mn.news_rn <= 3 OR mn.news_id IS NULL
    ORDER BY 
        ABS(mn.price_change_percent) DESC,
        mn.quote_timestamp DESC,
        mn.news_rn
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- 2. GET TOP MOVERS WITH NEWS TODAY

CREATE OR REPLACE FUNCTION get_top_movers_with_news_today(
    p_limit INTEGER DEFAULT 20,
    p_min_change_percent DECIMAL(7,4) DEFAULT 3.0
)
RETURNS TABLE (
    symbol VARCHAR(20),
    price_change_percent DECIMAL(7,4),
    price_change_amount DECIMAL(15,4),
    current_price DECIMAL(15,4),
    volume BIGINT,
    movement_type VARCHAR(10),
    news_count INTEGER,
    latest_news_title TEXT,
    latest_news_sentiment DECIMAL(4,3),
    latest_news_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH todays_movers AS (
        SELECT 
            sq.symbol,
            sq.change_percent as price_change_percent,
            sq.change_amount as price_change_amount,
            sq.price as current_price,
            sq.volume,
            CASE 
                WHEN sq.change_percent >= p_min_change_percent THEN 'SURGE'::VARCHAR(10)
                WHEN sq.change_percent <= -p_min_change_percent THEN 'DROP'::VARCHAR(10)
            END as movement_type,
            sq.quote_timestamp,
            ROW_NUMBER() OVER (
                PARTITION BY sq.symbol 
                ORDER BY sq.quote_timestamp DESC
            ) as rn
        FROM stock_quotes sq
        WHERE 
            DATE(sq.quote_timestamp) = CURRENT_DATE
            AND (
                sq.change_percent >= p_min_change_percent 
                OR sq.change_percent <= -p_min_change_percent
            )
    ),
    latest_movers AS (
        SELECT 
            tm.symbol,
            tm.price_change_percent,
            tm.price_change_amount,
            tm.current_price,
            tm.volume,
            tm.movement_type,
            tm.quote_timestamp
        FROM todays_movers tm
        WHERE tm.rn = 1
    ),
    movers_with_news AS (
        SELECT 
            lm.*,
            COUNT(fn.id) as news_count,
            (
                SELECT fn2.title 
                FROM finance_news fn2 
                WHERE (UPPER(lm.symbol) = ANY(fn2.mentioned_symbols) OR UPPER(lm.symbol) = ANY(fn2.primary_symbols))
                AND DATE(fn2.published_at) = CURRENT_DATE
                ORDER BY fn2.published_at DESC
                LIMIT 1
            ) as latest_news_title,
            (
                SELECT fn2.sentiment_score 
                FROM finance_news fn2 
                WHERE (UPPER(lm.symbol) = ANY(fn2.mentioned_symbols) OR UPPER(lm.symbol) = ANY(fn2.primary_symbols))
                AND DATE(fn2.published_at) = CURRENT_DATE
                ORDER BY fn2.published_at DESC
                LIMIT 1
            ) as latest_news_sentiment,
            (
                SELECT fn2.news_url 
                FROM finance_news fn2 
                WHERE (UPPER(lm.symbol) = ANY(fn2.mentioned_symbols) OR UPPER(lm.symbol) = ANY(fn2.primary_symbols))
                AND DATE(fn2.published_at) = CURRENT_DATE
                ORDER BY fn2.published_at DESC
                LIMIT 1
            ) as latest_news_url
        FROM latest_movers lm
        LEFT JOIN finance_news fn ON (
            (UPPER(lm.symbol) = ANY(fn.mentioned_symbols) OR UPPER(lm.symbol) = ANY(fn.primary_symbols))
            AND DATE(fn.published_at) = CURRENT_DATE
        )
        GROUP BY lm.symbol, lm.price_change_percent, lm.price_change_amount, 
                 lm.current_price, lm.volume, lm.movement_type, lm.quote_timestamp
    )
    SELECT 
        mwn.symbol,
        mwn.price_change_percent,
        mwn.price_change_amount,
        mwn.current_price,
        mwn.volume,
        mwn.movement_type,
        mwn.news_count::INTEGER,
        mwn.latest_news_title,
        mwn.latest_news_sentiment,
        mwn.latest_news_url
    FROM movers_with_news mwn
    ORDER BY ABS(mwn.price_change_percent) DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- USAGE EXAMPLES
/*
-- Get significant movements with related news for Apple
SELECT * FROM get_significant_price_movements_with_news('AAPL', 30, 3.0, 20);

-- Get all significant movements across all stocks
SELECT * FROM get_significant_price_movements_with_news(NULL, 7, 3.0, 50);

-- Get daily summary for today
SELECT * FROM get_daily_significant_movements_summary(CURRENT_DATE, 3.0);

-- Get Tesla's movement history with news correlation
SELECT * FROM get_symbol_movement_history_with_news('TSLA', 90, 3.0);

-- Get today's top movers with news
SELECT * FROM get_top_movers_with_news_today(15, 3.0);

-- Example formatted query for significant movements
SELECT 
    symbol,
    movement_date,
    CONCAT(
        CASE WHEN movement_type = 'SURGE' THEN '📈 +' ELSE '📉 ' END,
        ROUND(price_change_percent, 2), '%'
    ) as movement,
    CONCAT('$', ROUND(close_price, 2)) as price,
    CASE 
        WHEN news_title IS NOT NULL THEN LEFT(news_title, 80) || '...'
        ELSE 'No related news found'
    END as related_news
FROM get_significant_price_movements_with_news('AAPL', 14, 3.0, 10)
ORDER BY movement_date DESC;
*/
