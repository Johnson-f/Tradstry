-- Trade Embeddings Search Functions
-- Functions for semantic similarity search and retrieval of trade embeddings

-- Main similarity search function using cosine similarity
CREATE OR REPLACE FUNCTION search_trade_embeddings_by_similarity(
    p_query_vector vector(1024),
    p_user_id UUID DEFAULT NULL,
    p_symbol TEXT DEFAULT NULL,
    p_content_type TEXT DEFAULT NULL,
    p_source_tables TEXT[] DEFAULT NULL,
    p_date_from TIMESTAMPTZ DEFAULT NULL,
    p_date_to TIMESTAMPTZ DEFAULT NULL,
    p_min_relevance_score DECIMAL(3,2) DEFAULT 0.0,
    p_similarity_threshold DECIMAL(5,4) DEFAULT 0.7,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    source_table TEXT,
    source_id TEXT,
    content_text TEXT,
    metadata JSONB,
    symbol TEXT,
    trade_date TIMESTAMPTZ,
    content_type TEXT,
    relevance_score DECIMAL(3,2),
    similarity_score DECIMAL(5,4),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Use authenticated user if no user_id provided
    IF p_user_id IS NULL THEN
        p_user_id := auth.uid();
    END IF;
    
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated or user_id must be provided';
    END IF;
    
    RETURN QUERY
    SELECT 
        te.id,
        te.user_id,
        te.source_table,
        te.source_id,
        te.content_text,
        te.metadata,
        te.symbol,
        te.trade_date,
        te.content_type,
        te.relevance_score,
        (1 - (te.embedding_vector <=> p_query_vector))::DECIMAL(5,4) as similarity_score,
        te.created_at,
        te.updated_at
    FROM public.trade_embeddings te
    WHERE te.user_id = p_user_id
        AND (p_symbol IS NULL OR te.symbol = p_symbol)
        AND (p_content_type IS NULL OR te.content_type = p_content_type)
        AND (p_source_tables IS NULL OR te.source_table = ANY(p_source_tables))
        AND (p_date_from IS NULL OR te.trade_date >= p_date_from)
        AND (p_date_to IS NULL OR te.trade_date <= p_date_to)
        AND te.relevance_score >= p_min_relevance_score
        AND (1 - (te.embedding_vector <=> p_query_vector)) >= p_similarity_threshold
    ORDER BY te.embedding_vector <=> p_query_vector ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Search function with text query (converts text to embedding first)
-- NOTE: This would typically be called from the application after generating embedding
CREATE OR REPLACE FUNCTION search_trade_embeddings_by_text(
    p_query_text TEXT,
    p_query_vector vector(1024), -- Pre-computed embedding of the query text
    p_user_id UUID DEFAULT NULL,
    p_symbol TEXT DEFAULT NULL,
    p_content_type TEXT DEFAULT NULL,
    p_source_tables TEXT[] DEFAULT NULL,
    p_date_from TIMESTAMPTZ DEFAULT NULL,
    p_date_to TIMESTAMPTZ DEFAULT NULL,
    p_similarity_threshold DECIMAL(5,4) DEFAULT 0.7,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    id UUID,
    source_table TEXT,
    source_id TEXT,
    content_text TEXT,
    metadata JSONB,
    symbol TEXT,
    trade_date TIMESTAMPTZ,
    content_type TEXT,
    similarity_score DECIMAL(5,4),
    relevance_score DECIMAL(3,2),
    matched_content TEXT -- Truncated content for display
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        te.id,
        te.source_table,
        te.source_id,
        te.content_text,
        te.metadata,
        te.symbol,
        te.trade_date,
        te.content_type,
        (1 - (te.embedding_vector <=> p_query_vector))::DECIMAL(5,4) as similarity_score,
        te.relevance_score,
        CASE 
            WHEN length(te.content_text) > 200 
            THEN substring(te.content_text from 1 for 200) || '...'
            ELSE te.content_text
        END as matched_content
    FROM search_trade_embeddings_by_similarity(
        p_query_vector,
        p_user_id,
        p_symbol,
        p_content_type,
        p_source_tables,
        p_date_from,
        p_date_to,
        0.0, -- min_relevance_score
        p_similarity_threshold,
        p_limit
    ) te;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get embeddings for a specific source record
CREATE OR REPLACE FUNCTION get_trade_embeddings_by_source(
    p_source_table TEXT,
    p_source_id TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    content_text TEXT,
    metadata JSONB,
    symbol TEXT,
    trade_date TIMESTAMPTZ,
    content_type TEXT,
    relevance_score DECIMAL(3,2),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Use authenticated user if no user_id provided
    IF p_user_id IS NULL THEN
        p_user_id := auth.uid();
    END IF;
    
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated';
    END IF;
    
    RETURN QUERY
    SELECT 
        te.id,
        te.content_text,
        te.metadata,
        te.symbol,
        te.trade_date,
        te.content_type,
        te.relevance_score,
        te.created_at,
        te.updated_at
    FROM public.trade_embeddings te
    WHERE te.user_id = p_user_id
        AND te.source_table = p_source_table
        AND te.source_id = p_source_id
    ORDER BY te.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get trade embeddings statistics for a user
CREATE OR REPLACE FUNCTION get_trade_embeddings_stats(
    p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
    total_embeddings BIGINT,
    embeddings_by_source JSONB,
    embeddings_by_content_type JSONB,
    embeddings_by_symbol JSONB,
    latest_embedding TIMESTAMPTZ,
    avg_relevance_score DECIMAL(5,3)
) AS $$
BEGIN
    -- Use authenticated user if no user_id provided
    IF p_user_id IS NULL THEN
        p_user_id := auth.uid();
    END IF;
    
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated';
    END IF;
    
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_embeddings,
        jsonb_object_agg(source_table, source_count) as embeddings_by_source,
        jsonb_object_agg(content_type, type_count) as embeddings_by_content_type,
        jsonb_object_agg(symbol, symbol_count) FILTER (WHERE symbol IS NOT NULL) as embeddings_by_symbol,
        MAX(created_at) as latest_embedding,
        AVG(relevance_score)::DECIMAL(5,3) as avg_relevance_score
    FROM (
        SELECT 
            source_table,
            content_type,
            symbol,
            created_at,
            relevance_score,
            COUNT(*) OVER (PARTITION BY source_table) as source_count,
            COUNT(*) OVER (PARTITION BY content_type) as type_count,
            COUNT(*) OVER (PARTITION BY symbol) as symbol_count
        FROM public.trade_embeddings
        WHERE user_id = p_user_id
    ) stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get similar trades for a specific symbol
CREATE OR REPLACE FUNCTION get_similar_trades_for_symbol(
    p_symbol TEXT,
    p_query_vector vector(1024),
    p_user_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE(
    content_text TEXT,
    trade_date TIMESTAMPTZ,
    metadata JSONB,
    similarity_score DECIMAL(5,4),
    source_table TEXT,
    source_id TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        te.content_text,
        te.trade_date,
        te.metadata,
        (1 - (te.embedding_vector <=> p_query_vector))::DECIMAL(5,4) as similarity_score,
        te.source_table,
        te.source_id
    FROM search_trade_embeddings_by_similarity(
        p_query_vector,
        p_user_id,
        p_symbol,
        NULL, -- content_type
        NULL, -- source_tables
        NULL, -- date_from
        NULL, -- date_to
        0.0,  -- min_relevance_score
        0.6,  -- similarity_threshold (slightly lower for symbol-specific search)
        p_limit
    ) te
    ORDER BY similarity_score DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION search_trade_embeddings_by_similarity TO authenticated;
GRANT EXECUTE ON FUNCTION search_trade_embeddings_by_text TO authenticated;
GRANT EXECUTE ON FUNCTION get_trade_embeddings_by_source TO authenticated;
GRANT EXECUTE ON FUNCTION get_trade_embeddings_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_similar_trades_for_symbol TO authenticated;

-- Example usage:
/*
-- Search for similar trading content
SELECT * FROM search_trade_embeddings_by_similarity(
    '[0.1, 0.2, ...]'::vector(1024), -- query embedding
    auth.uid(), -- user_id
    'AAPL', -- symbol filter
    'trade_entry', -- content_type filter
    ARRAY['stocks', 'notes'], -- source_tables filter
    '2024-01-01'::timestamptz, -- date_from
    '2024-12-31'::timestamptz, -- date_to
    0.7, -- min_relevance_score
    0.8, -- similarity_threshold
    10 -- limit
);

-- Get embeddings stats for current user
SELECT * FROM get_trade_embeddings_stats();

-- Find similar trades for a specific symbol
SELECT * FROM get_similar_trades_for_symbol(
    'AAPL',
    '[0.1, 0.2, ...]'::vector(1024),
    auth.uid(),
    5
);
*/
