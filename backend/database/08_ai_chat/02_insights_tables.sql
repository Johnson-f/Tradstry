-- AI Insights Tables Migration
-- This migration creates tables for AI insights functionality

-- AI insights table
CREATE TABLE IF NOT EXISTS ai_insights (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    time_range TEXT NOT NULL CHECK (time_range IN ('7d', '30d', '90d', 'ytd', '1y')),
    insight_type TEXT NOT NULL CHECK (insight_type IN ('trading_patterns', 'performance_analysis', 'risk_assessment', 'behavioral_analysis', 'market_analysis', 'opportunity_detection')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    key_findings TEXT, -- JSON array
    recommendations TEXT, -- JSON array
    data_sources TEXT, -- JSON array
    confidence_score REAL DEFAULT 0.0,
    generated_at TEXT NOT NULL,
    expires_at TEXT,
    metadata TEXT, -- JSON object with additional metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insight generation tasks table (for tracking async generation)
CREATE TABLE IF NOT EXISTS insight_generation_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    time_range TEXT NOT NULL,
    insight_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    result_insight_id TEXT,
    FOREIGN KEY (result_insight_id) REFERENCES ai_insights(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_insights_user_id ON ai_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_time_range ON ai_insights(time_range);
CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_ai_insights_generated_at ON ai_insights(generated_at);
CREATE INDEX IF NOT EXISTS idx_ai_insights_expires_at ON ai_insights(expires_at);
CREATE INDEX IF NOT EXISTS idx_insight_tasks_user_id ON insight_generation_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_insight_tasks_status ON insight_generation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_insight_tasks_created_at ON insight_generation_tasks(created_at);

-- Trigger to clean up expired insights
CREATE TRIGGER IF NOT EXISTS cleanup_expired_insights
    AFTER INSERT ON ai_insights
    FOR EACH ROW
BEGIN
    DELETE FROM ai_insights 
    WHERE expires_at IS NOT NULL 
    AND expires_at < datetime('now');
END;

-- Trigger to clean up old completed tasks
CREATE TRIGGER IF NOT EXISTS cleanup_old_tasks
    AFTER INSERT ON insight_generation_tasks
    FOR EACH ROW
BEGIN
    DELETE FROM insight_generation_tasks 
    WHERE status IN ('completed', 'failed', 'expired')
    AND created_at < datetime('now', '-7 days');
END;

