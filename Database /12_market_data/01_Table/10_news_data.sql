-- News Data Table - GLOBAL SHARED DATA
-- This table stores news articles accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores news articles, sentiment analysis, and symbol mentions from providers

CREATE TABLE IF NOT EXISTS news_articles (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    url TEXT UNIQUE,
    source VARCHAR(100),

    -- Publication information
    published_at TIMESTAMP NOT NULL,
    author VARCHAR(255),
    category VARCHAR(50),  -- 'earnings', 'general', 'analysis', etc.

    -- Sentiment and relevance analysis
    sentiment DECIMAL(3,2),  -- -1.0 to 1.0 sentiment score
    relevance_score DECIMAL(3,2),  -- 0.0 to 1.0 relevance score
    sentiment_confidence DECIMAL(3,2),  -- Confidence in sentiment analysis

    -- Content metadata
    language VARCHAR(5) DEFAULT 'en',
    word_count INTEGER,
    image_url TEXT,
    tags TEXT[],  -- Array of tags/keywords

    -- Provider and audit info
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for news analysis queries
CREATE INDEX IF NOT EXISTS idx_news_articles_published_at ON news_articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_source ON news_articles (source);
CREATE INDEX IF NOT EXISTS idx_news_articles_sentiment ON news_articles (sentiment);
CREATE INDEX IF NOT EXISTS idx_news_articles_relevance ON news_articles (relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_category ON news_articles (category);
CREATE INDEX IF NOT EXISTS idx_news_articles_provider ON news_articles (data_provider);
CREATE INDEX IF NOT EXISTS idx_news_articles_published_at_source ON news_articles (published_at DESC, source);

-- Many-to-many relationship table for news mentioning multiple stocks
CREATE TABLE IF NOT EXISTS news_stocks (
    news_id INTEGER REFERENCES news_articles(id) ON DELETE CASCADE,
    stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
    mention_type VARCHAR(20) DEFAULT 'mentioned',  -- 'primary', 'mentioned', 'sector'
    sentiment_impact DECIMAL(3,2),  -- -1.0 to 1.0 impact on stock
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (news_id, stock_id)
);

-- Indexes for news-stock relationship queries
CREATE INDEX IF NOT EXISTS idx_news_stocks_stock_id ON news_stocks (stock_id);
CREATE INDEX IF NOT EXISTS idx_news_stocks_news_id ON news_stocks (news_id);
CREATE INDEX IF NOT EXISTS idx_news_stocks_mention_type ON news_stocks (mention_type);
CREATE INDEX IF NOT EXISTS idx_news_stocks_sentiment_impact ON news_stocks (sentiment_impact DESC);

-- Add table comments
COMMENT ON TABLE news_articles IS 'News articles and content from multiple market data providers';
COMMENT ON TABLE news_stocks IS 'Many-to-many relationship between news articles and mentioned stocks';

-- Add column comments for news_articles
COMMENT ON COLUMN news_articles.title IS 'News article title';
COMMENT ON COLUMN news_articles.summary IS 'Brief summary of the article';
COMMENT ON COLUMN news_articles.content IS 'Full article content (if available)';
COMMENT ON COLUMN news_articles.url IS 'URL to the full article';
COMMENT ON COLUMN news_articles.source IS 'News source (Bloomberg, Reuters, CNBC, etc.)';
COMMENT ON COLUMN news_articles.published_at IS 'Date and time when article was published';
COMMENT ON COLUMN news_articles.author IS 'Article author or journalist name';
COMMENT ON COLUMN news_articles.category IS 'Article category (earnings, general, analysis, etc.)';
COMMENT ON COLUMN news_articles.sentiment IS 'Sentiment score (-1.0 negative to 1.0 positive)';
COMMENT ON COLUMN news_articles.relevance_score IS 'Relevance score (0.0 to 1.0) for financial markets';
COMMENT ON COLUMN news_articles.sentiment_confidence IS 'Confidence level in sentiment analysis';
COMMENT ON COLUMN news_articles.language IS 'Article language code (en, es, fr, etc.)';
COMMENT ON COLUMN news_articles.word_count IS 'Approximate word count of the article';
COMMENT ON COLUMN news_articles.image_url IS 'URL to article featured image';
COMMENT ON COLUMN news_articles.tags IS 'Array of tags and keywords for the article';
COMMENT ON COLUMN news_articles.data_provider IS 'Market data provider (finnhub, alpha_vantage, etc.)';

-- Add column comments for news_stocks
COMMENT ON COLUMN news_stocks.news_id IS 'Foreign key to news_articles table';
COMMENT ON COLUMN news_stocks.stock_id IS 'Foreign key to stocks table';
COMMENT ON COLUMN news_stocks.mention_type IS 'Type of mention (primary, mentioned, sector)';
COMMENT ON COLUMN news_stocks.sentiment_impact IS 'Sentiment impact on the stock (-1.0 to 1.0)';

-- =====================================================
-- NEWS TABLES SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from news tables
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from news tables
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON news_articles TO PUBLIC;
GRANT SELECT ON news_stocks TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON news_articles FROM PUBLIC;
REVOKE UPDATE ON news_articles FROM PUBLIC;
REVOKE DELETE ON news_articles FROM PUBLIC;

REVOKE INSERT ON news_stocks FROM PUBLIC;
REVOKE UPDATE ON news_stocks FROM PUBLIC;
REVOKE DELETE ON news_stocks FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the tables
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_stocks ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "news_articles_select_policy" ON news_articles
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

CREATE POLICY "news_stocks_select_policy" ON news_stocks
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "news_articles_insert_policy" ON news_articles
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

CREATE POLICY "news_stocks_insert_policy" ON news_stocks
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "news_articles_update_policy" ON news_articles
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

CREATE POLICY "news_stocks_update_policy" ON news_stocks
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "news_articles_delete_policy" ON news_articles
    FOR DELETE
    USING (false);  -- Deny all delete operations

CREATE POLICY "news_stocks_delete_policy" ON news_stocks
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR NEWS TABLES
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for news analysis and display
   - Users cannot modify news data integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic news data updates

3. DATA INTEGRITY:
   - News data should be treated as immutable by users
   - Only trusted sources can update news information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/
