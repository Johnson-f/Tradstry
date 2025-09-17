-- RAG Vector Search Functions
-- These functions perform semantic similarity searches across vector indexes

-- =========================================================================
-- SEMANTIC SEARCH ACROSS ALL INDEXES
-- =========================================================================
CREATE OR REPLACE FUNCTION semantic_search_all(
    p_user_id UUID,
    p_query_embedding vector(1024),
    p_similarity_threshold DECIMAL(3,2) DEFAULT 0.7,
    p_limit_count INTEGER DEFAULT 10
)
RETURNS TABLE(
    id UUID,
    content TEXT,
    document_type VARCHAR(50),
    similarity_score DECIMAL(5,4),
    metadata JSONB,
    source_table VARCHAR(50),
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    WITH combined_results AS (
        -- Search trade documents
        SELECT 
            rtd.id,
            rtd.content,
            rtd.document_type,
            (1 - (rtd.content_embedding <=> p_query_embedding))::DECIMAL(5,4) as similarity_score,
            jsonb_build_object(
                'symbol', rtd.symbol,
                'trade_date', rtd.trade_date,
                'trade_type', rtd.trade_type,
                'action', rtd.action,
                'pnl', rtd.pnl,
                'tags', rtd.tags
            ) as metadata,
            'rag_trade_documents' as source_table,
            rtd.created_at
        FROM rag_trade_documents rtd
        WHERE rtd.user_id = p_user_id
          AND (1 - (rtd.content_embedding <=> p_query_embedding)) >= p_similarity_threshold
        
        UNION ALL
        
        -- Search market documents
        SELECT 
            rmd.id,
            rmd.content,
            rmd.document_type,
            (1 - (rmd.content_embedding <=> p_query_embedding))::DECIMAL(5,4) as similarity_score,
            jsonb_build_object(
                'symbols', rmd.symbols,
                'sector', rmd.sector,
                'publication_date', rmd.publication_date,
                'sentiment_score', rmd.sentiment_score,
                'categories', rmd.categories
            ) as metadata,
            'rag_market_documents' as source_table,
            rmd.created_at
        FROM rag_market_documents rmd
        WHERE rmd.user_id = p_user_id
          AND (1 - (rmd.content_embedding <=> p_query_embedding)) >= p_similarity_threshold
          AND (rmd.expires_at IS NULL OR rmd.expires_at > NOW())
        
        UNION ALL
        
        -- Search AI documents
        SELECT 
            rad.id,
            rad.content,
            rad.document_type,
            (1 - (rad.content_embedding <=> p_query_embedding))::DECIMAL(5,4) as similarity_score,
            jsonb_build_object(
                'model_used', rad.model_used,
                'confidence_score', rad.confidence_score,
                'insight_types', rad.insight_types,
                'time_horizon', rad.time_horizon,
                'actionability_score', rad.actionability_score
            ) as metadata,
            'rag_ai_documents' as source_table,
            rad.created_at
        FROM rag_ai_documents rad
        WHERE rad.user_id = p_user_id
          AND (1 - (rad.content_embedding <=> p_query_embedding)) >= p_similarity_threshold
    )
    SELECT 
        cr.id,
        cr.content,
        cr.document_type,
        cr.similarity_score,
        cr.metadata,
        cr.source_table,
        cr.created_at
    FROM combined_results cr
    ORDER BY cr.similarity_score DESC, cr.created_at DESC
    LIMIT p_limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- SEARCH TRADE DOCUMENTS ONLY
-- =========================================================================
CREATE OR REPLACE FUNCTION search_rag_trade_documents(
    p_user_id UUID,
    p_query_embedding vector(1024),
    p_similarity_threshold DECIMAL(3,2) DEFAULT 0.7,
    p_limit_count INTEGER DEFAULT 10,
    p_symbol VARCHAR(10) DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    content TEXT,
    document_type VARCHAR(50),
    similarity_score DECIMAL(5,4),
    symbol VARCHAR(10),
    trade_date DATE,
    pnl DECIMAL(15,2),
    tags TEXT[],
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rtd.id,
        rtd.content,
        rtd.document_type,
        (1 - (rtd.content_embedding <=> p_query_embedding))::DECIMAL(5,4) as similarity_score,
        rtd.symbol,
        rtd.trade_date,
        rtd.pnl,
        rtd.tags,
        rtd.created_at
    FROM rag_trade_documents rtd
    WHERE rtd.user_id = p_user_id
      AND (1 - (rtd.content_embedding <=> p_query_embedding)) >= p_similarity_threshold
      AND (p_symbol IS NULL OR rtd.symbol = p_symbol)
      AND (p_date_from IS NULL OR rtd.trade_date >= p_date_from)
      AND (p_date_to IS NULL OR rtd.trade_date <= p_date_to)
    ORDER BY similarity_score DESC, rtd.trade_date DESC
    LIMIT p_limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- SEARCH MARKET DOCUMENTS ONLY
-- =========================================================================
CREATE OR REPLACE FUNCTION search_rag_market_documents(
    p_user_id UUID,
    p_query_embedding vector(1024),
    p_similarity_threshold DECIMAL(3,2) DEFAULT 0.7,
    p_limit_count INTEGER DEFAULT 10,
    p_symbols TEXT[] DEFAULT NULL,
    p_categories TEXT[] DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    content TEXT,
    document_type VARCHAR(50),
    similarity_score DECIMAL(5,4),
    symbols TEXT[],
    sector VARCHAR(50),
    categories TEXT[],
    publication_date DATE,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rmd.id,
        rmd.content,
        rmd.document_type,
        (1 - (rmd.content_embedding <=> p_query_embedding))::DECIMAL(5,4) as similarity_score,
        rmd.symbols,
        rmd.sector,
        rmd.categories,
        rmd.publication_date,
        rmd.created_at
    FROM rag_market_documents rmd
    WHERE rmd.user_id = p_user_id
      AND (1 - (rmd.content_embedding <=> p_query_embedding)) >= p_similarity_threshold
      AND (rmd.expires_at IS NULL OR rmd.expires_at > NOW())
      AND (p_symbols IS NULL OR rmd.symbols && p_symbols)
      AND (p_categories IS NULL OR rmd.categories && p_categories)
    ORDER BY similarity_score DESC, rmd.publication_date DESC NULLS LAST
    LIMIT p_limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- SEARCH AI DOCUMENTS ONLY
-- =========================================================================
CREATE OR REPLACE FUNCTION search_rag_ai_documents(
    p_user_id UUID,
    p_query_embedding vector(1024),
    p_similarity_threshold DECIMAL(3,2) DEFAULT 0.7,
    p_limit_count INTEGER DEFAULT 10,
    p_insight_types TEXT[] DEFAULT NULL,
    p_min_confidence DECIMAL(3,2) DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    content TEXT,
    document_type VARCHAR(50),
    similarity_score DECIMAL(5,4),
    model_used VARCHAR(100),
    confidence_score DECIMAL(3,2),
    insight_types TEXT[],
    actionability_score DECIMAL(3,2),
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rad.id,
        rad.content,
        rad.document_type,
        (1 - (rad.content_embedding <=> p_query_embedding))::DECIMAL(5,4) as similarity_score,
        rad.model_used,
        rad.confidence_score,
        rad.insight_types,
        rad.actionability_score,
        rad.created_at
    FROM rag_ai_documents rad
    WHERE rad.user_id = p_user_id
      AND (1 - (rad.content_embedding <=> p_query_embedding)) >= p_similarity_threshold
      AND (p_insight_types IS NULL OR rad.insight_types && p_insight_types)
      AND (p_min_confidence IS NULL OR rad.confidence_score >= p_min_confidence)
    ORDER BY similarity_score DESC, rad.actionability_score DESC NULLS LAST
    LIMIT p_limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- CONTEXTUAL SEARCH FOR SPECIFIC SYMBOLS
-- =========================================================================
CREATE OR REPLACE FUNCTION search_symbol_context(
    p_user_id UUID,
    p_symbol VARCHAR(10),
    p_query_embedding vector(1024),
    p_limit_count INTEGER DEFAULT 10
)
RETURNS TABLE(
    id UUID,
    content TEXT,
    document_type VARCHAR(50),
    similarity_score DECIMAL(5,4),
    symbol_relevance DECIMAL(3,2),
    metadata JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    WITH symbol_results AS (
        SELECT 
            rtd.id,
            rtd.content,
            rtd.document_type,
            (1 - (rtd.content_embedding <=> p_query_embedding))::DECIMAL(5,4) as similarity_score,
            CASE 
                WHEN rtd.symbol = p_symbol THEN 1.0
                WHEN rtd.content ILIKE '%' || p_symbol || '%' THEN 0.8
                ELSE 0.5
            END::DECIMAL(3,2) as symbol_relevance,
            jsonb_build_object(
                'symbol', rtd.symbol,
                'trade_date', rtd.trade_date,
                'pnl', rtd.pnl,
                'action', rtd.action
            ) as metadata,
            rtd.created_at
        FROM rag_trade_documents rtd
        WHERE rtd.user_id = p_user_id
          AND (rtd.symbol = p_symbol OR rtd.content ILIKE '%' || p_symbol || '%')
          
        UNION ALL
        
        SELECT 
            rmd.id,
            rmd.content,
            rmd.document_type,
            (1 - (rmd.content_embedding <=> p_query_embedding))::DECIMAL(5,4) as similarity_score,
            CASE 
                WHEN p_symbol = ANY(rmd.symbols) THEN 1.0
                WHEN rmd.content ILIKE '%' || p_symbol || '%' THEN 0.8
                ELSE 0.5
            END::DECIMAL(3,2) as symbol_relevance,
            jsonb_build_object(
                'symbols', rmd.symbols,
                'sector', rmd.sector,
                'publication_date', rmd.publication_date
            ) as metadata,
            rmd.created_at
        FROM rag_market_documents rmd
        WHERE rmd.user_id = p_user_id
          AND (p_symbol = ANY(rmd.symbols) OR rmd.content ILIKE '%' || p_symbol || '%')
          AND (rmd.expires_at IS NULL OR rmd.expires_at > NOW())
    )
    SELECT 
        sr.id,
        sr.content,
        sr.document_type,
        sr.similarity_score,
        sr.symbol_relevance,
        sr.metadata,
        sr.created_at
    FROM symbol_results sr
    ORDER BY (sr.similarity_score * 0.7 + sr.symbol_relevance * 0.3) DESC, sr.created_at DESC
    LIMIT p_limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION semantic_search_all TO authenticated;
GRANT EXECUTE ON FUNCTION search_rag_trade_documents TO authenticated;
GRANT EXECUTE ON FUNCTION search_rag_market_documents TO authenticated;
GRANT EXECUTE ON FUNCTION search_rag_ai_documents TO authenticated;
GRANT EXECUTE ON FUNCTION search_symbol_context TO authenticated;
