-- Enable the vector extension for pgvector support
CREATE EXTENSION IF NOT EXISTS vector;

-- Create trade_embeddings table for storing vectorized trade data
CREATE TABLE IF NOT EXISTS public.trade_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Source information to track where this embedding came from
    source_table TEXT NOT NULL CHECK (source_table IN ('stocks', 'options', 'setups', 'notes', 'tags', 'templates', 'trade_notes')),
    source_id TEXT NOT NULL, -- Could be UUID or SERIAL depending on source table
    
    -- Content and embedding data
    content_text TEXT NOT NULL, -- The actual text that was embedded
    embedding_vector vector(1024) NOT NULL, -- Voyager AI embeddings are 1024 dimensions
    
    -- Metadata for better retrieval and filtering
    metadata JSONB DEFAULT '{}', -- Store additional context like symbol, trade_type, dates, etc.
    content_hash TEXT NOT NULL, -- Hash of content to avoid duplicate embeddings
    
    -- Additional fields for better search and filtering
    symbol TEXT, -- Stock/option symbol for quick filtering
    trade_date TIMESTAMPTZ, -- Trade date for temporal filtering  
    content_type TEXT DEFAULT 'trade_data', -- Type classification (trade_data, note, setup, etc.)
    relevance_score DECIMAL(3,2) DEFAULT 1.0, -- Quality score for this embedding (0.0-1.0)
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Ensure uniqueness per user and source
    CONSTRAINT unique_user_source_content UNIQUE (user_id, source_table, source_id, content_hash)
);

-- Add table comment
COMMENT ON TABLE public.trade_embeddings IS 'Stores vector embeddings of user trade data for RAG-enhanced AI responses';
COMMENT ON COLUMN public.trade_embeddings.content_text IS 'The original text content that was converted to vector embedding';
COMMENT ON COLUMN public.trade_embeddings.embedding_vector IS '1024-dimensional vector embedding from Voyager AI';
COMMENT ON COLUMN public.trade_embeddings.metadata IS 'Additional context data in JSON format for enhanced retrieval';
COMMENT ON COLUMN public.trade_embeddings.content_hash IS 'SHA-256 hash of content_text to prevent duplicate embeddings';

-- Create indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_trade_embeddings_user_id ON public.trade_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_embeddings_source ON public.trade_embeddings(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_trade_embeddings_symbol ON public.trade_embeddings(user_id, symbol) WHERE symbol IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trade_embeddings_trade_date ON public.trade_embeddings(user_id, trade_date) WHERE trade_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trade_embeddings_content_type ON public.trade_embeddings(user_id, content_type);
CREATE INDEX IF NOT EXISTS idx_trade_embeddings_relevance ON public.trade_embeddings(user_id, relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_trade_embeddings_content_hash ON public.trade_embeddings(content_hash);

-- Create vector similarity index using IVFFlat for fast similarity search
-- This will significantly speed up vector similarity queries
CREATE INDEX IF NOT EXISTS idx_trade_embeddings_vector_similarity 
ON public.trade_embeddings 
USING ivfflat (embedding_vector vector_cosine_ops) 
WITH (lists = 100); -- Adjust lists parameter based on data size

-- Enable Row Level Security for user data isolation
ALTER TABLE public.trade_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for secure user data access
CREATE POLICY "Users can view their own trade embeddings" 
ON public.trade_embeddings FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trade embeddings" 
ON public.trade_embeddings FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trade embeddings" 
ON public.trade_embeddings FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trade embeddings" 
ON public.trade_embeddings FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger function to update timestamps
CREATE OR REPLACE FUNCTION update_trade_embeddings_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_trade_embeddings_timestamps
    BEFORE UPDATE ON public.trade_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_trade_embeddings_timestamps();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_embeddings TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;