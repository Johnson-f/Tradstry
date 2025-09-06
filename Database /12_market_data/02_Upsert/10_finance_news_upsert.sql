-- ----------------------------------------------------------------------------
-- Function: upsert_finance_news (For finance-query.onrender.com API)
-- ----------------------------------------------------------------------------
-- This function handles inserting/updating finance news data from the 
-- finance-query API with proper conflict resolution and stock symbol tracking

CREATE OR REPLACE FUNCTION upsert_finance_news(
    -- Required parameters from finance-query API
    p_title TEXT,
    p_news_url TEXT,
    p_source_name TEXT,
    p_time_published TEXT,
    p_published_at TIMESTAMP,
    
    -- Optional parameters from API
    p_image_url TEXT DEFAULT NULL,
    
    -- Calculated parameters (from Edge Function processing)
    p_sentiment_score NUMERIC DEFAULT NULL,
    p_relevance_score NUMERIC DEFAULT NULL,
    p_sentiment_confidence NUMERIC DEFAULT NULL,
    p_mentioned_symbols TEXT[] DEFAULT NULL,
    p_primary_symbols TEXT[] DEFAULT NULL,
    p_word_count INTEGER DEFAULT 0,
    
    -- Metadata parameters
    p_language VARCHAR(5) DEFAULT 'en',
    p_category VARCHAR(50) DEFAULT 'financial'
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    -- Insert/update finance news article
    INSERT INTO finance_news (
        title, news_url, source_name, image_url, time_published, published_at,
        sentiment_score, relevance_score, sentiment_confidence, mentioned_symbols,
        primary_symbols, word_count, language, category, api_fetch_timestamp,
        created_at, updated_at
    )
    VALUES (
        p_title, p_news_url, p_source_name, p_image_url, p_time_published, p_published_at,
        p_sentiment_score, p_relevance_score, p_sentiment_confidence, p_mentioned_symbols,
        p_primary_symbols, p_word_count, p_language, p_category, CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (news_url) DO UPDATE SET
        title = COALESCE(EXCLUDED.title, finance_news.title),
        source_name = COALESCE(EXCLUDED.source_name, finance_news.source_name),
        image_url = COALESCE(EXCLUDED.image_url, finance_news.image_url),
        time_published = COALESCE(EXCLUDED.time_published, finance_news.time_published),
        published_at = COALESCE(EXCLUDED.published_at, finance_news.published_at),
        sentiment_score = COALESCE(EXCLUDED.sentiment_score, finance_news.sentiment_score),
        relevance_score = COALESCE(EXCLUDED.relevance_score, finance_news.relevance_score),
        sentiment_confidence = COALESCE(EXCLUDED.sentiment_confidence, finance_news.sentiment_confidence),
        mentioned_symbols = COALESCE(EXCLUDED.mentioned_symbols, finance_news.mentioned_symbols),
        primary_symbols = COALESCE(EXCLUDED.primary_symbols, finance_news.primary_symbols),
        word_count = COALESCE(EXCLUDED.word_count, finance_news.word_count),
        language = COALESCE(EXCLUDED.language, finance_news.language),
        category = COALESCE(EXCLUDED.category, finance_news.category),
        api_fetch_timestamp = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_finance_news IS 'Upserts finance news data from finance-query API with conflict resolution on news_url. Handles sentiment analysis and stock symbol tracking.';

-- ----------------------------------------------------------------------------
-- Function: upsert_finance_news_stock_relationship
-- ----------------------------------------------------------------------------
-- This function creates relationships between finance news and stock symbols

CREATE OR REPLACE FUNCTION upsert_finance_news_stock(
    -- Required parameters
    p_finance_news_id BIGINT,
    p_stock_symbol VARCHAR(10),
    
    -- Optional parameters
    p_mention_type VARCHAR(20) DEFAULT 'mentioned',
    p_sentiment_impact NUMERIC DEFAULT NULL,
    p_confidence_score NUMERIC DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    -- Insert/update finance news stock relationship
    INSERT INTO finance_news_stocks (
        finance_news_id, stock_symbol, mention_type, sentiment_impact, 
        confidence_score, created_at
    )
    VALUES (
        p_finance_news_id, p_stock_symbol, p_mention_type, p_sentiment_impact,
        p_confidence_score, CURRENT_TIMESTAMP
    )
    ON CONFLICT (finance_news_id, stock_symbol) DO UPDATE SET
        mention_type = COALESCE(EXCLUDED.mention_type, finance_news_stocks.mention_type),
        sentiment_impact = COALESCE(EXCLUDED.sentiment_impact, finance_news_stocks.sentiment_impact),
        confidence_score = COALESCE(EXCLUDED.confidence_score, finance_news_stocks.confidence_score);
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_finance_news_stock IS 'Upserts finance news stock relationship with conflict resolution on finance_news_id and stock_symbol.';

-- ----------------------------------------------------------------------------
-- Bulk function: Process finance news with stock symbols
-- ----------------------------------------------------------------------------
-- This function combines news upsert with automatic stock relationship creation

CREATE OR REPLACE FUNCTION process_finance_news_with_symbols(
    -- News data
    p_title TEXT,
    p_news_url TEXT,
    p_source_name TEXT,
    p_time_published TEXT,
    p_published_at TIMESTAMP,
    p_image_url TEXT DEFAULT NULL,
    p_sentiment_score NUMERIC DEFAULT NULL,
    p_relevance_score NUMERIC DEFAULT NULL,
    p_sentiment_confidence NUMERIC DEFAULT NULL,
    p_mentioned_symbols TEXT[] DEFAULT NULL,
    p_primary_symbols TEXT[] DEFAULT NULL,
    p_word_count INTEGER DEFAULT 0,
    p_language VARCHAR(5) DEFAULT 'en',
    p_category VARCHAR(50) DEFAULT 'financial'
) RETURNS BIGINT AS $$
DECLARE
    v_news_id BIGINT;
    v_symbol TEXT;
    v_mention_type TEXT;
BEGIN
    -- Insert the news article first
    v_news_id := upsert_finance_news(
        p_title, p_news_url, p_source_name, p_time_published, p_published_at,
        p_image_url, p_sentiment_score, p_relevance_score, p_sentiment_confidence,
        p_mentioned_symbols, p_primary_symbols, p_word_count, p_language, p_category
    );
    
    -- Process primary symbols (high confidence)
    IF p_primary_symbols IS NOT NULL THEN
        FOREACH v_symbol IN ARRAY p_primary_symbols
        LOOP
            PERFORM upsert_finance_news_stock(
                v_news_id, v_symbol, 'primary', p_sentiment_score, 0.9
            );
        END LOOP;
    END IF;
    
    -- Process mentioned symbols (lower confidence)
    IF p_mentioned_symbols IS NOT NULL THEN
        FOREACH v_symbol IN ARRAY p_mentioned_symbols
        LOOP
            -- Only add if not already added as primary
            IF p_primary_symbols IS NULL OR NOT (v_symbol = ANY(p_primary_symbols)) THEN
                PERFORM upsert_finance_news_stock(
                    v_news_id, v_symbol, 'mentioned', p_sentiment_score * 0.7, 0.6
                );
            END IF;
        END LOOP;
    END IF;
    
    RETURN v_news_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION process_finance_news_with_symbols IS 'Complete processing of finance news including automatic stock symbol relationship creation';

-- ----------------------------------------------------------------------------
-- Test script for Supabase SQL Editor 
-- ----------------------------------------------------------------------------
/*
-- Test insert: new finance news article
SELECT upsert_finance_news(
    p_title => 'Apple Stock Surges After Strong Earnings Report',
    p_news_url => 'https://finance-query.onrender.com/news/apple-earnings-2024',
    p_source_name => 'Reuters',
    p_time_published => '2 hours ago',
    p_published_at => NOW() - INTERVAL '2 hours',
    p_image_url => 'https://example.com/apple-chart.jpg',
    p_sentiment_score => 0.75,
    p_relevance_score => 0.95,
    p_sentiment_confidence => 0.88,
    p_mentioned_symbols => ARRAY['AAPL', 'MSFT', 'GOOGL'],
    p_primary_symbols => ARRAY['AAPL'],
    p_word_count => 45,
    p_language => 'en',
    p_category => 'earnings'
);

-- Test bulk processing with automatic stock relationships
SELECT process_finance_news_with_symbols(
    p_title => 'Tesla Reports Q4 Delivery Numbers Beat Expectations',
    p_news_url => 'https://finance-query.onrender.com/news/tesla-q4-deliveries',
    p_source_name => 'MarketWatch',
    p_time_published => '1 hour ago',
    p_published_at => NOW() - INTERVAL '1 hour',
    p_sentiment_score => 0.85,
    p_relevance_score => 0.92,
    p_sentiment_confidence => 0.91,
    p_mentioned_symbols => ARRAY['TSLA', 'F', 'GM'],
    p_primary_symbols => ARRAY['TSLA'],
    p_word_count => 52
);

-- Query to verify data
SELECT f.title, f.source_name, f.sentiment_score, 
       array_agg(fns.stock_symbol) as symbols
FROM finance_news f
LEFT JOIN finance_news_stocks fns ON f.id = fns.finance_news_id
WHERE f.created_at >= NOW() - INTERVAL '1 day'
GROUP BY f.id, f.title, f.source_name, f.sentiment_score
ORDER BY f.published_at DESC;
*/
