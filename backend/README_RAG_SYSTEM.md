# Tradistry RAG (Retrieval-Augmented Generation) System

## Overview

The Tradistry RAG system implements a comprehensive vector-based retrieval system that enhances AI responses with contextual information from the user's trading history, insights, and market data. This system uses PostgreSQL with pgvector extension for efficient similarity search and integrates with LangChain for seamless AI orchestration.

## Architecture

### Components

1. **Vector Database Layer**
   - PostgreSQL with pgvector extension
   - Multiple specialized vector indexes for different data types
   - Efficient similarity search with cosine distance

2. **Service Layer**
   - `RAGVectorService`: Core vector indexing and search
   - `RAGRetrieverService`: Contextual document retrieval
   - `AIOrchestrator`: Enhanced with RAG integration

3. **LangChain Integration**
   - Custom `TradistryRetriever` class
   - Seamless integration with existing LLM chains
   - Automatic context injection

## Vector Indexes

### 1. Trade Documents Index (`rag_trade_documents`)
Stores vectorized trade history and journal entries:
- Trade entries and exits
- Trading notes and analysis
- Symbol-specific context
- P&L and performance data

### 2. Market Documents Index (`rag_market_documents`)
Stores market research and external data:
- Market news and analysis
- Earnings data
- Company information
- Sector analysis

### 3. AI Documents Index (`rag_ai_documents`)
Stores AI-generated content for self-improvement:
- Previous AI reports
- Generated insights
- Pattern analysis
- Performance reviews

## Key Features

### 1. Contextual Retrieval
```python
# Get contextually relevant documents
context_docs = await rag_service.get_contextual_documents(
    user_token, 
    query="What were my best AAPL trades?",
    context_types=['trades', 'insights'],
    time_range_days=30,
    max_documents=10
)
```

### 2. Symbol-Specific Context
```python
# Get context specific to a trading symbol
symbol_context = await rag_service.get_trade_specific_context(
    user_token, 
    symbol="AAPL",
    context_types=['trades', 'insights']
)
```

### 3. Automatic Content Indexing
- AI-generated reports are automatically indexed
- Trade data is indexed when created/updated
- Market data is indexed with expiration dates

### 4. LangChain Integration
```python
# Create LangChain-compatible retriever
retriever = rag_service.create_langchain_retriever(user_token)

# Use in chains
chain = retriever | llm | output_parser
```

## Database Schema

### Core Tables

#### `rag_trade_documents`
- Stores trade-related vector documents
- Includes symbol, date, P&L context
- Supports chunking for large documents

#### `rag_market_documents`
- Stores market data and news
- Includes sentiment and relevance scores
- Supports expiration dates for data freshness

#### `rag_ai_documents`
- Stores AI-generated content
- Tracks usage and retrieval patterns
- Supports actionability scoring

### Key Functions

#### Search Functions
- `semantic_search_all()`: Search across all indexes
- `search_rag_trade_documents()`: Trade-specific search
- `search_rag_market_documents()`: Market data search
- `search_symbol_context()`: Symbol-focused retrieval

#### Upsert Functions
- `upsert_rag_trade_document()`: Index trade documents
- `upsert_rag_market_document()`: Index market data
- `upsert_rag_ai_document()`: Index AI content

## Integration Points

### 1. AI Orchestrator Enhancement
The `AIOrchestrator` now uses RAG for:
- Enhanced context retrieval in chat responses
- Symbol extraction from user queries
- Automatic indexing of generated content
- Improved contextual awareness

### 2. Embedding Service Integration
- Uses Voyager AI embeddings (1024 dimensions)
- Consistent embedding generation across all content
- Optimized for semantic similarity search

### 3. Structured Logging
Following the existing logging patterns:
- Service-level logger initialization
- Method entry/exit logging
- Performance timing
- Error context with structured data

## Usage Examples

### 1. Index New Trade Data
```python
# Index a new trade
await rag_service.index_trade_data(
    user_token, 
    {
        'symbol': 'AAPL',
        'action': 'buy',
        'date': '2024-01-15',
        'pnl': 150.0,
        'notes': 'Strong earnings beat, buying on momentum'
    }
)
```

### 2. Enhanced Chat with Context
```python
# Process chat message with RAG context
response = await orchestrator.process_chat_message(
    user, 
    session_id, 
    "What patterns do I have with AAPL trades?"
)
# Response includes relevant trade history and insights
```

### 3. Generate Report with Historical Context
```python
# Generate report with enhanced context
report = await orchestrator.generate_daily_report(
    user, 
    time_range="7d"
)
# Report references relevant historical patterns and insights
```

## Performance Considerations

### 1. Vector Index Optimization
- Uses IVFFlat indexes for efficient similarity search
- Cosine distance for semantic similarity
- Indexes are created with optimal parameters

### 2. Content Chunking
- Large documents are split into manageable chunks
- Overlapping chunks maintain context
- Chunk size optimized for embedding models

### 3. Caching and Expiration
- Market data includes expiration dates
- AI content tracks retrieval patterns
- Automatic cleanup of stale data

## Configuration

### Required Environment Variables
```bash
# Embedding service (Voyager AI)
VOYAGE_API_KEY=your_voyage_api_key

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# LLM (OpenRouter)
OPENROUTER_API_KEY=your_openrouter_key
```

### Database Setup
1. Ensure pgvector extension is installed
2. Run vector table creation scripts
3. Execute upsert and search function scripts
4. Verify indexes are created properly

## Monitoring and Observability

### 1. Structured Logging
- All RAG operations are logged with context
- Performance metrics included
- Error tracking with stack traces

### 2. Usage Metrics
- Document retrieval counts
- Similarity score distributions
- Context relevance feedback

### 3. Content Analytics
- Most retrieved documents
- Search pattern analysis
- Content quality metrics

## Security

### 1. Row Level Security (RLS)
- All vector tables have RLS enabled
- Users can only access their own data
- Automatic user ID filtering

### 2. Authentication
- Uses existing Supabase authentication
- Token validation on all operations
- Secure function execution

## Future Enhancements

1. **Graph-Based Relationships**
   - Document relationship tracking
   - Knowledge graph construction
   - Enhanced context discovery

2. **Advanced Embedding Models**
   - Support for multiple embedding models
   - Model-specific optimizations
   - Embedding quality metrics

3. **Real-time Indexing**
   - Automatic trade data indexing
   - Live market data integration
   - Streaming document updates

4. **Federated Search**
   - Multi-user knowledge sharing
   - Community insights integration
   - Privacy-preserving collaboration

## Troubleshooting

### Common Issues

1. **Embedding Dimension Mismatch**
   - Ensure all embeddings use 1024 dimensions
   - Check Voyager AI model configuration
   - Verify vector column definitions

2. **Slow Search Performance**
   - Check vector index creation
   - Monitor query execution plans
   - Consider index rebuilding

3. **Memory Usage**
   - Monitor embedding service memory
   - Optimize batch processing
   - Implement content pruning

### Debug Commands
```bash
# Test embedding service
python -c "from services.ai_embedding_service import AIEmbeddingService; svc = AIEmbeddingService(); print(len(svc.generate_embedding('test')))"

# Check vector indexes
psql -c "SELECT tablename, indexname FROM pg_indexes WHERE indexname LIKE '%vector%';"

# Monitor search performance
psql -c "EXPLAIN ANALYZE SELECT * FROM semantic_search_all('user_id', '{...}', 0.7, 10);"
```

## API Reference

See individual service files for detailed API documentation:
- `services/rag_vector_service.py`
- `services/rag_retriever_service.py`
- `services/ai_orchestrator_service.py`
