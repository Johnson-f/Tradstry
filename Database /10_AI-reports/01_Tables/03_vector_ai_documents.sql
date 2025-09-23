-- AI Knowledge Documents Vector Index for RAG System
CREATE EXTENSION IF NOT EXISTS vector;

-- Stores AI-generated reports, insights, and analysis for retrieval
CREATE TABLE IF NOT EXISTS rag_ai_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Document metadata
    document_type VARCHAR(50) NOT NULL, -- 'ai_report', 'ai_insight', 'pattern_analysis', 'performance_review'
    source_table VARCHAR(50), -- 'ai_reports', 'ai_insights'
    source_id UUID, -- Reference to original AI-generated record
    
    -- Content and embeddings
    title VARCHAR(500),
    content TEXT NOT NULL,
    content_embedding vector(1024),
    
    -- AI context
    model_used VARCHAR(100),
    generation_date DATE,
    confidence_score DECIMAL(3,2),
    
    -- Content classification
    insight_types TEXT[], -- ['risk', 'opportunity', 'pattern', 'performance']
    time_horizon VARCHAR(20), -- 'intraday', 'short_term', 'medium_term', 'long_term'
    actionability_score DECIMAL(3,2), -- How actionable the content is
    
    -- Usage tracking
    retrieval_count INTEGER DEFAULT 0,
    last_retrieved_at TIMESTAMPTZ,
    avg_relevance_score DECIMAL(3,2), -- Average relevance when retrieved
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rag_ai_user_type ON rag_ai_documents(user_id, document_type);
CREATE INDEX IF NOT EXISTS idx_rag_ai_confidence ON rag_ai_documents(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_rag_ai_actionability ON rag_ai_documents(actionability_score DESC);
CREATE INDEX IF NOT EXISTS idx_rag_ai_insight_types ON rag_ai_documents USING GIN(insight_types);
CREATE INDEX IF NOT EXISTS idx_rag_ai_content_vector ON rag_ai_documents USING ivfflat (content_embedding vector_cosine_ops);

-- RLS
ALTER TABLE rag_ai_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own ai documents" ON rag_ai_documents FOR ALL USING (auth.uid() = user_id);
GRANT ALL ON rag_ai_documents TO authenticated;
