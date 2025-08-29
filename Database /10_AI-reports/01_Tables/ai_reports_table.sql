-- AI Reports Vector Storage Table
-- Stores AI-generated trading reports with vector embeddings for semantic search

-- Enable vector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create AI reports table with vector storage
CREATE TABLE IF NOT EXISTS ai_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    
    -- Report metadata
    time_period VARCHAR(50) NOT NULL, -- '7d', '30d', '90d', '1y', 'ytd', 'custom'
    start_date DATE,
    end_date DATE,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Report content
    report_title VARCHAR(255) NOT NULL,
    executive_summary TEXT NOT NULL,
    full_report TEXT NOT NULL,
    data_analysis TEXT NOT NULL,
    insights TEXT NOT NULL,
    
    -- Trading metrics for context
    win_rate DECIMAL(5,2),
    profit_factor DECIMAL(8,2),
    trade_expectancy DECIMAL(10,2),
    total_trades INTEGER,
    net_pnl DECIMAL(12,2),
    
    -- Vector embeddings for semantic search
    report_embedding vector(1536), -- OpenAI ada-002 embedding size
    summary_embedding vector(1536), -- Embedding of executive summary
    
    -- Search and filtering
    report_hash VARCHAR(64) UNIQUE, -- SHA-256 hash to prevent duplicates
    tags TEXT[], -- Searchable tags like ['profitable_week', 'tech_heavy', 'risk_management']
    
    -- Metadata
    model_versions JSONB, -- Track which AI models were used
    processing_time_ms INTEGER,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_reports_user_id ON ai_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_reports_time_period ON ai_reports(time_period);
CREATE INDEX IF NOT EXISTS idx_ai_reports_generated_at ON ai_reports(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_reports_date_range ON ai_reports(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_ai_reports_tags ON ai_reports USING GIN(tags);

-- Vector similarity search indexes
CREATE INDEX IF NOT EXISTS idx_ai_reports_report_embedding ON ai_reports 
USING ivfflat (report_embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_ai_reports_summary_embedding ON ai_reports 
USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists = 100);

-- Row Level Security (RLS)
ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own reports
CREATE POLICY ai_reports_user_policy ON ai_reports
    FOR ALL USING (auth.uid() = user_id);

-- Policy for authenticated users to view only their own stock records
CREATE POLICY "Users can view own ai_reports" ON public.ai_reports
    FOR SELECT USING (auth.uid() = user_id);

-- Policy for authenticated users to insert their own stock records
CREATE POLICY "Users can insert own ai_reports" ON public.ai_reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy for authenticated users to update only their own stock records
CREATE POLICY "Users can update own ai_reports" ON public.ai_reports
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy for authenticated users to delete only their own stock records
CREATE POLICY "Users can delete own ai_reports" ON public.ai_reports
    FOR DELETE USING (auth.uid() = user_id);


-- Grant permissions
GRANT ALL ON ai_reports TO authenticated;
-- Note: No sequence grant needed since we use gen_random_uuid() for UUID primary key

-- Chat Q&A table for storing conversation history with vector embeddings
CREATE TABLE IF NOT EXISTS chat_qa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    question_embedding vector(1536), -- Vector embedding of the question
    answer_embedding vector(1536),  -- Vector embedding of the answer
    similarity_score DECIMAL(3,2),  -- Optional similarity score when found via search
    source_type VARCHAR(20) DEFAULT 'external_ai', -- 'external_ai' or 'vector_match'
    model_used VARCHAR(100),        -- Which AI model generated this answer
    created_at TIMESTAMPTZ DEFAULT NOW(),
    usage_count INTEGER DEFAULT 1,  -- How many times this Q&A pair has been reused
    last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_qa_user_id ON chat_qa(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_qa_created_at ON chat_qa(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_qa_question_embedding ON chat_qa
USING ivfflat (question_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_chat_qa_answer_embedding ON chat_qa
USING ivfflat (answer_embedding vector_cosine_ops) WITH (lists = 100);

-- Row Level Security (RLS)
ALTER TABLE chat_qa ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own chat Q&A
CREATE POLICY chat_qa_user_policy ON chat_qa
    FOR ALL USING (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON TABLE chat_qa IS 'Stores chat Q&A pairs with vector embeddings for semantic search and AI learning';
COMMENT ON COLUMN chat_qa.question_embedding IS 'Vector embedding of the user question for similarity matching';
COMMENT ON COLUMN chat_qa.answer_embedding IS 'Vector embedding of the AI answer for content matching';
COMMENT ON COLUMN chat_qa.source_type IS 'Whether answer came from external AI or vector similarity match';
COMMENT ON COLUMN chat_qa.usage_count IS 'How many times this Q&A pair has been reused by the learning system';

-- Grant permissions
GRANT ALL ON chat_qa TO authenticated;
