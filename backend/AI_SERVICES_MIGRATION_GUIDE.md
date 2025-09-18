# AI Services Migration Guide

## Overview

The AI services have been reorganized and refactored to implement a **Data Access Layer (DAL)** architecture. This decouples business logic from database operations, making the services more testable and maintainable.

## New Structure

```
backend/services/ai/
├── __init__.py                    # AI services exports
├── dal/                          # Data Access Layer
│   ├── __init__.py
│   ├── base_dal.py              # Base DAL with common operations
│   ├── ai_chat_dal.py           # Chat data operations
│   ├── ai_insights_dal.py       # Insights data operations
│   └── ai_reports_dal.py        # Reports data operations
├── ai_chat_service.py           # Chat business logic
├── ai_insights_service.py       # Insights business logic
├── ai_reports_service.py        # Reports business logic
├── ai_embedding_service.py      # Embedding service (moved)
├── ai_orchestrator_service.py   # Orchestrator service (moved)
├── rag_vector_service.py        # RAG vector operations (moved)
└── rag_retriever_service.py     # RAG retrieval operations (moved)
```

## Key Changes

### 1. **Data Access Layer (DAL)**
- **BaseDAL**: Common database operations (authentication, SQL function calls, response parsing)
- **Specific DALs**: Chat, Insights, and Reports data access logic
- **Benefits**: 
  - Cleaner separation of concerns
  - Easier testing with mock DALs
  - Centralized database operation patterns
  - Better error handling and logging

### 2. **Service Layer Refactoring**
- **Business Logic Focus**: Services now handle validation, orchestration, and business rules
- **DAL Integration**: Services use DAL for all database operations
- **Improved Logging**: Structured logging with context and performance metrics
- **Better Error Handling**: Consistent error patterns across services

### 3. **Import Path Changes**

#### Old Imports (Deprecated)
```python
from services.ai_chat_service import AIChatService
from services.ai_insights_service import AIInsightsService
from services.ai_reports_service import AIReportsService
```

#### New Imports (Current)
```python
from services.ai.ai_chat_service import AIChatService
from services.ai.ai_insights_service import AIInsightsService
from services.ai.ai_reports_service import AIReportsService
```

## Migration Steps

### For Existing Code

1. **Update imports** to use new paths:
   ```python
   # Old
   from services.ai_chat_service import AIChatService
   
   # New
   from services.ai.ai_chat_service import AIChatService
   ```

2. **Service instantiation** remains the same:
   ```python
   chat_service = AIChatService()
   ```

3. **API calls** remain unchanged - same method signatures and return types

### For New Development

1. **Use new import paths** from `services.ai.*`
2. **Leverage DAL** for custom data operations:
   ```python
   from services.ai.dal.ai_chat_dal import AIChatDAL
   
   # Custom data operations
   dal = AIChatDAL()
   user_id = await dal.get_authenticated_user_id(access_token)
   ```

## Benefits

### 1. **Improved Testability**
- Services can be tested with mock DALs
- Database operations isolated and easily stubbed
- Business logic testing without database dependencies

### 2. **Better Maintainability**
- Clear separation between business logic and data access
- Consistent patterns across all AI services
- Centralized database operation handling

### 3. **Enhanced Observability**
- Structured logging throughout the stack
- Performance metrics and timing
- Better error context and debugging information

### 4. **Scalability**
- Easy to add new AI services following established patterns
- DAL can be extended for new data operations
- Service layer focuses on business value

## Backward Compatibility

- **Legacy imports** are maintained in `services/__init__.py` for transition period
- **API compatibility** is preserved - no breaking changes to public interfaces
- **Gradual migration** is supported - old and new imports work simultaneously

## Files Updated

### New Files Created
- `services/ai/__init__.py`
- `services/ai/dal/__init__.py`
- `services/ai/dal/base_dal.py`
- `services/ai/dal/ai_chat_dal.py`
- `services/ai/dal/ai_insights_dal.py`
- `services/ai/dal/ai_reports_dal.py`
- `services/ai/ai_chat_service.py` (refactored)
- `services/ai/ai_insights_service.py` (refactored)
- `services/ai/ai_reports_service.py` (refactored)

### Files Moved
- `ai_embedding_service.py` → `services/ai/ai_embedding_service.py`
- `ai_orchestrator_service.py` → `services/ai/ai_orchestrator_service.py`
- `rag_vector_service.py` → `services/ai/rag_vector_service.py`
- `rag_retriever_service.py` → `services/ai/rag_retriever_service.py`

### Files Updated
- `services/__init__.py` (new exports and legacy compatibility)
- `routers/ai_chat.py` (updated imports)
- `routers/ai_insights.py` (updated imports)
- `routers/ai_reports.py` (updated imports)
- All test files (updated imports)

## Next Steps

1. **Test thoroughly** - run all AI-related tests to ensure functionality
2. **Monitor logs** - structured logging provides better observability
3. **Update documentation** - reflect new architecture in API docs
4. **Consider deprecation timeline** - plan removal of legacy imports
5. **Extend patterns** - use DAL architecture for other service areas

## Architecture Benefits

This new architecture provides:

- **Single Responsibility Principle**: Each layer has a clear purpose
- **Dependency Inversion**: Services depend on abstractions (DAL interfaces)
- **Open/Closed Principle**: Easy to extend with new functionality
- **Testability**: Each layer can be tested independently
- **Maintainability**: Clear structure and separation of concerns
