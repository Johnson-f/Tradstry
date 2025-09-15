-- This function fetches the latest news articles from the news_articles table
-- Prioritizes by updated_at and published_at for the most recent content
-- Returns maximum 7 articles at once for optimal performance

CREATE OR REPLACE FUNCTION get_latest_market_news(
    article_limit INTEGER DEFAULT 7
)
RETURNS TABLE (
    id INTEGER,
    title TEXT,
    summary TEXT,
    content TEXT,
    url TEXT,
    source VARCHAR(100),
    published_at TIMESTAMP,
    updated_at TIMESTAMP,
    author VARCHAR(255),
    category VARCHAR(50),
    sentiment DECIMAL(3,2),
    relevance_score DECIMAL(3,2),
    sentiment_confidence DECIMAL(3,2),
    language VARCHAR(5),
    word_count INTEGER,
    image_url TEXT,
    tags TEXT[],
    data_provider VARCHAR(50),
    created_at TIMESTAMP
) 
LANGUAGE plpgsql 
AS $$
BEGIN
    -- Validate input parameter
    IF article_limit IS NULL OR article_limit <= 0 THEN
        article_limit := 7;
    END IF;
    
    -- Cap maximum articles to prevent performance issues
    IF article_limit > 50 THEN
        article_limit := 50;
    END IF;

    RETURN QUERY
    SELECT 
        na.id,
        na.title,
        na.summary,
        na.content,
        na.url,
        na.source,
        na.published_at,
        na.updated_at,
        na.author,
        na.category,
        na.sentiment,
        na.relevance_score,
        na.sentiment_confidence,
        na.language,
        na.word_count,
        na.image_url,
        na.tags,
        na.data_provider,
        na.created_at
    FROM news_articles na
    ORDER BY 
        -- Prioritize by latest updated_at first (for articles that have been modified)
        na.updated_at DESC,
        -- Then by published_at for original publication order
        na.published_at DESC,
        -- Finally by id for consistent ordering
        na.id DESC
    LIMIT article_limit;
END;
$$;

-- FILTERED MARKET NEWS FUNCTION
-- Enhanced function with filtering options for more targeted news retrieval

CREATE OR REPLACE FUNCTION get_filtered_market_news(
    article_limit INTEGER DEFAULT 7,
    source_filter VARCHAR(100) DEFAULT NULL,
    category_filter VARCHAR(50) DEFAULT NULL,
    min_relevance_score DECIMAL(3,2) DEFAULT NULL,
    days_back INTEGER DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    title TEXT,
    summary TEXT,
    content TEXT,
    url TEXT,
    source VARCHAR(100),
    published_at TIMESTAMP,
    updated_at TIMESTAMP,
    author VARCHAR(255),
    category VARCHAR(50),
    sentiment DECIMAL(3,2),
    relevance_score DECIMAL(3,2),
    sentiment_confidence DECIMAL(3,2),
    language VARCHAR(5),
    word_count INTEGER,
    image_url TEXT,
    tags TEXT[],
    data_provider VARCHAR(50),
    created_at TIMESTAMP,
    news_age_hours INTEGER
) 
LANGUAGE plpgsql 
AS $$
BEGIN
    -- Validate and set defaults
    IF article_limit IS NULL OR article_limit <= 0 THEN
        article_limit := 7;
    END IF;
    
    IF article_limit > 50 THEN
        article_limit := 50;
    END IF;

    RETURN QUERY
    SELECT 
        na.id,
        na.title,
        na.summary,
        na.content,
        na.url,
        na.source,
        na.published_at,
        na.updated_at,
        na.author,
        na.category,
        na.sentiment,
        na.relevance_score,
        na.sentiment_confidence,
        na.language,
        na.word_count,
        na.image_url,
        na.tags,
        na.data_provider,
        na.created_at,
        -- Calculate news age in hours
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - na.published_at)) / 3600 AS news_age_hours
    FROM news_articles na
    WHERE 
        -- Apply source filter if provided
        (source_filter IS NULL OR na.source ILIKE '%' || source_filter || '%')
        -- Apply category filter if provided
        AND (category_filter IS NULL OR na.category = category_filter)
        -- Apply relevance score filter if provided
        AND (min_relevance_score IS NULL OR na.relevance_score >= min_relevance_score)
        -- Apply date range filter if provided
        AND (days_back IS NULL OR na.published_at >= CURRENT_DATE - INTERVAL '1 day' * days_back)
    ORDER BY 
        na.updated_at DESC,
        na.published_at DESC,
        na.id DESC
    LIMIT article_limit;
END;
$$;

-- These indexes support the functions above (if not already created)

-- Index for ordering by updated_at and published_at
CREATE INDEX IF NOT EXISTS idx_news_articles_latest_ordering 
ON news_articles (updated_at DESC, published_at DESC, id DESC);

-- Index for source filtering
CREATE INDEX IF NOT EXISTS idx_news_articles_source_latest 
ON news_articles (source, updated_at DESC);

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_news_articles_category_latest 
ON news_articles (category, updated_at DESC);

-- Index for relevance score filtering
CREATE INDEX IF NOT EXISTS idx_news_articles_relevance_latest 
ON news_articles (relevance_score DESC, updated_at DESC);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_news_articles_published_range 
ON news_articles (published_at DESC, updated_at DESC);

-- Grant permissions for the functions
GRANT EXECUTE ON FUNCTION get_latest_market_news(INTEGER) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_filtered_market_news(INTEGER, VARCHAR(100), VARCHAR(50), DECIMAL(3,2), INTEGER) TO PUBLIC;


-- USAGE EXAMPLES
/*
-- Get the latest 7 news articles (default)
SELECT * FROM get_latest_market_news();

-- Get the latest 10 news articles
SELECT * FROM get_latest_market_news(10);

-- Get latest 5 Bloomberg articles with high relevance from the past 3 days
SELECT * FROM get_filtered_market_news(
    article_limit := 5,
    source_filter := 'Bloomberg',
    min_relevance_score := 0.7,
    days_back := 3
);

-- Get latest earnings-related news
SELECT * FROM get_filtered_market_news(
    article_limit := 10,
    category_filter := 'earnings'
);

-- Get news from the past week only
SELECT * FROM get_filtered_market_news(
    article_limit := 15,
    days_back := 7
);
*/
