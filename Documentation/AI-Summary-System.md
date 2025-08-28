# AI Trading Summary System - Hosted Models

A comprehensive AI-powered trading analysis system that processes your daily trading data through a sophisticated 3-stage pipeline using Hugging Face Inference API with intelligent fallback system.

## System Architecture

### 3-Stage AI Pipeline with Fallback Models

**Model 1: Data Analyzer** (with fallbacks)
- **Primary**: `microsoft/CodeBERT-base` - Numerical data analysis
- **Fallback 1**: `microsoft/DialoGPT-large` - Structured data processing  
- **Fallback 2**: `meta-llama/Llama-3.2-3B-Instruct` - Analytical capabilities
- **Purpose**: Transform raw JSON trading data into structured insights

**Model 2: Insight Generator** (with fallbacks)
- **Primary**: `mistralai/Mistral-7B-Instruct-v0.1` - Data insights
- **Fallback 1**: `meta-llama/Llama-3.1-8B-Instruct` - Pattern recognition
- **Fallback 2**: `microsoft/DialoGPT-large` - Data connections
- **Purpose**: Generate psychological and strategic insights from data analysis

**Model 3: Report Writer** (with fallbacks)
- **Primary**: `meta-llama/Llama-3.1-8B-Instruct` - Clear writing
- **Fallback 1**: `mistralai/Mistral-7B-Instruct-v0.1` - Report generation
- **Fallback 2**: `microsoft/DialoGPT-large` - Conversational tone
- **Purpose**: Create clear, actionable trading reports

**Chat Assistant** (with fallbacks)
- **Primary**: `meta-llama/Llama-3.1-8B-Instruct` - Context chat
- **Fallback 1**: `mistralai/Mistral-7B-Instruct-v0.1` - Context maintenance
- **Fallback 2**: `microsoft/DialoGPT-large` - Conversations
- **Purpose**: Handle follow-up questions about analysis

## Installation & Setup

### 1. Install Dependencies

```bash
# Install AI-specific dependencies
pip install -r backend/requirements-ai.txt

# Core dependencies should already be installed
pip install -r backend/requirements.txt
```

### 2. Environment Configuration

Create/update your `.env` file:

```bash
# AI Model Configuration
AI_MODEL_SIZE=medium          # Options: small, medium, large
AI_USE_GPU=true              # Set to false if no GPU available
AI_GPU_MEMORY_FRACTION=0.8   # GPU memory allocation
AI_MAX_TOKENS=512            # Max tokens per generation
AI_TEMPERATURE=0.7           # Model creativity (0.0-1.0)
AI_ENABLE_CACHE=true         # Enable model caching
AI_CACHE_DIR=./model_cache   # Cache directory
AI_ENABLE_QUANTIZATION=true  # Enable model quantization for efficiency
```

### 3. Model Size Selection

Choose based on your hardware:

**Small** (Recommended for development/testing)
- Models: CodeBERT-base, DialoGPT-medium
- RAM: ~4GB
- GPU: Optional

**Medium** (Recommended for production)
- Models: CodeBERT-base, Mistral-7B, Llama-3.1-8B
- RAM: ~16GB
- GPU: 8GB+ VRAM recommended

**Large** (High-performance setup)
- Models: Llama-3.2-3B, Llama-3.1-8B
- RAM: ~32GB
- GPU: 16GB+ VRAM recommended

## API Endpoints

### Generate Complete Analysis

```http
POST /api/ai-summary/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "time_range": "30d",
  "custom_start_date": "2024-01-01",
  "custom_end_date": "2024-01-31"
}
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2024-01-31T10:30:00Z",
  "time_period": "Last 30 Days",
  "report": "# Trading Performance Report...",
  "chat_enabled": true
}
```

### Chat with AI

```http
POST /api/ai-summary/chat
Content-Type: application/json
Authorization: Bearer <token>

{
  "question": "What's my biggest weakness as a trader?"
}
```

**Response:**
```json
{
  "question": "What's my biggest weakness as a trader?",
  "answer": "Based on your trading data, your biggest weakness appears to be...",
  "timestamp": "2024-01-31T10:35:00Z"
}
```

### Quick Insights

```http
GET /api/ai-summary/quick-insights?time_range=7d
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "insights": {
    "performance_summary": {
      "win_rate": 65.5,
      "profit_factor": 1.45,
      "trade_expectancy": 12.50,
      "total_trades": 45
    },
    "risk_assessment": {
      "risk_reward_ratio": 1.8,
      "avg_hold_time_hours": 2.5,
      "position_consistency": 0.75
    },
    "behavioral_flags": {
      "longest_winning_streak": 8,
      "longest_losing_streak": 4,
      "directional_bias": "bullish_bias"
    },
    "top_symbols": [...],
    "time_period": "Last 7 Days"
  },
  "timestamp": "2024-01-31T10:40:00Z"
}
```

## Usage Examples

### Python Client Example

```python
import asyncio
from backend.services.ai_summary_service import AITradingSummaryService

async def main():
    service = AITradingSummaryService()
    
    # Generate complete analysis
    analysis = await service.generate_complete_analysis(
        user_id="user123",
        time_range="30d"
    )
    
    if analysis["success"]:
        print("=== AI TRADING REPORT ===")
        print(analysis["report"])
        
        # Chat about the analysis
        response = await service.chat_about_analysis(
            "How can I improve my win rate?"
        )
        print(f"\nAI: {response}")

asyncio.run(main())
```

### Frontend Integration Example

```typescript
// Generate AI analysis
const generateAnalysis = async (timeRange: string) => {
  const response = await fetch('/api/ai-summary/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ time_range: timeRange })
  });
  
  const analysis = await response.json();
  return analysis;
};

// Chat with AI
const chatWithAI = async (question: string) => {
  const response = await fetch('/api/ai-summary/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ question })
  });
  
  const chatResponse = await response.json();
  return chatResponse.answer;
};
```

## Report Structure

The AI generates comprehensive reports with these sections:

### 🎯 Executive Summary
Brief overview of performance and key takeaways

### 💪 What You're Doing Well
- Specific strengths with supporting data
- Positive behavioral patterns
- Successful strategies identified

### 🔍 Key Areas for Improvement
- Critical issues needing attention
- Impact analysis of problems
- Priority ranking of fixes

### 📋 Specific Action Steps
1. **Immediate Actions (This Week)**
2. **Short-term Improvements (2-4 weeks)**
3. **Long-term Development (1-3 months)**

### 🎯 Next Week's Focus
Three specific priorities with success metrics

### 📊 Key Metrics to Track
Performance indicators to monitor progress

### 💡 Final Thoughts
Encouraging conclusion with motivation

## Performance Optimization

### Model Caching
- Models are cached after first load
- Subsequent requests are much faster
- Cache directory configurable via environment

### GPU Acceleration
- Automatic GPU detection and usage
- Configurable memory allocation
- Fallback to CPU if GPU unavailable

### Quantization
- 8-bit quantization for memory efficiency
- Maintains model quality while reducing VRAM usage
- Configurable via environment variables

## Monitoring & Health Checks

### Service Status
```http
GET /api/ai-summary/status
```

Returns model loading status and system health.

### Health Check
```http
GET /api/ai-summary/health
```

Basic service availability check.

## Troubleshooting

### Common Issues

**Out of Memory Errors**
- Reduce `AI_GPU_MEMORY_FRACTION`
- Enable quantization: `AI_ENABLE_QUANTIZATION=true`
- Use smaller model size: `AI_MODEL_SIZE=small`

**Slow Generation**
- Enable GPU: `AI_USE_GPU=true`
- Reduce max tokens: `AI_MAX_TOKENS=256`
- Enable model caching: `AI_ENABLE_CACHE=true`

**Model Loading Failures**
- Check internet connection for model downloads
- Verify Hugging Face access tokens if using gated models
- Ensure sufficient disk space for model cache

### Performance Tuning

**For Development**
```bash
AI_MODEL_SIZE=small
AI_MAX_TOKENS=256
AI_ENABLE_QUANTIZATION=true
```

**For Production**
```bash
AI_MODEL_SIZE=medium
AI_MAX_TOKENS=512
AI_USE_GPU=true
AI_GPU_MEMORY_FRACTION=0.8
```

## Integration with Existing System

The AI summary system integrates seamlessly with your existing trading platform:

1. **Database Integration**: Uses the `get_daily_ai_summary()` SQL function
2. **Authentication**: Leverages existing user authentication system
3. **API Consistency**: Follows existing FastAPI patterns and error handling
4. **Type Safety**: Full TypeScript/Pydantic model definitions

## Future Enhancements

- **Real-time Analysis**: Stream processing for live trading insights
- **Custom Model Training**: Fine-tune models on user-specific trading data
- **Multi-language Support**: Expand beyond English for global users
- **Advanced Visualizations**: AI-generated charts and graphs
- **Predictive Analytics**: Market prediction capabilities
