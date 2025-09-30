-- ----------------------------------------------------------------------------
-- Function: upsert_news_article (Updated to match news_articles table structure)
-- ----------------------------------------------------------------------------

-- Tested 

CREATE OR REPLACE FUNCTION upsert_news_article(
    -- Required parameters (no defaults)
    p_title TEXT,
    p_published_at TIMESTAMP,
    p_data_provider TEXT,
    
    -- Optional content parameters
    p_summary TEXT DEFAULT NULL,
    p_content TEXT DEFAULT NULL,
    p_url TEXT DEFAULT NULL,
    p_source VARCHAR(100) DEFAULT NULL,
    p_author VARCHAR(255) DEFAULT NULL,
    p_category VARCHAR(50) DEFAULT NULL,
    
    -- Sentiment and analysis parameters
    p_sentiment NUMERIC DEFAULT NULL,
    p_relevance_score NUMERIC DEFAULT NULL,
    p_sentiment_confidence NUMERIC DEFAULT NULL,
    
    -- Content metadata parameters
    p_language VARCHAR(5) DEFAULT 'en',
    p_word_count INTEGER DEFAULT NULL,
    p_image_url TEXT DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    -- Insert/update news article
    INSERT INTO news_articles (
        title, summary, content, url, source, published_at, author, category,
        sentiment, relevance_score, sentiment_confidence, language, word_count,
        image_url, tags, data_provider, created_at, updated_at
    )
    VALUES (
        p_title, p_summary, p_content, p_url, p_source, p_published_at, p_author, p_category,
        p_sentiment, p_relevance_score, p_sentiment_confidence, p_language, p_word_count,
        p_image_url, p_tags, p_data_provider, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (url) DO UPDATE SET
        title = COALESCE(EXCLUDED.title, news_articles.title),
        summary = COALESCE(EXCLUDED.summary, news_articles.summary),
        content = COALESCE(EXCLUDED.content, news_articles.content),
        source = COALESCE(EXCLUDED.source, news_articles.source),
        published_at = COALESCE(EXCLUDED.published_at, news_articles.published_at),
        author = COALESCE(EXCLUDED.author, news_articles.author),
        category = COALESCE(EXCLUDED.category, news_articles.category),
        sentiment = COALESCE(EXCLUDED.sentiment, news_articles.sentiment),
        relevance_score = COALESCE(EXCLUDED.relevance_score, news_articles.relevance_score),
        sentiment_confidence = COALESCE(EXCLUDED.sentiment_confidence, news_articles.sentiment_confidence),
        language = COALESCE(EXCLUDED.language, news_articles.language),
        word_count = COALESCE(EXCLUDED.word_count, news_articles.word_count),
        image_url = COALESCE(EXCLUDED.image_url, news_articles.image_url),
        tags = COALESCE(EXCLUDED.tags, news_articles.tags),
        data_provider = COALESCE(EXCLUDED.data_provider, news_articles.data_provider),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_news_article IS 'Upserts news article data with conflict resolution on url. Handles all news metadata and sentiment analysis.';

-- ----------------------------------------------------------------------------
-- Updated News Stock Upsert Function to match news_stocks table structure
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_news_stock(
    -- Required parameters (no defaults)
    p_news_id INTEGER,
    p_stock_id INTEGER,
    
    -- Optional parameters
    p_mention_type VARCHAR(20) DEFAULT 'mentioned',
    p_sentiment_impact NUMERIC DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    -- Insert/update news stock relationship
    INSERT INTO news_stocks (
        news_id, stock_id, mention_type, sentiment_impact, created_at
    )
    VALUES (
        p_news_id, p_stock_id, p_mention_type, p_sentiment_impact, CURRENT_TIMESTAMP
    )
    ON CONFLICT (news_id, stock_id) DO UPDATE SET
        mention_type = COALESCE(EXCLUDED.mention_type, news_stocks.mention_type),
        sentiment_impact = COALESCE(EXCLUDED.sentiment_impact, news_stocks.sentiment_impact);
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_news_stock IS 'Upserts news stock relationship with conflict resolution on news_id and stock_id.';


-- ----------------------------------------------------------------------------
-- Test script for Supabase SQL Editor 
-- ----------------------------------------------------------------------------
/*
-- Test insert: new news article
SELECT upsert_news_article(
    p_title => 'Apple Reports Strong Q4 Earnings',
    p_published_at => '2024-03-15 10:30:00'::TIMESTAMP,
    p_data_provider => 'finnhub',
    
    -- Content data
    p_summary => 'Apple Inc. reported better-than-expected quarterly earnings...',
    p_content => 'Full article content here...',
    p_url => 'https://example.com/apple-earnings-q4-2024',
    p_source => 'Reuters',
    p_author => 'John Smith',
    p_category => 'earnings',
    
    -- Sentiment analysis
    p_sentiment => 0.75,
    p_relevance_score => 0.95,
    p_sentiment_confidence => 0.88,
    
    -- Metadata
    p_language => 'en',
    p_word_count => 1250,
    p_image_url => 'https://example.com/apple-logo.jpg',
    p_tags => ARRAY['Apple', 'earnings', 'technology', 'Q4']
);

-- Test insert: link news article to stock (assuming news article ID = 1, stock ID = 1)
SELECT upsert_news_stock(
    p_news_id => 1,
    p_stock_id => 1,
    p_mention_type => 'primary',
    p_sentiment_impact => 0.80
);
*/