-- Trade Documents Vector Index for RAG System
CREATE EXTENSION IF NOT EXISTS vector;

-- Stores vectorized representations of trade history and journal entries
CREATE TABLE IF NOT EXISTS rag_trade_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Document metadata
    document_type VARCHAR(50) NOT NULL, -- 'trade_entry', 'trade_exit', 'trade_note', 'trade_analysis'
    source_table VARCHAR(50) NOT NULL, -- 'stocks', 'options', 'trade_notes'
    source_id UUID NOT NULL, -- Reference to the original record
    
    -- Content and embeddings
    title VARCHAR(500), -- Trade title or summary
    content TEXT NOT NULL, -- Full text content to be embedded
    content_embedding vector(1024), -- Voyager AI embedding (1024d)
    
    -- Trading context
    symbol VARCHAR(10),
    trade_date DATE,
    trade_type VARCHAR(20), -- 'stock', 'option'
    action VARCHAR(10), -- 'buy', 'sell'
    pnl DECIMAL(15,2),
    
    -- Metadata for retrieval
    tags TEXT[], -- ['scalping', 'swing', 'earnings_play', etc.]
    confidence_score DECIMAL(3,2) DEFAULT 0.0,
    chunk_index INTEGER DEFAULT 0, -- For large documents split into chunks
    total_chunks INTEGER DEFAULT 1,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rag_trade_user_type ON rag_trade_documents(user_id, document_type);
CREATE INDEX IF NOT EXISTS idx_rag_trade_symbol_date ON rag_trade_documents(symbol, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_rag_trade_tags ON rag_trade_documents USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_rag_trade_content_vector ON rag_trade_documents USING ivfflat (content_embedding vector_cosine_ops);

-- RLS
ALTER TABLE rag_trade_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own trade documents" ON rag_trade_documents FOR ALL USING (auth.uid() = user_id);
GRANT ALL ON rag_trade_documents TO authenticated;
