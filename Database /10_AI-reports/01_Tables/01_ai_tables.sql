-- Enable vector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- AI Reports table for storing generated summaries and insights 
-- Going to have an upsert, select, & delete function 
CREATE TABLE IF NOT EXISTS ai_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    report_type VARCHAR(50) NOT NULL, -- 'daily', 'weekly', 'monthly', 'year-to-date', 'yearly', 'custom'
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    content_embedding vector(1536), -- Vector embedding for semantic search
    insights JSONB, -- Structured insights data
    recommendations JSONB, -- AI-generated recommendations
    metrics JSONB, -- Key metrics calculated for this report
    date_range_start DATE,
    date_range_end DATE,
    model_used VARCHAR(100), -- AI model that generated this report
    processing_time_ms INTEGER, -- Time taken to generate
    confidence_score DECIMAL(3,2), -- AI confidence in the analysis
    status VARCHAR(20) DEFAULT 'completed', -- 'processing', 'completed', 'failed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Chat History table for conversation context and memory
-- Going to have an upsert, select, & delete function 
CREATE TABLE IF NOT EXISTS ai_chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL, -- Group related messages in a conversation
    message_type VARCHAR(20) NOT NULL, -- 'user_question', 'ai_response'
    content TEXT NOT NULL,
    question_embedding vector(1536), -- For user questions
    answer_embedding vector(1536), -- For AI responses
    context_data JSONB, -- Trading data context used for this response
    model_used VARCHAR(100), -- AI model used
    processing_time_ms INTEGER,
    confidence_score DECIMAL(3,2),
    similarity_score DECIMAL(3,2), -- If answer was found via vector search
    source_type VARCHAR(20) DEFAULT 'external_ai', -- 'external_ai', 'vector_match', 'cached'
    usage_count INTEGER DEFAULT 1, -- How many times this Q&A was reused
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Insights table for cached analysis results
-- Going to have an upsert, select, & delect function 
CREATE TABLE IF NOT EXISTS ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    insight_type VARCHAR(50) NOT NULL, -- 'pattern', 'risk', 'opportunity', 'performance'
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    insight_embedding vector(1536), -- For finding similar insights
    data_source JSONB, -- What data this insight is based on
    confidence_score DECIMAL(3,2),
    priority VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    actionable BOOLEAN DEFAULT true, -- Whether this insight has actionable recommendations
    actions JSONB, -- Suggested actions based on this insight
    tags TEXT[], -- Categorization tags
    valid_until TIMESTAMPTZ, -- When this insight expires
    model_used VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Processing Jobs table for tracking async AI tasks
-- Going to have an Upsert & select function 
CREATE TABLE IF NOT EXISTS ai_processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_type VARCHAR(50) NOT NULL, -- 'report_generation', 'insight_analysis', 'chat_response'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    input_data JSONB, -- Parameters and data for the job
    output_data JSONB, -- Results when completed
    error_message TEXT, -- Error details if failed
    model_used VARCHAR(100),
    priority INTEGER DEFAULT 5, -- 1-10, lower is higher priority
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    processing_time_ms INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_reports_user_id ON ai_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_reports_type_date ON ai_reports(user_id, report_type, date_range_start DESC);
CREATE INDEX IF NOT EXISTS idx_ai_reports_created_at ON ai_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_chat_history_user_session ON ai_chat_history(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_history_created_at ON ai_chat_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_history_message_type ON ai_chat_history(user_id, message_type);

CREATE INDEX IF NOT EXISTS idx_ai_insights_user_type ON ai_insights(user_id, insight_type);
CREATE INDEX IF NOT EXISTS idx_ai_insights_priority ON ai_insights(user_id, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_valid_until ON ai_insights(valid_until) WHERE valid_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_processing_jobs_user_status ON ai_processing_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_processing_jobs_type_status ON ai_processing_jobs(job_type, status, priority);
CREATE INDEX IF NOT EXISTS idx_ai_processing_jobs_created_at ON ai_processing_jobs(created_at DESC);

-- Vector indexes for similarity search (using ivfflat)
CREATE INDEX IF NOT EXISTS idx_ai_reports_content_embedding ON ai_reports USING ivfflat (content_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_ai_chat_question_embedding ON ai_chat_history USING ivfflat (question_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_ai_chat_answer_embedding ON ai_chat_history USING ivfflat (answer_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_ai_insights_embedding ON ai_insights USING ivfflat (insight_embedding vector_cosine_ops);

-- Enable Row Level Security
ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_processing_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_reports
CREATE POLICY "Users can view own ai_reports" ON public.ai_reports
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai_reports" ON public.ai_reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai_reports" ON public.ai_reports
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ai_reports" ON public.ai_reports
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for ai_chat_history
CREATE POLICY "Users can view own ai_chat_history" ON public.ai_chat_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai_chat_history" ON public.ai_chat_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai_chat_history" ON public.ai_chat_history
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ai_chat_history" ON public.ai_chat_history
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for ai_insights
CREATE POLICY "Users can view own ai_insights" ON public.ai_insights
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai_insights" ON public.ai_insights
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai_insights" ON public.ai_insights
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ai_insights" ON public.ai_insights
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for ai_processing_jobs
CREATE POLICY "Users can view own ai_processing_jobs" ON public.ai_processing_jobs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai_processing_jobs" ON public.ai_processing_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai_processing_jobs" ON public.ai_processing_jobs
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ai_processing_jobs" ON public.ai_processing_jobs
    FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON ai_reports TO authenticated;
GRANT ALL ON ai_chat_history TO authenticated;
GRANT ALL ON ai_insights TO authenticated;
GRANT ALL ON ai_processing_jobs TO authenticated;

-- Update triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ai_reports_updated_at BEFORE UPDATE ON ai_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_insights_updated_at BEFORE UPDATE ON ai_insights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_processing_jobs_updated_at BEFORE UPDATE ON ai_processing_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
