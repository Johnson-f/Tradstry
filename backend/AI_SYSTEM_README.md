# Tradistry AI System Documentation

## Overview

Tradistry is a comprehensive trading journal and analytics platform that leverages advanced AI capabilities to provide intelligent insights, automated reporting, and conversational assistance for traders. The backend AI system is built with FastAPI and integrates multiple AI services for enhanced trading analysis.

## Architecture Overview

### Core Components

```
├── Configuration Layer (config/)
│   ├── ai_config.py - AI model configurations and settings
│   └── __init__.py - Configuration initialization
├── Service Layer (services/)
│   ├── ai_orchestrator_service.py - Main AI coordination service
│   ├── ai_embedding_service.py - Text embedding generation
│   ├── ai_reports_service.py - AI report generation
│   ├── ai_chat_service.py - Conversational AI chat
│   └── ai_insights_service.py - Pattern recognition and insights
├── API Layer (routers/)
│   ├── ai_reports.py - Report generation endpoints
│   ├── ai_chat.py - Chat interaction endpoints
│   └── ai_insights.py - Insights management endpoints
├── Data Models (models/)
│   ├── ai_reports.py - Report data structures
│   ├── ai_chat.py - Chat message structures
│   └── ai_insights.py - Insights data structures
└── Main Application (main.py) - FastAPI application entry point
```

## AI System Flow

### 1. Configuration Layer

#### `config/ai_config.py`
**Purpose**: Central configuration for all AI models and settings

**Key Features**:
- **Hugging Face Integration**: API token management for hosted models
- **Multiple Model Support**: 16+ pre-configured models including:
  - **LLM Models**: Mistral, Llama2, Phi-3, Gemma, CodeLlama, Zephyr, OpenChat, NeuralChat, Starling
  - **Embedding Models**: Sentence Transformers (MiniLM, MPNet, E5, BGE variants)
  - **Financial Models**: FinBERT, SEC-BERT, ESG-BERT, CryptoBERT

**Configuration Options**:
```python
# Model Selection
DEFAULT_LLM_MODEL = "mistralai/Mistral-7B-Instruct-v0.1"
DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# Performance Settings
LLM_MAX_LENGTH = 2048
LLM_TEMPERATURE = 0.7
EMBEDDING_DIMENSION = 384

# System Limits
MAX_CONTEXT_MESSAGES = 10
MAX_INSIGHTS_PER_REQUEST = 5
```

**Utility Functions**:
- `get_available_llm_models()` - Get all LLM options
- `get_available_embedding_models()` - Get all embedding options
- `get_financial_models()` - Get financial-specific models
- `get_model_by_key()` - Retrieve model path by identifier
- `validate_model_availability()` - Check model availability

### 2. Service Layer

#### `services/ai_orchestrator_service.py`
**Purpose**: Main coordination service that orchestrates all AI operations

**Key Features**:
- **Dynamic Model Selection**: Runtime model switching with fallback support
- **Multi-Modal Processing**: Handles text, embeddings, and complex analysis
- **Error Recovery**: Automatic fallback to stable models when primary models fail
- **Performance Monitoring**: Tracks processing times and model usage

**Core Methods**:
- `select_model(model_type, model_key)` - Switch between models
- `validate_current_models()` - Check model health
- `get_fallback_model()` - Get backup model options
- `generate_daily_report()` - Create comprehensive trading reports
- `process_chat_message()` - Handle conversational AI
- `generate_insights()` - Extract trading patterns and insights

**Trading Prompts**:
- **Daily Reports**: Performance summaries, risk analysis, recommendations
- **Chat Interactions**: Context-aware trading conversations
- **Insight Generation**: Pattern recognition, risk alerts, opportunities

#### `services/ai_embedding_service.py`
**Purpose**: Local text embedding generation using Sentence Transformers

**Key Features**:
- **Cost-Effective**: Local processing reduces API costs
- **Batch Processing**: Efficient handling of multiple texts
- **Similarity Search**: Cosine similarity calculations
- **Caching**: LRU cache for frequently used embeddings

**Core Methods**:
- `generate_embedding(text)` - Single text embedding
- `generate_embeddings_batch(texts)` - Batch processing
- `calculate_similarity(emb1, emb2)` - Similarity scoring
- `find_most_similar(query, candidates)` - Vector search

#### `services/ai_reports_service.py`
**Purpose**: AI-powered report generation and management

**Key Features**:
- **Multi-Period Analysis**: Daily, weekly, monthly, yearly reports
- **Trading Context Integration**: Combines multiple data sources
- **Structured Output**: Consistent report formatting
- **Performance Metrics**: Detailed analytics and insights

**Core Methods**:
- `get_trading_context()` - Aggregate trading data
- `create_report()` - Generate and store reports
- `get_reports()` - Retrieve with filtering/pagination
- `update_report()` - Modify existing reports

#### `services/ai_chat_service.py`
**Purpose**: Conversational AI for trading assistance

**Key Features**:
- **Context Awareness**: Maintains conversation history
- **Vector Search**: Semantic search through chat history
- **Session Management**: Organized conversation threads
- **Embedding Integration**: Context-aware responses

**Core Methods**:
- `create_message()` - Store chat messages
- `get_session_messages()` - Retrieve conversation history
- `search_messages()` - Vector-based message search
- `get_sessions()` - Manage chat sessions

#### `services/ai_insights_service.py`
**Purpose**: Pattern recognition and actionable insights generation

**Key Features**:
- **Multi-Type Insights**: Risk, opportunity, performance, patterns
- **Priority Classification**: Critical, high, medium, low
- **Actionable Items**: Specific recommendations
- **Expiration Management**: Time-based insight relevance

**Core Methods**:
- `create_insight()` - Generate new insights
- `get_priority_insights()` - Get critical insights
- `search_insights()` - Vector-based insight search
- `expire_insight()` - Mark insights as outdated

### 3. API Layer

#### `routers/ai_reports.py`
**Endpoints**:

```
POST /api/ai/reports/ - Create new report
GET  /api/ai/reports/ - List reports with filtering
GET  /api/ai/reports/{id} - Get specific report
PUT  /api/ai/reports/{id} - Update report
DELETE /api/ai/reports/{id} - Delete report
POST /api/ai/reports/generate - Generate AI report
GET  /api/ai/reports/context/trading - Get trading context
```

**Key Features**:
- **Advanced Filtering**: By type, status, date range, search
- **Pagination**: Efficient large dataset handling
- **Real-time Generation**: On-demand report creation
- **Context Aggregation**: Comprehensive trading data analysis

#### `routers/ai_chat.py`
**Endpoints**:

```
POST /api/ai/chat/messages - Create chat message
GET  /api/ai/chat/messages - List messages with filtering
GET  /api/ai/chat/sessions - Get chat sessions
GET  /api/ai/chat/sessions/{id}/messages - Get session messages
POST /api/ai/chat/chat - Send message to AI
PUT  /api/ai/chat/messages/{id} - Update message
DELETE /api/ai/chat/messages/{id} - Delete message
DELETE /api/ai/chat/sessions/{id} - Delete session
GET  /api/ai/chat/search - Search messages
```

**Key Features**:
- **Session Management**: Organized conversations
- **Vector Search**: Semantic message retrieval
- **Real-time Responses**: Streaming AI interactions
- **Context Preservation**: Conversation history awareness

#### `routers/ai_insights.py`
**Endpoints**:

```
POST /api/ai/insights/ - Create insight
GET  /api/ai/insights/ - List insights with filtering
GET  /api/ai/insights/priority - Get priority insights
GET  /api/ai/insights/actionable - Get actionable insights
GET  /api/ai/insights/{id} - Get specific insight
PUT  /api/ai/insights/{id} - Update insight
DELETE /api/ai/insights/{id} - Delete insight
POST /api/ai/insights/{id}/expire - Expire insight
POST /api/ai/insights/generate - Generate AI insights
GET  /api/ai/insights/search - Search insights
```

**Key Features**:
- **Priority Filtering**: Focus on critical insights
- **Actionable Items**: Specific recommendations
- **Expiration Handling**: Time-based relevance
- **Batch Generation**: Multiple insight types

### 4. Data Models

#### `models/ai_reports.py`
**Core Models**:
- `AIReportBase` - Base report structure
- `AIReportCreate` - Report creation model
- `AIReportResponse` - API response format
- `AIReportGenerateRequest` - Generation parameters

**Report Types**:
- `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`, `CUSTOM`

**Status Types**:
- `PROCESSING`, `COMPLETED`, `FAILED`

#### `models/ai_chat.py`
**Core Models**:
- `AIChatMessageCreate` - Message creation
- `AIChatSessionResponse` - Session data
- `AIChatRequest` - Chat interaction

**Message Types**:
- `USER_QUESTION`, `AI_RESPONSE`

#### `models/ai_insights.py`
**Core Models**:
- `AIInsightCreate` - Insight creation
- `AIInsightResponse` - API response
- `AIInsightGenerateRequest` - Generation parameters

**Insight Types**:
- `PATTERN`, `RISK`, `OPPORTUNITY`, `PERFORMANCE`, `RECOMMENDATION`

**Priority Levels**:
- `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`

## AI System Data Flow

### Report Generation Flow
1. **Request** → `/api/ai/reports/generate`
2. **Context Gathering** → `AIReportsService.get_trading_context()`
3. **AI Processing** → `AIOrchestrator.generate_daily_report()`
4. **Model Selection** → Dynamic LLM selection with fallback
5. **Analysis** → Trading data analysis using prompts
6. **Storage** → Save to database with metadata
7. **Response** → Return formatted report

### Chat Interaction Flow
1. **Message** → `/api/ai/chat/chat`
2. **Context Retrieval** → Search relevant trading data
3. **Embedding Generation** → Convert message to vectors
4. **AI Processing** → `AIOrchestrator.process_chat_message()`
5. **Response Generation** → Context-aware AI response
6. **Storage** → Save conversation history
7. **Response** → Return AI message

### Insights Generation Flow
1. **Request** → `/api/ai/insights/generate`
2. **Data Analysis** → `AIOrchestrator.generate_insights()`
3. **Pattern Recognition** → Multiple insight types
4. **Priority Classification** → Risk/opportunity assessment
5. **Action Extraction** → Generate recommendations
6. **Storage** → Save with expiration dates
7. **Response** → Return insights array

## Configuration and Deployment

### Environment Variables
```bash
# Required
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
JWT_SECRET_KEY=your_jwt_secret
HUGGINGFACEHUB_API_TOKEN=your_huggingface_token

# Optional
PROJECT_NAME=Tradistry Backend
VERSION=1.0.0
API_PREFIX=/api
```

### Model Configuration
The system supports dynamic model switching:
```python
# Switch LLM model
orchestrator.select_model('llm', 'phi3_mini')

# Switch embedding model
orchestrator.select_model('embedding', 'e5_base_v2')
```

### Performance Optimization
- **Lazy Loading**: Models loaded on first use
- **Caching**: LRU cache for embeddings
- **Batch Processing**: Efficient multiple text handling
- **Fallback Systems**: Automatic model failover

## Monitoring and Maintenance

### Health Checks
- `GET /api/health` - System health status
- Model availability validation
- Processing time monitoring
- Error rate tracking

### Logging
- Comprehensive error logging
- Performance metrics
- Model usage tracking
- User activity monitoring

### Maintenance Tasks
- Model cache cleanup
- Expired insights removal
- Performance optimization
- Security updates

## Security Considerations

### Authentication
- JWT-based authentication
- Supabase integration
- User-specific data isolation
- API key management

### Data Protection
- Encrypted communications
- Secure token storage
- Input validation
- Rate limiting

### Model Safety
- Input sanitization
- Output filtering
- Usage monitoring
- Fallback mechanisms

## Future Enhancements
# TODO
### Planned Features
- **Multi-Modal AI**: Image and document analysis
- **Real-time Processing**: Streaming responses
- **Advanced Analytics**: Predictive modeling
- **Custom Model Training**: User-specific adaptations
- **Integration APIs**: Third-party trading platforms

### Scalability Improvements
- **Distributed Processing**: Multi-instance deployment
- **Model Caching**: Advanced caching strategies
- **Database Optimization**: Query performance
- **API Rate Limiting**: Advanced throttling

---

## Quick Start

1. **Setup Environment**:
   ```bash
   pip install -r requirements.txt
   cp .env.example .env
   # Configure environment variables
   ```

2. **Initialize Database**:
   ```bash
   # Run database migrations
   python -m scripts.setup_database
   ```

3. **Start Application**:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

4. **Access API Documentation**:
   - Swagger UI: `http://localhost:8000/api/docs`
   - ReDoc: `http://localhost:8000/api/redoc`

This comprehensive AI system provides traders with powerful analytics, intelligent insights, and conversational assistance, all built on a scalable, secure, and maintainable architecture.
