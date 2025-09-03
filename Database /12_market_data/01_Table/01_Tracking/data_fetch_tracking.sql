-- Data Fetch Tracking Tables
-- Tables to support persistent tracking of data fetch operations and provider performance

-- Provider statistics table
CREATE TABLE IF NOT EXISTS provider_stats (
    id SERIAL PRIMARY KEY,
    provider_name VARCHAR(50) NOT NULL UNIQUE,
    total_attempts INTEGER DEFAULT 0,
    successful_attempts INTEGER DEFAULT 0,
    failed_attempts INTEGER DEFAULT 0,
    avg_response_time_ms DECIMAL(10,2) DEFAULT 0.0,
    last_success TIMESTAMP WITH TIME ZONE,
    last_failure TIMESTAMP WITH TIME ZONE,
    consecutive_failures INTEGER DEFAULT 0,
    rate_limited_until TIMESTAMP WITH TIME ZONE,
    supported_data_types TEXT[], -- Array of supported data types
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fetch attempts tracking table
CREATE TABLE IF NOT EXISTS fetch_attempts (
    id SERIAL PRIMARY KEY,
    attempt_id VARCHAR(255) NOT NULL UNIQUE,
    symbol VARCHAR(20) NOT NULL,
    data_type VARCHAR(50) NOT NULL,
    provider_name VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL, -- pending, in_progress, success, failed, partial, skipped
    job_id VARCHAR(100),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    execution_time_ms INTEGER,
    data_size INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (provider_name) REFERENCES provider_stats(provider_name) ON DELETE CASCADE
);

-- Failed symbols tracking table (for retry logic)
CREATE TABLE IF NOT EXISTS failed_symbols (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    data_type VARCHAR(50) NOT NULL,
    last_failure TIMESTAMP WITH TIME ZONE NOT NULL,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(symbol, data_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fetch_attempts_symbol_data_type ON fetch_attempts(symbol, data_type);
CREATE INDEX IF NOT EXISTS idx_fetch_attempts_provider_status ON fetch_attempts(provider_name, status);
CREATE INDEX IF NOT EXISTS idx_fetch_attempts_created_at ON fetch_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_failed_symbols_next_retry ON failed_symbols(next_retry_at) WHERE next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_stats_provider_name ON provider_stats(provider_name);

-- Function to update provider statistics
CREATE OR REPLACE FUNCTION update_provider_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update provider stats when fetch attempt is completed
    IF NEW.status IN ('success', 'failed') AND OLD.status NOT IN ('success', 'failed') THEN
        UPDATE provider_stats 
        SET 
            total_attempts = total_attempts + 1,
            successful_attempts = CASE WHEN NEW.status = 'success' THEN successful_attempts + 1 ELSE successful_attempts END,
            failed_attempts = CASE WHEN NEW.status = 'failed' THEN failed_attempts + 1 ELSE failed_attempts END,
            consecutive_failures = CASE 
                WHEN NEW.status = 'success' THEN 0 
                WHEN NEW.status = 'failed' THEN consecutive_failures + 1 
                ELSE consecutive_failures 
            END,
            last_success = CASE WHEN NEW.status = 'success' THEN NEW.completed_at ELSE last_success END,
            last_failure = CASE WHEN NEW.status = 'failed' THEN NEW.completed_at ELSE last_failure END,
            avg_response_time_ms = CASE 
                WHEN NEW.status = 'success' AND NEW.execution_time_ms IS NOT NULL THEN
                    CASE 
                        WHEN successful_attempts = 0 THEN NEW.execution_time_ms
                        ELSE (avg_response_time_ms * successful_attempts + NEW.execution_time_ms) / (successful_attempts + 1)
                    END
                ELSE avg_response_time_ms
            END,
            updated_at = NOW()
        WHERE provider_name = NEW.provider_name;
        
        -- Add data type to supported types if not already present
        UPDATE provider_stats 
        SET supported_data_types = array_append(supported_data_types, NEW.data_type)
        WHERE provider_name = NEW.provider_name 
        AND NOT (NEW.data_type = ANY(supported_data_types));
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update provider stats
DROP TRIGGER IF EXISTS trigger_update_provider_stats ON fetch_attempts;
CREATE TRIGGER trigger_update_provider_stats
    AFTER UPDATE ON fetch_attempts
    FOR EACH ROW
    EXECUTE FUNCTION update_provider_stats();

-- Function to manage failed symbols
CREATE OR REPLACE FUNCTION upsert_failed_symbol(
    p_symbol VARCHAR(20),
    p_data_type VARCHAR(50),
    p_retry_backoff_minutes INTEGER DEFAULT 5
) RETURNS VOID AS $$
BEGIN
    INSERT INTO failed_symbols (symbol, data_type, last_failure, retry_count, next_retry_at)
    VALUES (
        p_symbol, 
        p_data_type, 
        NOW(), 
        1, 
        NOW() + INTERVAL '1 minute' * p_retry_backoff_minutes
    )
    ON CONFLICT (symbol, data_type) 
    DO UPDATE SET
        last_failure = NOW(),
        retry_count = failed_symbols.retry_count + 1,
        next_retry_at = NOW() + INTERVAL '1 minute' * (
            CASE 
                WHEN failed_symbols.retry_count < 3 THEN p_retry_backoff_minutes * POWER(2, failed_symbols.retry_count)
                ELSE 60 -- Max 1 hour backoff
            END
        ),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get symbols ready for retry
CREATE OR REPLACE FUNCTION get_retry_candidates(p_data_type VARCHAR(50))
RETURNS TABLE(symbol VARCHAR(20), retry_count INTEGER, last_failure TIMESTAMP WITH TIME ZONE) AS $$
BEGIN
    RETURN QUERY
    SELECT fs.symbol, fs.retry_count, fs.last_failure
    FROM failed_symbols fs
    WHERE fs.data_type = p_data_type
    AND fs.next_retry_at <= NOW()
    AND fs.retry_count < 3
    ORDER BY fs.last_failure ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to remove successful symbol from failed tracking
CREATE OR REPLACE FUNCTION remove_failed_symbol(
    p_symbol VARCHAR(20),
    p_data_type VARCHAR(50)
) RETURNS VOID AS $$
BEGIN
    DELETE FROM failed_symbols 
    WHERE symbol = p_symbol AND data_type = p_data_type;
END;
$$ LANGUAGE plpgsql;

-- Function to get provider performance summary
CREATE OR REPLACE FUNCTION get_provider_performance()
RETURNS TABLE(
    provider_name VARCHAR(50),
    success_rate DECIMAL(5,2),
    total_attempts INTEGER,
    successful_attempts INTEGER,
    failed_attempts INTEGER,
    avg_response_time_ms DECIMAL(10,2),
    consecutive_failures INTEGER,
    is_rate_limited BOOLEAN,
    supported_data_types TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ps.provider_name,
        CASE 
            WHEN ps.total_attempts > 0 THEN ROUND((ps.successful_attempts::DECIMAL / ps.total_attempts) * 100, 2)
            ELSE 0.00
        END as success_rate,
        ps.total_attempts,
        ps.successful_attempts,
        ps.failed_attempts,
        ps.avg_response_time_ms,
        ps.consecutive_failures,
        (ps.rate_limited_until IS NOT NULL AND ps.rate_limited_until > NOW()) as is_rate_limited,
        ps.supported_data_types
    FROM provider_stats ps
    ORDER BY success_rate DESC, avg_response_time_ms ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old tracking data
CREATE OR REPLACE FUNCTION cleanup_tracking_data(p_days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete old fetch attempts
    DELETE FROM fetch_attempts 
    WHERE created_at < NOW() - INTERVAL '1 day' * p_days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete old failed symbols that haven't been retried recently
    DELETE FROM failed_symbols 
    WHERE last_failure < NOW() - INTERVAL '1 day' * p_days_to_keep
    AND retry_count >= 3;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Initialize known providers
INSERT INTO provider_stats (provider_name, supported_data_types) VALUES
    ('alpha_vantage', ARRAY['stock_quotes', 'historical_prices', 'company_info', 'fundamentals']),
    ('finnhub', ARRAY['stock_quotes', 'company_info', 'news', 'earnings']),
    ('polygon', ARRAY['stock_quotes', 'historical_prices', 'options_chain', 'dividends']),
    ('twelve_data', ARRAY['stock_quotes', 'historical_prices', 'fundamentals']),
    ('fmp', ARRAY['stock_quotes', 'company_info', 'fundamentals', 'earnings', 'dividends']),
    ('tiingo', ARRAY['stock_quotes', 'historical_prices', 'fundamentals']),
    ('api_ninjas', ARRAY['company_info']),
    ('fiscal', ARRAY['fundamentals', 'earnings'])
ON CONFLICT (provider_name) DO NOTHING;

-- Create a view for easy monitoring
CREATE OR REPLACE VIEW fetch_tracking_summary AS
SELECT 
    data_type,
    COUNT(*) as total_attempts,
    COUNT(*) FILTER (WHERE status = 'success') as successful_attempts,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_attempts,
    ROUND(AVG(execution_time_ms), 2) as avg_execution_time_ms,
    COUNT(DISTINCT symbol) as unique_symbols,
    COUNT(DISTINCT provider_name) as providers_used
FROM fetch_attempts 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY data_type
ORDER BY total_attempts DESC;
