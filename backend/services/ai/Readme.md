# Tradistry AI Services Documentation

## Overview

This directory contains the comprehensive AI services architecture for Tradistry, a trading journal and analytics platform. The AI services are designed with a modular, decoupled architecture that provides advanced trading insights, intelligent chat capabilities, automated report generation, and semantic search functionality using modern AI techniques.

## Architecture Overview

The AI services follow a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                   │
└─────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────┐
│                 API Layer (FastAPI)                     │
│  - /api/ai/chat/*     - Chat operations                 │
│  - /api/ai/reports/*  - Report generation               │
│  - /api/ai/insights/* - Trading insights                │
│  - /api/ai/rag/*      - Vector search                   │
└─────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────┐
│              Service Layer (Business Logic)             │
│  - AIChatService       - Chat management                │
│  - AIReportsService    - Report generation              │
│  - AIInsightsService   - Trading analysis               │
│  - AIEmbeddingService  - Vector embeddings              │
│  - AIOrchestrator      - Main coordination              │
└─────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────┐
│                Data Access Layer (DAL)                  │
│  - AIChatDAL          - Chat database operations        │
│  - AIReportsDAL       - Reports database operations     │
│  - AIInsightsDAL      - Insights database operations    │
│  - BaseDAL            - Common database utilities       │
└─────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────┐
│              External Services & Models                 │
│  - OpenRouter API     - LLM access (GPT, Claude, etc.)  │
│  - Google Vertex AI   - Embedding models                │
│  - PostgreSQL         - Vector database with pgvector   │
│  - Supabase           - Auth & real-time features       │
└─────────────────────────────────────────────────────────┘
```


## Design Principles

### 1. **Modular Architecture**
- Each service has a single responsibility
- Loose coupling between components
- Easy to test, maintain, and extend

### 2. **Data Access Layer (DAL) Pattern**
- All database operations go through dedicated DAL classes
- Business logic is separated from data access
- Consistent error handling and logging

### 3. **Orchestrator Pattern**
- Central coordination of multiple AI services
- Unified interface for complex operations
- Automatic fallback mechanisms

### 4. **RAG (Retrieval-Augmented Generation)**
- Vector embeddings for semantic search
- Context-aware AI responses
- Persistent user-specific knowledge base

### 5. **Structured Logging**
- Comprehensive logging throughout all services
- Structured data for observability
- Performance and error tracking

## Core Services

### AIChatService

**Location**: `ai_chat_service.py`

**Purpose**: Manages all AI chat operations including sessions, messages, and interactions.

**Key Features**:
- **Session Management**: Create, retrieve, and manage chat sessions
- **Message Processing**: Handle user messages with AI responses
- **Search Functionality**: Vector-based message search with similarity scoring
- **Context Integration**: Automatic integration with user's trading history
- **Persistent Storage**: All conversations stored in database

**Methods**:
- `create_message()` - Create new chat message
- `update_message()` - Update existing message (feedback, etc.)
- `get_chat_history()` - Retrieve message history for session
- `get_session_list()` - List user's chat sessions
- `search_messages()` - Search messages using vector similarity
- `delete_session()` / `delete_message()` - Remove conversations

**Integration**:
- Uses `AIChatDAL` for database operations
- Integrates with RAG system for context-aware responses
- Supports streaming through orchestrator

### AIReportsService

**Location**: `ai_reports_service.py`

**Purpose**: Generates comprehensive AI-powered trading reports and analysis.

**Key Features**:
- **Daily Reports**: Automated daily trading summaries
- **Performance Analysis**: Detailed performance breakdowns
- **Report Management**: CRUD operations for reports
- **Advanced Prompts**: Few-shot prompting for high-quality analysis
- **Multi-format Output**: Structured reports with insights and recommendations

**Methods**:
- `create_report()` - Generate new AI report
- `update_report()` - Update existing report
- `get_reports()` - Retrieve user's reports with filtering
- `delete_report()` - Remove report
- `generate_daily_report()` - Create comprehensive daily summary
- `generate_performance_summary()` - Performance analysis report

**Integration**:
- Uses `AIReportsDAL` for database operations
- Integrates with analytics service for trade data
- Auto-indexes reports in RAG system for future context

### AIInsightsService

**Location**: `ai_insights_service.py`

**Purpose**: Generates trading insights and risk analysis using AI pattern recognition.

**Key Features**:
- **Pattern Recognition**: Identify trading patterns and trends
- **Risk Assessment**: Analyze risk exposure and opportunities
- **Performance Insights**: Actionable trading recommendations
- **Confidence Scoring**: AI-evaluated confidence levels
- **Insight Management**: CRUD operations for insights

**Methods**:
- `generate_insights()` - Create AI insights for specified types
- `generate_risk_insights()` - Specific risk analysis
- `get_insights()` - Retrieve user's insights
- `create_insight()` - Store new insight
- `update_insight()` - Update existing insight

### AIEmbeddingService

**Location**: `ai_embedding_service.py`

**Purpose**: Generates high-quality vector embeddings for semantic search and RAG.

**Key Features**:
- **Multiple Models**: Support for various embedding models
- **Cloud Integration**: Google Vertex AI integration
- **Batch Processing**: Efficient batch embedding generation
- **Caching**: Built-in caching for performance
- **Fallback Support**: Automatic fallback mechanisms

**Methods**:
- `generate_embeddings()` - Generate single embedding
- `generate_embeddings_batch()` - Generate multiple embeddings
- `get_embedding_dimension()` - Get model dimensions
- `validate_embedding()` - Validate embedding quality

## Orchestrator Components

### AIOrchestrator

**Location**: `orchestrator/ai_orchestrator.py`

**Purpose**: Main coordination hub for all AI services with advanced features.

**Key Features**:
- **Unified Interface**: Single entry point for all AI operations
- **RAG Integration**: Automatic context retrieval from user's trading history
- **Trade Context**: Symbol extraction and relevant trade context
- **Streaming Support**: Real-time AI responses
- **Health Monitoring**: Comprehensive system health checks
- **Fallback Mechanisms**: Automatic fallback to stable components

**Methods**:
- `generate_daily_report()` - Generate trading report with context
- `process_chat_message()` - Process chat with trade context
- `process_chat_message_stream()` - Streaming chat with context
- `generate_insights()` - Generate trading insights
- `get_health_status()` - System health and status
- `search_trade_context()` - Search user's trading history

**Integration**:
- Coordinates all AI services
- Manages model selection and fallbacks
- Handles authentication and user context
- Integrates with RAG system for enhanced responses

### Orchestrator Sub-Components

#### AIModelManager
- **Purpose**: Manages AI model selection, validation, and fallbacks
- **Features**: Stable model tiers, auto-recovery, performance tracking
- **Location**: `orchestrator/ai_model_manager.py`

#### AILLMHandler
- **Purpose**: Handles LLM initialization, prompt processing, and response generation
- **Features**: Multiple model support, conversation history, streaming
- **Location**: `orchestrator/ai_llm_handler.py`

#### AIChatProcessor
- **Purpose**: Processes chat messages with context and history
- **Features**: Context-aware responses, session management, RAG integration
- **Location**: `orchestrator/ai_chat_processor.py`

#### AIStreamHandler
- **Purpose**: Manages real-time streaming AI responses
- **Features**: Token-by-token streaming, error handling, context integration
- **Location**: `orchestrator/ai_stream_handler.py`

#### AIContextManager
- **Purpose**: Manages RAG and vector search for context retrieval
- **Features**: Document indexing, semantic search, context formatting
- **Location**: `orchestrator/ai_context_manager.py`

#### AIContentProcessor
- **Purpose**: Processes and formats AI-generated content
- **Features**: Text cleaning, symbol extraction, summary generation
- **Location**: `orchestrator/ai_content_processor.py`

#### AIHealthMonitor
- **Purpose**: Monitors system health and component status
- **Features**: Health checks, performance monitoring, error tracking
- **Location**: `orchestrator/ai_health_mointor.py`

## Data Access Layer (DAL)

### Architecture

The DAL follows a consistent pattern across all services:

```
Service Layer
    ↓
Data Access Layer (DAL)
    ↓
Database Operations (Supabase/PostgreSQL)
    ↓
SQL Functions (Stored Procedures)
```

### Base Components

#### BaseDAL
**Location**: `dal/base_dal.py`

**Purpose**: Common database utilities and patterns used by all DAL classes.

**Features**:
- Authentication handling
- Common SQL operations
- Error handling patterns
- Logging utilities

#### AIChatDAL
**Location**: `dal/ai_chat_dal.py`

**Purpose**: Database operations for chat functionality.

**Operations**:
- Message CRUD operations
- Session management
- Vector search queries
- User authentication validation

#### AIReportsDAL
**Location**: `dal/ai_reports_dal.py`

**Purpose**: Database operations for AI reports.

**Operations**:
- Report creation and updates
- Report retrieval with filtering
- Analytics integration
- Content indexing for RAG

#### AIInsightsDAL
**Location**: `dal/ai_insights_dal.py`

**Purpose**: Database operations for trading insights.

**Operations**:
- Insight CRUD operations
- Pattern analysis queries
- Confidence score management
- Risk assessment data

## RAG and Vector Services

### RAGVectorService

**Location**: `rag_vector_service.py`

**Purpose**: Core vector database operations and semantic search.

**Key Features**:
- **Unified Vector Storage**: Single `trade_embeddings` table approach
- **Multiple Content Types**: Support for trades, reports, insights, notes
- **Semantic Search**: Cosine similarity-based search with pgvector
- **Batch Operations**: Efficient batch embedding and indexing
- **Metadata Management**: Rich metadata for context and filtering

**Methods**:
- `index_document()` - Index content with embeddings
- `semantic_search()` - Perform semantic similarity search
- `search_trade_embeddings()` - Advanced search with filters
- `get_similar_trades_for_symbol()` - Symbol-specific search
- `get_trade_embeddings_stats()` - Usage analytics

### TradeEmbeddingsService

**Location**: `trade_embeddings_service.py`

**Purpose**: Specialized service for embedding trading data.

**Key Features**:
- **Automatic Embedding**: Trigger embeddings for new trade data
- **Batch Processing**: Efficient processing of existing data
- **Real-time Updates**: Webhook-based embedding triggers
- **Analytics Dashboard**: Embedding usage and performance metrics
- **Content Type Detection**: Automatic content type classification

## Configuration and Environment

### Required Environment Variables

```bash
# AI Services Configuration
OPENROUTER_API_KEY=your_openrouter_api_key
VOYAGE_API_KEY=your_voyage_api_key

# Google Cloud (for embeddings)
GOOGLE_CLOUD_PROJECT=your_project_id
GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key

# Optional: Advanced Prompt System
LLM_CONFIDENCE_SCORING_ENABLED=true
LLM_CONFIDENCE_CACHE_SIZE=1000
```

### Service Configuration

Services can be configured through:

1. **Environment Variables**: API keys and service endpoints
2. **Service Parameters**: Model selection and behavior settings
3. **Database Configuration**: Connection settings and timeouts

### Model Configuration

The system supports multiple AI models through OpenRouter:

```python
# Stable models organized by tiers
TIER_1_MODELS = ["gpt-4-turbo", "claude-3-opus"]
TIER_2_MODELS = ["gpt-4", "claude-3-sonnet"]
TIER_3_MODELS = ["gpt-3.5-turbo", "claude-3-haiku"]
TIER_4_MODELS = ["llama-2-70b", "mixtral-8x7b"]
```

## API Usage Examples

### Basic Chat Interaction

```python
from services.ai import AIOrchestrator

orchestrator = AIOrchestrator()

# Simple chat message
user = {"id": "user123", "email": "user@example.com"}
response = await orchestrator.process_chat_message(
    user=user,
    session_id="session_123",
    user_message="What's my trading performance this week?",
    context_limit=10
)

print(response["response"])  # AI-generated response with trade context
```

### Generating Reports

```python
# Generate daily report
report = await orchestrator.generate_daily_report(
    user=user,
    time_range="7d",
    custom_start_date=datetime.now() - timedelta(days=7)
)

# Access report sections
performance = report["report"]["performance_summary"]
insights = report["report"]["key_insights"]
recommendations = report["report"]["recommendations"]
```

### Streaming Chat

```python
# Streaming response
async for chunk in orchestrator.process_chat_message_stream(
    user=user,
    session_id="session_123",
    user_message="Analyze my recent AAPL trades"
):
    if chunk["type"] == "token":
        print(chunk["content"], end="", flush=True)
    elif chunk["type"] == "metadata":
        print(f"\nTrade context used: {chunk['trade_context_used']}")
```

### RAG Search

```python
# Search user's trading history
results = await orchestrator.search_trade_context(
    user=user,
    query="What was my strategy when I bought TSLA?",
    symbol="TSLA",
    limit=5
)

for result in results:
    print(f"Content: {result['content']}")
    print(f"Similarity: {result['similarity_score']}")
```

### Health Monitoring

```python
# Check system health
health_status = await orchestrator.get_health_status()

print(f"Overall Status: {health_status['overall_status']}")
print(f"Available Components: {health_status['available_components']}")

# Quick health check
quick_status = orchestrator.get_quick_health_status()
print(f"Core Services Operational: {quick_status['core_services_operational']}")
```

## Advanced Features

### RAG-Enhanced Responses

The system automatically enhances AI responses with relevant context:

1. **Symbol Extraction**: Automatically detects stock symbols in queries
2. **Context Retrieval**: Searches user's trading history for relevant information
3. **Context Formatting**: Formats retrieved context for optimal AI processing
4. **Response Enhancement**: Integrates context into AI prompts
5. **Content Indexing**: Automatically indexes AI responses for future use

### Confidence Scoring

AI responses include confidence scores for quality control:

```python
response = await orchestrator.process_chat_message(...)
confidence_score = response.get("confidence_score", 0.0)

if confidence_score > 0.8:
    # High confidence response
    pass
elif confidence_score > 0.6:
    # Medium confidence - may need review
    pass
else:
    # Low confidence - consider fallback
    pass
```

### Few-Shot Prompting

Advanced prompt system with curated examples:

```python
from config.prompt_registry import PromptRegistry

registry = PromptRegistry()
examples = registry.get_few_shot_examples("DAILY_REPORT")
optimized_prompt = registry.get_optimized_prompt("CHAT", "V3_FEW_SHOT")
```

## Best Practices

### 1. Error Handling

```python
try:
    response = await orchestrator.process_chat_message(...)
except Exception as e:
    logger.error(f"Chat processing failed: {str(e)}")
    # Fallback to simpler processing or return error message
```

### 2. Authentication

```python
# Always validate user authentication
user_id = await dal.get_authenticated_user_id(access_token)
if not user_id:
    raise HTTPException(status_code=401, detail="Invalid authentication")
```

### 3. Logging

```python
# Use structured logging with context
logger.info("Processing chat message", extra={
    "session_id": session_id,
    "user_id": user_id,
    "message_length": len(user_message)
})
```

### 4. Performance

```python
# Use batch operations for multiple embeddings
embeddings = embedding_service.generate_embeddings_batch(texts)
# Cache frequently used data
results = await cached_search_function(query, user_id)
```

### 5. Testing

```python
# Unit test individual components
def test_chat_service():
    service = AIChatService()
    # Test with mock data

# Integration test with real database
async def test_full_flow():
    # Test complete request flow
    pass
```

## Monitoring and Maintenance

### Health Checks

Regular health monitoring is built into the system:

```python
# Comprehensive health check
health = await orchestrator.get_health_status()

# Quick status check
quick_health = orchestrator.get_quick_health_status()
```

### Performance Metrics

Key metrics to monitor:

- **Response Times**: Chat response latency, report generation time
- **Success Rates**: API call success rates, model availability
- **Usage Patterns**: Most common queries, user activity patterns
- **Resource Usage**: Memory usage, database connections

### Troubleshooting

Common issues and solutions:

1. **Model Unavailable**: Automatic fallback to stable models
2. **Database Connection**: Connection pooling with retry logic
3. **Memory Usage**: LRU caching with size limits
4. **Rate Limits**: Request throttling and queue management

## Security Considerations

- **Authentication**: JWT token validation on all endpoints
- **Authorization**: User-scoped data access (RLS in PostgreSQL)
- **API Keys**: Secure storage and rotation of API keys
- **Data Protection**: Encryption of sensitive trading data
- **Rate Limiting**: Protection against abuse and API limits

## Extending the System

### Adding New Services

1. **Create Service Class**: Follow the pattern of existing services
2. **Implement DAL**: Create corresponding data access layer
3. **Add to Orchestrator**: Integrate with main orchestrator
4. **Update API**: Add new endpoints in FastAPI layer

### Custom Models

```python
# Add custom model configuration
from orchestrator.ai_model_manager import AIModelManager

manager = AIModelManager()
manager.add_custom_model("custom-model", "Custom AI", tier=2)
```

### New Content Types

```python
# Extend RAG system with new content types
from rag_vector_service import DocumentType

class DocumentType(Enum):
    # Add new types
    MARKET_ANALYSIS = "market_analysis"
    STRATEGY_GUIDE = "strategy_guide"
```

## Conclusion

This AI services architecture provides a robust, scalable foundation for advanced trading intelligence. The modular design allows for easy maintenance and extension, while the RAG-enhanced capabilities ensure contextually aware and personalized AI interactions. The system is designed to grow with user needs while maintaining high performance and reliability.

For detailed implementation examples and API specifications, see the individual service files and API documentation.
