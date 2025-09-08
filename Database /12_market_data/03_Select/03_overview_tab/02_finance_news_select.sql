-- FINANCE NEWS SELECT FUNCTIONS
-- Functions to retrieve news data for specific symbols

-- 1. GET NEWS BY SYMBOL (PRIMARY FUNCTION)

CREATE OR REPLACE FUNCTION get_symbol_news(
    p_symbol VARCHAR(20),
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_days_back INTEGER DEFAULT 7,
    p_min_relevance DECIMAL(4,3) DEFAULT 0.0,
    p_data_provider VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    id BIGINT,
    title TEXT,
    news_url TEXT,
    source_name VARCHAR(100),
    image_url TEXT,
    time_published VARCHAR(50),
    published_at TIMESTAMP,
    sentiment_score DECIMAL(4,3),
    relevance_score DECIMAL(4,3),
    sentiment_confidence DECIMAL(4,3),
    mentioned_symbols TEXT[],
    primary_symbols TEXT[],
    word_count INTEGER,
    category VARCHAR(50),
    data_provider VARCHAR(50),
    mention_type VARCHAR(20),
    sentiment_impact DECIMAL(4,3),
    confidence_score DECIMAL(4,3)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fn.id,
        fn.title,
        fn.news_url,
        fn.source_name,
        fn.image_url,
        fn.time_published,
        fn.published_at,
        fn.sentiment_score,
        fn.relevance_score,
        fn.sentiment_confidence,
        fn.mentioned_symbols,
        fn.primary_symbols,
        fn.word_count,
        fn.category,
        fn.data_provider,
        COALESCE(fns.mention_type, 'mentioned') as mention_type,
        fns.sentiment_impact,
        fns.confidence_score
    FROM finance_news fn
    LEFT JOIN finance_news_stocks fns ON fn.id = fns.finance_news_id 
        AND fns.stock_symbol = UPPER(p_symbol)
    WHERE 
        (
            -- Symbol mentioned in arrays
            UPPER(p_symbol) = ANY(fn.mentioned_symbols) 
            OR UPPER(p_symbol) = ANY(fn.primary_symbols)
            -- Or symbol in relationship table
            OR fns.stock_symbol = UPPER(p_symbol)
        )
        AND fn.published_at >= CURRENT_TIMESTAMP - INTERVAL '%s days' 
        AND (p_min_relevance = 0.0 OR fn.relevance_score >= p_min_relevance)
        AND (p_data_provider IS NULL OR fn.data_provider = p_data_provider)
    ORDER BY 
        CASE WHEN UPPER(p_symbol) = ANY(fn.primary_symbols) THEN 1 ELSE 2 END,
        fn.published_at DESC,
        fn.relevance_score DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 2. GET LATEST NEWS BY SYMBOL (SIMPLIFIED)

CREATE OR REPLACE FUNCTION get_latest_symbol_news(
    p_symbol VARCHAR(20),
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id BIGINT,
    title TEXT,
    news_url TEXT,
    source_name VARCHAR(100),
    published_at TIMESTAMP,
    sentiment_score DECIMAL(4,3),
    relevance_score DECIMAL(4,3),
    image_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fn.id,
        fn.title,
        fn.news_url,
        fn.source_name,
        fn.published_at,
        fn.sentiment_score,
        fn.relevance_score,
        fn.image_url
    FROM finance_news fn
    WHERE 
        UPPER(p_symbol) = ANY(fn.mentioned_symbols) 
        OR UPPER(p_symbol) = ANY(fn.primary_symbols)
        OR EXISTS (
            SELECT 1 FROM finance_news_stocks fns 
            WHERE fns.finance_news_id = fn.id 
            AND fns.stock_symbol = UPPER(p_symbol)
        )
    ORDER BY fn.published_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;



-- 3. GET NEWS SUMMARY STATISTICS BY SYMBOL

CREATE OR REPLACE FUNCTION get_symbol_news_stats(
    p_symbol VARCHAR(20),
    p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    symbol VARCHAR(20),
    total_articles BIGINT,
    positive_articles BIGINT,
    negative_articles BIGINT,
    neutral_articles BIGINT,
    avg_sentiment DECIMAL(4,3),
    avg_relevance DECIMAL(4,3),
    latest_article_date TIMESTAMP,
    top_sources TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    WITH news_stats AS (
        SELECT 
            fn.sentiment_score,
            fn.relevance_score,
            fn.published_at,
            fn.source_name
        FROM finance_news fn
        LEFT JOIN finance_news_stocks fns ON fn.id = fns.finance_news_id 
            AND fns.stock_symbol = UPPER(p_symbol)
        WHERE 
            (
                UPPER(p_symbol) = ANY(fn.mentioned_symbols) 
                OR UPPER(p_symbol) = ANY(fn.primary_symbols)
                OR fns.stock_symbol = UPPER(p_symbol)
            )
            AND fn.published_at >= CURRENT_TIMESTAMP - INTERVAL '%s days'
    ),
    source_counts AS (
        SELECT 
            source_name,
            COUNT(*) as article_count
        FROM news_stats
        GROUP BY source_name
        ORDER BY COUNT(*) DESC
        LIMIT 5
    )
    SELECT 
        UPPER(p_symbol) as symbol,
        COUNT(*) as total_articles,
        COUNT(*) FILTER (WHERE sentiment_score > 0.1) as positive_articles,
        COUNT(*) FILTER (WHERE sentiment_score < -0.1) as negative_articles,
        COUNT(*) FILTER (WHERE sentiment_score BETWEEN -0.1 AND 0.1) as neutral_articles,
        AVG(sentiment_score) as avg_sentiment,
        AVG(relevance_score) as avg_relevance,
        MAX(published_at) as latest_article_date,
        ARRAY_AGG(sc.source_name ORDER BY sc.article_count DESC) as top_sources
    FROM news_stats ns
    CROSS JOIN source_counts sc
    GROUP BY UPPER(p_symbol);
END;
$$ LANGUAGE plpgsql;


-- 4. SEARCH NEWS BY KEYWORD AND SYMBOL

CREATE OR REPLACE FUNCTION search_symbol_news(
    p_symbol VARCHAR(20),
    p_search_term TEXT,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id BIGINT,
    title TEXT,
    news_url TEXT,
    source_name VARCHAR(100),
    published_at TIMESTAMP,
    sentiment_score DECIMAL(4,3),
    relevance_score DECIMAL(4,3),
    match_rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fn.id,
        fn.title,
        fn.news_url,
        fn.source_name,
        fn.published_at,
        fn.sentiment_score,
        fn.relevance_score,
        ts_rank(to_tsvector('english', fn.title), plainto_tsquery('english', p_search_term)) as match_rank
    FROM finance_news fn
    LEFT JOIN finance_news_stocks fns ON fn.id = fns.finance_news_id 
        AND fns.stock_symbol = UPPER(p_symbol)
    WHERE 
        (
            UPPER(p_symbol) = ANY(fn.mentioned_symbols) 
            OR UPPER(p_symbol) = ANY(fn.primary_symbols)
            OR fns.stock_symbol = UPPER(p_symbol)
        )
        AND to_tsvector('english', fn.title) @@ plainto_tsquery('english', p_search_term)
    ORDER BY match_rank DESC, fn.published_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- USAGE EXAMPLES
/*
-- Get comprehensive news for Apple
SELECT * FROM get_symbol_news('AAPL', 10, 0, 7, 0.0);

-- Get latest 5 news articles for Tesla
SELECT * FROM get_latest_symbol_news('TSLA', 5);

-- Get positive sentiment news for Microsoft
SELECT * FROM get_symbol_news_with_sentiment('MSFT', 'positive', 10, 30);

-- Get news statistics for Google
SELECT * FROM get_symbol_news_stats('GOOGL', 30);

-- Search for earnings-related news for Apple
SELECT * FROM search_symbol_news('AAPL', 'earnings revenue profit', 5);

-- Get news for multiple symbols
SELECT * FROM get_multiple_symbols_news(ARRAY['AAPL', 'TSLA', 'MSFT'], 3);

-- Example formatted query
SELECT 
    title,
    source_name,
    published_at::date as news_date,
    CASE 
        WHEN sentiment_score > 0.1 THEN '📈 Positive'
        WHEN sentiment_score < -0.1 THEN '📉 Negative'
        ELSE '➡️ Neutral'
    END as sentiment,
    ROUND(relevance_score * 100, 1) || '%' as relevance,
    news_url
FROM get_latest_symbol_news('AAPL', 10)
ORDER BY published_at DESC;
*/
