-- AI Reports Tables Migration
-- This migration creates tables for AI reports functionality

-- AI reports table
CREATE TABLE IF NOT EXISTS ai_reports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    time_range TEXT NOT NULL CHECK (time_range IN ('7d', '30d', '90d', 'ytd', '1y')),
    report_type TEXT NOT NULL CHECK (report_type IN ('comprehensive', 'performance', 'risk', 'trading', 'behavioral', 'market')),
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    analytics TEXT NOT NULL, -- JSON object with analytics data
    insights TEXT NOT NULL, -- JSON array of insights
    trades TEXT NOT NULL, -- JSON array of trade data
    recommendations TEXT NOT NULL, -- JSON array of recommendations
    patterns TEXT, -- JSON array of trading patterns
    risk_metrics TEXT, -- JSON object with risk metrics
    performance_metrics TEXT, -- JSON object with performance metrics
    behavioral_insights TEXT, -- JSON array of behavioral insights
    market_analysis TEXT, -- JSON object with market analysis
    generated_at TEXT NOT NULL,
    expires_at TEXT,
    metadata TEXT, -- JSON object with additional metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Report generation tasks table (for tracking async generation)
CREATE TABLE IF NOT EXISTS report_generation_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    time_range TEXT NOT NULL,
    report_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    result_report_id TEXT,
    FOREIGN KEY (result_report_id) REFERENCES ai_reports(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_reports_user_id ON ai_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_reports_time_range ON ai_reports(time_range);
CREATE INDEX IF NOT EXISTS idx_ai_reports_type ON ai_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_ai_reports_generated_at ON ai_reports(generated_at);
CREATE INDEX IF NOT EXISTS idx_ai_reports_expires_at ON ai_reports(expires_at);
CREATE INDEX IF NOT EXISTS idx_report_tasks_user_id ON report_generation_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_report_tasks_status ON report_generation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_report_tasks_created_at ON report_generation_tasks(created_at);

-- Trigger to clean up expired reports
CREATE TRIGGER IF NOT EXISTS cleanup_expired_reports
    AFTER INSERT ON ai_reports
    FOR EACH ROW
BEGIN
    DELETE FROM ai_reports 
    WHERE expires_at IS NOT NULL 
    AND expires_at < datetime('now');
END;

-- Trigger to clean up old completed tasks
CREATE TRIGGER IF NOT EXISTS cleanup_old_report_tasks
    AFTER INSERT ON report_generation_tasks
    FOR EACH ROW
BEGIN
    DELETE FROM report_generation_tasks 
    WHERE status IN ('completed', 'failed', 'expired')
    AND created_at < datetime('now', '-7 days');
END;

