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

-- Grant permissions
GRANT ALL ON ai_reports TO authenticated;
GRANT USAGE ON SEQUENCE ai_reports_id_seq TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE ai_reports IS 'Stores AI-generated trading analysis reports with vector embeddings for semantic search';
COMMENT ON COLUMN ai_reports.report_embedding IS 'Vector embedding of the full report content for semantic similarity search';
COMMENT ON COLUMN ai_reports.summary_embedding IS 'Vector embedding of the executive summary for quick similarity matching';
COMMENT ON COLUMN ai_reports.report_hash IS 'SHA-256 hash of report content to prevent duplicate storage';
COMMENT ON COLUMN ai_reports.model_versions IS 'JSON object tracking which AI models were used for each stage';
COMMENT ON COLUMN ai_reports.tags IS 'Array of searchable tags for categorizing reports';
