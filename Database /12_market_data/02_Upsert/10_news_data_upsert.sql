-- News Data Upsert Functions
-- Handles INSERT or UPDATE operations for news_articles and news_stocks tables
-- Uses PostgreSQL's ON CONFLICT for atomic upsert operations

-- Function to upsert news articles
CREATE OR REPLACE FUNCTION upsert_news_article(
    p_title TEXT,
    p_summary TEXT DEFAULT NULL,
    p_content TEXT DEFAULT NULL,
    p_url TEXT,
    p_source VARCHAR(100) DEFAULT NULL,
    p_published_at TIMESTAMP,
    p_author VARCHAR(255) DEFAULT NULL,
    p_category VARCHAR(50) DEFAULT NULL,
    p_sentiment DECIMAL(3,2) DEFAULT NULL,
    p_relevance_score DECIMAL(3,2) DEFAULT NULL,
    p_sentiment_confidence DECIMAL(3,2) DEFAULT NULL,
    p_language VARCHAR(5) DEFAULT 'en',
    p_word_count INTEGER DEFAULT NULL,
    p_image_url TEXT DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_data_provider VARCHAR(50)
)
RETURNS INTEGER AS $$
DECLARE
    result_id INTEGER;
BEGIN
    -- Attempt to insert or update the news article record
    INSERT INTO news_articles (
        title,
        summary,
        content,
        url,
        source,
        published_at,
        author,
        category,
        sentiment,
        relevance_score,
        sentiment_confidence,
        language,
        word_count,
        image_url,
        tags,
        data_provider,
        updated_at
    ) VALUES (
        p_title,
        p_summary,
        p_content,
        p_url,
        p_source,
        p_published_at,
        p_author,
        p_category,
        p_sentiment,
        p_relevance_score,
        p_sentiment_confidence,
        p_language,
        p_word_count,
        p_image_url,
        p_tags,
        p_data_provider,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (url)
    DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        content = EXCLUDED.content,
        source = EXCLUDED.source,
        published_at = EXCLUDED.published_at,
        author = EXCLUDED.author,
        category = EXCLUDED.category,
        sentiment = EXCLUDED.sentiment,
        relevance_score = EXCLUDED.relevance_score,
        sentiment_confidence = EXCLUDED.sentiment_confidence,
        language = EXCLUDED.language,
        word_count = EXCLUDED.word_count,
        image_url = EXCLUDED.image_url,
        tags = EXCLUDED.tags,
        data_provider = EXCLUDED.data_provider,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO result_id;

    -- Log the operation for audit purposes
    RAISE NOTICE 'News article upserted: "%" from % (%), ID: %',
                 LEFT(p_title, 50), p_source, p_data_provider, result_id;

    RETURN result_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Error upserting news article "%": %',
                       LEFT(p_title, 50), SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Function to upsert news-stock relationships
CREATE OR REPLACE FUNCTION upsert_news_stock(
    p_news_id INTEGER,
    p_stock_id INTEGER,
    p_mention_type VARCHAR(20) DEFAULT 'mentioned',
    p_sentiment_impact DECIMAL(3,2) DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    -- Attempt to insert or update the news-stock relationship
    INSERT INTO news_stocks (
        news_id,
        stock_id,
        mention_type,
        sentiment_impact
    ) VALUES (
        p_news_id,
        p_stock_id,
        p_mention_type,
        p_sentiment_impact
    )
    ON CONFLICT (news_id, stock_id)
    DO UPDATE SET
        mention_type = EXCLUDED.mention_type,
        sentiment_impact = EXCLUDED.sentiment_impact;

    -- Log the operation for audit purposes
    RAISE NOTICE 'News-stock relationship upserted: news %, stock %, type %',
                 p_news_id, p_stock_id, p_mention_type;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Error upserting news-stock relationship: news %, stock %: %',
                       p_news_id, p_stock_id, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Add function comments
COMMENT ON FUNCTION upsert_news_article(
    TEXT, TEXT, TEXT, TEXT, VARCHAR(100), TIMESTAMP, VARCHAR(255),
    VARCHAR(50), DECIMAL(3,2), DECIMAL(3,2), DECIMAL(3,2), VARCHAR(5),
    INTEGER, TEXT, TEXT[], VARCHAR(50)
) IS 'Upserts news article data. Inserts new record or updates existing based on URL.';

COMMENT ON FUNCTION upsert_news_stock(
    INTEGER, INTEGER, VARCHAR(20), DECIMAL(3,2)
) IS 'Upserts news-stock relationship data. Inserts new record or updates existing based on news_id + stock_id.';

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Example 1: Insert new news article with stock mentions
DO $$
DECLARE
    news_id INTEGER;
BEGIN
    -- Insert the news article first
    SELECT upsert_news_article(
        'Apple Reports Strong Q1 Earnings, Beats Expectations', -- title
        'Apple Inc. reported quarterly earnings that exceeded analyst expectations...', -- summary
        'Full article content here...', -- content
        'https://example.com/apple-q1-earnings', -- url
        'Bloomberg', -- source
        '2024-01-25 16:30:00', -- published_at
        'John Smith', -- author
        'earnings', -- category
        0.8, -- sentiment (positive)
        0.95, -- relevance_score
        0.85, -- sentiment_confidence
        'en', -- language
        850, -- word_count
        'https://example.com/apple-earnings-image.jpg', -- image_url
        ARRAY['Apple', 'earnings', 'Q1', 'iPhone'], -- tags
        'finnhub' -- data_provider
    ) INTO news_id;

    -- Add stock mentions
    PERFORM upsert_news_stock(news_id, 1, 'primary', 0.8);    -- AAPL (primary)
    PERFORM upsert_news_stock(news_id, 2, 'mentioned', 0.2);   -- MSFT (mentioned)
    PERFORM upsert_news_stock(news_id, 3, 'sector', 0.1);      -- GOOGL (sector impact)

    RAISE NOTICE 'News article and stock mentions inserted successfully';
END $$;

-- Example 2: Update existing news article with new sentiment analysis
SELECT upsert_news_article(
    'Apple Reports Strong Q1 Earnings, Beats Expectations', -- same title
    'Updated summary...', -- updated summary
    'Updated full content...', -- updated content
    'https://example.com/apple-q1-earnings', -- same URL
    'Bloomberg', -- same source
    '2024-01-25 16:30:00', -- same published_at
    'John Smith', -- same author
    'earnings', -- same category
    0.85, -- updated sentiment (more positive)
    0.97, -- updated relevance
    0.90, -- updated confidence
    'en', 'en', -- same language
    850, -- same word count
    'https://example.com/apple-earnings-image.jpg', -- same image
    ARRAY['Apple', 'earnings', 'Q1', 'iPhone', 'record-breaking'], -- updated tags
    'finnhub' -- same provider
);

-- Example 3: Handle market news without specific stock mentions
SELECT upsert_news_article(
    'Federal Reserve Maintains Interest Rates',
    'The Federal Reserve decided to keep interest rates unchanged...',
    'Full article content about Fed decision...',
    'https://example.com/fed-rates-unchanged',
    'Reuters',
    '2024-01-31 14:00:00',
    'Jane Doe',
    'general',
    -0.3, -- negative sentiment (rate stability)
    0.9,  -- high relevance
    0.8,  -- good confidence
    'en',
    650,
    'https://example.com/fed-building.jpg',
    ARRAY['Federal Reserve', 'interest rates', 'monetary policy'],
    'alpha_vantage'
);

-- Example 4: Bulk news processing
-- Your application can process multiple news articles in a batch
-- Each article can mention multiple stocks with different impact levels
*/

-- =====================================================
-- FUNCTION FEATURES
-- =====================================================

/*
FUNCTION FEATURES:

1. ATOMIC UPSERT:
   - Uses PostgreSQL ON CONFLICT for thread-safe operations
   - Either inserts new record or updates existing
   - Based on unique constraints (URL for articles, composite key for relationships)
   - No race conditions or duplicate data

2. COMPREHENSIVE PARAMETERS:
   - All news_articles table columns supported
   - All news_stocks relationship columns supported
   - Optional parameters with sensible defaults
   - Type-safe with proper data types for all parameters

3. SENTIMENT ANALYSIS SUPPORT:
   - Sentiment scores with confidence levels
   - Relevance scoring for financial markets
   - Array-based tags for flexible categorization
   - Multi-stock mention tracking

4. RELATIONSHIP MANAGEMENT:
   - Many-to-many stock mention relationships
   - Different mention types (primary, mentioned, sector)
   - Sentiment impact per stock mention
   - Cascade delete support

5. AUDIT TRAIL:
   - Automatically updates updated_at timestamp
   - Logs operations for monitoring
   - Returns the record ID for reference

INTEGRATION NOTES:

- Call upsert_news_article first to create/get article ID
- Then call upsert_news_stock for each stock mention
- Use the returned ID for logging or further processing
- Handle exceptions in your application code
- Consider batch processing for multiple news articles
- Functions support sentiment analysis and multi-stock relationships
*/
