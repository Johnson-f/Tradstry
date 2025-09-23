-- Market Data Documents Vector Index for RAG System
CREATE EXTENSION IF NOT EXISTS vector;

-- Stores vectorized market research, news, and external data
CREATE TABLE IF NOT EXISTS rag_market_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Document metadata
    document_type VARCHAR(50) NOT NULL, -- 'market_news', 'earnings_data', 'company_info', 'sector_analysis'
    source VARCHAR(100), -- 'internal', 'polygon', 'alpha_vantage', 'manual_input'
    source_id VARCHAR(100), -- External API reference
    
    -- Content and embeddings
    title VARCHAR(500),
    content TEXT NOT NULL,
    content_embedding vector(1024),
    
    -- Market context
    symbols TEXT[], -- Related symbols
    sector VARCHAR(50),
    market_cap_range VARCHAR(20), -- 'small', 'mid', 'large', 'mega'
    publication_date DATE,
    
    -- Classification and filtering
    sentiment_score DECIMAL(3,2), -- -1.0 to 1.0
    relevance_score DECIMAL(3,2), -- How relevant to user's trading style
    categories TEXT[], -- ['earnings', 'technical_analysis', 'fundamental', 'news']
    
    -- Expiry and maintenance
    expires_at TIMESTAMPTZ, -- When this data becomes stale
    last_validated_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rag_market_user_type ON rag_market_documents(user_id, document_type);
CREATE INDEX IF NOT EXISTS idx_rag_market_symbols ON rag_market_documents USING GIN(symbols);
CREATE INDEX IF NOT EXISTS idx_rag_market_categories ON rag_market_documents USING GIN(categories);
CREATE INDEX IF NOT EXISTS idx_rag_market_relevance ON rag_market_documents(user_id, relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_rag_market_content_vector ON rag_market_documents USING ivfflat (content_embedding vector_cosine_ops);

-- RLS
ALTER TABLE rag_market_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own market documents" ON rag_market_documents FOR ALL USING (auth.uid() = user_id);
GRANT ALL ON rag_market_documents TO authenticated;
