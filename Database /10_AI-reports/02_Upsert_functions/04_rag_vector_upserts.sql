-- RAG Vector Index Upsert Functions
-- These functions handle inserting and updating documents in the vector indexes

-- =========================================================================
-- TRADE DOCUMENTS UPSERT
-- =========================================================================
CREATE OR REPLACE FUNCTION upsert_rag_trade_document(
    p_user_id UUID,
    p_document_type VARCHAR(50),
    p_source_table VARCHAR(50),
    p_source_id UUID,
    p_title VARCHAR(500),
    p_content TEXT,
    p_content_embedding vector(1024),
    p_symbol VARCHAR(10) DEFAULT NULL,
    p_trade_date DATE DEFAULT NULL,
    p_trade_type VARCHAR(20) DEFAULT NULL,
    p_action VARCHAR(10) DEFAULT NULL,
    p_pnl DECIMAL(15,2) DEFAULT NULL,
    p_tags TEXT[] DEFAULT '{}',
    p_confidence_score DECIMAL(3,2) DEFAULT 0.0,
    p_chunk_index INTEGER DEFAULT 0,
    p_total_chunks INTEGER DEFAULT 1
)
RETURNS TABLE(id UUID, created BOOLEAN) AS $$
DECLARE
    v_id UUID;
    v_created BOOLEAN := FALSE;
BEGIN
    -- Try to find existing document
    SELECT rtd.id INTO v_id
    FROM rag_trade_documents rtd
    WHERE rtd.user_id = p_user_id
      AND rtd.source_table = p_source_table
      AND rtd.source_id = p_source_id
      AND rtd.chunk_index = p_chunk_index;
    
    IF v_id IS NOT NULL THEN
        -- Update existing document
        UPDATE rag_trade_documents SET
            document_type = p_document_type,
            title = p_title,
            content = p_content,
            content_embedding = p_content_embedding,
            symbol = p_symbol,
            trade_date = p_trade_date,
            trade_type = p_trade_type,
            action = p_action,
            pnl = p_pnl,
            tags = p_tags,
            confidence_score = p_confidence_score,
            total_chunks = p_total_chunks,
            updated_at = NOW()
        WHERE id = v_id;
    ELSE
        -- Insert new document
        INSERT INTO rag_trade_documents (
            user_id, document_type, source_table, source_id,
            title, content, content_embedding,
            symbol, trade_date, trade_type, action, pnl,
            tags, confidence_score, chunk_index, total_chunks
        ) VALUES (
            p_user_id, p_document_type, p_source_table, p_source_id,
            p_title, p_content, p_content_embedding,
            p_symbol, p_trade_date, p_trade_type, p_action, p_pnl,
            p_tags, p_confidence_score, p_chunk_index, p_total_chunks
        ) RETURNING rag_trade_documents.id INTO v_id;
        
        v_created := TRUE;
    END IF;
    
    RETURN QUERY SELECT v_id, v_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- MARKET DOCUMENTS UPSERT
-- =========================================================================
CREATE OR REPLACE FUNCTION upsert_rag_market_document(
    p_user_id UUID,
    p_document_type VARCHAR(50),
    p_title VARCHAR(500),
    p_content TEXT,
    p_content_embedding vector(1024),
    p_source VARCHAR(100) DEFAULT NULL,
    p_source_id VARCHAR(100) DEFAULT NULL,
    p_symbols TEXT[] DEFAULT '{}',
    p_categories TEXT[] DEFAULT '{}',
    p_sector VARCHAR(50) DEFAULT NULL,
    p_market_cap_range VARCHAR(20) DEFAULT NULL,
    p_publication_date DATE DEFAULT NULL,
    p_sentiment_score DECIMAL(3,2) DEFAULT NULL,
    p_relevance_score DECIMAL(3,2) DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(id UUID, created BOOLEAN) AS $$
DECLARE
    v_id UUID;
    v_created BOOLEAN := FALSE;
BEGIN
    -- Check for existing document by source and source_id
    IF p_source IS NOT NULL AND p_source_id IS NOT NULL THEN
        SELECT rmd.id INTO v_id
        FROM rag_market_documents rmd
        WHERE rmd.user_id = p_user_id
          AND rmd.source = p_source
          AND rmd.source_id = p_source_id;
    END IF;
    
    IF v_id IS NOT NULL THEN
        -- Update existing document
        UPDATE rag_market_documents SET
            document_type = p_document_type,
            title = p_title,
            content = p_content,
            content_embedding = p_content_embedding,
            symbols = p_symbols,
            sector = p_sector,
            market_cap_range = p_market_cap_range,
            publication_date = p_publication_date,
            sentiment_score = p_sentiment_score,
            relevance_score = p_relevance_score,
            categories = p_categories,
            expires_at = p_expires_at,
            last_validated_at = NOW(),
            updated_at = NOW()
        WHERE id = v_id;
    ELSE
        -- Insert new document
        INSERT INTO rag_market_documents (
            user_id, document_type, source, source_id,
            title, content, content_embedding,
            symbols, sector, market_cap_range, publication_date,
            sentiment_score, relevance_score, categories, expires_at
        ) VALUES (
            p_user_id, p_document_type, p_source, p_source_id,
            p_title, p_content, p_content_embedding,
            p_symbols, p_sector, p_market_cap_range, p_publication_date,
            p_sentiment_score, p_relevance_score, p_categories, p_expires_at
        ) RETURNING rag_market_documents.id INTO v_id;
        
        v_created := TRUE;
    END IF;
    
    RETURN QUERY SELECT v_id, v_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- AI DOCUMENTS UPSERT
-- =========================================================================
CREATE OR REPLACE FUNCTION upsert_rag_ai_document(
    p_user_id UUID,
    p_document_type VARCHAR(50),
    p_title VARCHAR(500),
    p_content TEXT,
    p_content_embedding vector(1024),
    p_source_table VARCHAR(50) DEFAULT NULL,
    p_source_id UUID DEFAULT NULL,
    p_insight_types TEXT[] DEFAULT '{}',
    p_model_used VARCHAR(100) DEFAULT NULL,
    p_generation_date DATE DEFAULT NULL,
    p_confidence_score DECIMAL(3,2) DEFAULT NULL,
    p_time_horizon VARCHAR(20) DEFAULT NULL,
    p_actionability_score DECIMAL(3,2) DEFAULT NULL
)
RETURNS TABLE(id UUID, created BOOLEAN) AS $$
DECLARE
    v_id UUID;
    v_created BOOLEAN := FALSE;
BEGIN
    -- Check for existing document by source reference
    IF p_source_table IS NOT NULL AND p_source_id IS NOT NULL THEN
        SELECT rad.id INTO v_id
        FROM rag_ai_documents rad
        WHERE rad.user_id = p_user_id
          AND rad.source_table = p_source_table
          AND rad.source_id = p_source_id;
    END IF;
    
    IF v_id IS NOT NULL THEN
        -- Update existing document
        UPDATE rag_ai_documents SET
            document_type = p_document_type,
            title = p_title,
            content = p_content,
            content_embedding = p_content_embedding,
            model_used = p_model_used,
            generation_date = COALESCE(p_generation_date, generation_date),
            confidence_score = p_confidence_score,
            insight_types = p_insight_types,
            time_horizon = p_time_horizon,
            actionability_score = p_actionability_score,
            updated_at = NOW()
        WHERE id = v_id;
    ELSE
        -- Insert new document
        INSERT INTO rag_ai_documents (
            user_id, document_type, source_table, source_id,
            title, content, content_embedding,
            model_used, generation_date, confidence_score,
            insight_types, time_horizon, actionability_score
        ) VALUES (
            p_user_id, p_document_type, p_source_table, p_source_id,
            p_title, p_content, p_content_embedding,
            p_model_used, COALESCE(p_generation_date, CURRENT_DATE), p_confidence_score,
            p_insight_types, p_time_horizon, p_actionability_score
        ) RETURNING rag_ai_documents.id INTO v_id;
        
        v_created := TRUE;
    END IF;
    
    RETURN QUERY SELECT v_id, v_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION upsert_rag_trade_document TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_rag_market_document TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_rag_ai_document TO authenticated;