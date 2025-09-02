-- ----------------------------------------------------------------------------
-- Function: upsert_news_article
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_news_article(
    p_article_id TEXT,
    p_title TEXT,
    p_summary TEXT,
    p_content TEXT,
    p_author TEXT,
    p_published_at TIMESTAMP WITH TIME ZONE,
    p_url TEXT,
    p_image_url TEXT,
    p_sentiment_score NUMERIC,
    p_sentiment_label TEXT,
    p_data_provider TEXT,
    p_data_source_url TEXT
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO news_articles (
        article_id, title, summary, content, author, published_at, url, 
        image_url, sentiment_score, sentiment_label, data_provider, data_source_url
    )
    VALUES (
        p_article_id, p_title, p_summary, p_content, p_author, p_published_at, p_url, 
        p_image_url, p_sentiment_score, p_sentiment_label, p_data_provider, p_data_source_url
    )
    ON CONFLICT (article_id, data_provider) DO UPDATE SET
        title = COALESCE(p_title, excluded.title),
        summary = COALESCE(p_summary, excluded.summary),
        content = COALESCE(p_content, excluded.content),
        author = COALESCE(p_author, excluded.author),
        published_at = COALESCE(p_published_at, excluded.published_at),
        url = COALESCE(p_url, excluded.url),
        image_url = COALESCE(p_image_url, excluded.image_url),
        sentiment_score = COALESCE(p_sentiment_score, excluded.sentiment_score),
        sentiment_label = COALESCE(p_sentiment_label, excluded.sentiment_label),
        data_source_url = COALESCE(p_data_source_url, excluded.data_source_url),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function: upsert_news_stock
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_news_stock(
    p_article_id BIGINT,
    p_symbol TEXT,
    p_relevance_score NUMERIC
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO news_stocks (
        article_id, symbol, relevance_score
    )
    VALUES (
        p_article_id, p_symbol, p_relevance_score
    )
    ON CONFLICT (article_id, symbol) DO UPDATE SET
        relevance_score = COALESCE(p_relevance_score, excluded.relevance_score),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Permissions
-- ----------------------------------------------------------------------------

ALTER FUNCTION upsert_news_article(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) OWNER TO api_user;
GRANT EXECUTE ON FUNCTION upsert_news_article(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) TO api_user;

ALTER FUNCTION upsert_news_stock(BIGINT, TEXT, NUMERIC) OWNER TO api_user;
GRANT EXECUTE ON FUNCTION upsert_news_stock(BIGINT, TEXT, NUMERIC) TO api_user;
