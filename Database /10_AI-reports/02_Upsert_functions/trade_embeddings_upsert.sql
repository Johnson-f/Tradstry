-- Trade Embeddings Upsert Function
-- This function handles inserting/updating trade embeddings with automatic deduplication

CREATE OR REPLACE FUNCTION upsert_trade_embedding(
    p_user_id UUID,
    p_source_table TEXT,
    p_source_id TEXT,
    p_content_text TEXT,
    p_embedding_vector vector(1024),
    p_metadata JSONB DEFAULT '{}',
    p_symbol TEXT DEFAULT NULL,
    p_trade_date TIMESTAMPTZ DEFAULT NULL,
    p_content_type TEXT DEFAULT 'trade_data',
    p_relevance_score DECIMAL(3,2) DEFAULT 1.0
)
RETURNS UUID AS $$
DECLARE
    v_content_hash TEXT;
    v_embedding_id UUID;
    v_existing_id UUID;
BEGIN
    -- Generate SHA-256 hash of content for deduplication
    v_content_hash := encode(digest(p_content_text, 'sha256'), 'hex');
    
    -- Check if embedding already exists for this user/source/content combination
    SELECT id INTO v_existing_id 
    FROM public.trade_embeddings 
    WHERE user_id = p_user_id 
        AND source_table = p_source_table 
        AND source_id = p_source_id 
        AND content_hash = v_content_hash;
    
    IF v_existing_id IS NOT NULL THEN
        -- Update existing embedding with new metadata and vector (in case of content changes)
        UPDATE public.trade_embeddings 
        SET 
            content_text = p_content_text,
            embedding_vector = p_embedding_vector,
            metadata = p_metadata,
            symbol = p_symbol,
            trade_date = p_trade_date,
            content_type = p_content_type,
            relevance_score = p_relevance_score,
            updated_at = now()
        WHERE id = v_existing_id;
        
        RETURN v_existing_id;
    ELSE
        -- Insert new embedding
        INSERT INTO public.trade_embeddings (
            user_id,
            source_table,
            source_id,
            content_text,
            embedding_vector,
            metadata,
            content_hash,
            symbol,
            trade_date,
            content_type,
            relevance_score
        ) VALUES (
            p_user_id,
            p_source_table,
            p_source_id,
            p_content_text,
            p_embedding_vector,
            p_metadata,
            v_content_hash,
            p_symbol,
            p_trade_date,
            p_content_type,
            p_relevance_score
        ) RETURNING id INTO v_embedding_id;
        
        RETURN v_embedding_id;
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error upserting trade embedding: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Batch upsert function for processing multiple embeddings at once
CREATE OR REPLACE FUNCTION batch_upsert_trade_embeddings(
    p_embeddings JSONB -- Array of embedding objects
)
RETURNS TABLE(embedding_id UUID, source_table TEXT, source_id TEXT, status TEXT) AS $$
DECLARE
    v_embedding JSONB;
    v_result_id UUID;
    v_user_id UUID;
BEGIN
    -- Get the authenticated user ID
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated';
    END IF;
    
    -- Process each embedding in the batch
    FOR v_embedding IN SELECT jsonb_array_elements(p_embeddings)
    LOOP
        BEGIN
            -- Call individual upsert function
            SELECT upsert_trade_embedding(
                v_user_id,
                (v_embedding->>'source_table')::TEXT,
                (v_embedding->>'source_id')::TEXT,
                (v_embedding->>'content_text')::TEXT,
                (v_embedding->>'embedding_vector')::vector(1024),
                COALESCE((v_embedding->'metadata')::JSONB, '{}'),
                (v_embedding->>'symbol')::TEXT,
                (v_embedding->>'trade_date')::TIMESTAMPTZ,
                COALESCE((v_embedding->>'content_type')::TEXT, 'trade_data'),
                COALESCE((v_embedding->>'relevance_score')::DECIMAL(3,2), 1.0)
            ) INTO v_result_id;
            
            -- Return success result
            RETURN QUERY SELECT 
                v_result_id,
                (v_embedding->>'source_table')::TEXT,
                (v_embedding->>'source_id')::TEXT,
                'success'::TEXT;
                
        EXCEPTION
            WHEN OTHERS THEN
                -- Return error result but continue processing
                RETURN QUERY SELECT 
                    NULL::UUID,
                    (v_embedding->>'source_table')::TEXT,
                    (v_embedding->>'source_id')::TEXT,
                    ('error: ' || SQLERRM)::TEXT;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete embeddings for a specific source record
CREATE OR REPLACE FUNCTION delete_trade_embedding_by_source(
    p_user_id UUID,
    p_source_table TEXT,
    p_source_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM public.trade_embeddings 
    WHERE user_id = p_user_id 
        AND source_table = p_source_table 
        AND source_id = p_source_id;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN v_deleted_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permissions to authenticated users
GRANT EXECUTE ON FUNCTION upsert_trade_embedding TO authenticated;
GRANT EXECUTE ON FUNCTION batch_upsert_trade_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION delete_trade_embedding_by_source TO authenticated;

-- Example usage:
/*
-- Single embedding upsert
SELECT upsert_trade_embedding(
    auth.uid(),
    'stocks',
    '123',
    'Bought AAPL at $150, expecting bounce from support level. Risk management with stop at $145.',
    '[0.1, 0.2, ...]'::vector(1024),
    '{"symbol": "AAPL", "entry_price": 150, "stop_loss": 145}'::jsonb,
    'AAPL',
    '2024-01-15 10:30:00'::timestamptz,
    'trade_entry',
    0.95
);

-- Batch upsert example
SELECT * FROM batch_upsert_trade_embeddings('[
    {
        "source_table": "stocks",
        "source_id": "123",
        "content_text": "Trade analysis text...",
        "embedding_vector": "[0.1, 0.2, ...]",
        "metadata": {"symbol": "AAPL"},
        "symbol": "AAPL",
        "content_type": "trade_entry"
    }
]'::jsonb);
*/
