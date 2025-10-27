# Reports & Analysis Architecture

## Overview

The Tradistry backend implements a sophisticated **AI-powered multi-layered architecture** for generating intelligent trading reports and analysis. The system combines vector databases, AI models, and structured data processing to provide comprehensive insights into trading performance.

## 🏗️ Core Architecture Components

### Database Schema Design

The system uses three main database tables for AI functionality:

#### 1. AI Insights Table (`ai_insights`)
```sql
CREATE TABLE ai_insights (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    time_range TEXT NOT NULL CHECK (time_range IN ('7d', '30d', '90d', 'ytd', '1y')),
    insight_type TEXT NOT NULL CHECK (insight_type IN ('trading_patterns', 'performance_analysis', 'risk_assessment', 'behavioral_analysis', 'market_analysis', 'opportunity_detection')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    key_findings TEXT, -- JSON array
    recommendations TEXT, -- JSON array
    data_sources TEXT, -- JSON array
    confidence_score REAL DEFAULT 0.0,
    generated_at TEXT NOT NULL,
    expires_at TEXT,
    metadata TEXT, -- JSON object with additional metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### 2. AI Reports Table (`ai_reports`)
```sql
CREATE TABLE ai_reports (
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
```

#### 3. Chat Sessions & Messages
```sql
CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    last_message_at TEXT
);

CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    context_vectors TEXT, -- JSON array of vector IDs
    token_count INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);
```

### AI Service Layer

The backend implements a modular AI service architecture:

```rust
// Core AI Services
- AIInsightsService     // Generates trading insights
- AIChatService        // Handles conversational AI
- VectorizationService  // Converts data to embeddings
- OpenRouterClient     // AI model integration
- HybridSearchService  // Combines vector + keyword search
- DataFormatter        // Formats data for AI processing
```

## 🧠 AI-Powered Analysis Pipeline

### 1. Data Vectorization Process

The **VectorizationService** converts trading data into embeddings:

```rust
pub struct VectorizationService {
    voyager_client: Arc<VoyagerClient>,      // Embedding generation
    upstash_vector: Arc<UpstashVectorClient>, // Vector storage
    qdrant_client: Arc<QdrantDocumentClient>, // Document storage
    config: AIConfig,
}
```

**Supported Data Types:**
- **Stock trades** - Entry/exit prices, P&L, commissions
- **Options trades** - Strategies, strikes, premiums
- **Trade notes** - Sentiment, reasoning, emotions
- **Notebook entries** - Trading plans, strategies
- **Playbook strategies** - Systematic approaches

### 2. Insight Generation Flow

```rust
// Insight Generation Process:
1. Retrieve trading data using vector similarity search
2. Build context-aware prompts based on insight type
3. Generate AI content using OpenRouter (multiple AI models)
4. Parse and structure the AI response
5. Store insights with metadata and expiration
```

**Insight Types Supported:**
- **TradingPatterns** - Identifies recurring trading behaviors
- **PerformanceAnalysis** - Analyzes P&L and trading metrics
- **RiskAssessment** - Evaluates risk exposure and management
- **BehavioralAnalysis** - Examines trading psychology
- **MarketAnalysis** - Assesses market conditions
- **OpportunityDetection** - Finds trading opportunities

### 3. Report Types

The system supports comprehensive report generation:

- **Comprehensive** - Full trading analysis with all metrics
- **Performance** - P&L and performance metrics analysis
- **Risk** - Risk assessment and risk metrics
- **Trading** - Trading pattern and behavior analysis
- **Behavioral** - Trading psychology and mindset insights
- **Market** - Market condition and opportunity analysis

## 🔄 Asynchronous Processing

### Background Task Management

```rust
pub struct InsightGenerationTask {
    pub task_id: String,
    pub user_id: String,
    pub insight_request: InsightRequest,
    pub status: TaskStatus,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub result_insight_id: Option<String>,
}
```

**Task Status Flow:**
1. **Pending** - Task created, waiting to start
2. **Processing** - Currently generating insight
3. **Completed** - Successfully generated
4. **Failed** - Generation failed with error
5. **Expired** - Task expired due to timeout

### Performance Optimizations

- **24-hour expiration** for insights to ensure freshness
- **Force regeneration** option to bypass cache
- **Data quality scoring** based on trade count
- **Processing time tracking** for performance monitoring
- **Automatic cleanup** of expired insights and completed tasks

## 🎯 Context-Aware AI

### Hybrid Search System

```rust
pub struct HybridSearchService {
    vectorization_service: Arc<VectorizationService>,
    upstash_search: Arc<UpstashSearchClient>,
    qdrant_client: Arc<QdrantDocumentClient>,
}
```

**Search Capabilities:**
- **Vector similarity search** for semantic understanding
- **Keyword search** fallback for precise matching
- **Context source tracking** to show which data informed insights
- **Relevance scoring** for context quality
- **Multi-modal search** combining different data types

### Smart Prompt Engineering

```rust
pub struct ChatPromptConfig {
    pub templates: HashMap<QueryType, PromptTemplate>,
    pub context_max_length: usize,
    pub include_relevance_scores: bool,
    pub temperature: f32,
    pub max_tokens: u32,
}
```

**Features:**
- **Dynamic prompt templates** based on insight type
- **Context-aware system prompts** that adapt to query type
- **Multi-model support** through OpenRouter integration
- **Structured output parsing** for consistent data format

## 📊 Data Integration

### Multi-Source Data Aggregation

The system integrates data from multiple sources:

```rust
// Data formatting for embeddings
impl DataFormatter {
    pub fn format_stock_for_embedding(stock: &Stock) -> String;
    pub fn format_option_for_embedding(option: &OptionTrade) -> String;
    pub fn format_trade_note_for_embedding(note: &TradeNote) -> String;
    pub fn format_notebook_for_embedding(entry: &NotebookNote) -> String;
    pub fn format_playbook_for_embedding(playbook: &Playbook) -> String;
}
```

### Real-Time Vector Updates

- **Automatic vectorization** when new trades are added
- **Priority-based processing** (High/Medium/Low)
- **Content validation** and **hash-based deduplication**
- **Batch processing** for efficiency
- **Incremental updates** for existing data

## 🚀 API Design

### RESTful Endpoints

#### AI Insights API
```rust
POST   /api/ai/insights           // Generate insights synchronously
POST   /api/ai/insights/async     // Generate insights asynchronously
GET    /api/ai/insights           // List user insights with filters
GET    /api/ai/insights/{id}      // Get specific insight
DELETE /api/ai/insights/{id}      // Delete insight
GET    /api/ai/insights/tasks/{id} // Get task status
```

#### AI Chat API
```rust
POST   /api/ai/chat               // Send chat message
GET    /api/ai/chat/sessions      // List chat sessions
GET    /api/ai/chat/sessions/{id} // Get session details
POST   /api/ai/chat/sessions      // Create new session
DELETE /api/ai/chat/sessions/{id} // Delete session
```

### Request/Response Examples

#### Generate Insights Request
```json
{
  "time_range": "30d",
  "insight_type": "trading_patterns",
  "include_predictions": true,
  "force_regenerate": false
}
```

#### Insight Response
```json
{
  "success": true,
  "data": {
    "id": "insight-uuid",
    "user_id": "user-uuid",
    "time_range": "ThirtyDays",
    "insight_type": "TradingPatterns",
    "title": "Weekly Momentum Trading Patterns",
    "content": "Analysis of your trading patterns shows...",
    "key_findings": [
      "You tend to enter positions on Tuesday mornings",
      "Your win rate increases by 15% when holding overnight"
    ],
    "recommendations": [
      "Consider scaling into positions on Monday",
      "Review your overnight holding criteria"
    ],
    "confidence_score": 0.87,
    "generated_at": "2024-01-15T10:30:00Z",
    "expires_at": "2024-01-16T10:30:00Z",
    "metadata": {
      "trade_count": 45,
      "analysis_period_days": 30,
      "model_version": "1.0",
      "processing_time_ms": 2340,
      "data_quality_score": 0.9
    }
  }
}
```

## 🔒 Security & Multi-Tenancy

### User Isolation

```rust
// Per-user database connections
pub struct TursoClient {
    config: TursoConfig,
    connection_pool: Arc<Mutex<HashMap<String, Connection>>>,
}

impl TursoClient {
    pub async fn get_user_database_connection(&self, user_id: &str) -> Result<Option<Connection>>;
}
```

**Security Features:**
- **Per-user database connections** via TursoClient
- **JWT-based authentication** with Supabase
- **User-scoped vector storage** for data privacy
- **Session-based chat** with user ownership
- **Input validation** at API boundaries

### Error Handling

```rust
#[derive(Error, Debug)]
pub enum TradingError {
    #[error("Database error: {0}")]
    Database(#[from] libsql::Error),
    
    #[error("Authentication error: {0}")]
    Auth(#[from] AuthError),
    
    #[error("Validation error: {field} - {message}")]
    Validation { field: String, message: String },
    
    #[error("AI service error: {0}")]
    AIService(String),
}
```

## 📈 Scalability Features

### Performance Optimizations

- **Connection pooling** for database access
- **Streaming responses** for large data
- **Background processing** for heavy operations
- **Efficient indexing** on database tables
- **Caching strategies** for frequently accessed data

### Monitoring & Observability

```rust
pub struct InsightMetadata {
    pub trade_count: u32,
    pub analysis_period_days: u32,
    pub model_version: String,
    pub processing_time_ms: u64,
    pub data_quality_score: f32,
}
```

**Metrics Tracked:**
- **Processing time** for each operation
- **Token usage** for AI calls
- **Data quality metrics** for insights
- **Error rates** and alerting
- **Cache hit rates** and performance

## 🛠️ Configuration

### Environment Variables

```bash
# Database Configuration
TURSO_DATABASE_URL=your-turso-url
TURSO_AUTH_TOKEN=your-turso-token

# Authentication
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI Services
OPENROUTER_API_KEY=your-openrouter-key
UPSTASH_REDIS_REST_URL=your-upstash-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-token
VOYAGER_API_KEY=your-voyager-key
QDRANT_URL=your-qdrant-url
QDRANT_API_KEY=your-qdrant-key

# Service Configuration
MAX_CONTEXT_VECTORS=50
AI_TIMEOUT_SECONDS=30
VECTOR_BATCH_SIZE=100
```

### Service Initialization

```rust
// Initialize AI services
let vectorization_service = Arc::new(VectorizationService::new(
    voyager_client.clone(),
    upstash_vector.clone(),
    qdrant_client.clone(),
    ai_config.clone(),
));

let ai_insights_service = Arc::new(AIInsightsService::new(
    vectorization_service.clone(),
    openrouter_client.clone(),
    turso_client.clone(),
    max_context_vectors,
));

let ai_chat_service = Arc::new(AIChatService::new(
    vectorization_service.clone(),
    hybrid_search_service.clone(),
    openrouter_client.clone(),
    turso_client.clone(),
    voyager_client.clone(),
    max_context_vectors,
));
```

## 🚀 Getting Started

### Prerequisites

- Rust 1.70+
- Turso CLI
- Supabase account
- OpenRouter API key
- Upstash account
- Qdrant instance

### Running the Backend

```bash
# Install dependencies
cargo build

# Run database migrations
cargo run --bin migrate

# Start the server
cargo run
```

### Testing the API

```bash
# Generate insights
curl -X POST http://localhost:3000/api/ai/insights \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "time_range": "30d",
    "insight_type": "trading_patterns",
    "include_predictions": true
  }'

# Start async generation
curl -X POST http://localhost:3000/api/ai/insights/async \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "time_range": "7d",
    "insight_type": "performance_analysis"
  }'

# Check task status
curl -X GET http://localhost:3000/api/ai/insights/tasks/TASK_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 📚 Additional Resources

- [Database Schema Documentation](./database/README.md)
- [AI Service Configuration](./src/service/ai_service/README.md)
- [API Documentation](./docs/API.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)

---

This architecture provides a robust, scalable foundation for generating intelligent trading reports and analysis while maintaining data privacy, performance, and user experience.
